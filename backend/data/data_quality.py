"""
Data Quality Monitoring System

Tracks the quality of scraped data and alerts when too many fields are using fallback values.
"""

import logging
import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from collections import deque
import threading

logger = logging.getLogger("liquifi.data_quality")


@dataclass
class DataQualitySnapshot:
    """Snapshot of data quality at a point in time."""
    timestamp: str
    total_fields: int
    real_fields: int
    simulated_fields: int
    real_percentage: float
    source_breakdown: Dict[str, List[str]]
    missing_fields: List[str]
    
    def to_dict(self) -> Dict:
        return asdict(self)


class DataQualityMonitor:
    """Monitor data quality over time."""
    
    def __init__(
        self,
        history_size: int = 168,  # 1 week of hourly snapshots
        min_quality_threshold: float = 0.5,  # At least 50% real data
    ):
        self.history_size = history_size
        self.min_quality_threshold = min_quality_threshold
        self._history: deque = deque(maxlen=history_size)
        self._alerts: List[Dict] = []
        self._lock = threading.Lock()
        
    def record_snapshot(
        self,
        real_fields: List[str],
        simulated_fields: List[str],
        source_breakdown: Dict[str, List[str]],
    ) -> DataQualitySnapshot:
        """Record a data quality snapshot."""
        total = len(real_fields) + len(simulated_fields)
        real_pct = len(real_fields) / total if total > 0 else 0
        
        snapshot = DataQualitySnapshot(
            timestamp=datetime.now().isoformat(),
            total_fields=total,
            real_fields=len(real_fields),
            simulated_fields=len(simulated_fields),
            real_percentage=real_pct,
            source_breakdown=source_breakdown,
            missing_fields=simulated_fields,
        )
        
        with self._lock:
            self._history.append(snapshot)
            
            # Check for quality issues
            if real_pct < self.min_quality_threshold:
                self._create_alert(
                    severity="warning",
                    message=f"Data quality below threshold: {real_pct:.1%} real data",
                    snapshot=snapshot,
                )
                
        return snapshot
        
    def _create_alert(self, severity: str, message: str, snapshot: DataQualitySnapshot) -> None:
        """Create a data quality alert."""
        alert = {
            "timestamp": datetime.now().isoformat(),
            "severity": severity,
            "message": message,
            "snapshot": snapshot.to_dict(),
        }
        self._alerts.append(alert)
        logger.warning(f"Data Quality Alert: {message}")
        
    def get_current_quality(self) -> Optional[DataQualitySnapshot]:
        """Get the most recent quality snapshot."""
        with self._lock:
            return self._history[-1] if self._history else None
            
    def get_quality_trend(self, hours: int = 24) -> Dict[str, Any]:
        """Get data quality trend over time."""
        cutoff = datetime.now() - timedelta(hours=hours)
        
        recent = [
            s for s in self._history
            if datetime.fromisoformat(s.timestamp) > cutoff
        ]
        
        if not recent:
            return {"error": "No data for specified period"}
            
        real_percentages = [s.real_percentage for s in recent]
        
        return {
            "period_hours": hours,
            "samples": len(recent),
            "current_quality": real_percentages[-1],
            "avg_quality": sum(real_percentages) / len(real_percentages),
            "min_quality": min(real_percentages),
            "max_quality": max(real_percentages),
            "trend": "improving" if real_percentages[-1] > real_percentages[0] else "degrading",
        }
        
    def get_source_reliability(self) -> Dict[str, Dict[str, Any]]:
        """Get reliability metrics for each data source."""
        source_stats: Dict[str, Dict[str, Any]] = {}
        
        for snapshot in self._history:
            for source, fields in snapshot.source_breakdown.items():
                if source not in source_stats:
                    source_stats[source] = {
                        "appearances": 0,
                        "total_fields": 0,
                        "fields": set(),
                    }
                source_stats[source]["appearances"] += 1
                source_stats[source]["total_fields"] += len(fields)
                source_stats[source]["fields"].update(fields)
                
        # Calculate averages
        for source, stats in source_stats.items():
            stats["avg_fields_per_snapshot"] = (
                stats["total_fields"] / stats["appearances"]
                if stats["appearances"] > 0 else 0
            )
            stats["fields"] = list(stats["fields"])
            stats["reliability_score"] = min(1.0, stats["appearances"] / len(self._history))
            
        return source_stats
        
    def get_recommendations(self) -> List[Dict[str, str]]:
        """Get recommendations for improving data quality."""
        recommendations = []
        
        current = self.get_current_quality()
        if not current:
            return [{"message": "No data quality history available"}]
            
        # Check overall quality
        if current.real_percentage < 0.3:
            recommendations.append({
                "priority": "critical",
                "message": f"Only {current.real_percentage:.1%} real data. Major scraping issues.",
                "action": "Check scraper logs, verify data sources are accessible",
            })
        elif current.real_percentage < 0.6:
            recommendations.append({
                "priority": "high",
                "message": f"Only {current.real_percentage:.1%} real data. Quality needs improvement.",
                "action": "Install Playwright for CCIL, check network connectivity",
            })
            
        # Check specific missing fields
        critical_fields = ["mibor_overnight", "call_money_high", "call_money_low"]
        missing_critical = [f for f in critical_fields if f in current.missing_fields]
        
        if missing_critical:
            recommendations.append({
                "priority": "high",
                "message": f"Critical fields missing: {', '.join(missing_critical)}",
                "action": "Focus on fixing CCIL scraper (Playwright required)",
            })
            
        # Check trend
        trend = self.get_quality_trend(hours=24)
        if trend.get("trend") == "degrading":
            recommendations.append({
                "priority": "medium",
                "message": "Data quality is degrading over time",
                "action": "Check if data sources have changed their websites",
            })
            
        return recommendations


