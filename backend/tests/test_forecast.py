"""Tests for ml/forecast.py"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config
from ml.forecast import get_forecast, _build_input_sequence, _synthetic_forecast


SAMPLE_RATES = {
    "mibor_overnight": 6.75,
    "repo": 6.50,
    "cblo_bid": 6.55,
    "usdinr_spot": 83.25,
    "gsec_10y": 7.15,
    "call_money_high": 6.90,
    "call_money_low": 6.50,
}


def test_synthetic_forecast_returns_24_hours():
    result = _synthetic_forecast(SAMPLE_RATES)
    assert len(result) == 24


def test_synthetic_forecast_has_required_fields():
    result = _synthetic_forecast(SAMPLE_RATES)
    required = {"hour", "balance", "predicted", "ci95_upper", "ci95_lower",
                "ci99_upper", "ci99_lower", "min_buffer", "inflow", "outflow"}
    for entry in result:
        assert required.issubset(entry.keys()), f"Missing fields in {entry.keys()}"


def test_synthetic_forecast_ci_ordering():
    result = _synthetic_forecast(SAMPLE_RATES)
    for entry in result:
        assert entry["ci99_upper"] >= entry["ci95_upper"]
        assert entry["ci95_lower"] >= entry["ci99_lower"]


def test_build_input_sequence_shape():
    seq = _build_input_sequence(SAMPLE_RATES, None)
    assert seq.shape == (config.SEQ_LEN, config.NUM_FEATURES)


def test_build_input_sequence_with_buffer():
    # Build a small buffer of rate snapshots
    buf = [dict(SAMPLE_RATES) for _ in range(10)]
    seq = _build_input_sequence(SAMPLE_RATES, buf)
    assert seq.shape == (config.SEQ_LEN, config.NUM_FEATURES)


def test_build_input_sequence_no_nans():
    import numpy as np
    seq = _build_input_sequence(SAMPLE_RATES, None)
    assert not np.any(np.isnan(seq)), "Input sequence contains NaN"


def test_get_forecast_without_model_returns_synthetic():
    """When model is not loaded, get_forecast falls back to synthetic."""
    result = get_forecast(SAMPLE_RATES)
    assert len(result) == 24
    assert all("hour" in h for h in result)


def test_inflow_outflow_positive():
    result = _synthetic_forecast(SAMPLE_RATES)
    for entry in result:
        assert entry["inflow"] >= 0
        assert entry["outflow"] >= 0
