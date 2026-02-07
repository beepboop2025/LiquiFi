"""Monitoring and alerting system for ML pipeline.

Tracks:
- Model performance metrics
- Data quality and drift
- Prediction accuracy over time
- System health
- Anomaly detection
"""

import logging
import os
import json
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from collections import deque
import threading
import time

import numpy as np
import pandas as pd

import config

logger = logging.getLogger("liquifi.monitoring")


@dataclass
class Alert:
    """Represents an alert."""
    alert_id: str
    timestamp: str
    severity: str  # "info", "warning", "critical"
    category: str  # "performance", "data", "system"
    message: str
    metric_value: Optional[float] = None
    threshold: Optional[float] = None
    acknowledged: bool = False
    resolved: bool = False


@dataclass
class PerformanceSnapshot:
    """Snapshot of model performance."""
    timestamp: str
    rmse: float
    mae: float
    mape: float
    prediction_count: int
    avg_latency_ms: float
    error_count: int


class MetricsCollector:
    """Collect and store metrics."""
    
    def __init__(self, metrics_dir: str = "metrics"):
        self.metrics_dir = Path(metrics_dir)
        self.metrics_dir.mkdir(parents=True, exist_ok=True)
        
        # In-memory buffers
        self._prediction_buffer: deque = deque(maxlen=1000)
        self._performance_history: deque = deque(maxlen=168)  # 1 week hourly
        
    def record_prediction(
        self,
        predicted: float,
        actual: Optional[float] = None,
        latency_ms: float = 0.0,
        metadata: Optional[Dict] = None,
    ) -> None:
        """Record a prediction for later analysis."""
        self._prediction_buffer.append({
            "timestamp": datetime.now().isoformat(),
            "predicted": predicted,
            "actual": actual,
            "latency_ms": latency_ms,
            "metadata": metadata or {},
        })
        
    def record_performance(
        self,
        rmse: float,
        mae: float,
        mape: float,
        prediction_count: int,
        avg_latency_ms: float,
        error_count: int = 0,
    ) -> None:
        """Record a performance snapshot."""
        snapshot = PerformanceSnapshot(
            timestamp=datetime.now().isoformat(),
            rmse=rmse,
            mae=mae,
            mape=mape,
            prediction_count=prediction_count,
            avg_latency_ms=avg_latency_ms,
            error_count=error_count,
        )
        self._performance_history.append(snapshot)
        
        # Persist to disk
        self._save_snapshot(snapshot)
        
    def _save_snapshot(self, snapshot: PerformanceSnapshot) -> None:
        """Save snapshot to disk."""
        date_str = datetime.now().strftime("%Y-%m-%d")
        file_path = self.metrics_dir / f"performance_{date_str}.jsonl"
        
        with open(file_path, "a") as f:
            f.write(json.dumps(asdict(snapshot)) + "\n")
            
    def get_recent_performance(self, hours: int = 24) -> pd.DataFrame:
        """Get performance data for recent period."""
        cutoff = datetime.now() - timedelta(hours=hours)
        
        data = []
        for snapshot in self._performance_history:
            ts = datetime.fromisoformat(snapshot.timestamp)
            if ts > cutoff:
                data.append(asdict(snapshot))
                
        return pd.DataFrame(data)
        
    def calculate_accuracy_metrics(self, hours: int = 24) -> Dict[str, float]:
        """Calculate accuracy metrics from recent predictions."""
        cutoff = datetime.now() - timedelta(hours=hours)
        
        predictions = [
            p for p in self._prediction_buffer
            if datetime.fromisoformat(p["timestamp"]) > cutoff and p["actual"] is not None
        ]
        
        if len(predictions) < 10:
            return {"error": "Insufficient data for accuracy calculation"}
            
        pred_values = np.array([p["predicted"] for p in predictions])
        actual_values = np.array([p["actual"] for p in predictions])
        
        errors = pred_values - actual_values
        
        return {
            "count": len(predictions),
            "rmse": float(np.sqrt(np.mean(errors ** 2))),
            "mae": float(np.mean(np.abs(errors))),
            "mape": float(np.mean(np.abs(errors / actual_values)) * 100),
            "bias": float(np.mean(errors)),
            "r2": float(1 - np.sum(errors ** 2) / np.sum((actual_values - np.mean(actual_values)) ** 2)),
        }


