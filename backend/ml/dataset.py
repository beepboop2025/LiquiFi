"""Time-series dataset for LSTM training with enriched real-market features."""

import logging
import math
import os

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

import config

logger = logging.getLogger("liquifi.dataset")


class LiquidityDataset(Dataset):
    """
    Reads rate CSV and creates (input, target) pairs with enriched features.

    Each input is a window of `seq_len` hourly observations.
    Each target is the next `forecast_horizon` hourly balance values.

    Feature groups:
    - 6 market rates: mibor, repo, cblo, usdinr, gsec, call_avg
    - 3 temporal: hour_sin, hour_cos, dow_norm
    - 3 lagged: prev_balance, prev_inflow, prev_outflow
    - 5 spreads: mibor-repo, mibor-cblo, cblo-repo, call_spread, call_mid
    - 3 momentum: mibor_momentum, repo_momentum, balance_momentum
    - 4 calendar: is_weekend, is_month_end, is_payroll, is_business_hours
    Total: 24 features (up from 12)
    """

    RATE_COLS = ["mibor", "repo", "cblo", "usdinr", "gsec", "call_avg"]

    def __init__(
        self,
        csv_path: str,
        seq_len: int = config.SEQ_LEN,
        horizon: int = config.FORECAST_HORIZON,
        target_mode: str = config.TARGET_MODE_DEFAULT,
    ):
        self.seq_len = seq_len
        self.horizon = horizon
        if target_mode not in {"absolute", "delta"}:
            raise ValueError(f"Unsupported target_mode: {target_mode}")
        self.target_mode = target_mode
        self.num_features = 0  # Set after building features

        df = pd.read_csv(csv_path)
        logger.info("Loaded %d rows from %s", len(df), csv_path)
        self.features, self.targets = self._prepare(df)
        logger.info(
            "Dataset ready: %d samples, %d features, seq_len=%d, horizon=%d",
            len(self.features), self.num_features, self.seq_len, self.horizon,
        )

    def _prepare(self, df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        """Build features, normalize, and create sliding-window arrays."""
        features = self._build_features(df)
        self.num_features = features.shape[1]
        balances = df["balance"].values.astype(np.float32)

        # Min-max normalization per feature column
        self.feat_min = features.min(axis=0)
        self.feat_max = features.max(axis=0)
        feat_range = self.feat_max - self.feat_min
        feat_range[feat_range == 0] = 1.0
        features = (features - self.feat_min) / feat_range

        # Create sliding windows
        X, Y, last_seen = [], [], []
        total = len(features)
        for i in range(total - self.seq_len - self.horizon + 1):
            x_window = features[i : i + self.seq_len]
            y_window = balances[i + self.seq_len : i + self.seq_len + self.horizon]
            last_balance = balances[i + self.seq_len - 1]
            if self.target_mode == "delta":
                y_window = y_window - last_balance
            X.append(x_window)
            Y.append(y_window)
            last_seen.append(last_balance)

        self.last_observed = np.array(last_seen, dtype=np.float32)
        return np.array(X, dtype=np.float32), np.array(Y, dtype=np.float32)

    def _build_features(self, df: pd.DataFrame) -> np.ndarray:
        """Build enriched feature matrix from raw CSV columns."""
        n = len(df)

        # --- 6 market rate features ---
        rate_feats = np.column_stack([
            df[col].values.astype(np.float32) if col in df.columns
            else np.full(n, 6.5, dtype=np.float32)
            for col in self.RATE_COLS
        ])

        # --- 3 temporal features ---
        hour = df["hour"].values.astype(np.float32) if "hour" in df.columns else np.zeros(n, dtype=np.float32)
        day_col = pd.to_datetime(df["date"], errors="coerce") if "date" in df.columns else pd.Series([pd.NaT] * n)
        day_of_week = day_col.dt.dayofweek.values.astype(np.float32) if not day_col.isna().all() else np.zeros(n, dtype=np.float32)

        hour_sin = np.sin(2 * math.pi * hour / 24).astype(np.float32)
        hour_cos = np.cos(2 * math.pi * hour / 24).astype(np.float32)
        dow_norm = (day_of_week / 6.0).astype(np.float32)

        # --- 3 lagged features ---
        balance = df["balance"].values.astype(np.float32) if "balance" in df.columns else np.full(n, 245.0, dtype=np.float32)
        prev_balance = np.roll(balance, 1)
        prev_balance[0] = balance[0]

        inflow = df["inflow"].values.astype(np.float32) if "inflow" in df.columns else np.zeros(n, dtype=np.float32)
        outflow = df["outflow"].values.astype(np.float32) if "outflow" in df.columns else np.zeros(n, dtype=np.float32)
        prev_inflow = np.roll(inflow, 1)
        prev_outflow = np.roll(outflow, 1)
        prev_inflow[0] = inflow[0]
        prev_outflow[0] = outflow[0]

        # --- 5 spread features (domain knowledge) ---
        mibor = rate_feats[:, 0]
        repo = rate_feats[:, 1]
        cblo = rate_feats[:, 2]
        call_avg = rate_feats[:, 5]

        mibor_repo_spread = (mibor - repo).astype(np.float32)
        mibor_cblo_spread = (mibor - cblo).astype(np.float32)
        cblo_repo_spread = (cblo - repo).astype(np.float32)

        # Call money spread (use call_avg as proxy when high/low unavailable)
        call_spread = np.full(n, 0.4, dtype=np.float32)  # typical spread
        call_mid = call_avg.copy()

        # --- 3 momentum features (6-hour lookback) ---
        lookback = 6
        mibor_momentum = np.zeros(n, dtype=np.float32)
        repo_momentum = np.zeros(n, dtype=np.float32)
        balance_momentum = np.zeros(n, dtype=np.float32)
        for i in range(lookback, n):
            mibor_momentum[i] = mibor[i] - mibor[i - lookback]
            repo_momentum[i] = repo[i] - repo[i - lookback]
            balance_momentum[i] = balance[i] - balance[i - lookback]

        # --- 4 calendar features ---
        is_weekend = (day_of_week >= 5).astype(np.float32)
        day_of_month = day_col.dt.day.values.astype(np.float32) if not day_col.isna().all() else np.full(n, 15.0, dtype=np.float32)
        is_month_end = ((day_of_month >= 28) | (day_of_month <= 2)).astype(np.float32)
        is_payroll = ((day_of_month >= 29) | (day_of_month <= 2)).astype(np.float32)
        is_business_hours = ((hour >= 9) & (hour <= 17) & (day_of_week < 5)).astype(np.float32)

        # Stack all features: 6 + 3 + 3 + 5 + 3 + 4 = 24
        all_features = np.column_stack([
            rate_feats,          # 6: mibor, repo, cblo, usdinr, gsec, call_avg
            hour_sin,            # 1
            hour_cos,            # 1
            dow_norm,            # 1
            prev_balance,        # 1
            prev_inflow,         # 1
            prev_outflow,        # 1
            mibor_repo_spread,   # 1
            mibor_cblo_spread,   # 1
            cblo_repo_spread,    # 1
            call_spread,         # 1
            call_mid,            # 1
            mibor_momentum,      # 1
            repo_momentum,       # 1
            balance_momentum,    # 1
            is_weekend,          # 1
            is_month_end,        # 1
            is_payroll,          # 1
            is_business_hours,   # 1
        ])  # Total: 24

        logger.info("Built %d features from %d rows", all_features.shape[1], n)
        return all_features

    def save_scaler(self, path: str = config.SCALER_PATH) -> None:
        """Persist min/max scaling parameters and feature count to disk."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        np.savez(
            path,
            feat_min=self.feat_min,
            feat_max=self.feat_max,
            num_features=np.array([self.num_features]),
        )
        logger.info("Scaler saved: %d features, path=%s", self.num_features, path)

    @staticmethod
    def load_scaler(path: str = config.SCALER_PATH) -> tuple[np.ndarray, np.ndarray] | None:
        """Load persisted scaler parameters. Returns (feat_min, feat_max) or None."""
        if not os.path.exists(path):
            return None
        try:
            data = np.load(path)
            return data["feat_min"], data["feat_max"]
        except Exception as exc:
            logger.warning("Corrupted scaler file %s: %s — will re-create on next training", path, exc)
            return None

    @staticmethod
    def load_num_features(path: str = config.SCALER_PATH) -> int:
        """Load the number of features from persisted scaler."""
        if not os.path.exists(path):
            return config.NUM_FEATURES
        try:
            data = np.load(path)
            if "num_features" in data:
                return int(data["num_features"][0])
            return len(data["feat_min"])
        except Exception as exc:
            logger.warning("Corrupted scaler file %s: %s — using default features", path, exc)
            return config.NUM_FEATURES

    def __len__(self) -> int:
        return len(self.features)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        return torch.from_numpy(self.features[idx]), torch.from_numpy(self.targets[idx])
