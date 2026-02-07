"""Tests for unified scraper orchestrator (__init__.py)."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import Mock, patch

from data.scrapers import (
    scrape_all,
    get_source_priority,
    scrape_rbi,
    scrape_fbil,
    scrape_ccil,
    scrape_nse,
)


class TestScraperOrchestrator:
    """Test cases for unified scraper orchestrator."""

    @patch('data.scrapers.scrape_rbi')
    @patch('data.scrapers.scrape_fbil')
    @patch('data.scrapers.scrape_ccil')
    @patch('data.scrapers.scrape_nse')
    def test_scrape_all_merges_sources(self, mock_nse, mock_ccil, mock_fbil, mock_rbi):
        """Test that scrape_all merges data from all sources."""
        mock_rbi.return_value = {"repo": 6.50, "usdinr_spot": 83.25}
        mock_fbil.return_value = {"mibor_overnight": 6.75}
        mock_ccil.return_value = {"call_money_high": 6.90, "call_money_low": 6.50}
        mock_nse.return_value = {"mibor_1w": 6.80}
        
        result = scrape_all()
        
        # Should have data from all sources
        assert "repo" in result  # From RBI
        assert "mibor_overnight" in result  # From FBIL
        assert "call_money_high" in result  # From CCIL
        assert "mibor_1w" in result  # From NSE

    @patch('data.scrapers.scrape_rbi')
    @patch('data.scrapers.scrape_fbil')
    @patch('data.scrapers.scrape_ccil')
    @patch('data.scrapers.scrape_nse')
    def test_scrape_all_priority_fbil_over_ccil_for_mibor(
        self, mock_nse, mock_ccil, mock_fbil, mock_rbi
    ):
        """Test that FBIL takes priority over CCIL for MIBOR rates."""
        mock_rbi.return_value = {}
        mock_fbil.return_value = {"mibor_overnight": 6.75}  # FBIL value
        mock_ccil.return_value = {"mibor_overnight": 6.70}  # CCIL value
        mock_nse.return_value = {}
        
        result = scrape_all()
        
        # FBIL value should win for MIBOR
        assert result["mibor_overnight"] == 6.75

    @patch('data.scrapers.scrape_rbi')
    @patch('data.scrapers.scrape_fbil')
    @patch('data.scrapers.scrape_ccil')
    @patch('data.scrapers.scrape_nse')
    def test_scrape_all_ccil_priority_for_call_money(
        self, mock_nse, mock_ccil, mock_fbil, mock_rbi
    ):
        """Test that CCIL takes priority for call money rates."""
        mock_rbi.return_value = {}
        mock_fbil.return_value = {"call_money_high": 6.85}
        mock_ccil.return_value = {"call_money_high": 6.90}  # CCIL value
        mock_nse.return_value = {}
        
        result = scrape_all()
        
        # CCIL value should win for call money
        assert result["call_money_high"] == 6.90

    @patch('data.scrapers.scrape_rbi')
    @patch('data.scrapers.scrape_fbil')
    @patch('data.scrapers.scrape_ccil')
    @patch('data.scrapers.scrape_nse')
    def test_scrape_all_nse_fallback(
        self, mock_nse, mock_ccil, mock_fbil, mock_rbi
    ):
        """Test that NSE is used as fallback for missing fields."""
        mock_rbi.return_value = {}
        mock_fbil.return_value = {}
        mock_ccil.return_value = {}
        mock_nse.return_value = {"mibor_overnight": 6.75}
        
        result = scrape_all()
        
        # NSE should provide the value when others fail
        assert result["mibor_overnight"] == 6.75

    @patch('data.scrapers.scrape_rbi')
    @patch('data.scrapers.scrape_fbil')
    @patch('data.scrapers.scrape_ccil')
    @patch('data.scrapers.scrape_nse')
    def test_scrape_all_handles_errors(
        self, mock_nse, mock_ccil, mock_fbil, mock_rbi
    ):
        """Test that scrape_all continues when individual scrapers fail."""
        mock_rbi.side_effect = Exception("RBI error")
        mock_fbil.return_value = {"mibor_overnight": 6.75}
        mock_ccil.side_effect = Exception("CCIL error")
        mock_nse.return_value = {}
        
        result = scrape_all()
        
        # Should still have data from FBIL
        assert "mibor_overnight" in result

    @patch('data.scrapers.scrape_rbi')
    @patch('data.scrapers.scrape_fbil')
    @patch('data.scrapers.scrape_ccil')
    @patch('data.scrapers.scrape_nse')
    def test_scrape_all_empty_when_all_fail(
        self, mock_nse, mock_ccil, mock_fbil, mock_rbi
    ):
        """Test that scrape_all returns empty dict when all scrapers fail."""
        mock_rbi.side_effect = Exception("RBI error")
        mock_fbil.side_effect = Exception("FBIL error")
        mock_ccil.side_effect = Exception("CCIL error")
        mock_nse.side_effect = Exception("NSE error")
        
        result = scrape_all()
        
        assert result == {}


class TestGetSourcePriority:
    """Test cases for get_source_priority function."""

    def test_policy_rates_priority(self):
        """Test priority for policy rates."""
        result = get_source_priority("repo")
        assert result == ["rbi", "fbil"]

    def test_mibor_rates_priority(self):
        """Test priority for MIBOR rates."""
        result = get_source_priority("mibor_overnight")
        assert result == ["fbil", "nse", "ccil"]

    def test_call_money_priority(self):
        """Test priority for call money rates."""
        result = get_source_priority("call_money_high")
        assert result == ["ccil", "fbil", "nse"]

    def test_cblo_priority(self):
        """Test priority for CBLO rates."""
        result = get_source_priority("cblo_bid")
        assert result == ["ccil", "fbil"]

    def test_tbill_priority(self):
        """Test priority for T-bill rates."""
        result = get_source_priority("tbill_91d")
        assert result == ["rbi", "fbil", "nse"]

    def test_gsec_priority(self):
        """Test priority for G-Sec rates."""
        result = get_source_priority("gsec_10y")
        assert result == ["rbi", "fbil"]

    def test_usdinr_priority(self):
        """Test priority for USD/INR rates."""
        result = get_source_priority("usdinr_spot")
        assert result == ["rbi", "fbil"]

    def test_unknown_field_default(self):
        """Test default priority for unknown fields."""
        result = get_source_priority("unknown_field")
        assert result == ["rbi", "fbil", "ccil", "nse", "us_fed", "ecb", "pboc"]


class TestScraperExports:
    """Test that all expected functions are exported."""

    def test_scrape_all_exported(self):
        """Test that scrape_all is available."""
        from data.scrapers import scrape_all
        assert callable(scrape_all)

    def test_scrape_alias(self):
        """Test that scrape is an alias for scrape_all."""
        from data.scrapers import scrape
        from data.scrapers import scrape_all
        assert scrape == scrape_all

    def test_individual_scrapers_exported(self):
        """Test that individual scrapers are available."""
        from data.scrapers import (
            scrape_rbi,
            scrape_fbil,
            scrape_ccil,
            scrape_nse,
        )
        assert callable(scrape_rbi)
        assert callable(scrape_fbil)
        assert callable(scrape_ccil)
        assert callable(scrape_nse)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
