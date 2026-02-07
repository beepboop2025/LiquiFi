#!/bin/bash
# Install Playwright for CCIL headless browser scraping

echo "Installing Playwright for Treasury Automation App..."
echo "======================================================"

# Check if we're in a virtual environment
if [[ -z "${VIRTUAL_ENV}" ]]; then
    echo "⚠️  Warning: Not in a virtual environment. Consider activating venv first:"
    echo "   source backend/venv/bin/activate"
fi

# Install Playwright Python package
echo "📦 Installing Playwright Python package..."
pip install playwright>=1.40.0

# Install browser binaries (Chromium)
echo "🌐 Installing Chromium browser for Playwright..."
playwright install chromium

echo ""
echo "✅ Playwright installation complete!"
echo ""
echo "You can now use the enhanced CCIL scraper which will:"
echo "  1. Try static HTML scraping first (fast)"
echo "  2. Fall back to headless browser if needed"
echo ""
echo "To test the scraper, run:"
echo "  python -c \"from data.scrapers import scrape_ccil; print(scrape_ccil())\""
