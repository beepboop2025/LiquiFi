# LiquiFi ML System - Comprehensive Documentation

## Overview

The LiquiFi ML System is a production-grade machine learning pipeline for liquidity forecasting. It provides:

- **Multiple Model Architectures**: LSTM, GRU, Transformer
- **Ensemble Methods**: Weighted ensemble with automatic weight optimization
- **Feature Engineering**: Technical indicators, statistical features, domain-specific metrics
- **Automated Training**: Continuous training with smart triggers
- **Model Versioning**: Full version control with A/B testing
- **Monitoring**: Real-time performance monitoring and drift detection
- **Codex Integration**: Collaborative interface for AI-assisted improvements

## Quick Start

```python
from ml import initialize_ml_system

# Initialize complete ML system
ml_system = initialize_ml_system(
    enable_monitoring=True,
    enable_continuous_training=True,
)

# Access components
forecaster = ml_system["forecaster"]
trainer = ml_system["trainer"]
monitor = ml_system["monitor"]
codex = ml_system["codex"]
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ML System Architecture                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   LSTM       │    │    GRU       │    │Transformer   │      │
│  │   Model      │    │   Model      │    │   Model      │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                    │                    │              │
│         └────────────────────┼────────────────────┘              │
│                              ▼                                   │
│                    ┌──────────────────┐                         │
│                    │  Ensemble        │                         │
│                    │  Manager         │                         │
│                    │  (Weighted Avg)  │                         │
│                    └────────┬─────────┘                         │
│                             │                                    │
│                             ▼                                    │
│                    ┌──────────────────┐                         │
│                    │  24-Hour         │                         │
│                    │  Forecast        │                         │
│                    └──────────────────┘                         │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Feature Engineering Pipeline                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ Technical   │ │ Statistical │ │   Domain    │               │
│  │ Indicators  │ │   Features  │ │  Features   │               │
│  │ (RSI,MACD)  │ │(Z-score,etc)│ │(Spreads,etc)│               │
│  └─────────────┘ └─────────────┘ └─────────────┘               │
├─────────────────────────────────────────────────────────────────┤
│  Training Pipeline                                               │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │  Model   │──▶│ Version  │──▶│   A/B    │──▶│ Production│     │
│  │ Training │   │ Control  │   │ Testing  │   │ Deploy    │     │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘     │
├─────────────────────────────────────────────────────────────────┤
│  Monitoring & Alerting                                           │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                     │
│  │Performance│   │   Data   │   │  System  │                     │
│  │ Metrics  │   │   Drift  │   │  Health  │                     │
│  └──────────┘   └──────────┘   └──────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Ensemble System (`ensemble.py`)

Combines predictions from multiple models for robust forecasts.

```python
from ml.ensemble import EnsembleManager, create_ensemble_forecast

# Create ensemble manager
ensemble = EnsembleManager()

# Generate forecast
prediction = ensemble.predict(input_sequence)
print(prediction.mean)  # Weighted average prediction
print(prediction.model_weights)  # Contribution of each model

# Or use convenience function
from ml import create_ensemble_forecast
clock_data = create_ensemble_forecast(rates, rate_buffer)
```

**Supported Models:**
- LSTM: Captures long-term temporal dependencies
- GRU: Efficient sequential modeling
- Transformer: Attention-based forecasting

### 2. Feature Engineering (`features.py`)

Creates rich feature sets for model input.

```python
from ml.features import FeatureEngineer, FeatureConfig

# Configure features
config = FeatureConfig(
    use_technical=True,    # RSI, MACD, Bollinger Bands
    use_statistical=True,  # Rolling stats, z-scores
    use_domain=True,       # Spreads, stress indicators
    use_calendar=True,     # Day-of-week, month-end, etc.
)

# Create feature engineer
engineer = FeatureEngineer(config)

# Update with historical data
for snapshot in history:
    engineer.update(snapshot)

# Generate features
features = engineer.engineer_features(current_rates)
# Returns 50+ features including:
# - balance_rsi, balance_macd
# - mibor_repo_spread, liquidity_stress_score
# - hour_sin, is_month_end, is_payroll_period
```

### 3. Training Pipeline (`training_pipeline.py`)

Automated training with versioning and A/B testing.

```python
from ml.training_pipeline import (
    AutomatedTrainingPipeline,
    TrainingConfig,
    HyperparameterOptimizer,
)

