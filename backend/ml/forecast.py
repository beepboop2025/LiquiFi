"""Multi-model inference: 24-hour forecast with ensemble and MC Dropout confidence intervals."""

import logging
import math
import os
import json
from datetime import datetime

import numpy as np
import torch

import config
from ml.model import MODEL_REGISTRY
from ml.dataset import LiquidityDataset

logger = logging.getLogger("liquifi.forecast")

# Loaded models (all available architectures)
_models: dict[str, torch.nn.Module] = {}
_device = torch.device("cpu")
_scaler: tuple[np.ndarray, np.ndarray] | None = None  # (feat_min, feat_max)
_model_meta: dict = {}
_ensemble_weights: dict[str, float] = {}
_num_features: int = config.NUM_FEATURES


def _ordered_ci(center: float, w95: float, w99: float, floor: float = 30.0) -> tuple[float, float, float, float]:
    """Build ordered 95%/99% confidence bounds."""
    w95 = max(0.0, float(w95))
    w99 = max(w95, float(w99))

    ci95_upper = center + w95
    ci99_upper = center + w99
    ci95_lower = max(floor, center - w95)
    ci99_lower = max(floor, center - w99)

    if ci99_upper < ci95_upper:
        ci99_upper = ci95_upper
    if ci99_lower > ci95_lower:
        ci99_lower = ci95_lower

    return ci95_upper, ci95_lower, ci99_upper, ci99_lower


def load_model() -> bool:
    """Load all available model checkpoints and ensemble weights. Returns True if at least one loaded."""
    global _models, _scaler, _model_meta, _ensemble_weights, _num_features

    _num_features = LiquidityDataset.load_num_features()

    # Load scaler
    _scaler = LiquidityDataset.load_scaler()
    if _scaler is None:
        logger.warning("No scaler file at %s — inference will use raw features", config.SCALER_PATH)

    # Load all available model checkpoints
    model_paths = {
        "lstm": config.MODEL_PATH,
        "gru": config.GRU_MODEL_PATH,
        "transformer": config.TRANSFORMER_MODEL_PATH,
    }

    _models.clear()
    for name, path in model_paths.items():
        if os.path.exists(path):
            try:
                model_class = MODEL_REGISTRY[name]
                model = model_class(num_features=_num_features)
                model.load_state_dict(torch.load(path, map_location=_device, weights_only=True))
                model.to(_device)
                model.eval()
                _models[name] = model
                logger.info("Loaded %s model from %s", name, path)
            except Exception as exc:
                logger.warning("Could not load %s model: %s", name, exc)

    if not _models:
        logger.warning("No model files found")
        return False

    # Load ensemble weights
    _ensemble_weights = {}
    if os.path.exists(config.ENSEMBLE_WEIGHTS_PATH):
        try:
            with open(config.ENSEMBLE_WEIGHTS_PATH) as f:
                data = json.load(f)
                _ensemble_weights = data.get("weights", {})
                logger.info("Ensemble weights loaded: %s", _ensemble_weights)
        except Exception as exc:
            logger.warning("Could not load ensemble weights: %s", exc)

    # Load model metadata
    _model_meta = {}
    if os.path.exists(config.META_PATH):
        try:
            with open(config.META_PATH, encoding="utf-8") as fh:
                _model_meta = json.load(fh)
        except Exception as exc:
            logger.warning("Could not read model metadata: %s", exc)

    logger.info("Loaded %d models: %s", len(_models), list(_models.keys()))
    return True


def get_forecast(rates: dict, rate_buffer: list[dict] | None = None) -> list[dict]:
    """Run 24-hour forecast using ensemble of available models."""
    if _models:
        return _ensemble_forecast(rates, rate_buffer)
    return _synthetic_forecast(rates)


