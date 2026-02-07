"""Tests for data/rate_manager.py"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import Mock, patch

import config
from data.rate_manager import RateManager, RateManagerFactory


def test_snapshot_returns_all_fields():
    rm = RateManager()
    snap = rm.snapshot()
    for field in config.RATE_FIELDS:
        assert field in snap, f"Missing field: {field}"
    assert len(snap) == len(config.RATE_FIELDS)


def test_snapshot_values_are_finite():
    rm = RateManager()
    snap = rm.snapshot()
    for field, val in snap.items():
        assert isinstance(val, (int, float)), f"{field} is not numeric: {type(val)}"
        assert val == val, f"{field} is NaN"  # NaN != NaN


def test_cblo_ask_gte_bid():
    rm = RateManager()
    snap = rm.snapshot()
    assert snap["cblo_ask"] >= snap["cblo_bid"]


def test_call_money_high_gte_low():
    rm = RateManager()
    snap = rm.snapshot()
    assert snap["call_money_high"] >= snap["call_money_low"]


def test_history_grows():
    rm = RateManager()
    rm.snapshot()
    rm.snapshot()
    rm.snapshot()
    assert len(rm.get_history()) == 3


def test_source_map_covers_all_fields():
    rm = RateManager()
    rm.snapshot()
    source = rm.get_source_map()
    all_fields = set(source["real"]) | set(source["simulated"])
    assert all_fields == set(config.RATE_FIELDS)


def test_rate_buffer_grows():
    rm = RateManager()
    rm.snapshot()
    rm.snapshot()
    buf = rm.get_rate_buffer()
    assert len(buf) == 2
    assert "repo" in buf[0]


def test_drift_mean_reverts():
    """Drift with an anchor should push values toward the anchor."""
    val = 10.0
    anchor = 6.0
    # Run many drifts — on average should move toward anchor
    results = [RateManager._drift(val, 0.01, anchor=anchor) for _ in range(200)]
    avg = sum(results) / len(results)
    assert avg < val, f"Expected mean reversion toward {anchor}, got avg={avg}"


def test_fallback_fields_logged_when_no_scrape():
    rm = RateManager()
    rm.snapshot()
    # Without scraping, all real fields should be in fallback
    assert len(rm._fallback_fields) == len(config.REAL_FIELDS)


# New tests for enhanced RateManager

@patch('data.rate_manager.scrape_all')
def test_scrape_calls_unified_scraper(mock_scrape_all):
    """Test that scrape() uses the unified scraper."""
    mock_scrape_all.return_value = {
        "repo": 6.50,
        "mibor_overnight": 6.75,
    }
    
    rm = RateManager()
    rm.scrape()
    
    mock_scrape_all.assert_called_once()
    assert "repo" in rm._real
    assert "mibor_overnight" in rm._real


@patch('data.rate_manager.scrape_all')
def test_scrape_fallback_to_individual(mock_scrape_all):
    """Test fallback to individual scrapers when unified fails."""
    mock_scrape_all.side_effect = Exception("Unified scraper failed")
    
    with patch('data.rate_manager.scrape_rbi') as mock_rbi, \
         patch('data.rate_manager.scrape_fbil') as mock_fbil:
        mock_rbi.return_value = {"repo": 6.50}
        mock_fbil.return_value = {"mibor_overnight": 6.75}
        
        rm = RateManager()
        rm.scrape()
        
        # Should have data from individual scrapers
        assert rm._real.get("repo") == 6.50
        assert rm._real.get("mibor_overnight") == 6.75


def test_get_scrape_stats():
    """Test getting scrape statistics."""
    rm = RateManager()
    
    # Before any scrape
    stats = rm.get_scrape_stats()
    assert "real_fields_count" in stats
    assert "fallback_fields" in stats
    assert "last_scrape_age_seconds" in stats


def test_get_last_scrape_age():
    """Test getting last scrape age."""
    rm = RateManager()
    
    # Before any scrape
    assert rm.get_last_scrape_age() == float('inf')
    
    # After scrape
    rm.scrape = Mock()  # Mock to avoid actual HTTP calls
    rm._last_scrape_time = 1000.0
    assert rm.get_last_scrape_age() > 0


def test_source_map_with_real_data():
    """Test source map when real data is available."""
    rm = RateManager()
    rm._real = {"repo": 6.50, "mibor_overnight": 6.75}
    rm.real_fields_available = ["repo", "mibor_overnight"]
    rm._scrape_source_log = {
        "repo": ["rbi"],
        "mibor_overnight": ["fbil", "nse"]
    }
    
    source = rm.get_source_map()
    
    assert "real" in source
    assert "simulated" in source
    assert "repo" in source["real"]
    assert "mibor_overnight" in source["real"]


def test_rate_manager_factory_singleton():
    """Test that RateManagerFactory returns singleton instance."""
    RateManagerFactory.reset_instance()
    
    rm1 = RateManagerFactory.get_instance()
    rm2 = RateManagerFactory.get_instance()
    
    assert rm1 is rm2


def test_rate_manager_factory_reset():
    """Test resetting the factory."""
    RateManagerFactory.reset_instance()
    rm1 = RateManagerFactory.get_instance()
    
    RateManagerFactory.reset_instance()
    rm2 = RateManagerFactory.get_instance()
    
    assert rm1 is not rm2


def test_determine_source():
    """Test source determination for different fields."""
    rm = RateManager()
    
    # Policy rates should come from RBI
    assert "rbi" in rm._determine_source("repo")
    
    # MIBOR should come from FBIL/NSE/CCIL
    assert "fbil" in rm._determine_source("mibor_overnight")
    
    # Call money should come from CCIL
    assert "ccil" in rm._determine_source("call_money_high")


@patch('data.rate_manager.scrape_all')
def test_scrape_logs_source_info(mock_scrape_all):
    """Test that scraping logs source information."""
    mock_scrape_all.return_value = {
        "repo": 6.50,
        "mibor_overnight": 6.75,
    }
    
    rm = RateManager()
    rm.scrape()
    
    assert len(rm._scrape_source_log) > 0
    assert "repo" in rm._scrape_source_log


def test_buffer_size_limit():
    """Test that raw buffer doesn't grow indefinitely."""
    rm = RateManager()
    
    # Take many snapshots
    for _ in range(100):
        rm.snapshot()
    
    buf = rm.get_rate_buffer()
    # Buffer should be limited to SEQ_LEN + 10
    assert len(buf) <= config.SEQ_LEN + 10


def test_history_size_limit():
    """Test that history doesn't grow indefinitely."""
    rm = RateManager()
    
    # Take many snapshots
    for _ in range(config.MAX_RATE_HISTORY + 50):
        rm.snapshot()
    
    hist = rm.get_history()
    # History should be limited
    assert len(hist) <= config.MAX_RATE_HISTORY


if __name__ == "__main__":
    import pytest
    pytest.main([__file__, "-v"])
