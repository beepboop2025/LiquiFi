"""Codex Collaboration Interface for ML Enhancement.

This module provides a standardized interface for Codex (and other AI assistants)
to collaborate on improving the ML pipeline.

Features:
- Experiment tracking and sharing
- Model performance comparison
- A/B test orchestration
- Automated experiment suggestions
- Code generation for new models
"""

import logging
import os
import json
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
import hashlib

import numpy as np
import pandas as pd
import torch

import config
from ml.training_pipeline import ModelRegistry, ModelVersion, TrainingConfig
from ml.ensemble import EnsembleManager

logger = logging.getLogger("liquifi.codex_interface")


@dataclass
class Experiment:
    """Represents an ML experiment."""
    experiment_id: str
    name: str
    description: str
    hypothesis: str
    status: str  # "pending", "running", "completed", "failed"
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    model_type: str = ""
    hyperparameters: Dict[str, Any] = None
    metrics: Dict[str, float] = None
    artifacts: List[str] = None
    parent_experiment: Optional[str] = None
    notes: str = ""
    
    def __post_init__(self):
        if self.hyperparameters is None:
            self.hyperparameters = {}
        if self.metrics is None:
            self.metrics = {}
        if self.artifacts is None:
            self.artifacts = []


class ExperimentTracker:
    """Track and manage ML experiments."""
    
    def __init__(self, experiments_dir: str = "experiments"):
        self.experiments_dir = Path(experiments_dir)
        self.experiments_dir.mkdir(parents=True, exist_ok=True)
        self._experiments: Dict[str, Experiment] = {}
        self._load_experiments()
        
    def _load_experiments(self) -> None:
        """Load experiments from disk."""
        for exp_file in self.experiments_dir.glob("*.json"):
            try:
                with open(exp_file, "r") as f:
                    data = json.load(f)
                    exp = Experiment(**data)
                    self._experiments[exp.experiment_id] = exp
            except Exception as exc:
                logger.warning(f"Failed to load experiment {exp_file}: {exc}")
                
    def _save_experiment(self, exp: Experiment) -> None:
        """Save experiment to disk."""
        exp_file = self.experiments_dir / f"{exp.experiment_id}.json"
        with open(exp_file, "w") as f:
            json.dump(asdict(exp), f, indent=2)
            
    def create_experiment(
        self,
        name: str,
        description: str,
        hypothesis: str,
        model_type: str = "lstm",
        hyperparameters: Optional[Dict[str, Any]] = None,
        parent_experiment: Optional[str] = None,
    ) -> Experiment:
        """Create a new experiment."""
        exp_id = f"exp_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{self._generate_hash()[:6]}"
        
        exp = Experiment(
            experiment_id=exp_id,
            name=name,
            description=description,
            hypothesis=hypothesis,
            status="pending",
            created_at=datetime.now().isoformat(),
            model_type=model_type,
            hyperparameters=hyperparameters or {},
            parent_experiment=parent_experiment,
        )
        
        self._experiments[exp_id] = exp
        self._save_experiment(exp)
        
        logger.info(f"Created experiment: {exp_id} - {name}")
        return exp
        
    def start_experiment(self, exp_id: str) -> None:
        """Mark experiment as started."""
        if exp_id in self._experiments:
            self._experiments[exp_id].status = "running"
            self._experiments[exp_id].started_at = datetime.now().isoformat()
            self._save_experiment(self._experiments[exp_id])
            
    def complete_experiment(
        self,
        exp_id: str,
        metrics: Dict[str, float],
        artifacts: List[str],
    ) -> None:
        """Mark experiment as completed with results."""
        if exp_id in self._experiments:
            exp = self._experiments[exp_id]
            exp.status = "completed"
            exp.completed_at = datetime.now().isoformat()
            exp.metrics = metrics
            exp.artifacts = artifacts
            self._save_experiment(exp)
            logger.info(f"Completed experiment {exp_id} with metrics: {metrics}")
            
    def fail_experiment(self, exp_id: str, reason: str) -> None:
        """Mark experiment as failed."""
        if exp_id in self._experiments:
            self._experiments[exp_id].status = "failed"
            self._experiments[exp_id].notes = reason
            self._experiments[exp_id].completed_at = datetime.now().isoformat()
            self._save_experiment(self._experiments[exp_id])
            
    def get_experiment(self, exp_id: str) -> Optional[Experiment]:
        """Get experiment by ID."""
        return self._experiments.get(exp_id)
        
    def list_experiments(
        self,
        status: Optional[str] = None,
        model_type: Optional[str] = None,
    ) -> List[Experiment]:
        """List experiments with optional filtering."""
        exps = list(self._experiments.values())
        
        if status:
            exps = [e for e in exps if e.status == status]
        if model_type:
            exps = [e for e in exps if e.model_type == model_type]
            
        return sorted(exps, key=lambda e: e.created_at, reverse=True)
        
    def get_best_experiments(self, metric: str = "rmse", top_k: int = 5) -> List[Experiment]:
        """Get top-k experiments by a metric."""
        completed = [e for e in self._experiments.values() if e.status == "completed"]
        
        # Sort by metric (assuming lower is better)
        sorted_exps = sorted(
            completed,
            key=lambda e: e.metrics.get(metric, float("inf"))
        )
        
        return sorted_exps[:top_k]
        
    def _generate_hash(self) -> str:
        """Generate short hash."""
        data = f"{datetime.now().isoformat()}{np.random.randint(10000)}"
        return hashlib.sha256(data.encode()).hexdigest()


