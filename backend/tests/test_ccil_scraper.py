"""Tests for enhanced CCIL scraper."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import Mock, patch, MagicMock

from data.scrapers.ccil import (
    scrape_ccil,
    extract_rate_from_cells,
    _extract_rates_from_element,
    _scrape_static,
    _check_playwright,
    _scrape_with_playwright,
    CCIL_HOME_URL,
    CCIL_TREPS_URL,
)


class TestCCILScraper:
    """Test cases for CCIL scraper."""

    def test_extract_rate_from_cells_valid(self):
        """Test rate extraction from valid cells."""
        cells = ["Call Money", "High", "6.90%"]
        result = extract_rate_from_cells(cells)
        assert result == 6.9

    def test_extract_rate_from_cells_no_valid_rate(self):
        """Test rate extraction with no valid rate."""
        cells = ["Call Money", "N/A", "-"]
        result = extract_rate_from_cells(cells)
        assert result is None

    def test_extract_rates_from_element_call_money(self):
        """Test extracting call money rates from HTML element."""
        from bs4 import BeautifulSoup
        
        html = """
        <div>
            <span>High: 6.90%</span>
            <span>Low: 6.50%</span>
            <span>Weighted Average: 6.75%</span>
        </div>
        """
        soup = BeautifulSoup(html, "lxml")
        result = _extract_rates_from_element(soup.div)
        
        assert "call_money_high" in result
        assert "call_money_low" in result
        assert "mibor_overnight" in result

    def test_extract_rates_from_element_cblo(self):
        """Test extracting CBLO/TREPS rates from HTML element."""
        from bs4 import BeautifulSoup
        
        html = """
        <div>
            <span>TREPS Rate: 6.55%</span>
        </div>
        """
        soup = BeautifulSoup(html, "lxml")
        result = _extract_rates_from_element(soup.div)
        
        assert "cblo_bid" in result
        assert "cblo_ask" in result
        assert result["cblo_ask"] == round(result["cblo_bid"] + 0.07, 4)

    @patch('data.scrapers.ccil.cache')
    @patch('data.scrapers.ccil.httpx.Client')
    def test_scrape_ccil_uses_cache(self, mock_client, mock_cache):
        """Test that scraper uses cached data when available."""
        mock_cache.get.return_value = {"call_money_high": 6.90}
        
        result = scrape_ccil()
        
        assert result == {"call_money_high": 6.90}
        mock_cache.get.assert_called_once_with("ccil")
        mock_client.assert_not_called()

    @patch('data.scrapers.ccil.cache')
    @patch('data.scrapers.ccil.httpx.Client')
    def test_scrape_ccil_static_success(self, mock_client, mock_cache):
        """Test successful static scraping."""
        mock_cache.get.return_value = None
        
        # Mock HTTP response
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_response.text = """
        <html>
            <body>
                <table>
                    <tr>
                        <td>Call Money</td>
                        <td>High</td>
                        <td>6.90%</td>
                    </tr>
                    <tr>
                        <td>Call Money</td>
                        <td>Low</td>
                        <td>6.50%</td>
                    </tr>
                    <tr>
                        <td>Weighted Average</td>
                        <td>6.75%</td>
                    </tr>
                </table>
            </body>
        </html>
        """
        
        mock_client_instance = Mock()
        mock_client_instance.__enter__ = Mock(return_value=mock_client_instance)
        mock_client_instance.__exit__ = Mock(return_value=False)
        mock_client_instance.get.return_value = mock_response
        mock_client.return_value = mock_client_instance
        
        result = scrape_ccil()
        
        assert "call_money_high" in result or "mibor_overnight" in result

    @patch('data.scrapers.ccil.cache')
    @patch('data.scrapers.ccil._check_playwright')
    @patch('data.scrapers.ccil._scrape_with_playwright')
    @patch('data.scrapers.ccil._scrape_static')
    def test_scrape_ccil_falls_back_to_playwright(
        self, mock_static, mock_playwright, mock_check, mock_cache
    ):
        """Test that scraper falls back to Playwright when static fails."""
        mock_cache.get.return_value = None
        mock_static.return_value = {}  # Static scraping returns nothing
        mock_check.return_value = True
        mock_playwright.return_value = {"call_money_high": 6.90}
        
        result = scrape_ccil()
        
        assert "call_money_high" in result
        mock_playwright.assert_called_once()

    def test_check_playwright_available(self):
        """Test checking if Playwright is available."""
        with patch.dict('sys.modules', {'playwright': MagicMock()}):
            # Reset the cached value to force re-check
            import data.scrapers.ccil as ccil_module
            ccil_module._playwright_available = None
            result = _check_playwright(force_check=True)
            assert result is True

    def test_check_playwright_not_available(self):
        """Test checking when Playwright is not available."""
        with patch.dict('sys.modules', {'playwright': None}):
            # Need to reset the cached value
            import data.scrapers.ccil as ccil_module
            ccil_module._playwright_available = None
            
            result = _check_playwright()
            assert result is False


class TestCCILPlaywright:
    """Tests for Playwright functionality in CCIL scraper."""

    @patch('data.scrapers.ccil._check_playwright')
    def test_scrape_with_playwright_not_available(self, mock_check):
        """Test that Playwright scraping is skipped when not available."""
        mock_check.return_value = False
        
        from data.scrapers.ccil import _scrape_with_playwright
        result = _scrape_with_playwright()
        
        assert result == {}

    @patch('data.scrapers.ccil._check_playwright')
    def test_scrape_with_playwright_success(self, mock_check):
        """Test successful Playwright scraping."""
        mock_check.return_value = True
        
        # Mock Playwright objects - sync_playwright is now at module level
        with patch('data.scrapers.ccil.sync_playwright') as mock_sync_playwright:
            mock_playwright = Mock()
            mock_browser = Mock()
            mock_context = Mock()
            mock_page = Mock()
            
            mock_sync_playwright.return_value.__enter__ = Mock(return_value=mock_playwright)
            mock_playwright.chromium.launch.return_value = mock_browser
            mock_browser.new_context.return_value = mock_context
            mock_context.new_page.return_value = mock_page
            
            # Mock page content with call money data AND TREPS/CBLO data
            # This prevents the fallback to TREPS page since cblo_bid is already found
            mock_page.content.return_value = """
            <html>
                <body>
                    <div>High: 6.90%</div>
                    <div>Low: 6.50%</div>
                    <div>Weighted Average Rate: 6.75%</div>
                    <div>TREPS Rate: 6.55%</div>
                </body>
            </html>
            """
            
            from data.scrapers.ccil import _scrape_with_playwright
            result = _scrape_with_playwright()
            
            # Should be called once for home page (TREPS page not needed since we have cblo_bid)
            mock_page.goto.assert_called_once_with(CCIL_HOME_URL, wait_until="networkidle")
            assert "call_money_high" in result
            assert "call_money_low" in result
            assert "mibor_overnight" in result


class TestCCILIntegration:
    """Integration tests for CCIL scraper."""

    @pytest.mark.slow
    @pytest.mark.integration
    def test_scrape_ccil_live(self):
        """Test scraping from real CCIL website."""
        result = scrape_ccil()
        
        assert isinstance(result, dict)
        
        if result:
            for key, value in result.items():
                assert isinstance(key, str)
                assert isinstance(value, (int, float))


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
