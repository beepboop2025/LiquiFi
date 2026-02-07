#!/bin/bash
set -e

# LiquiFi Backend Container Entrypoint Script
# Handles database migrations, health checks, and graceful startup

echo "╔══════════════════════════════════════════════════════════╗"
echo "║          LiquiFi Backend - Container Startup             ║"
echo "╚══════════════════════════════════════════════════════════╝"

# Configuration with defaults
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-liquifi}"
POSTGRES_DB="${POSTGRES_DB:-liquifi}"
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
MAX_RETRIES="${MAX_RETRIES:-30}"
RETRY_DELAY="${RETRY_DELAY:-2}"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to wait for PostgreSQL
wait_for_postgres() {
    log "⏳ Waiting for PostgreSQL at ${POSTGRES_HOST}:${POSTGRES_PORT}..."
    
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        if nc -z "$POSTGRES_HOST" "$POSTGRES_PORT" 2>/dev/null; then
            log "✅ PostgreSQL is ready!"
            return 0
        fi
        retries=$((retries + 1))
        log "  Attempt $retries/$MAX_RETRIES - waiting ${RETRY_DELAY}s..."
        sleep $RETRY_DELAY
    done
    
    log "❌ PostgreSQL connection failed after $MAX_RETRIES attempts"
    return 1
}

# Function to wait for Redis
wait_for_redis() {
    log "⏳ Waiting for Redis at ${REDIS_HOST}:${REDIS_PORT}..."
    
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        if nc -z "$REDIS_HOST" "$REDIS_PORT" 2>/dev/null; then
            log "✅ Redis is ready!"
            return 0
        fi
        retries=$((retries + 1))
        log "  Attempt $retries/$MAX_RETRIES - waiting ${RETRY_DELAY}s..."
        sleep $RETRY_DELAY
    done
    
    log "❌ Redis connection failed after $MAX_RETRIES attempts"
    return 1
}

# Function to run database migrations
run_migrations() {
    log "🔄 Running database migrations..."
    
    # Check if we have a migrations script
    if [ -f "scripts/migrate.py" ]; then
        python scripts/migrate.py
    elif [ -f "scripts/init_db.py" ]; then
        python scripts/init_db.py
    else
        log "ℹ️  No migration script found, skipping migrations"
    fi
    
    log "✅ Database migrations completed"
}

# Function to validate environment
validate_environment() {
    log "🔍 Validating environment..."
    
    # Check critical environment variables
    if [ -z "$LIQUIFI_RETRAIN_KEY" ] && [ "$LIQUIFI_ENV" = "production" ]; then
        log "⚠️  Warning: LIQUIFI_RETRAIN_KEY not set in production mode"
    fi
    
    # Verify Python environment
    if ! python --version > /dev/null 2>&1; then
        log "❌ Python is not available"
        exit 1
    fi
    
    # Verify required directories exist
    for dir in seed_data models logs metrics data/_cache; do
        if [ ! -d "$dir" ]; then
            log "📁 Creating directory: $dir"
            mkdir -p "$dir"
        fi
    done
    
    log "✅ Environment validation passed"
}

# Function to perform health check
health_check() {
    log "🏥 Performing startup health check..."
    
    # Test FastAPI import
    if ! python -c "import main" 2>/dev/null; then
        log "⚠️  Warning: Could not import main module"
    fi
    
    # Check Playwright installation
    if ! python -c "import playwright" 2>/dev/null; then
        log "⚠️  Warning: Playwright not installed"
    else
        log "✅ Playwright is installed"
    fi
    
    log "✅ Startup health check completed"
}

# Main startup sequence
main() {
    log "Starting LiquiFi Backend v2.0.0"
    log "Environment: ${LIQUIFI_ENV:-production}"
    log "Host: ${LIQUIFI_HOST:-0.0.0.0}:${LIQUIFI_PORT:-8000}"
    
    # Wait for dependencies
    if [ -n "$POSTGRES_HOST" ]; then
        wait_for_postgres || exit 1
    fi
    
    if [ -n "$REDIS_HOST" ]; then
        wait_for_redis || exit 1
    fi
    
    # Validate environment
    validate_environment
    
    # Run migrations
    run_migrations
    
    # Health check
    health_check
    
    log "🚀 Starting application..."
    log "═══════════════════════════════════════════════════════════"
    
    # Execute the main command
    exec "$@"
}

# Handle shutdown signals gracefully
shutdown_handler() {
    log "🛑 Received shutdown signal, gracefully stopping..."
    exit 0
}

trap shutdown_handler SIGTERM SIGINT

# Run main function with all arguments
main "$@"