def _ensemble_forecast(rates: dict, rate_buffer: list[dict] | None) -> list[dict]:
    """Run weighted ensemble forecast with MC Dropout confidence intervals."""
    input_seq = _build_input_sequence(rates, rate_buffer)
    input_tensor = torch.from_numpy(input_seq).unsqueeze(0).to(_device)
    target_mode = str(_model_meta.get("target_mode", "delta"))
    last_balance = _get_last_balance(rates, rate_buffer)

    # Collect MC Dropout predictions from all models
    model_predictions = []  # list of (weight, preds_array[N, 24])

    for name, model in _models.items():
        weight = _ensemble_weights.get(name, 1.0 / len(_models))

        model.train()  # enable dropout
        preds = []
        for _ in range(config.MC_DROPOUT_SAMPLES):
            with torch.no_grad():
                pred = model(input_tensor).squeeze(0).cpu().numpy()
                preds.append(pred)
        model.eval()

        model_predictions.append((weight, np.array(preds)))

    # Weighted ensemble aggregation
    total_weight = sum(w for w, _ in model_predictions)
    ensemble_mean = np.zeros(config.FORECAST_HORIZON)
    ensemble_var = np.zeros(config.FORECAST_HORIZON)

    for weight, preds in model_predictions:
        w = weight / total_weight
        model_mean = preds.mean(axis=0)
        model_var = preds.var(axis=0)
        ensemble_mean += w * model_mean
        # Law of total variance: Var = E[Var] + Var[E]
        ensemble_var += w * (model_var + model_mean ** 2)

    ensemble_var -= ensemble_mean ** 2
    ensemble_var = np.maximum(ensemble_var, 0)
    ensemble_std = np.sqrt(ensemble_var)

    mean = ensemble_mean
    std = ensemble_std

    if target_mode == "delta":
        mean = mean + last_balance

    # Build clock data
    clock_data = []
    for i in range(config.FORECAST_HORIZON):
        bal = float(mean[i])
        s = float(std[i])
        ci95_upper, ci95_lower, ci99_upper, ci99_lower = _ordered_ci(
            center=bal, w95=1.96 * s, w99=2.576 * s, floor=30.0,
        )

        prev_bal = float(mean[i - 1]) if i > 0 else bal
        net_change = bal - prev_bal
        if net_change >= 0:
            inflow = abs(net_change) + 2.0
            outflow = 2.0
        else:
            inflow = 2.0
            outflow = abs(net_change) + 2.0

        clock_data.append({
            "hour": f"{i:02d}:00",
            "balance": round(bal, 1),
            "predicted": round(bal, 1),
            "ci95_upper": round(ci95_upper, 1),
            "ci95_lower": round(ci95_lower, 1),
            "ci99_upper": round(ci99_upper, 1),
            "ci99_lower": round(ci99_lower, 1),
            "min_buffer": 120,
            "inflow": round(inflow, 1),
            "outflow": round(outflow, 1),
        })

    return clock_data


def _get_last_balance(rates: dict, rate_buffer: list[dict] | None) -> float:
    """Get the latest observed/estimated balance."""
    if rate_buffer and "_balance" in rate_buffer[-1]:
        try:
            return float(rate_buffer[-1]["_balance"])
        except (TypeError, ValueError):
            pass
    for key in ("_balance", "estimated_balance", "balance"):
        if key in rates:
            try:
                return float(rates[key])
            except (TypeError, ValueError):
                continue
    return 245.0


