# LiquiFi Treasury Automation App

## Project Overview
Real-time Indian money market treasury automation platform with LSTM-based liquidity forecasting, Monte Carlo simulation, and automated order execution.

## Architecture
- **Frontend**: React 18 + Vite (port 5173) — `src/`
- **Backend**: FastAPI + Python (port 8000) — `backend/`
- **ML**: PyTorch LSTM (3-layer, 128 hidden) + Monte Carlo GBM — `backend/ml/`
- **Data**: CSV-based + file cache, scrapers for RBI/FBIL/CCIL/NSE — `backend/data/`

## Quick Start
```bash
# Backend
cd backend && pip install -r requirements.txt && python main.py

# Frontend
npm install && npm run dev

# AI Bridge (for CLI AI tools)
cd backend && python ai_bridge.py diagnose --pretty
```

## AI Bridge Commands
The `ai_bridge.py` script provides a CLI interface for AI tools:
```bash
python backend/ai_bridge.py status       # Health + data quality
python backend/ai_bridge.py rates        # Current 34-field rate snapshot
python backend/ai_bridge.py forecast     # LSTM forecast
python backend/ai_bridge.py quality      # Data quality report
python backend/ai_bridge.py diagnose     # Full system diagnostic
python backend/ai_bridge.py retrain      # Trigger model retraining
python backend/ai_bridge.py config       # Current configuration
python backend/ai_bridge.py export-rates # Export rate history CSV
```

## Key Directories
- `backend/data/scrapers/` — Web scrapers for live market data
- `backend/ml/` — LSTM model, forecast, Monte Carlo simulation
- `backend/seed_data/` — Historical and live rate data (CSV)
- `backend/models/` — Trained model checkpoints
- `src/components/tabs/` — React tab components
- `src/engine/` — Frontend order processing engine
- `src/services/api.ts` — WebSocket + REST API client

## Environment Variables
- `LIQUIFI_HOST` — Server host (default: 0.0.0.0)
- `LIQUIFI_PORT` — Server port (default: 8000)
- `LIQUIFI_CORS_ORIGINS` — Comma-separated CORS origins
- `LIQUIFI_RETRAIN_KEY` — API key for model retraining (required in production)
- `LIQUIFI_ENV` — Environment: development|production
- `LIQUIFI_REQUIRE_HTTPS` — Enforce HTTPS for sensitive endpoints

## API Endpoints
- `GET /api/health` — System health with scraping/data quality metrics
- `GET /api/rates` — Current 34-field rate snapshot + data quality
- `GET /api/forecast` — 24h LSTM forecast
- `GET /api/monte-carlo` — Monte Carlo simulation
- `GET /api/cashflow-history` — 90-day cash flow history
- `GET /api/data-quality` — Detailed data quality + recommendations
- `POST /api/model/retrain` — Trigger retraining (requires X-Api-Key header)
- `WS /ws/rates` — Live rate streaming (3s interval)

## Testing
```bash
cd backend && python -m pytest tests/ -v
```

## Important Notes
- Rate data has 34 fields: 13 real (scraped), 5 derived, 16 simulated
- LSTM requires 48-hour sequence (seq_len=48) for inference
- Training uses temporal split (last 48h holdout) to prevent data leakage
- WebSocket pushes data quality metrics alongside rates
- Circuit breaker pattern in frontend engine (open → half_open → closed)
