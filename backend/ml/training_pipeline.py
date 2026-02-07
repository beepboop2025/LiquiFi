"""Automated ML training pipeline with model versioning and A/B testing.

This module provides:
- Automated retraining triggers
- Model versioning and artifact management
- A/B testing framework
- Performance monitoring and alerting
- Hyperparameter optimization
"""

import logging
import os
import json
import shutil
import hashlib
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
import threading
import time

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

import config
from ml.dataset import LiquidityDataset
from ml.model import MODEL_REGISTRY

logger = logging.getLogger("liquifi.training_pipeline")


@dataclass
class ModelVersion:
    """Represents a versioned model."""
    version_id: str
    timestamp: str
    model_type: str
    metrics: Dict[str, float]
    hyperparameters: Dict[str, Any]
    data_hash: str
    description: str
    is_active: bool = False
    is_production: bool = False
    
    def to_dict(self) -> Dict:
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict) -> "ModelVersion":
        return cls(**data)


@dataclass
class TrainingConfig:
    """Configuration for training run."""
    model_type: str = "lstm"  # lstm, gru, transformer
    epochs: int = 100
    batch_size: int = 64
    learning_rate: float = 0.001
    seq_len: int = 48
    hidden_dim: int = 128
    num_layers: int = 2
    dropout: float = 0.15
    weight_decay: float = 1e-4
    early_stopping_patience: int = 20
    target_mode: str = "delta"
    use_scheduler: bool = True
    
    def to_dict(self) -> Dict:
        return asdict(self)


class ModelRegistry:
    """Registry for managing model versions."""
    
    def __init__(self, registry_dir: str = "models/registry"):
        self.registry_dir = Path(registry_dir)
        self.registry_dir.mkdir(parents=True, exist_ok=True)
        self._registry_file = self.registry_dir / "registry.json"
        self._versions: Dict[str, ModelVersion] = {}
        self._lock = threading.RLock()
        self._load_registry()
        
    def _load_registry(self) -> None:
        """Load registry from disk."""
        if self._registry_file.exists():
            try:
                with open(self._registry_file, "r") as f:
                    data = json.load(f)
                    for version_id, version_data in data.items():
                        self._versions[version_id] = ModelVersion.from_dict(version_data)
                logger.info(f"Loaded {len(self._versions)} model versions from registry")
            except Exception as exc:
                logger.error(f"Failed to load registry: {exc}")
                
    def _save_registry(self) -> None:
        """Save registry to disk."""
        with self._lock:
            data = {v.version_id: v.to_dict() for v in self._versions.values()}
            with open(self._registry_file, "w") as f:
                json.dump(data, f, indent=2)
                
    def register_model(
        self,
        version_id: str,
        model_type: str,
        metrics: Dict[str, float],
        hyperparameters: Dict[str, Any],
        data_hash: str,
        description: str = "",
    ) -> ModelVersion:
        """Register a new model version."""
        with self._lock:
            version = ModelVersion(
                version_id=version_id,
                timestamp=datetime.now().isoformat(),
                model_type=model_type,
                metrics=metrics,
                hyperparameters=hyperparameters,
                data_hash=data_hash,
                description=description,
            )
            self._versions[version_id] = version
            self._save_registry()
            logger.info(f"Registered model version: {version_id}")
            return version
            
    def get_version(self, version_id: str) -> Optional[ModelVersion]:
        """Get a specific model version."""
        return self._versions.get(version_id)
        
    def list_versions(
        self,
        model_type: Optional[str] = None,
        active_only: bool = False,
    ) -> List[ModelVersion]:
        """List all model versions, optionally filtered."""
        versions = list(self._versions.values())
        
        if model_type:
            versions = [v for v in versions if v.model_type == model_type]
            
        if active_only:
            versions = [v for v in versions if v.is_active]
            
        return sorted(versions, key=lambda v: v.timestamp, reverse=True)
        
    def set_active(self, version_id: str) -> None:
        """Set a version as the active model."""
        with self._lock:
            # Deactivate all others
            for v in self._versions.values():
                v.is_active = False
                
            if version_id in self._versions:
                self._versions[version_id].is_active = True
                self._save_registry()
                logger.info(f"Set {version_id} as active model")
                
    def set_production(self, version_id: str) -> None:
        """Set a version as the production model."""
        with self._lock:
            for v in self._versions.values():
                v.is_production = False
                
            if version_id in self._versions:
                self._versions[version_id].is_production = True
                self._save_registry()
                logger.info(f"Set {version_id} as production model")
                
    def compare_versions(self, v1_id: str, v2_id: str) -> Dict:
        """Compare two model versions."""
        v1 = self._versions.get(v1_id)
        v2 = self._versions.get(v2_id)
        
        if not v1 or not v2:
            return {"error": "One or both versions not found"}
            
        return {
            "version_1": v1_id,
            "version_2": v2_id,
            "metrics_diff": {
                k: v1.metrics.get(k, 0) - v2.metrics.get(k, 0)
                for k in set(v1.metrics) | set(v2.metrics)
            },
            "improvements": {
                k: v1.metrics.get(k, 0) < v2.metrics.get(k, 0)  # Lower is better for errors
                for k in set(v1.metrics) & set(v2.metrics)
                if k in ["rmse", "mae", "mape"]
            },
        }
        
    def cleanup_old_versions(self, keep_last_n: int = 10) -> int:
        """Remove old model versions, keeping only the last N."""
        with self._lock:
            versions = self.list_versions()
            to_remove = versions[keep_last_n:]
            
            removed = 0
            for version in to_remove:
                if not version.is_active and not version.is_production:
                    del self._versions[version.version_id]
                    removed += 1
                    
            if removed > 0:
                self._save_registry()
                logger.info(f"Cleaned up {removed} old model versions")
                
            return removed


