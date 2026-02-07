"""Ensemble model system for robust liquidity forecasting.

Uses model architectures from ml.model (LSTM, GRU, Transformer)
and provides weighted aggregation with MC Dropout uncertainty.
"""

import logging
import os
import json
import numpy as np
import torch
import torch.nn as nn
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime

import config
from ml.model import MODEL_REGISTRY

logger = logging.getLogger("liquifi.ensemble")


@dataclass
class ModelPrediction:
    """Prediction from a single model."""
    model_name: str
    mean: np.ndarray  # (24,) forecast
    std: np.ndarray   # (24,) uncertainty
    confidence: float  # 0-1 confidence score
    metadata: Dict[str, Any]


@dataclass
class EnsemblePrediction:
    """Aggregated prediction from ensemble."""
    mean: np.ndarray
    std: np.ndarray
    ci95_upper: np.ndarray
    ci95_lower: np.ndarray
    ci99_upper: np.ndarray
    ci99_lower: np.ndarray
    model_weights: Dict[str, float]
    component_predictions: List[ModelPrediction]
    timestamp: str


# Model name -> checkpoint path
MODEL_PATHS = {
    "lstm": config.MODEL_PATH,
    "gru": config.GRU_MODEL_PATH,
    "transformer": config.TRANSFORMER_MODEL_PATH,
}


class EnsembleManager:
    """Manages multiple models and aggregates predictions."""

    def __init__(self):
        self.device = torch.device("cpu")
        self.models: Dict[str, nn.Module] = {}
        self.model_weights: Dict[str, float] = {}
        self._num_features = config.NUM_FEATURES
        self._load_models()

    def _load_models(self) -> None:
        """Load all available models from disk using model.py's registry."""
        from ml.dataset import LiquidityDataset
        self._num_features = LiquidityDataset.load_num_features()

        for name, path in MODEL_PATHS.items():
            if os.path.exists(path):
                try:
                    model_class = MODEL_REGISTRY[name]
                    model = model_class(num_features=self._num_features)
                    model.load_state_dict(torch.load(path, map_location=self.device, weights_only=True))
                    model.to(self.device)
                    model.eval()
                    self.models[name] = model
                    self.model_weights[name] = 1.0
                    logger.info("Loaded %s model from %s", name, path)
                except Exception as exc:
                    logger.warning("Could not load %s model: %s", name, exc)

        self._normalize_weights()
        self._load_saved_weights()

    def _normalize_weights(self) -> None:
        """Normalize model weights to sum to 1."""
        total = sum(self.model_weights.values())
        if total > 0:
            for name in self.model_weights:
                self.model_weights[name] /= total

    def _load_saved_weights(self) -> None:
        """Load previously saved ensemble weights if available."""
        if os.path.exists(config.ENSEMBLE_WEIGHTS_PATH):
            try:
                with open(config.ENSEMBLE_WEIGHTS_PATH, "r") as f:
                    data = json.load(f)
                    saved = data.get("weights", {})
                    # Only use weights for models we actually have loaded
                    for name in list(self.model_weights.keys()):
                        if name in saved:
                            self.model_weights[name] = saved[name]
                    self._normalize_weights()
            except Exception as exc:
                logger.warning("Could not load saved ensemble weights: %s", exc)

    def update_weights_from_performance(self, performance: Dict[str, float]) -> None:
        """Update model weights based on recent performance (lower RMSE = higher weight)."""
        inverse_rmse = {}
        for name, rmse in performance.items():
            if rmse > 0 and name in self.model_weights:
                inverse_rmse[name] = 1.0 / rmse

        total = sum(inverse_rmse.values())
        if total > 0:
            for name in self.model_weights:
                if name in inverse_rmse:
                    self.model_weights[name] = inverse_rmse[name] / total
                else:
                    self.model_weights[name] = 0.0

    def predict(
        self,
        input_seq: np.ndarray,
        mc_samples: int = 30,
    ) -> EnsemblePrediction:
        """Generate ensemble prediction with MC Dropout uncertainty."""
        input_tensor = torch.from_numpy(input_seq).unsqueeze(0).to(self.device)
        component_predictions = []

        for name, model in self.models.items():
            try:
                pred = self._predict_single_model(model, input_tensor, mc_samples)
                confidence = self.model_weights.get(name, 0.5)
                component_predictions.append(ModelPrediction(
                    model_name=name,
                    mean=pred["mean"],
                    std=pred["std"],
                    confidence=confidence,
                    metadata={"weight": confidence},
                ))
            except Exception as exc:
                logger.warning("Model %s prediction failed: %s", name, exc)

        if not component_predictions:
            logger.error("All models failed, returning default prediction")
            default = np.full(config.FORECAST_HORIZON, 245.0)
            return EnsemblePrediction(
                mean=default,
                std=np.ones(config.FORECAST_HORIZON) * 50,
                ci95_upper=default + 100,
                ci95_lower=np.maximum(default - 100, 30),
                ci99_upper=default + 150,
                ci99_lower=np.maximum(default - 150, 30),
                model_weights={},
                component_predictions=[],
                timestamp=datetime.now().isoformat(),
            )

        # Weighted ensemble using law of total variance
        total_weight = sum(p.confidence for p in component_predictions)
        weighted_mean = np.zeros(config.FORECAST_HORIZON)
        weighted_var = np.zeros(config.FORECAST_HORIZON)

        for pred in component_predictions:
            weight = pred.confidence / total_weight
            weighted_mean += weight * pred.mean
            weighted_var += weight * (pred.std ** 2 + pred.mean ** 2)

        weighted_var -= weighted_mean ** 2
        weighted_var = np.maximum(weighted_var, 0)
        weighted_std = np.sqrt(weighted_var)

        ci95_upper = weighted_mean + 1.96 * weighted_std
        ci95_lower = np.maximum(weighted_mean - 1.96 * weighted_std, 30.0)
        ci99_upper = weighted_mean + 2.576 * weighted_std
        ci99_lower = np.maximum(weighted_mean - 2.576 * weighted_std, 30.0)

        return EnsemblePrediction(
            mean=weighted_mean,
            std=weighted_std,
            ci95_upper=ci95_upper,
            ci95_lower=ci95_lower,
            ci99_upper=ci99_upper,
            ci99_lower=ci99_lower,
            model_weights={p.model_name: p.confidence / total_weight for p in component_predictions},
            component_predictions=component_predictions,
            timestamp=datetime.now().isoformat(),
        )

    def _predict_single_model(
        self,
        model: nn.Module,
        input_tensor: torch.Tensor,
        mc_samples: int,
    ) -> Dict[str, np.ndarray]:
        """Generate prediction from a single model with MC dropout."""
        model.train()  # Enable dropout
        predictions = []

        with torch.no_grad():
            for _ in range(mc_samples):
                pred = model(input_tensor).squeeze(0).cpu().numpy()
                predictions.append(pred)

        model.eval()

        preds = np.array(predictions)
        return {
            "mean": preds.mean(axis=0),
            "std": preds.std(axis=0),
        }

    def save_weights(self, path: str | None = None) -> None:
        """Save current model weights to disk."""
        if path is None:
            path = config.ENSEMBLE_WEIGHTS_PATH

        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump({
                "weights": self.model_weights,
                "timestamp": datetime.now().isoformat(),
            }, f, indent=2)