# Create pipeline
pipeline = AutomatedTrainingPipeline()

# Option 1: One-off training
version = pipeline.run_training_job(
    custom_config=TrainingConfig(
        model_type="lstm",
        epochs=100,
        learning_rate=0.001,
    )
)
print(f"Trained model: {version.version_id}")
print(f"RMSE: {version.metrics['rmse']}")

# Option 2: Continuous training
pipeline.start_continuous_training(
    check_interval_minutes=60,
    min_new_samples=100,
)

# Option 3: Hyperparameter optimization
optimizer = HyperparameterOptimizer(pipeline)
best_config = optimizer.optimize(n_trials=20)
```

### 4. Model Registry

Version control for models.

```python
from ml.training_pipeline import ModelRegistry

registry = ModelRegistry()

# List all versions
versions = registry.list_versions()

# Get specific version
version = registry.get_version("lstm_20240207_120000_a1b2c3d4")

# Compare versions
comparison = registry.compare_versions("model_v1", "model_v2")

# Promote to production
registry.set_production("lstm_20240207_120000_a1b2c3d4")
```

### 5. Monitoring System (`monitoring.py`)

Real-time monitoring and alerting.

```python
from ml.monitoring import MLMonitoringSystem

# Create and start monitoring
monitor = MLMonitoringSystem()
monitor.start_monitoring(check_interval_minutes=10)

# Check health
health = monitor.get_health_report()
print(f"Health Score: {health['health_score']}")
print(f"Status: {health['status']}")

# Get active alerts
alerts = monitor.alerts.get_active_alerts()
for alert in alerts:
    print(f"[{alert.severity}] {alert.message}")

# Record predictions for accuracy tracking
monitor.metrics.record_prediction(
    predicted=250.5,
    actual=248.3,  # Optional: if ground truth available
    latency_ms=45.0,
)
```

### 6. Codex Collaboration Interface (`codex_interface.py`)

Interface for AI-assisted ML development.

```python
from ml.codex_interface import CodexInterface

codex = CodexInterface()

# Get current status
status = codex.get_current_performance()

# Propose an experiment
exp_id = codex.propose_experiment(
    name="GRU with Higher Dropout",
    description="Test GRU model with increased dropout for regularization",
    hypothesis="Higher dropout will reduce overfitting",
    model_type="gru",
    hyperparameters={"dropout": 0.3, "hidden_dim": 256},
)

# Run experiment
results = codex.run_experiment(exp_id)

# Get suggestions
suggestions = codex.suggest_improvements()
for suggestion in suggestions:
    print(f"[{suggestion['priority']}] {suggestion['message']}")

# Generate model template
template = codex.generate_model_template("cnn_lstm")
print(template)  # Ready-to-use PyTorch model class
```

## Integration with Main App

### Update main.py to use enhanced ML

```python
# In main.py lifespan
from ml import initialize_ml_system

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize ML system
    ml_components = initialize_ml_system(
        enable_monitoring=True,
        enable_continuous_training=True,
    )
    app.state.ml = ml_components
    
    # ... rest of startup
    
    yield
    
    # Cleanup
    ml_components["trainer"].stop_continuous_training()
    ml_components["monitor"].stop_monitoring()
```

### Enhanced Forecast Endpoint

```python
@app.get("/api/forecast")
async def forecast(request: Request):
    ml = request.app.state.ml
    
    # Get enhanced forecast with ensemble
    snapshot = rate_manager.snapshot()
    rate_buffer = rate_manager.get_rate_buffer()
    
    # Use ensemble forecaster
    clock_data = create_ensemble_forecast(
        snapshot,
        rate_buffer,
        ensemble_manager=ml["forecaster"],
    )
    
    # Log prediction for monitoring
    ml["monitor"].metrics.record_prediction(
        predicted=clock_data[0]["predicted"],
        latency_ms=50.0,
    )
    
    return {"clockData": clock_data, "ensemble_weights": clock_data[0].get("model_weights")}