class AutomatedTrainingPipeline:
    """Automated training pipeline with triggers and monitoring."""
    
    def __init__(
        self,
        registry: Optional[ModelRegistry] = None,
        config: Optional[TrainingConfig] = None,
    ):
        self.registry = registry or ModelRegistry()
        self.config = config or TrainingConfig()
        self._stop_event = threading.Event()
        self._training_thread: Optional[threading.Thread] = None
        
    def start_continuous_training(
        self,
        check_interval_minutes: int = 60,
        min_new_samples: int = 100,
        performance_threshold: float = 0.05,  # 5% degradation triggers retraining
    ) -> None:
        """Start continuous training in background thread."""
        if self._training_thread and self._training_thread.is_alive():
            logger.warning("Continuous training already running")
            return
            
        self._stop_event.clear()
        self._training_thread = threading.Thread(
            target=self._continuous_training_loop,
            args=(check_interval_minutes, min_new_samples, performance_threshold),
            daemon=True,
        )
        self._training_thread.start()
        logger.info("Started continuous training pipeline")
        
    def stop_continuous_training(self) -> None:
        """Stop continuous training."""
        self._stop_event.set()
        if self._training_thread:
            self._training_thread.join(timeout=5)
            logger.info("Stopped continuous training pipeline")
            
    def _continuous_training_loop(
        self,
        check_interval_minutes: int,
        min_new_samples: int,
        performance_threshold: float,
    ) -> None:
        """Main loop for continuous training."""
        from data.training_store import get_live_stats
        
        last_sample_count = 0
        last_performance = None
        
        while not self._stop_event.is_set():
            try:
                # Check data drift
                stats = get_live_stats()
                current_samples = stats.get("rows", 0)
                
                should_retrain = False
                reason = ""
                
                # Trigger 1: Enough new data
                if current_samples - last_sample_count >= min_new_samples:
                    should_retrain = True
                    reason = f"New data: {current_samples - last_sample_count} samples"
                    
                # Trigger 2: Performance degradation
                if last_performance is not None:
                    active_models = self.registry.list_versions(active_only=True)
                    if active_models:
                        current_performance = active_models[0].metrics.get("rmse", float("inf"))
                        degradation = (current_performance - last_performance) / last_performance
                        if degradation > performance_threshold:
                            should_retrain = True
                            reason = f"Performance degraded by {degradation:.1%}"
                            
                if should_retrain:
                    logger.info(f"Triggering retraining: {reason}")
                    self.run_training_job()
                    last_sample_count = current_samples
                    
                    # Update performance baseline
                    active_models = self.registry.list_versions(active_only=True)
                    if active_models:
                        last_performance = active_models[0].metrics.get("rmse")
                        
            except Exception as exc:
                logger.error(f"Error in continuous training loop: {exc}")
                
            # Wait for next check
            self._stop_event.wait(check_interval_minutes * 60)
            
    def run_training_job(
        self,
        custom_config: Optional[TrainingConfig] = None,
        data_path: Optional[str] = None,
    ) -> ModelVersion:
        """Run a single training job."""
        cfg = custom_config or self.config
        
        # Generate version ID
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        version_id = f"{cfg.model_type}_{timestamp}_{self._generate_hash()}"
        
        # Prepare data
        if data_path is None:
            from data.training_store import build_training_csv
            data_info = build_training_csv(
                base_path=config.SEED_DATA_PATH,
                out_path=config.TRAINING_DATA_PATH,
            )
            data_path = data_info["path"]
            data_hash = self._hash_file(data_path)
        else:
            data_hash = self._hash_file(data_path)
            
        # Train model
        logger.info(f"Starting training job: {version_id}")
        metrics = self._train_model(cfg, data_path, version_id)
        
        # Register version
        version = self.registry.register_model(
            version_id=version_id,
            model_type=cfg.model_type,
            metrics=metrics,
            hyperparameters=cfg.to_dict(),
            data_hash=data_hash,
            description=f"Automated training run on {data_hash[:8]}",
        )
        
        # Evaluate and potentially promote
        self._evaluate_and_promote(version_id)
        
        return version
        
    def _train_model(
        self,
        cfg: TrainingConfig,
        data_path: str,
        version_id: str,
    ) -> Dict[str, float]:
        """Train a model with given configuration."""
        # Load data
        dataset = LiquidityDataset(data_path, seq_len=cfg.seq_len, target_mode=cfg.target_mode)
        
        # Split
        total = len(dataset)
        split = int(total * 0.85)
        train_set = torch.utils.data.Subset(dataset, range(split))
        val_set = torch.utils.data.Subset(dataset, range(split, total))
        
        train_loader = DataLoader(train_set, batch_size=cfg.batch_size, shuffle=True)
        val_loader = DataLoader(val_set, batch_size=cfg.batch_size, shuffle=False)
        
        # Create model
        model = self._create_model(cfg)
        optimizer = torch.optim.AdamW(
            model.parameters(),
            lr=cfg.learning_rate,
            weight_decay=cfg.weight_decay,
        )
        criterion = nn.SmoothL1Loss()
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            optimizer, patience=cfg.early_stopping_patience // 2, factor=0.5
        )
        
        # Training loop
        best_val_loss = float("inf")
        best_state = None
        patience_counter = 0
        
        for epoch in range(cfg.epochs):
            model.train()
            train_loss = 0.0
            
            for x_batch, y_batch in train_loader:
                optimizer.zero_grad()
                pred = model(x_batch)
                loss = criterion(pred, y_batch)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                train_loss += loss.item() * x_batch.size(0)
                
            train_loss /= len(train_set)
            
            # Validation
            model.eval()
            val_loss = 0.0
            all_preds = []
            all_true = []
            
            with torch.no_grad():
                for x_batch, y_batch in val_loader:
                    pred = model(x_batch)
                    val_loss += criterion(pred, y_batch).item() * x_batch.size(0)
                    all_preds.append(pred.numpy())
                    all_true.append(y_batch.numpy())
                    
            val_loss /= len(val_set)
            scheduler.step(val_loss)
            
            # Early stopping
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                best_state = model.state_dict().copy()
                patience_counter = 0
            else:
                patience_counter += 1
                
            if patience_counter >= cfg.early_stopping_patience:
                logger.info(f"Early stopping at epoch {epoch}")
                break
                
        # Save best model
        if best_state:
            model_path = self.registry.registry_dir / f"{version_id}.pt"
            torch.save(best_state, model_path)
            
        # Compute final metrics
        all_preds = np.concatenate(all_preds)
        all_true = np.concatenate(all_true)
        
        rmse = float(np.sqrt(np.mean((all_preds - all_true) ** 2)))
        mae = float(np.mean(np.abs(all_preds - all_true)))
        
        return {"rmse": rmse, "mae": mae, "val_loss": best_val_loss}
        
    def _create_model(self, cfg: TrainingConfig) -> nn.Module:
        """Create model based on configuration using the model registry."""
        if cfg.model_type not in MODEL_REGISTRY:
            raise ValueError(f"Unknown model type: {cfg.model_type}")

        from ml.dataset import LiquidityDataset
        num_features = LiquidityDataset.load_num_features()
        model_class = MODEL_REGISTRY[cfg.model_type]

        if cfg.model_type == "transformer":
            return model_class(
                num_features=num_features,
                d_model=cfg.hidden_dim,
                num_layers=cfg.num_layers,
                dropout=cfg.dropout,
            )
        return model_class(
            num_features=num_features,
            hidden_size=cfg.hidden_dim,
            num_layers=cfg.num_layers,
            dropout=cfg.dropout,
        )
            
    def _evaluate_and_promote(self, version_id: str) -> None:
        """Evaluate model and potentially promote to production."""
        version = self.registry.get_version(version_id)
        if version is None:
            return
            
        # Compare with current production model
        production = [v for v in self.registry.list_versions() if v.is_production]
        
        if not production:
            # No production model yet, promote this one
            self.registry.set_production(version_id)
            self.registry.set_active(version_id)
            return
            
        prod_model = production[0]
        
        # Compare metrics
        current_rmse = version.metrics.get("rmse", float("inf"))
        prod_rmse = prod_model.metrics.get("rmse", float("inf"))
        
        if current_rmse < prod_rmse * 0.98:  # 2% improvement threshold
            logger.info(f"Promoting {version_id} to production (RMSE: {current_rmse:.3f} vs {prod_rmse:.3f})")
            self.registry.set_production(version_id)
            self.registry.set_active(version_id)
        else:
            logger.info(f"Not promoting {version_id} (RMSE: {current_rmse:.3f} vs production {prod_rmse:.3f})")
            
    def _generate_hash(self) -> str:
        """Generate a short hash for version ID."""
        data = f"{time.time()}{np.random.randint(10000)}"
        return hashlib.md5(data.encode()).hexdigest()[:8]
        
    def _hash_file(self, path: str) -> str:
        """Generate hash of file contents."""
        hasher = hashlib.md5()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hasher.update(chunk)
        return hasher.hexdigest()