def create_ensemble_forecast(
    rates: dict,
    rate_buffer: list[dict],
    ensemble_manager: EnsembleManager | None = None,
) -> list[dict]:
    """Create forecast using ensemble of models."""
    from ml.forecast import _build_input_sequence

    input_seq = _build_input_sequence(rates, rate_buffer)

    if ensemble_manager is None:
        ensemble_manager = EnsembleManager()

    prediction = ensemble_manager.predict(input_seq)

    clock_data = []
    for i in range(config.FORECAST_HORIZON):
        if i > 0:
            net_change = prediction.mean[i] - prediction.mean[i - 1]
        else:
            net_change = 0

        if net_change >= 0:
            inflow = abs(net_change) + 2.0
            outflow = 2.0
        else:
            inflow = 2.0
            outflow = abs(net_change) + 2.0

        clock_data.append({
            "hour": f"{i:02d}:00",
            "balance": round(float(prediction.mean[i]), 1),
            "predicted": round(float(prediction.mean[i]), 1),
            "ci95_upper": round(float(prediction.ci95_upper[i]), 1),
            "ci95_lower": round(float(prediction.ci95_lower[i]), 1),
            "ci99_upper": round(float(prediction.ci99_upper[i]), 1),
            "ci99_lower": round(float(prediction.ci99_lower[i]), 1),
            "min_buffer": 120,
            "inflow": round(float(inflow), 1),
            "outflow": round(float(outflow), 1),
            "model_weights": prediction.model_weights,
        })

    return clock_data