```

## Advanced Usage

### Custom Model Architecture

```python
import torch.nn as nn

class MyCustomModel(nn.Module):
    def __init__(self):
        super().__init__()
        # Your architecture here
        
    def forward(self, x):
        # Forward pass
        return output

# Register with ensemble
from ml.ensemble import EnsembleManager

ensemble = EnsembleManager()
ensemble.models["custom"] = MyCustomModel()
ensemble.model_weights["custom"] = 0.25
ensemble._normalize_weights()
```

### A/B Testing

```python
from ml.codex_interface import CodexInterface

codex = CodexInterface()

# Setup A/B test
test = codex.setup_ab_test(
    model_a_id="lstm_v1",
    model_b_id="gru_v1",
    test_duration_hours=24,
    traffic_split=0.5,
)

# Later, check results
results = codex.get_ab_test_results(test["test_id"])
```

### Data Drift Detection

```python
from ml.monitoring import DriftDetector

detector = DriftDetector("path/to/reference_data.csv")

# Check for drift
drift_report = detector.detect_drift(current_data)

if drift_report["drift_detected"]:
    print("Data drift detected!")
    for feature, stats in drift_report["features"].items():
        if stats["drifted"]:
            print(f"  {feature}: drift_score={stats['drift_score']:.3f}")
```

## Performance Benchmarks

| Component | Latency | Memory | Notes |
|-----------|---------|--------|-------|
| Single LSTM | ~30ms | ~50MB | Baseline |
| Ensemble (3 models) | ~80ms | ~150MB | Recommended |
| Feature Engineering | ~5ms | ~20MB | Per snapshot |
| Training (per epoch) | ~2s | ~500MB | Depends on data size |

## Directory Structure

```
backend/
├── ml/
│   ├── __init__.py              # Main exports
│   ├── model.py                 # LSTM model
│   ├── forecast.py              # Inference
│   ├── ensemble.py              # Ensemble methods
│   ├── features.py              # Feature engineering
│   ├── training_pipeline.py     # Training & versioning
│   ├── monitoring.py            # Monitoring & alerts
│   ├── codex_interface.py       # AI collaboration
│   ├── dataset.py               # Data loading
│   ├── monte_carlo.py           # MC simulations
│   └── README.md                # This file
├── models/
│   ├── lstm_liquidity.pt        # Production model
│   ├── registry/                # Versioned models
│   │   ├── registry.json
│   │   ├── lstm_20240207_120000_abc123.pt
│   │   └── ...
│   └── ensemble_weights.json
├── experiments/                 # Experiment tracking
│   ├── exp_20240207_120000_a1b2c3.json
│   └── ...
├── metrics/                     # Performance metrics
│   ├── performance_2024-02-07.jsonl
│   └── ...
└── alerts/                      # Alert history
    ├── alert_20240207_120000_1234.json
    └── ...
```

## Testing

```bash
# Run ML tests
pytest tests/test_ml*.py -v

# Test specific component
pytest tests/test_ensemble.py -v
pytest tests/test_features.py -v

# Run with coverage
pytest tests/ --cov=ml --cov-report=html
```

## Troubleshooting

### Model Not Loading
```python
# Check if model exists
from ml.training_pipeline import ModelRegistry
registry = ModelRegistry()
versions = registry.list_versions()
print(f"Available models: {len(versions)}")
```

### Out of Memory During Training
```python
# Reduce batch size
config = TrainingConfig(batch_size=32)  # Default is 64
```

### Slow Predictions
```python
# Use single model instead of ensemble
from ml import create_forecaster
forecaster = create_forecaster(use_ensemble=False)
```

## Contributing (for Codex)

When collaborating on ML improvements:

1. **Use Experiment Tracker**: Always create an experiment for changes
2. **Version Control**: Register new models in the registry
3. **Monitor Impact**: Check performance before/after changes
4. **Document**: Update this README with new features

## Roadmap

- [ ] Add XGBoost and LightGBM models
- [ ] Implement online learning
- [ ] Add SHAP value explanations
- [ ] Multi-horizon forecasting
- [ ] Automated feature selection
- [ ] Model compression for edge deployment
