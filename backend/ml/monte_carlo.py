"""GBM Monte Carlo simulation calibrated from real historical balance data.

Calibration priority:
1. Real historical data from live scrapes
2. Training data (may include seed data)
3. Hardcoded defaults (last resort)

dS = mu * S * dt + sigma * S * dW
"""

import logging
import os

import numpy as np
import pandas as pd

import config

logger = logging.getLogger("liquifi.monte_carlo")

# Cached calibration to avoid re-reading CSV every call
_calibration_cache: dict | None = None
_calibration_ts: float = 0.0
_CACHE_TTL_S = 300  # re-calibrate every 5 minutes


def _calibrate_from_real_data() -> tuple[float, float, float]:
    """
    Calibrate mu, sigma, and initial_balance from real historical balance data.
    Returns (mu, sigma, initial_balance).
    """
    global _calibration_cache, _calibration_ts
    import time

    now = time.time()
    if _calibration_cache is not None and (now - _calibration_ts) < _CACHE_TTL_S:
        return _calibration_cache

    # Try data sources in priority order
    paths = [
        config.REAL_HISTORY_PATH,
        config.TRAINING_DATA_PATH,
        config.SEED_DATA_PATH,
    ]

    for path in paths:
        if not os.path.exists(path):
            continue
        try:
            df = pd.read_csv(path)
            if "balance" not in df.columns or len(df) < 48:
                continue

            balance = df["balance"].dropna().values.astype(float)
            if len(balance) < 48:
                continue

            # Compute log returns for GBM calibration
            # Guard against zero/negative balances
            safe_balance = np.maximum(balance, 1.0)
            log_returns = np.diff(np.log(safe_balance))

            # Annualized parameters (hourly data -> 24 hours/day, 365 days/year)
            hourly_mu = float(np.mean(log_returns))
            hourly_sigma = float(np.std(log_returns))
            mu = hourly_mu * 24 * 365
            sigma = hourly_sigma * np.sqrt(24 * 365)
            initial_balance = float(balance[-1])

            # Sanity bounds
            mu = float(np.clip(mu, -0.5, 0.5))
            sigma = float(np.clip(sigma, 0.01, 1.0))
            initial_balance = max(50.0, min(500.0, initial_balance))

            logger.info(
                "MC calibrated from %s: mu=%.4f, sigma=%.4f, initial=%.1f (%d points)",
                path, mu, sigma, initial_balance, len(balance),
            )
            result = (mu, sigma, initial_balance)
            _calibration_cache = result
            _calibration_ts = now
            return result

        except Exception as exc:
            logger.warning("MC calibration failed for %s: %s", path, exc)
            continue

    # Fallback defaults
    logger.warning("No real data for MC calibration — using defaults")
    result = (0.02, 0.08, 245.0)
    _calibration_cache = result
    _calibration_ts = now
    return result


def run_monte_carlo(rates: dict) -> dict:
    """
    Run Geometric Brownian Motion Monte Carlo simulation.

    Calibrates mu/sigma from real historical balance data,
    then adjusts for current market stress (MIBOR-repo spread).

    Returns paths + LaR metrics matching frontend data shape.
    """
    n_paths = config.MC_PATHS
    n_hours = config.MC_HOURS
    dt = 1.0 / 24  # hourly steps in day fractions

    # Calibrate from real data
    mu_base, sigma_base, initial_balance = _calibrate_from_real_data()

    # Adjust for current market conditions
    mibor = rates.get("mibor_overnight", 6.75)
    repo = rates.get("repo", 6.50)
    spread = mibor - repo

    # Spread-adjusted drift and volatility
    mu = mu_base + spread * 0.01
    sigma = sigma_base + abs(spread) * 0.02

    # Use actual current balance if available
    for key in ("_balance", "estimated_balance", "balance"):
        if key in rates:
            try:
                actual_bal = float(rates[key])
                if 20 < actual_bal < 600:
                    initial_balance = actual_bal
                    break
            except (TypeError, ValueError):
                continue

    # Generate correlated random paths
    paths = []
    final_values = []

    for p in range(n_paths):
        path = []
        S = initial_balance + np.random.normal(0, initial_balance * 0.02)
        for t in range(n_hours):
            dW = np.random.normal(0, np.sqrt(dt))
            S = S * np.exp((mu - 0.5 * sigma**2) * dt + sigma * dW)
            S = max(20, S)  # floor at 20 Cr
            path.append({"hour": t, "value": round(float(S), 1), "pathId": p})
        paths.append(path)
        final_values.append(S)

    final_arr = np.array(final_values)

    # Compute LaR metrics
    min_buffer = 120.0
    lar_95 = round(float(np.percentile(final_arr, 5)), 1)
    lar_99 = round(float(np.percentile(final_arr, 1)), 1)

    # Expected Shortfall (CVaR at 95%) = mean of worst 5%
    cutoff_5 = np.percentile(final_arr, 5)
    tail = final_arr[final_arr <= cutoff_5]
    expected_shortfall = round(float(tail.mean()), 1) if len(tail) > 0 else lar_95

    # Breach probability: probability of falling below min_buffer
    breach_count = np.sum(final_arr < min_buffer)
    breach_probability = round(float(breach_count / n_paths * 100), 2)

    # Hourly statistics for percentile bands
    hourly_stats = []
    for t in range(n_hours):
        values_at_t = [paths[p][t]["value"] for p in range(n_paths)]
        arr = np.array(values_at_t)
        hourly_stats.append({
            "hour": t,
            "mean": round(float(arr.mean()), 1),
            "p5": round(float(np.percentile(arr, 5)), 1),
            "p25": round(float(np.percentile(arr, 25)), 1),
            "p50": round(float(np.percentile(arr, 50)), 1),
            "p75": round(float(np.percentile(arr, 75)), 1),
            "p95": round(float(np.percentile(arr, 95)), 1),
        })

    return {
        "paths": paths,
        "metrics": {
            "lar_95": lar_95,
            "lar_99": lar_99,
            "expected_shortfall": expected_shortfall,
            "breach_probability": breach_probability,
            "n_paths": n_paths,
            "n_hours": n_hours,
            "initial_balance": round(initial_balance, 1),
            "calibration": {
                "mu": round(mu, 6),
                "sigma": round(sigma, 6),
                "mu_base": round(mu_base, 6),
                "sigma_base": round(sigma_base, 6),
                "spread_adjustment": round(spread, 4),
            },
        },
        "hourly_stats": hourly_stats,
    }