class DriftDetector:
    """Detect data drift and model degradation."""
    
    def __init__(self, reference_data_path: Optional[str] = None):
        self.reference_data_path = reference_data_path
        self._reference_distribution: Optional[Dict[str, Any]] = None
        self._load_reference()
        
    def _load_reference(self) -> None:
        """Load reference distribution from training data."""
        if self.reference_data_path and os.path.exists(self.reference_data_path):
            try:
                df = pd.read_csv(self.reference_data_path)
                self._reference_distribution = self._compute_distribution(df)
                logger.info("Loaded reference distribution for drift detection")
            except Exception as exc:
                logger.warning(f"Could not load reference distribution: {exc}")
                
    def _compute_distribution(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Compute statistical distribution of data."""
        distribution = {}
        
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        
        for col in numeric_cols:
            distribution[col] = {
                "mean": float(df[col].mean()),
                "std": float(df[col].std()),
                "min": float(df[col].min()),
                "max": float(df[col].max()),
                "q25": float(df[col].quantile(0.25)),
                "q50": float(df[col].quantile(0.50)),
                "q75": float(df[col].quantile(0.75)),
            }
            
        return distribution
        
    def detect_drift(
        self,
        current_data: pd.DataFrame,
        threshold: float = 0.1,
    ) -> Dict[str, Any]:
        """Detect drift between reference and current data."""
        if self._reference_distribution is None:
            return {"status": "no_reference", "drift_detected": False}
            
        current_dist = self._compute_distribution(current_data)
        drift_report = {
            "status": "checked",
            "drift_detected": False,
            "features": {},
            "timestamp": datetime.now().isoformat(),
        }
        
        for feature, ref_stats in self._reference_distribution.items():
            if feature not in current_dist:
                continue
                
            curr_stats = current_dist[feature]
            
            # Check mean drift (normalized)
            mean_drift = abs(curr_stats["mean"] - ref_stats["mean"]) / (ref_stats["std"] + 1e-6)
            
            # Check distribution shift (using min/max range)
            ref_range = ref_stats["max"] - ref_stats["min"]
            curr_range = curr_stats["max"] - curr_stats["min"]
            range_ratio = abs(curr_range - ref_range) / (ref_range + 1e-6)
            
            drift_score = (mean_drift + range_ratio) / 2
            
            drift_report["features"][feature] = {
                "drift_score": float(drift_score),
                "mean_shift": float(mean_drift),
                "range_shift": float(range_ratio),
                "drifted": drift_score > threshold,
            }
            
            if drift_score > threshold:
                drift_report["drift_detected"] = True
                
        return drift_report
        
    def detect_anomalies(
        self,
        values: np.ndarray,
        method: str = "iqr",
    ) -> np.ndarray:
        """Detect anomalous values."""
        if method == "iqr":
            q1 = np.percentile(values, 25)
            q3 = np.percentile(values, 75)
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            return (values < lower) | (values > upper)
            
        elif method == "zscore":
            z_scores = np.abs((values - np.mean(values)) / (np.std(values) + 1e-6))
            return z_scores > 3
            
        else:
            raise ValueError(f"Unknown anomaly detection method: {method}")


class AlertManager:
    """Manage alerts and notifications."""
    
    def __init__(self, alerts_dir: str = "alerts"):
        self.alerts_dir = Path(alerts_dir)
        self.alerts_dir.mkdir(parents=True, exist_ok=True)
        self._alerts: List[Alert] = []
        self._handlers: List[Callable[[Alert], None]] = []
        self._load_alerts()
        
    def _load_alerts(self) -> None:
        """Load historical alerts."""
        for alert_file in self.alerts_dir.glob("alert_*.json"):
            try:
                with open(alert_file, "r") as f:
                    data = json.load(f)
                    self._alerts.append(Alert(**data))
            except Exception as exc:
                logger.warning(f"Failed to load alert {alert_file}: {exc}")
                
    def _save_alert(self, alert: Alert) -> None:
        """Save alert to disk."""
        alert_file = self.alerts_dir / f"alert_{alert.alert_id}.json"
        with open(alert_file, "w") as f:
            json.dump(asdict(alert), f, indent=2)
            
    def add_handler(self, handler: Callable[[Alert], None]) -> None:
        """Add an alert handler."""
        self._handlers.append(handler)
        
    def create_alert(
        self,
        severity: str,
        category: str,
        message: str,
        metric_value: Optional[float] = None,
        threshold: Optional[float] = None,
    ) -> Alert:
        """Create a new alert."""
        alert_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{np.random.randint(10000)}"
        
        alert = Alert(
            alert_id=alert_id,
            timestamp=datetime.now().isoformat(),
            severity=severity,
            category=category,
            message=message,
            metric_value=metric_value,
            threshold=threshold,
        )
        
        self._alerts.append(alert)
        self._save_alert(alert)
        
        # Notify handlers
        for handler in self._handlers:
            try:
                handler(alert)
            except Exception as exc:
                logger.error(f"Alert handler failed: {exc}")
                
        logger.warning(f"Alert created: [{severity}] {message}")
        return alert
        
    def acknowledge_alert(self, alert_id: str) -> None:
        """Acknowledge an alert."""
        for alert in self._alerts:
            if alert.alert_id == alert_id:
                alert.acknowledged = True
                self._save_alert(alert)
                break
                
    def resolve_alert(self, alert_id: str) -> None:
        """Mark an alert as resolved."""
        for alert in self._alerts:
            if alert.alert_id == alert_id:
                alert.resolved = True
                self._save_alert(alert)
                break
                
    def get_active_alerts(self, severity: Optional[str] = None) -> List[Alert]:
        """Get active (unresolved) alerts."""
        alerts = [a for a in self._alerts if not a.resolved]
        
        if severity:
            alerts = [a for a in alerts if a.severity == severity]
            
        return sorted(alerts, key=lambda a: a.timestamp, reverse=True)
        
    def clear_old_alerts(self, days: int = 30) -> int:
        """Clear alerts older than specified days."""
        cutoff = datetime.now() - timedelta(days=days)
        
        to_remove = []
        for alert in self._alerts:
            ts = datetime.fromisoformat(alert.timestamp)
            if ts < cutoff and alert.resolved:
                to_remove.append(alert)
                
        for alert in to_remove:
            self._alerts.remove(alert)
            alert_file = self.alerts_dir / f"alert_{alert.alert_id}.json"
            if alert_file.exists():
                alert_file.unlink()
                
        return len(to_remove)


class MLMonitoringSystem:
    """Integrated ML monitoring system."""
    
    def __init__(
        self,
        metrics_collector: Optional[MetricsCollector] = None,
        drift_detector: Optional[DriftDetector] = None,
        alert_manager: Optional[AlertManager] = None,
    ):
        self.metrics = metrics_collector or MetricsCollector()
        self.drift = drift_detector or DriftDetector(config.TRAINING_DATA_PATH)
        self.alerts = alert_manager or AlertManager()
        
        # Thresholds
        self.rmse_threshold = 50.0
        self.latency_threshold_ms = 500.0
        self.error_rate_threshold = 0.05
        self.drift_threshold = 0.15
        
        # Background monitoring
        self._stop_event = threading.Event()
        self._monitor_thread: Optional[threading.Thread] = None
        
    def start_monitoring(self, check_interval_minutes: int = 10) -> None:
        """Start background monitoring."""
        if self._monitor_thread and self._monitor_thread.is_alive():
            return
            
        self._stop_event.clear()
        self._monitor_thread = threading.Thread(
            target=self._monitoring_loop,
            args=(check_interval_minutes,),
            daemon=True,
        )
        self._monitor_thread.start()
        logger.info("Started ML monitoring system")
        
    def stop_monitoring(self) -> None:
        """Stop background monitoring."""
        self._stop_event.set()
        if self._monitor_thread:
            self._monitor_thread.join(timeout=5)
            
    def _monitoring_loop(self, interval_minutes: int) -> None:
        """Main monitoring loop."""
        while not self._stop_event.is_set():
            try:
                self._check_performance()
                self._check_data_quality()
                self._check_system_health()
            except Exception as exc:
                logger.error(f"Error in monitoring loop: {exc}")
                
            self._stop_event.wait(interval_minutes * 60)
            
    def _check_performance(self) -> None:
        """Check model performance metrics."""
        recent = self.metrics.get_recent_performance(hours=1)
        
        if len(recent) == 0:
            return
            
        latest = recent.iloc[-1]
        
        # Check RMSE
        if latest.get("rmse", 0) > self.rmse_threshold:
            self.alerts.create_alert(
                severity="critical",
                category="performance",
                message=f"RMSE exceeded threshold: {latest['rmse']:.2f} > {self.rmse_threshold}",
                metric_value=float(latest["rmse"]),
                threshold=self.rmse_threshold,
            )
            
        # Check latency
        if latest.get("avg_latency_ms", 0) > self.latency_threshold_ms:
            self.alerts.create_alert(
                severity="warning",
                category="performance",
                message=f"Prediction latency high: {latest['avg_latency_ms']:.0f}ms > {self.latency_threshold_ms}ms",
                metric_value=float(latest["avg_latency_ms"]),
                threshold=self.latency_threshold_ms,
            )
            
    def _check_data_quality(self) -> None:
        """Check data quality and drift."""
        # Load recent live data
        live_data_path = config.TRAINING_DATA_PATH
        if os.path.exists(live_data_path):
            try:
                df = pd.read_csv(live_data_path)
                drift_report = self.drift.detect_drift(df, threshold=self.drift_threshold)
                
                if drift_report.get("drift_detected"):
                    drifted_features = [
                        f for f, stats in drift_report["features"].items()
                        if stats.get("drifted")
                    ]
                    
                    self.alerts.create_alert(
                        severity="warning",
                        category="data",
                        message=f"Data drift detected in features: {', '.join(drifted_features[:5])}",
                    )
            except Exception as exc:
                logger.error(f"Error checking data drift: {exc}")
                
    def _check_system_health(self) -> None:
        """Check overall system health."""
        # Check error rate
        recent = self.metrics.get_recent_performance(hours=1)
        
        if len(recent) > 0:
            total_predictions = recent["prediction_count"].sum()
            total_errors = recent["error_count"].sum()
            
            if total_predictions > 0:
                error_rate = total_errors / total_predictions
                
                if error_rate > self.error_rate_threshold:
                    self.alerts.create_alert(
                        severity="critical",
                        category="system",
                        message=f"Error rate exceeded threshold: {error_rate:.1%} > {self.error_rate_threshold:.1%}",
                        metric_value=error_rate,
                        threshold=self.error_rate_threshold,
                    )
                    
    def get_health_report(self) -> Dict[str, Any]:
        """Get comprehensive health report."""
        recent_perf = self.metrics.get_recent_performance(hours=24)
        accuracy = self.metrics.calculate_accuracy_metrics(hours=24)
        active_alerts = self.alerts.get_active_alerts()
        
        # Determine overall health
        health_score = 100
        
        if len(active_alerts) > 0:
            critical_count = len([a for a in active_alerts if a.severity == "critical"])
            health_score -= critical_count * 20
            
        if isinstance(accuracy, dict) and "rmse" in accuracy:
            if accuracy["rmse"] > self.rmse_threshold:
                health_score -= 30
                
        health_score = max(0, health_score)
        
        return {
            "timestamp": datetime.now().isoformat(),
            "health_score": health_score,
            "status": "healthy" if health_score >= 80 else "degraded" if health_score >= 50 else "critical",
            "recent_predictions": len(recent_perf),
            "accuracy_metrics": accuracy,
            "active_alerts": len(active_alerts),
            "critical_alerts": len([a for a in active_alerts if a.severity == "critical"]),
        }


def create_monitoring_system() -> MLMonitoringSystem:
    """Factory function to create monitoring system."""
    return MLMonitoringSystem()


# ---------------------------------------------------------------------------
# Production Performance Tracker (prediction vs actual validation)
# ---------------------------------------------------------------------------

class ModelPerformanceTracker:
    """Track real-time model performance against actual outcomes."""

    PREDICTIONS_LOG = os.path.join(
        os.path.dirname(__file__), "..", "metrics", "predictions_log.jsonl"
    )

    def __init__(self, retrain_threshold_rmse: float = 25.0):
        self.retrain_threshold_rmse = retrain_threshold_rmse
        self._predictions: deque = deque(maxlen=1000)
        self._lock = threading.Lock()
        self._last_retrain_trigger: float = 0
        os.makedirs(os.path.dirname(self.PREDICTIONS_LOG), exist_ok=True)

    def record_prediction(
        self,
        predicted_balances: list[float],
        model_source: str = "lstm",
        data_source: str = "real",
    ) -> None:
        """Record a new 24h forecast for later validation."""
        record = {
            "timestamp": datetime.now().isoformat(),
            "predicted": predicted_balances,
            "model_source": model_source,
            "data_source": data_source,
            "actuals": [],
            "rmse": None,
        }
        with self._lock:
            self._predictions.append(record)
        try:
            with open(self.PREDICTIONS_LOG, "a") as f:
                f.write(json.dumps(record, default=str) + "\n")
        except Exception:
            pass

    def record_actual(self, actual_balance: float) -> None:
        """Append an actual balance reading to the most recent prediction for comparison."""
        with self._lock:
            for record in reversed(self._predictions):
                if len(record["actuals"]) < 24:
                    record["actuals"].append(actual_balance)
                    if len(record["actuals"]) >= 6:
                        n = min(len(record["predicted"]), len(record["actuals"]))
                        pred = np.array(record["predicted"][:n])
                        actual = np.array(record["actuals"][:n])
                        record["rmse"] = float(np.sqrt(np.mean((pred - actual) ** 2)))
                    break

    def get_performance_summary(self) -> dict:
        """Get summary of how the model is performing against actuals."""
        with self._lock:
            validated = [r for r in self._predictions if r["rmse"] is not None]

        if not validated:
            return {"status": "awaiting_validation", "validated_count": 0}

        rmses = [r["rmse"] for r in validated]
        avg_rmse = float(np.mean(rmses))
        sources = {}
        for r in validated:
            sources[r["model_source"]] = sources.get(r["model_source"], 0) + 1

        return {
            "status": "active",
            "validated_count": len(validated),
            "avg_rmse": round(avg_rmse, 3),
            "best_rmse": round(min(rmses), 3),
            "worst_rmse": round(max(rmses), 3),
            "needs_retrain": avg_rmse > self.retrain_threshold_rmse,
            "model_source_breakdown": sources,
        }

    def should_retrain(self) -> tuple[bool, str]:
        """Check if auto-retrain should be triggered."""
        now = time.time()
        if now - self._last_retrain_trigger < 3600:
            return False, "Retrain cooldown active"
        summary = self.get_performance_summary()
        if summary.get("needs_retrain"):
            self._last_retrain_trigger = now
            return True, f"Avg RMSE {summary['avg_rmse']} > threshold {self.retrain_threshold_rmse}"
        return False, "Performance acceptable"


_perf_tracker: Optional[ModelPerformanceTracker] = None


def get_performance_tracker() -> ModelPerformanceTracker:
    """Get or create global performance tracker."""
    global _perf_tracker
    if _perf_tracker is None:
        _perf_tracker = ModelPerformanceTracker()
    return _perf_tracker