def _build_input_sequence(rates: dict, rate_buffer: list[dict] | None) -> np.ndarray:
    """
    Build a (seq_len, num_features) input array matching the dataset feature layout:

    Features 0-5:   6 market rates (mibor, repo, cblo, usdinr, gsec, call_avg)
    Feature 6:      hour_sin
    Feature 7:      hour_cos
    Feature 8:      dow_norm
    Feature 9:      prev_balance
    Feature 10:     prev_inflow
    Feature 11:     prev_outflow
    Feature 12:     mibor_repo_spread
    Feature 13:     mibor_cblo_spread
    Feature 14:     cblo_repo_spread
    Feature 15:     call_spread (constant 0.4)
    Feature 16:     call_mid (= call_avg)
    Feature 17:     mibor_momentum (6hr lookback)
    Feature 18:     repo_momentum (6hr lookback)
    Feature 19:     balance_momentum (6hr lookback)
    Feature 20:     is_weekend
    Feature 21:     is_month_end
    Feature 22:     is_payroll
    Feature 23:     is_business_hours
    """
    seq_len = config.SEQ_LEN
    n_features = _num_features
    seq = np.zeros((seq_len, n_features), dtype=np.float32)

    now = datetime.now()
    current_hour = now.hour
    current_dow = now.weekday()
    current_day = now.day

    # Current rate values for padding
    mibor = rates.get("mibor_overnight", 6.75)
    repo = rates.get("repo", 6.50)
    cblo = rates.get("cblo_bid", 6.55)
    usdinr = rates.get("usdinr_spot", 83.25)
    gsec = rates.get("gsec_10y", 7.15)
    call_avg = (rates.get("call_money_high", 6.90) + rates.get("call_money_low", 6.50)) / 2
    last_bal = 245.0
    prev_inflow = 2.0
    prev_outflow = 2.0

    # History buffers for momentum computation (6-step lookback)
    mibor_hist = []
    repo_hist = []
    bal_hist = []

    buf = rate_buffer or []
    pad_count = max(0, seq_len - len(buf))

    for t in range(seq_len):
        buf_idx = t - pad_count
        if 0 <= buf_idx < len(buf):
            entry = buf[buf_idx]
            m = entry.get("mibor_overnight", mibor)
            r = entry.get("repo", repo)
            c = entry.get("cblo_bid", cblo)
            u = entry.get("usdinr_spot", usdinr)
            g = entry.get("gsec_10y", gsec)
            high = entry.get("call_money_high", 6.90)
            low = entry.get("call_money_low", 6.50)
            ca = (high + low) / 2

            try:
                current_bal = float(entry.get("_balance", last_bal))
            except (TypeError, ValueError):
                current_bal = last_bal
            net = current_bal - last_bal
            prev_inflow = max(0.0, net)
            prev_outflow = max(0.0, -net)
            last_bal = current_bal
        else:
            m, r, c, u, g, ca = mibor, repo, cblo, usdinr, gsec, call_avg

        # Feature 0-5: market rates
        seq[t, 0] = m
        seq[t, 1] = r
        seq[t, 2] = c
        seq[t, 3] = u
        seq[t, 4] = g
        seq[t, 5] = ca

        # Feature 6-8: temporal
        hours_back = seq_len - 1 - t
        step_hour = (current_hour - hours_back) % 24
        step_dow = current_dow  # approximate for same week
        seq[t, 6] = math.sin(2 * math.pi * step_hour / 24)
        seq[t, 7] = math.cos(2 * math.pi * step_hour / 24)
        seq[t, 8] = step_dow / 6.0

        # Feature 9-11: lagged
        seq[t, 9] = last_bal
        seq[t, 10] = prev_inflow
        seq[t, 11] = prev_outflow

        # Only populate features 12-23 if model expects them
        if n_features > 12:
            # Feature 12-14: rate spreads
            seq[t, 12] = m - r       # mibor_repo_spread
            seq[t, 13] = m - c       # mibor_cblo_spread
            seq[t, 14] = c - r       # cblo_repo_spread

            # Feature 15-16: call money
            seq[t, 15] = 0.4         # call_spread (typical constant)
            seq[t, 16] = ca          # call_mid

            # Track history for momentum
            mibor_hist.append(m)
            repo_hist.append(r)
            bal_hist.append(last_bal)

            # Feature 17-19: momentum (6-step lookback)
            lookback = 6
            if len(mibor_hist) > lookback:
                seq[t, 17] = mibor_hist[-1] - mibor_hist[-lookback - 1]
                seq[t, 18] = repo_hist[-1] - repo_hist[-lookback - 1]
                seq[t, 19] = bal_hist[-1] - bal_hist[-lookback - 1]

            # Feature 20-23: calendar
            seq[t, 20] = 1.0 if step_dow >= 5 else 0.0                 # is_weekend
            seq[t, 21] = 1.0 if (current_day >= 28 or current_day <= 2) else 0.0  # is_month_end
            seq[t, 22] = 1.0 if (current_day >= 29 or current_day <= 2) else 0.0  # is_payroll
            seq[t, 23] = 1.0 if (9 <= step_hour <= 17 and step_dow < 5) else 0.0  # is_business_hours

    # Apply the same min-max scaling used during training
    if _scaler is not None:
        feat_min, feat_max = _scaler
        n_scaler = len(feat_min)
        n_actual = min(n_features, n_scaler)
        feat_range = feat_max[:n_actual] - feat_min[:n_actual]
        feat_range[feat_range == 0] = 1.0
        seq[:, :n_actual] = (seq[:, :n_actual] - feat_min[:n_actual]) / feat_range

    return seq


def _synthetic_forecast(rates: dict) -> list[dict]:
    """Generate a plausible synthetic forecast when no models are available."""
    import random

    bal = 245 + random.uniform(-15, 15)
    predicted = bal
    clock_data = []

    for i in range(24):
        is_biz = 9 <= i <= 17
        inflow = random.uniform(2, 45 if is_biz else 8)
        outflow = random.uniform(3, 40 if is_biz else 5)
        bal = max(60, min(400, bal + inflow - outflow))
        predicted = max(50, min(420, predicted + inflow - outflow + random.uniform(-15, 15)))
        ci95_w = random.uniform(10, 25)
        ci99_w = ci95_w + random.uniform(5, 20)
        ci95_upper, ci95_lower, ci99_upper, ci99_lower = _ordered_ci(
            center=predicted, w95=ci95_w, w99=ci99_w, floor=30.0,
        )

        clock_data.append({
            "hour": f"{i:02d}:00",
            "balance": round(bal, 1),
            "predicted": round(predicted, 1),
            "ci95_upper": round(ci95_upper, 1),
            "ci95_lower": round(ci95_lower, 1),
            "ci99_upper": round(ci99_upper, 1),
            "ci99_lower": round(ci99_lower, 1),
            "min_buffer": 120,
            "inflow": round(inflow, 1),
            "outflow": round(outflow, 1),
        })

    return clock_data
