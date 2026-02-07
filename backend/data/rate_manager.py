"""Combine real scraped rates, derived rates, and simulated rates into a 33-field snapshot."""

import logging
import random
import time
from collections import deque
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

import config
from data.scrapers import scrape_all, scrape_rbi, scrape_fbil, scrape_ccil, scrape_nse
from data.validation import validate_scraped_data, DataSanitizer

logger = logging.getLogger("liquifi.rates")


class RateManager:
    """Manages the current 33-field rate snapshot with real + derived + simulated data."""

    def __init__(self):
        self._real: Dict[str, float] = {}              # latest scraped real values
        self._prev_snapshot: Dict[str, float] = {}     # previous full snapshot (for drift)
        self._history: deque = deque(maxlen=config.MAX_RATE_HISTORY)
        self._raw_buffer: deque = deque(maxlen=config.SEQ_LEN + 10)
        self._estimated_balance: float = 245.0
        self.real_fields_available: List[str] = []
        self._last_scrape_time: float = 0
        self._fallback_fields: List[str] = []          # fields that fell back to simulated
        self._scrape_source_log: Dict[str, List[str]] = {}  # log of which source provided each field
        self._consecutive_scrape_failures: int = 0

        # Initialize with base rates
        self._prev_snapshot = dict(config.BASE_RATES)

    def scrape(self) -> None:
        """Run all scrapers and merge real data.
        
        Uses the unified scraper which intelligently merges data from:
        - RBI: Policy rates (repo, reverse repo), T-bills, G-Sec, USD/INR
        - FBIL: MIBOR rates, benchmark rates
        - CCIL: Call money rates (high, low, weighted average), TREPS/CBLO
        - NSE: Additional money market data (fallback)
        """
        # Use the unified scraper for all sources
        try:
            unified_data = scrape_all()
            
            # VALIDATE scraped data before using it
            validation_result = validate_scraped_data("unified", unified_data)
            
            if validation_result.is_valid:
                self._real = validation_result.sanitized_data
                self._consecutive_scrape_failures = 0
                
                # Log which sources contributed what
                for field in self._real:
                    self._scrape_source_log[field] = self._determine_source(field)
                    
                if validation_result.warnings:
                    logger.warning("Data validation warnings: %s", validation_result.warnings)
            else:
                logger.error("Data validation failed: %s", validation_result.errors)
                self._consecutive_scrape_failures += 1
                # Use previous data if available
                if not self._real:
                    self._fallback_individual_scraping()

        except Exception as exc:
            self._consecutive_scrape_failures += 1
            logger.error(
                "Unified scraper failed (attempt %d): %s",
                self._consecutive_scrape_failures, exc, exc_info=True,
            )
            # Fallback: try individual scrapers
            self._fallback_individual_scraping()

        self.real_fields_available = [f for f in config.REAL_FIELDS if f in self._real]
        self._last_scrape_time = time.time()

        if self._consecutive_scrape_failures >= 3:
            logger.warning(
                "Scraping has failed %d consecutive times. Data quality is degraded.",
                self._consecutive_scrape_failures,
            )

        logger.debug("Real fields available: %s", self.real_fields_available)
        logger.debug("Source log: %s", self._scrape_source_log)

    def _fallback_individual_scraping(self) -> None:
        """Fallback to individual scrapers if unified scraper fails."""
        self._real = {}
        
        # Try each scraper independently
        scrapers = [
            ("rbi", scrape_rbi),
            ("fbil", scrape_fbil),
            ("ccil", scrape_ccil),
            ("nse", scrape_nse),
        ]
        
        for source_name, scraper_func in scrapers:
            try:
                data = scraper_func()
                # Merge with priority based on field type
                for field, value in data.items():
                    if field not in self._real:
                        self._real[field] = value
                        self._scrape_source_log[field] = [source_name]
                logger.info("%s scraper contributed: %s", source_name.upper(), list(data.keys()))
            except Exception as exc:
                logger.warning("%s scraper failed in fallback: %s", source_name.upper(), exc)

    def _determine_source(self, field: str) -> List[str]:
        """Determine which source(s) likely provided a field."""
        field_lower = field.lower()
        
        if field_lower in {"repo", "reverse_repo", "sdf", "msf", "tbill_91d", "tbill_182d", "tbill_364d"}:
            return ["rbi"]
        elif "mibor" in field_lower:
            return ["fbil", "nse", "ccil"]
        elif "call_money" in field_lower:
            return ["ccil"]
        elif "cblo" in field_lower or "treps" in field_lower:
            return ["ccil"]
        elif "usdinr" in field_lower:
            return ["rbi", "fbil"]
        elif "gsec" in field_lower:
            return ["rbi", "fbil"]
        else:
            return ["unknown"]

    def snapshot(self) -> Dict[str, float]:
        """Build a complete 33-field rate snapshot."""
        snap: Dict[str, float] = {}

        # 1) Real fields: use scraped values or fall back to base + micro-drift
        self._fallback_fields = []
        for field in config.REAL_FIELDS:
            if field in self._real:
                snap[field] = self._real[field]
            else:
                base = config.BASE_RATES.get(field, 6.50)
                prev = self._prev_snapshot.get(field, base)
                snap[field] = self._drift(prev, 0.03)
                self._fallback_fields.append(field)
                
        if self._fallback_fields:
            logger.info("Fields using simulated fallback: %s", self._fallback_fields)

        # 2) Derived fields
        snap["sofr"] = self._real.get("sofr", config.BASE_RATES["sofr"])
        usdinr = snap["usdinr_spot"]
        fwd_points = config.DERIVED_OFFSETS["usdinr_1m_fwd_points"]
        snap["usdinr_1m_fwd"] = round(usdinr + fwd_points, 4)

        # MIFOR = SOFR + ((fwd - spot) / spot) * 1200
        if usdinr > 0:
            fwd_premium = ((snap["usdinr_1m_fwd"] - usdinr) / usdinr) * 1200
        else:
            logger.error("usdinr_spot is zero or negative (%s), using 0 forward premium", usdinr)
            fwd_premium = 0.0
        snap["mifor_1m"] = round(snap["sofr"] + fwd_premium, 4)
        snap["mifor_3m"] = round(snap["mifor_1m"] + config.DERIVED_OFFSETS["mifor_3m_premium"], 4)
        snap["mifor_6m"] = round(snap["mifor_1m"] + config.DERIVED_OFFSETS["mifor_6m_premium"], 4)
        snap["mmf_liquid"] = round(snap["repo"] + config.DERIVED_OFFSETS["mmf_liquid_spread"], 4)

        # 3) Simulated fields (anchored to real/derived + drift)
        for field, (anchor, offset, drift_vol) in config.SIMULATED_FIELDS.items():
            anchor_val = snap.get(anchor, config.BASE_RATES.get(anchor, 6.50))
            base = anchor_val + offset
            prev = self._prev_snapshot.get(field, base)
            snap[field] = self._drift(prev, drift_vol, anchor=base)

        # 4) Ensure bid/ask and high/low inversions don't happen
        if snap.get("cblo_ask", 0) < snap.get("cblo_bid", 0):
            snap["cblo_ask"] = round(snap["cblo_bid"] + 0.07, 4)
        if snap.get("call_money_high", 0) < snap.get("call_money_low", 0):
            snap["call_money_high"], snap["call_money_low"] = snap["call_money_low"], snap["call_money_high"]

        # 5) Update a proxy liquidity balance for ML input/training enrichment.
        self._estimated_balance = self._next_estimated_balance(snap)

        # Update state
        self._prev_snapshot = dict(snap)
        self._push_history(snap)
        self._push_raw_buffer(snap)

        return snap

    def get_history(self) -> List[dict]:
        """Return the rate history buffer."""
        return list(self._history)

    def get_source_map(self) -> Dict[str, List[str]]:
        """Return which fields are real vs simulated, including source info."""
        real = list(self.real_fields_available)
        simulated = [f for f in config.RATE_FIELDS if f not in real]
        
        # Build detailed source mapping
        source_detail: Dict[str, List[str]] = {"real": [], "simulated": []}
        
        for field in config.RATE_FIELDS:
            if field in real:
                source_detail["real"].append(field)
            else:
                source_detail["simulated"].append(field)
        
        # Add source breakdown
        for field in real:
            sources = self._scrape_source_log.get(field, ["unknown"])
            source_key = f"real_{'_'.join(sources)}"
            if source_key not in source_detail:
                source_detail[source_key] = []
            source_detail[source_key].append(field)
        
        return source_detail

    def get_rate_buffer(self) -> List[dict]:
        """Return the rolling raw rate buffer for LSTM input (newest last)."""
        return list(self._raw_buffer)

    def get_last_scrape_age(self) -> float:
        """Get the age of the last scrape in seconds."""
        if self._last_scrape_time == 0:
            return float('inf')
        return time.time() - self._last_scrape_time

    def get_scrape_stats(self) -> Dict[str, Any]:
        """Get statistics about the last scraping operation."""
        return {
            "real_fields_count": len(self.real_fields_available),
            "real_fields": self.real_fields_available,
            "fallback_fields": self._fallback_fields,
            "source_log": self._scrape_source_log,
            "last_scrape_age_seconds": self.get_last_scrape_age(),
            "estimated_balance": self._estimated_balance,
        }

    def _push_raw_buffer(self, snap: Dict[str, float]) -> None:
        """Append a raw snapshot to the rolling buffer for LSTM inference."""
        raw = dict(snap)
        raw["_balance"] = self._estimated_balance
        self._raw_buffer.append(raw)  # deque auto-pops oldest

    def _push_history(self, snap: Dict[str, float]) -> None:
        """Append a rate history entry."""
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "mibor": snap.get("mibor_overnight", 0),
            "repo": snap.get("repo", 0),
            "spread": round((snap.get("mibor_overnight", 0) - snap.get("repo", 0)) * 100, 2),
            "cblo": snap.get("cblo_bid", 0),
            "usdinr": snap.get("usdinr_spot", 0),
            "real_fields": len(self.real_fields_available),
        }
        self._history.append(entry)  # deque auto-pops oldest

    @staticmethod
    def _drift(prev: float, vol: float, anchor: Optional[float] = None) -> float:
        """Apply micro-drift to a rate. Gently mean-revert toward anchor if provided."""
        noise = (random.random() - 0.5) * vol
        if anchor is not None:
            # Mean-revert 10% toward anchor
            reversion = (anchor - prev) * 0.1
            return round(prev + noise + reversion, 4)
        return round(prev + noise, 4)

    def _next_estimated_balance(self, snap: Dict[str, float]) -> float:
        """
        Estimate liquidity balance from money-market signals.

        This is a proxy value used only for model conditioning and live training rows
        when real internal treasury balances are unavailable.
        """
        spread = snap.get("mibor_overnight", 6.75) - snap.get("repo", 6.50)
        call_mid = (snap.get("call_money_high", 6.90) + snap.get("call_money_low", 6.50)) / 2
        cblo = snap.get("cblo_bid", 6.55)
        hour = datetime.now().hour
        is_biz = 9 <= hour <= 17

        intraday = 2.5 if is_biz and hour <= 13 else (-2.0 if is_biz else -0.5)
        signal = (-9.0 * spread) + (5.5 - (call_mid - cblo) * 2.0)
        noise = (random.random() - 0.5) * 4.0

        next_balance = self._estimated_balance + intraday + signal + noise
        next_balance = max(60.0, min(450.0, next_balance))
        return round(next_balance, 1)


class RateManagerFactory:
    """Factory for creating RateManager instances."""
    
    _instance: Optional[RateManager] = None
    
    @classmethod
    def get_instance(cls) -> RateManager:
        """Get singleton RateManager instance."""
        if cls._instance is None:
            cls._instance = RateManager()
        return cls._instance
    
    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (useful for testing)."""
        cls._instance = None
