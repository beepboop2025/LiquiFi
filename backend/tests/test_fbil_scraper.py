"""Tests for FBIL scraper."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import Mock, patch, MagicMock

from data.scrapers.fbil import (
    scrape_fbil,
    _extract_rate,
    _scrape_reference_rates,
    FBIL_BASE,
)


class TestFBILScraper:
    """Test cases for FBIL scraper."""

    def test_extract_rate_valid(self):
        """Test rate extraction from valid cells."""
        cells = ["MIBOR", "Overnight", "6.75%"]
        result = _extract_rate(cells)
        assert result == 6.75

    def test_extract_rate_with_comma(self):
        """Test rate extraction with comma separator."""
        cells = ["MIBOR", "1 Week", "6,750.25"]
        result = _extract_rate(cells)
        # Should skip values > 15 (not interest rates)
        assert result is None

    def test_extract_rate_no_valid(self):
        """Test rate extraction with no valid rate."""
        cells = ["MIBOR", "Overnight", "N/A", "-"]
        result = _extract_rate(cells)
        assert result is None

    def test_extract_rate_out_of_range(self):
        """Test rate extraction with out-of-range values."""
        cells = ["MIBOR", "100.00", "200.00"]
        result = _extract_rate(cells)
        assert result is None

    def test_extract_rate_in_range(self):
        """Test rate extraction with valid interest rate range."""
        cells = ["MIBOR", "6.75", "6.80"]
        result = _extract_rate(cells)
        assert result == 6.8

    @patch('data.scrapers.fbil.cache')
    @patch('data.scrapers.fbil.httpx.Client')
    def test_scrape_fbil_uses_cache(self, mock_client, mock_cache):
        """Test that scraper uses cached data when available."""
        mock_cache.get.return_value = {"mibor_overnight": 6.75}

        result = scrape_fbil()

        assert result == {"mibor_overnight": 6.75}
        mock_cache.get.assert_called_once_with("fbil")
        mock_client.assert_not_called()

    @patch('data.scrapers.fbil.cache')
    @patch('data.scrapers.fbil.httpx.Client')
    def test_scrape_fbil_http_error(self, mock_client, mock_cache):
        """Test scraper handles HTTP errors gracefully."""
        mock_cache.get.return_value = None

        mock_response = Mock()
        mock_response.status_code = 500
        mock_response.raise_for_status.side_effect = Exception("Connection error")

        mock_client_instance = Mock()
        mock_client_instance.__enter__ = Mock(return_value=mock_client_instance)
        mock_client_instance.__exit__ = Mock(return_value=False)
        mock_client_instance.get.return_value = mock_response
        mock_client.return_value = mock_client_instance

        result = scrape_fbil()

        assert result == {}

    @patch('data.scrapers.fbil.cache')
    @patch('data.scrapers.fbil._scrape_api')
    @patch('data.scrapers.fbil._scrape_reference_rates')
    def test_scrape_fbil_merges_data(self, mock_ref, mock_api, mock_cache):
        """Test that scraper merges data from all sources."""
        mock_cache.get.return_value = None
        mock_api.return_value = {"mibor_overnight": 6.75, "tbill_91d": 6.50, "tbill_182d": 6.80}
        mock_ref.return_value = {"usdinr_spot": 83.25}

        result = scrape_fbil()

        assert "mibor_overnight" in result
        assert "tbill_91d" in result
        assert "usdinr_spot" in result


class TestFBILIntegration:
    """Integration tests that actually hit FBIL (marked as slow)."""

    @pytest.mark.slow
    @pytest.mark.integration
    def test_scrape_fbil_live(self):
        """Test scraping from real FBIL website."""
        result = scrape_fbil()

        assert isinstance(result, dict)

        if result:
            for key, value in result.items():
                assert isinstance(key, str)
                assert isinstance(value, (int, float))
                assert 0 < value < 200


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