# Global instance for app-wide use
_global_monitor: Optional[DataQualityMonitor] = None


def get_data_quality_monitor() -> DataQualityMonitor:
    """Get or create global data quality monitor."""
    global _global_monitor
    if _global_monitor is None:
        _global_monitor = DataQualityMonitor()
    return _global_monitor


def record_data_quality(
    real_fields: List[str],
    simulated_fields: List[str],
    source_breakdown: Dict[str, List[str]],
) -> DataQualitySnapshot:
    """Convenience function to record data quality."""
    monitor = get_data_quality_monitor()
    return monitor.record_snapshot(real_fields, simulated_fields, source_breakdown)


def get_current_data_quality() -> Optional[DataQualitySnapshot]:
    """Convenience function to get current data quality."""
    monitor = get_data_quality_monitor()
    return monitor.get_current_quality()


def check_ccil_data_quality() -> Dict[str, Any]:
    """Specific check for CCIL data quality."""
    from data.scrapers import scrape_ccil
    from data.scrapers.ccil_playwright import CCILAlternativeSources
    
    results = {
        "timestamp": datetime.now().isoformat(),
        "tests": [],
        "overall_status": "unknown",
    }
    
    # Test 1: Try Playwright scraper
    try:
        from data.scrapers.ccil_playwright import CCILPlaywrightScraper
        scraper = CCILPlaywrightScraper(headless=True)
        rates = scraper.scrape_with_playwright()
        
        results["tests"].append({
            "name": "Playwright Scraper",
            "status": "success" if rates else "failed",
            "fields_found": list(rates.keys()),
        })
    except Exception as exc:
        results["tests"].append({
            "name": "Playwright Scraper",
            "status": "error",
            "error": str(exc),
        })
        
    # Test 2: Try RBI fallback
    try:
        rates = CCILAlternativeSources.get_rbi_call_money()
        results["tests"].append({
            "name": "RBI Fallback",
            "status": "success" if rates else "failed",
            "fields_found": list(rates.keys()),
        })
    except Exception as exc:
        results["tests"].append({
            "name": "RBI Fallback",
            "status": "error",
            "error": str(exc),
        })
        
    # Test 3: Try FBIL fallback
    try:
        rates = CCILAlternativeSources.get_fbil_call_money()
        results["tests"].append({
            "name": "FBIL Fallback",
            "status": "success" if rates else "failed",
            "fields_found": list(rates.keys()),
        })
    except Exception as exc:
        results["tests"].append({
            "name": "FBIL Fallback",
            "status": "error",
            "error": str(exc),
        })
        
    # Determine overall status
    successful = sum(1 for t in results["tests"] if t["status"] == "success")
    if successful == 0:
        results["overall_status"] = "critical"
    elif successful == 1:
        results["overall_status"] = "degraded"
    else:
        results["overall_status"] = "healthy"
        
    return results
