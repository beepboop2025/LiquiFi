"""Tests for ml/monte_carlo.py"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config
from ml.monte_carlo import run_monte_carlo


SAMPLE_RATES = {
    "mibor_overnight": 6.75,
    "repo": 6.50,
}


def test_returns_correct_path_count():
    result = run_monte_carlo(SAMPLE_RATES)
    assert len(result["paths"]) == config.MC_PATHS


def test_each_path_has_correct_hours():
    result = run_monte_carlo(SAMPLE_RATES)
    for path in result["paths"]:
        assert len(path) == config.MC_HOURS


def test_metrics_present():
    result = run_monte_carlo(SAMPLE_RATES)
    m = result["metrics"]
    assert "lar_95" in m
    assert "lar_99" in m
    assert "expected_shortfall" in m
    assert "breach_probability" in m
    assert m["n_paths"] == config.MC_PATHS
    assert m["n_hours"] == config.MC_HOURS


def test_lar_99_lte_lar_95():
    result = run_monte_carlo(SAMPLE_RATES)
    # LaR-99 should be more extreme (lower) than LaR-95
    assert result["metrics"]["lar_99"] <= result["metrics"]["lar_95"]


def test_hourly_stats_present():
    result = run_monte_carlo(SAMPLE_RATES)
    assert len(result["hourly_stats"]) == config.MC_HOURS
    for h in result["hourly_stats"]:
        assert h["p5"] <= h["p25"] <= h["p50"] <= h["p75"] <= h["p95"]


def test_breach_probability_in_range():
    result = run_monte_carlo(SAMPLE_RATES)
    bp = result["metrics"]["breach_probability"]
    assert 0 <= bp <= 100


def test_path_values_positive():
    result = run_monte_carlo(SAMPLE_RATES)
    for path in result["paths"]:
        for point in path:
            assert point["value"] > 0