class CodexInterface:
    """Interface for Codex to collaborate on ML improvements."""
    
    def __init__(
        self,
        model_registry: Optional[ModelRegistry] = None,
        experiment_tracker: Optional[ExperimentTracker] = None,
    ):
        self.model_registry = model_registry or ModelRegistry()
        self.experiment_tracker = experiment_tracker or ExperimentTracker()
        self.ensemble_manager: Optional[EnsembleManager] = None
        
    # ============== Information Retrieval ==============
    
    def get_current_performance(self) -> Dict[str, Any]:
        """Get current model performance summary."""
        active_models = self.model_registry.list_versions(active_only=True)
        
        if not active_models:
            return {"status": "no_active_models", "message": "No models currently active"}
            
        active = active_models[0]
        
        # Get ensemble info if available
        if self.ensemble_manager is None:
            self.ensemble_manager = EnsembleManager()
            
        return {
            "status": "active",
            "current_model": {
                "version_id": active.version_id,
                "type": active.model_type,
                "metrics": active.metrics,
                "timestamp": active.timestamp,
            },
            "ensemble_weights": self.ensemble_manager.model_weights,
            "available_models": len(self.model_registry.list_versions()),
        }
        
    def get_historical_performance(self, n_models: int = 10) -> pd.DataFrame:
        """Get historical performance of last N models."""
        versions = self.model_registry.list_versions()[:n_models]
        
        data = []
        for v in versions:
            data.append({
                "version_id": v.version_id,
                "timestamp": v.timestamp,
                "model_type": v.model_type,
                **v.metrics,
            })
            
        return pd.DataFrame(data)
        
    def compare_models(self, model_ids: List[str]) -> Dict[str, Any]:
        """Compare multiple models."""
        models = []
        for mid in model_ids:
            m = self.model_registry.get_version(mid)
            if m:
                models.append(m)
                
        if len(models) < 2:
            return {"error": "Need at least 2 valid models to compare"}
            
        # Create comparison matrix
        metrics = set()
        for m in models:
            metrics.update(m.metrics.keys())
            
        comparison = {}
        for metric in metrics:
            comparison[metric] = {
                m.version_id: m.metrics.get(metric, None)
                for m in models
            }
            
        # Find best for each metric
        best = {}
        for metric in metrics:
            values = {m.version_id: m.metrics.get(metric, float("inf")) for m in models}
            if metric in ["rmse", "mae", "mape"]:
                best[metric] = min(values, key=values.get)
            else:
                best[metric] = max(values, key=values.get)
                
        return {
            "models": [m.version_id for m in models],
            "comparison": comparison,
            "best_per_metric": best,
        }
        
    def get_data_statistics(self) -> Dict[str, Any]:
        """Get statistics about training data."""
        from data.training_store import get_live_stats
        
        stats = get_live_stats()
        
        # Add more detailed stats if data exists
        if stats["rows"] > 0:
            df = pd.read_csv(config.TRAINING_DATA_PATH)
            
            stats["columns"] = list(df.columns)
            stats["date_range"] = {
                "start": df["date"].min() if "date" in df.columns else None,
                "end": df["date"].max() if "date" in df.columns else None,
            }
            
            if "balance" in df.columns:
                stats["balance_statistics"] = {
                    "mean": float(df["balance"].mean()),
                    "std": float(df["balance"].std()),
                    "min": float(df["balance"].min()),
                    "max": float(df["balance"].max()),
                }
                
        return stats
        
    # ============== Experiment Management ==============
    
    def propose_experiment(
        self,
        name: str,
        description: str,
        hypothesis: str,
        model_type: str,
        hyperparameters: Dict[str, Any],
    ) -> str:
        """Propose a new experiment. Returns experiment ID."""
        exp = self.experiment_tracker.create_experiment(
            name=name,
            description=description,
            hypothesis=hypothesis,
            model_type=model_type,
            hyperparameters=hyperparameters,
        )
        
        logger.info(f"Codex proposed experiment: {exp.experiment_id}")
        return exp.experiment_id
        
    def run_experiment(
        self,
        exp_id: str,
        training_func: Optional[Callable] = None,
    ) -> Dict[str, Any]:
        """Run a proposed experiment."""
        exp = self.experiment_tracker.get_experiment(exp_id)
        if not exp:
            return {"error": f"Experiment {exp_id} not found"}
            
        self.experiment_tracker.start_experiment(exp_id)
        
        try:
            if training_func:
                # Use custom training function provided by Codex
                metrics, artifacts = training_func(exp)
            else:
                # Use default training
                from ml.training_pipeline import AutomatedTrainingPipeline
                
                pipeline = AutomatedTrainingPipeline(self.model_registry)
                cfg = TrainingConfig(
                    model_type=exp.model_type,
                    **exp.hyperparameters,
                )
                version = pipeline.run_training_job(cfg)
                
                metrics = version.metrics
                artifacts = [f"models/registry/{version.version_id}.pt"]
                
            self.experiment_tracker.complete_experiment(exp_id, metrics, artifacts)
            
            return {
                "status": "success",
                "experiment_id": exp_id,
                "metrics": metrics,
                "artifacts": artifacts,
            }
            
        except Exception as exc:
            self.experiment_tracker.fail_experiment(exp_id, str(exc))
            return {
                "status": "failed",
                "experiment_id": exp_id,
                "error": str(exc),
            }
            
    # ============== A/B Testing ==============
    
    def setup_ab_test(
        self,
        model_a_id: str,
        model_b_id: str,
        test_duration_hours: int = 24,
        traffic_split: float = 0.5,
    ) -> Dict[str, str]:
        """Setup an A/B test between two models."""
        test_id = f"abtest_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        test_config = {
            "test_id": test_id,
            "model_a": model_a_id,
            "model_b": model_b_id,
            "start_time": datetime.now().isoformat(),
            "end_time": (datetime.now() + pd.Timedelta(hours=test_duration_hours)).isoformat(),
            "traffic_split": traffic_split,
            "status": "running",
            "results": {},
        }
        
        # Save test config
        test_file = Path("experiments") / f"{test_id}.json"
        test_file.parent.mkdir(exist_ok=True)
        with open(test_file, "w") as f:
            json.dump(test_config, f, indent=2)
            
        logger.info(f"Started A/B test: {test_id}")
        return {"test_id": test_id, "config": test_config}
        
    def get_ab_test_results(self, test_id: str) -> Dict[str, Any]:
        """Get results of an A/B test."""
        test_file = Path("experiments") / f"{test_id}.json"
        
        if not test_file.exists():
            return {"error": f"Test {test_id} not found"}
            
        with open(test_file, "r") as f:
            test_config = json.load(f)
            
        return test_config
        
    # ============== Code Generation Helpers ==============
    
    def generate_model_template(self, model_type: str) -> str:
        """Generate a template for a new model architecture."""
        templates = {
            "lstm": '''
class CustomLSTM(nn.Module):
    def __init__(self, input_dim=12, hidden_dim=128, num_layers=2, output_dim=24):
        super().__init__()
        self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_dim, output_dim)
        
    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])
''',
            "transformer": '''
class CustomTransformer(nn.Module):
    def __init__(self, input_dim=12, d_model=64, nhead=4, output_dim=24):
        super().__init__()
        self.encoder = nn.Linear(input_dim, d_model)
        self.transformer = nn.TransformerEncoderLayer(d_model, nhead)
        self.fc = nn.Linear(d_model, output_dim)
        
    def forward(self, x):
        x = self.encoder(x)
        x = self.transformer(x)
        return self.fc(x.mean(dim=1))
''',
            "cnn_lstm": '''
class CNNLSTM(nn.Module):
    def __init__(self, input_dim=12, hidden_dim=128, output_dim=24):
        super().__init__()
        self.cnn = nn.Conv1d(input_dim, 32, kernel_size=3, padding=1)
        self.lstm = nn.LSTM(32, hidden_dim, batch_first=True)
        self.fc = nn.Linear(hidden_dim, output_dim)
        
    def forward(self, x):
        # x: (batch, seq_len, features)
        x = x.permute(0, 2, 1)  # (batch, features, seq_len)
        x = torch.relu(self.cnn(x))
        x = x.permute(0, 2, 1)  # (batch, seq_len, features)
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])
''',
        }
        
        return templates.get(model_type, "# No template available for this model type")
        
    def generate_training_config(self, base_config: Optional[Dict] = None) -> TrainingConfig:
        """Generate a training configuration with smart defaults."""
        defaults = {
            "model_type": "lstm",
            "epochs": 100,
            "learning_rate": 0.001,
            "hidden_dim": 128,
            "num_layers": 2,
            "dropout": 0.15,
            "batch_size": 64,
        }
        
        if base_config:
            defaults.update(base_config)
            
        return TrainingConfig(**defaults)
        
    # ============== Analysis and Suggestions ==============
    
    def analyze_performance_trends(self) -> Dict[str, Any]:
        """Analyze trends in model performance over time."""
        versions = self.model_registry.list_versions()
        
        if len(versions) < 3:
            return {"message": "Not enough historical data for trend analysis"}
            
        df = self.get_historical_performance(len(versions))
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.sort_values("timestamp")
        
        analysis = {}
        
        for metric in ["rmse", "mae"]:
            if metric in df.columns:
                values = df[metric].dropna()
                if len(values) >= 3:
                    # Trend analysis
                    trend = np.polyfit(range(len(values)), values, 1)[0]
                    
                    analysis[metric] = {
                        "current": float(values.iloc[-1]),
                        "best": float(values.min()),
                        "worst": float(values.max()),
                        "trend": "improving" if trend < 0 else "degrading",
                        "trend_slope": float(trend),
                        "improvement_potential": float(values.max() - values.min()),
                    }
                    
        return analysis
        
    def suggest_improvements(self) -> List[Dict[str, str]]:
        """Suggest improvements based on current performance."""
        suggestions = []
        
        # Analyze current state
        perf = self.get_current_performance()
        trends = self.analyze_performance_trends()
        data_stats = self.get_data_statistics()
        
        # Suggestion 1: Data quantity
        if data_stats.get("rows", 0) < 1000:
            suggestions.append({
                "type": "data",
                "priority": "high",
                "message": "Insufficient training data. Collect more live snapshots.",
                "action": "Continue running the intensive training script",
            })
            
        # Suggestion 2: Model diversity
        if len(self.model_registry.list_versions()) < 3:
            suggestions.append({
                "type": "model",
                "priority": "medium",
                "message": "Limited model diversity. Consider training GRU or Transformer models.",
                "action": "Run hyperparameter optimization with different architectures",
            })
            
        # Suggestion 3: Performance degradation
        for metric, analysis in trends.items():
            if analysis.get("trend") == "degrading":
                suggestions.append({
                    "type": "performance",
                    "priority": "high",
                    "message": f"{metric.upper()} is trending upward (worse). Model may need retraining.",
                    "action": "Investigate data drift and retrain with recent data",
                })
                
        # Suggestion 4: Ensemble optimization
        if perf.get("ensemble_weights"):
            weights = perf["ensemble_weights"]
            if len(weights) > 0 and max(weights.values()) > 0.8:
                suggestions.append({
                    "type": "ensemble",
                    "priority": "low",
                    "message": "Ensemble is dominated by one model. Consider rebalancing.",
                    "action": "Run ensemble weight optimization",
                })
                
        return suggestions


def create_codex_interface() -> CodexInterface:
    """Factory function to create Codex interface."""
    return CodexInterface()


# CLI for Codex interaction
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Codex Collaboration Interface")
    parser.add_argument("action", choices=[
        "status", "performance", "experiments", "suggest", "compare"
    ])
    parser.add_argument("--model-ids", nargs="+", help="Model IDs for comparison")
    
    args = parser.parse_args()
    
    interface = create_codex_interface()
    
    if args.action == "status":
        print(json.dumps(interface.get_current_performance(), indent=2))
    elif args.action == "performance":
        print(interface.get_historical_performance().to_string())
    elif args.action == "experiments":
        exps = interface.experiment_tracker.list_experiments()
        for e in exps:
            print(f"{e.experiment_id}: {e.name} ({e.status})")
    elif args.action == "suggest":
        suggestions = interface.suggest_improvements()
        print(json.dumps(suggestions, indent=2))
    elif args.action == "compare" and args.model_ids:
        result = interface.compare_models(args.model_ids)
        print(json.dumps(result, indent=2))
