"""Feature engineering pipeline for liquidity forecasting.

Creates advanced features from raw rates:
- Technical indicators (RSI, MACD, Bollinger Bands)
- Statistical features (rolling statistics)
- Domain-specific features (liquidity stress indicators)
- Calendar features (holidays, month-end, etc.)
"""

import logging
import math
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from datetime import datetime, timedelta
from collections import deque

import numpy as np
import pandas as pd

logger = logging.getLogger("liquifi.features")


@dataclass
class FeatureConfig:
    """Configuration for feature engineering."""
    # Window sizes for rolling features
    short_window: int = 6    # 6 hours
    medium_window: int = 24  # 1 day
    long_window: int = 168   # 1 week
    
    # Technical indicator parameters
    rsi_period: int = 14
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9
    bb_period: int = 20
    bb_std: float = 2.0
    
    # Feature selection
    use_technical: bool = True
    use_statistical: bool = True
    use_domain: bool = True
    use_calendar: bool = True


class FeatureEngineer:
    """Engineer features from raw rate data."""
    
    def __init__(self, config: Optional[FeatureConfig] = None):
        self.config = config or FeatureConfig()
        self._history_buffer: deque = deque(maxlen=168)  # 1 week of hourly data
        
    def update(self, snapshot: Dict[str, float], timestamp: Optional[datetime] = None) -> None:
        """Update feature engineer with new snapshot."""
        if timestamp is None:
            timestamp = datetime.now()
            
        self._history_buffer.append({
            "timestamp": timestamp,
            **snapshot
        })
        
    def engineer_features(
        self,
        current_rates: Dict[str, float],
        timestamp: Optional[datetime] = None,
    ) -> Dict[str, float]:
        """Generate engineered features from current rates and history.
        
        Args:
            current_rates: Current rate snapshot
            timestamp: Current timestamp
            
        Returns:
            Dictionary of engineered features
        """
        if timestamp is None:
            timestamp = datetime.now()
            
        features = dict(current_rates)  # Start with raw features
        
        # Convert history to DataFrame for easier manipulation
        if len(self._history_buffer) > 0:
            df = pd.DataFrame(list(self._history_buffer))
            df.set_index("timestamp", inplace=True)
        else:
            df = None
            
        # Add feature groups
        if self.config.use_technical and df is not None:
            features.update(self._technical_indicators(df, current_rates))
            
        if self.config.use_statistical and df is not None:
            features.update(self._statistical_features(df, current_rates))
            
        if self.config.use_domain:
            features.update(self._domain_features(current_rates, timestamp))
            
        if self.config.use_calendar:
            features.update(self._calendar_features(timestamp))
            
        return features
        
    def _technical_indicators(
        self,
        df: pd.DataFrame,
        current: Dict[str, float],
    ) -> Dict[str, float]:
        """Calculate technical indicators."""
        features = {}
        
        # Get balance series if available
        if "_balance" in df.columns:
            balance = df["_balance"].values
            
            # RSI (Relative Strength Index)
            if len(balance) >= self.config.rsi_period:
                features["balance_rsi"] = self._calculate_rsi(balance, self.config.rsi_period)
                
            # MACD
            if len(balance) >= self.config.macd_slow:
                macd, signal, hist = self._calculate_macd(
                    balance,
                    self.config.macd_fast,
                    self.config.macd_slow,
                    self.config.macd_signal,
                )
                features["balance_macd"] = macd[-1] if len(macd) > 0 else 0
                features["balance_macd_signal"] = signal[-1] if len(signal) > 0 else 0
                features["balance_macd_hist"] = hist[-1] if len(hist) > 0 else 0
                
            # Bollinger Bands
            if len(balance) >= self.config.bb_period:
                bb_upper, bb_middle, bb_lower = self._calculate_bollinger_bands(
                    balance, self.config.bb_period, self.config.bb_std
                )
                features["balance_bb_upper"] = bb_upper
                features["balance_bb_middle"] = bb_middle
                features["balance_bb_lower"] = bb_lower
                features["balance_bb_position"] = (
                    (balance[-1] - bb_lower) / (bb_upper - bb_lower)
                    if bb_upper != bb_lower else 0.5
                )
                
        # Rate-based indicators
        for rate_col in ["mibor_overnight", "repo", "cblo_bid"]:
            if rate_col in df.columns:
                series = df[rate_col].values
                
                # Rate momentum (change over short window)
                if len(series) >= self.config.short_window:
                    momentum = series[-1] - series[-self.config.short_window]
                    features[f"{rate_col}_momentum"] = momentum
                    
                # Rate volatility (std over medium window)
                if len(series) >= self.config.medium_window:
                    volatility = np.std(series[-self.config.medium_window:])
                    features[f"{rate_col}_volatility"] = volatility
                    
        return features
        
    def _statistical_features(
        self,
        df: pd.DataFrame,
        current: Dict[str, float],
    ) -> Dict[str, float]:
        """Calculate statistical features."""
        features = {}
        
        for col in ["_balance", "mibor_overnight", "repo", "cblo_bid"]:
            if col in df.columns:
                series = df[col].values
                
                # Short window stats
                if len(series) >= self.config.short_window:
                    short = series[-self.config.short_window:]
                    features[f"{col}_short_mean"] = np.mean(short)
                    features[f"{col}_short_std"] = np.std(short)
                    features[f"{col}_short_min"] = np.min(short)
                    features[f"{col}_short_max"] = np.max(short)
                    
                # Medium window stats
                if len(series) >= self.config.medium_window:
                    medium = series[-self.config.medium_window:]
                    features[f"{col}_medium_mean"] = np.mean(medium)
                    features[f"{col}_medium_std"] = np.std(medium)
                    
                # Long window stats
                if len(series) >= self.config.long_window:
                    long = series[-self.config.long_window:]
                    features[f"{col}_long_mean"] = np.mean(long)
                    features[f"{col}_long_std"] = np.std(long)
                    
                # Z-score (how many std devs from mean)
                if len(series) >= self.config.medium_window:
                    medium = series[-self.config.medium_window:]
                    mean = np.mean(medium)
                    std = np.std(medium)
                    if std > 0:
                        features[f"{col}_zscore"] = (series[-1] - mean) / std
                    else:
                        features[f"{col}_zscore"] = 0
                        
        return features
        
    def _domain_features(
        self,
        current: Dict[str, float],
        timestamp: datetime,
    ) -> Dict[str, float]:
        """Calculate domain-specific features for liquidity."""
        features = {}
        
        # Interest rate spreads
        mibor = current.get("mibor_overnight", 6.75)
        repo = current.get("repo", 6.50)
        cblo = current.get("cblo_bid", 6.55)
        
        # MIBOR-Repo spread (liquidity stress indicator)
        features["mibor_repo_spread"] = mibor - repo
        
        # MIBOR-CBLO spread
        features["mibor_cblo_spread"] = mibor - cblo
        
        # CBLO-Repo spread
        features["cblo_repo_spread"] = cblo - repo
        
        # Call money spread
        call_high = current.get("call_money_high", 6.90)
        call_low = current.get("call_money_low", 6.50)
        features["call_money_spread"] = call_high - call_low
        features["call_money_mid"] = (call_high + call_low) / 2
        
        # Liquidity stress score (0-100)
        # Higher when spreads are wide and rates are high
        stress_components = []
        
        if mibor > repo + 0.5:
            stress_components.append(30)
        if call_high > call_low + 1.0:
            stress_components.append(30)
        if cblo > repo + 0.3:
            stress_components.append(20)
            
        features["liquidity_stress_score"] = min(sum(stress_components), 100)
        
        # Rate regime (0=loose, 1=neutral, 2=tight)
        if mibor < repo + 0.1:
            features["rate_regime"] = 0  # Loose
        elif mibor < repo + 0.5:
            features["rate_regime"] = 1  # Neutral
        else:
            features["rate_regime"] = 2  # Tight
            
        # FX impact
        usdinr = current.get("usdinr_spot", 83.25)
        features["fx_pressure"] = 1 if usdinr > 85 else (-1 if usdinr < 80 else 0)
        
        return features
        
    def _calendar_features(self, timestamp: datetime) -> Dict[str, float]:
        """Calculate calendar-based features."""
        features = {}
        
        # Time features
        features["hour"] = timestamp.hour
        features["day_of_week"] = timestamp.weekday()
        features["day_of_month"] = timestamp.day
        features["is_weekend"] = 1 if timestamp.weekday() >= 5 else 0
        features["is_friday"] = 1 if timestamp.weekday() == 4 else 0
        features["is_monday"] = 1 if timestamp.weekday() == 0 else 0
        
        # Business hours
        is_business_hours = 9 <= timestamp.hour <= 17 and timestamp.weekday() < 5
        features["is_business_hours"] = 1 if is_business_hours else 0
        
        # Month-end proximity (typically liquidity stress)
        days_to_month_end = (
            (timestamp.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        ).day - timestamp.day
        features["days_to_month_end"] = days_to_month_end
        features["is_month_end"] = 1 if days_to_month_end <= 2 else 0
        
        # Payroll period (typically 30th-2nd)
        is_payroll = timestamp.day in [30, 31, 1, 2]
        features["is_payroll_period"] = 1 if is_payroll else 0
        
        # GST period (typically 20th-22nd)
        is_gst = timestamp.day in [19, 20, 21, 22]
        features["is_gst_period"] = 1 if is_gst else 0
        
        # Advance tax periods (quarterly: 15th of Jun, Sep, Dec, Mar)
        advance_tax_dates = [(6, 15), (9, 15), (12, 15), (3, 15)]
        is_advance_tax = (timestamp.month, timestamp.day) in advance_tax_dates
        features["is_advance_tax_date"] = 1 if is_advance_tax else 0
        
        # Cyclical encodings
        features["hour_sin"] = math.sin(2 * math.pi * timestamp.hour / 24)
        features["hour_cos"] = math.cos(2 * math.pi * timestamp.hour / 24)
        features["dow_sin"] = math.sin(2 * math.pi * timestamp.weekday() / 7)
        features["dow_cos"] = math.cos(2 * math.pi * timestamp.weekday() / 7)
        features["day_sin"] = math.sin(2 * math.pi * timestamp.day / 31)
        features["day_cos"] = math.cos(2 * math.pi * timestamp.day / 31)
        
        # RBI policy meeting dates (approximate: every 2 months)
        # This is a simplified version - could be more precise
        month = timestamp.month
        is_policy_month = month in [2, 4, 6, 8, 10, 12]
        features["is_policy_month"] = 1 if is_policy_month else 0
        
        return features
        
    def _calculate_rsi(self, prices: np.ndarray, period: int = 14) -> float:
        """Calculate Relative Strength Index."""
        if len(prices) < period + 1:
            return 50.0  # Neutral
            
        deltas = np.diff(prices)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)
        
        avg_gain = np.mean(gains[-period:])
        avg_loss = np.mean(losses[-period:])
        
        if avg_loss == 0:
            return 100.0
            
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return rsi
        
    def _calculate_macd(
        self,
        prices: np.ndarray,
        fast: int = 12,
        slow: int = 26,
        signal: int = 9,
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Calculate MACD (Moving Average Convergence Divergence)."""
        ema_fast = self._calculate_ema(prices, fast)
        ema_slow = self._calculate_ema(prices, slow)
        
        macd = ema_fast - ema_slow
        signal_line = self._calculate_ema(macd, signal)
        histogram = macd - signal_line
        
        return macd, signal_line, histogram
        
    def _calculate_ema(self, data: np.ndarray, period: int) -> np.ndarray:
        """Calculate Exponential Moving Average."""
        alpha = 2 / (period + 1)
        ema = np.zeros_like(data)
        ema[0] = data[0]
        
        for i in range(1, len(data)):
            ema[i] = alpha * data[i] + (1 - alpha) * ema[i - 1]
            
        return ema
        
    def _calculate_bollinger_bands(
        self,
        prices: np.ndarray,
        period: int = 20,
        num_std: float = 2.0,
    ) -> Tuple[float, float, float]:
        """Calculate Bollinger Bands."""
        if len(prices) < period:
            last_price = prices[-1]
            return last_price * 1.02, last_price, last_price * 0.98
            
        recent = prices[-period:]
        middle = np.mean(recent)
        std = np.std(recent)
        
        upper = middle + num_std * std
        lower = middle - num_std * std
        
        return upper, middle, lower


def create_feature_pipeline(config: Optional[FeatureConfig] = None) -> FeatureEngineer:
    """Create a feature engineering pipeline."""
    return FeatureEngineer(config)


# Convenience function for direct use
def engineer_features(
    rates: Dict[str, float],
    history: Optional[List[Dict]] = None,
    timestamp: Optional[datetime] = None,
) -> Dict[str, float]:
    """One-shot feature engineering."""
    engineer = FeatureEngineer()
    
    if history:
        for entry in history:
            ts = entry.get("timestamp", datetime.now())
            engineer.update(entry, ts)
            
    return engineer.engineer_features(rates, timestamp)
