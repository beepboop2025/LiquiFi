"""ML module for LiquiFi - Comprehensive machine learning pipeline.

This module provides:
- Model architectures (LSTM, GRU, Transformer)
- Ensemble methods for robust predictions
- Feature engineering pipeline
- Automated training and versioning
- Monitoring and alerting
- Codex collaboration interface

Usage:
    from ml import create_forecaster, create_trainer, create_monitor
    
    # Create forecaster with ensemble
    forecaster = create_forecaster(use_ensemble=True)
    forecast = forecaster.predict(rates, history)
    
    # Create automated trainer
    trainer = create_trainer()
    trainer.start_continuous_training()
    
    # Create monitoring system
    monitor = create_monitor()
    monitor.start_monitoring()
"""

import logging
from typing import Optional

# Core ML components
from ml.model import LSTMLiquidityModel
from ml.forecast import get_forecast, load_model
from ml.monte_carlo import run_monte_carlo

# Advanced components
from ml.ensemble import (
    EnsembleManager,
    EnsemblePrediction,
    create_ensemble_forecast,
)
from ml.features import (
    FeatureEngineer,
    FeatureConfig,
    engineer_features,
    create_feature_pipeline,
)

# Training and versioning
from ml.training_pipeline import (
    ModelRegistry,
    ModelVersion,
    TrainingConfig,
    AutomatedTrainingPipeline,
    HyperparameterOptimizer,
    create_training_pipeline,
)

# Monitoring
from ml.monitoring import (
    MetricsCollector,
    DriftDetector,
    AlertManager,
    MLMonitoringSystem,
    create_monitoring_system,
)

# Codex collaboration
from ml.codex_interface import (
    ExperimentTracker,
    Experiment,
    CodexInterface,
    create_codex_interface,
)

__all__ = [
    # Core models
    "LSTMLiquidityModel",
    "get_forecast",
    "load_model",
    "run_monte_carlo",
    
    # Ensemble
    "EnsembleManager",
    "EnsemblePrediction",
    "create_ensemble_forecast",
    
    # Features
    "FeatureEngineer",
    "FeatureConfig",
    "engineer_features",
    "create_feature_pipeline",
    
    # Training
    "ModelRegistry",
    "ModelVersion",
    "TrainingConfig",
    "AutomatedTrainingPipeline",
    "HyperparameterOptimizer",
    "create_training_pipeline",
    
    # Monitoring
    "MetricsCollector",
    "DriftDetector",
    "AlertManager",
    "MLMonitoringSystem",
    "create_monitoring_system",
    
    # Codex
    "ExperimentTracker",
    "Experiment",
    "CodexInterface",
    "create_codex_interface",
]

logger = logging.getLogger("liquifi.ml")


def create_forecaster(use_ensemble: bool = True) -> object:
    """Factory to create forecaster with optional ensemble.

    Args:
        use_ensemble: Whether to use ensemble of models

    Returns:
        Forecaster object with predict() method
    """
    if use_ensemble:
        return EnsembleManager()
    else:
        from ml.forecast import _models
        if not _models:
            load_model()
        from ml.forecast import _models as loaded
        return loaded.get("lstm") or next(iter(loaded.values()), None)


def create_trainer(
    registry_dir: str = "models/registry",
    continuous: bool = False,
) -> AutomatedTrainingPipeline:
    """Factory to create training pipeline.
    
    Args:
        registry_dir: Directory for model registry
        continuous: Whether to enable continuous training
        
    Returns:
        Configured training pipeline
    """
    pipeline = create_training_pipeline(registry_dir)
    
    if continuous:
        pipeline.start_continuous_training()
        
    return pipeline


def create_monitor() -> MLMonitoringSystem:
    """Factory to create monitoring system.
    
    Returns:
        Configured monitoring system
    """
    return create_monitoring_system()


def initialize_ml_system(
    enable_monitoring: bool = True,
    enable_continuous_training: bool = False,
) -> dict:
    """Initialize the complete ML system.
    
    Args:
        enable_monitoring: Start monitoring system
        enable_continuous_training: Start continuous training
        
    Returns:
        Dictionary of initialized components
    """
    logger.info("Initializing ML system...")
    
    components = {}
    
    # Initialize forecaster
    components["forecaster"] = create_forecaster(use_ensemble=True)
    logger.info("✓ Forecaster initialized")
    
    # Initialize trainer
    components["trainer"] = create_trainer(continuous=enable_continuous_training)
    logger.info("✓ Trainer initialized")
    
    # Initialize monitor
    if enable_monitoring:
        components["monitor"] = create_monitor()
        components["monitor"].start_monitoring()
        logger.info("✓ Monitor initialized and started")
        
    # Initialize Codex interface
    components["codex"] = create_codex_interface()
    logger.info("✓ Codex interface initialized")
    
    logger.info("ML system initialization complete!")
    return components


def get_ml_status() -> dict:
    """Get overall status of ML system."""
    from ml.training_pipeline import ModelRegistry
    from ml.monitoring import create_monitoring_system
    
    registry = ModelRegistry()
    monitor = create_monitoring_system()
    
    return {
        "models": {
            "total": len(registry.list_versions()),
            "active": len(registry.list_versions(active_only=True)),
            "production": [v.version_id for v in registry.list_versions() if v.is_production],
        },
        "health": monitor.get_health_report(),
        "alerts": len(monitor.alerts.get_active_alerts()),
    }
