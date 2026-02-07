# LiquiFi Backend - Production Dockerfile
# Multi-stage build for optimized image size

# Stage 1: Builder stage
FROM python:3.11-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install Playwright with Chromium
RUN pip install --no-cache-dir playwright && \
    playwright install chromium && \
    playwright install-deps chromium

# Stage 2: Production stage
FROM python:3.11-slim AS production

# Install runtime dependencies for Playwright and common utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Playwright dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    # General utilities
    curl \
    netcat-traditional \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user
RUN groupadd -r liquifi && useradd -r -g liquifi -s /bin/false liquifi

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy Playwright browsers from builder
COPY --from=builder /root/.cache/ms-playwright /home/liquifi/.cache/ms-playwright
RUN chown -R liquifi:liquifi /home/liquifi/.cache/ms-playwright

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PLAYWRIGHT_BROWSERS_PATH=/home/liquifi/.cache/ms-playwright \
    LIQUIFI_ENV=production \
    LIQUIFI_HOST=0.0.0.0 \
    LIQUIFI_PORT=8000

# Create app directory
WORKDIR /app

# Copy application code
COPY --chown=liquifi:liquifi . .

# Create necessary directories and set permissions
RUN mkdir -p data/_cache seed_data models logs metrics && \
    chown -R liquifi:liquifi /app

# Switch to non-root user
USER liquifi

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Entrypoint script
COPY --chown=liquifi:liquifi entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