class HyperparameterOptimizer:
    """Hyperparameter optimization using random search."""
    
    def __init__(self, pipeline: AutomatedTrainingPipeline):
        self.pipeline = pipeline
        
    def optimize(
        self,
        n_trials: int = 10,
        data_path: Optional[str] = None,
    ) -> TrainingConfig:
        """Run hyperparameter optimization."""
        logger.info(f"Starting hyperparameter optimization with {n_trials} trials")
        
        best_config = None
        best_rmse = float("inf")
        
        search_space = {
            "learning_rate": [0.0001, 0.0005, 0.001, 0.002],
            "hidden_dim": [64, 128, 256],
            "num_layers": [1, 2, 3],
            "dropout": [0.1, 0.15, 0.2, 0.3],
            "batch_size": [32, 64, 128],
        }
        
        for trial in range(n_trials):
            # Sample configuration
            cfg = TrainingConfig(
                learning_rate=np.random.choice(search_space["learning_rate"]),
                hidden_dim=np.random.choice(search_space["hidden_dim"]),
                num_layers=np.random.choice(search_space["num_layers"]),
                dropout=np.random.choice(search_space["dropout"]),
                batch_size=np.random.choice(search_space["batch_size"]),
            )
            
            logger.info(f"Trial {trial + 1}/{n_trials}: {cfg.to_dict()}")
            
            # Train with this config
            version = self.pipeline.run_training_job(cfg, data_path)
            rmse = version.metrics.get("rmse", float("inf"))
            
            if rmse < best_rmse:
                best_rmse = rmse
                best_config = cfg
                logger.info(f"New best RMSE: {best_rmse:.4f}")
                
        logger.info(f"Optimization complete. Best config: {best_config.to_dict()}")
        return best_config


def create_training_pipeline(
    registry_dir: str = "models/registry",
) -> AutomatedTrainingPipeline:
    """Factory function to create training pipeline."""
    registry = ModelRegistry(registry_dir)
    return AutomatedTrainingPipeline(registry)
