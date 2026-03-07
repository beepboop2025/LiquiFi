# LiquiFi — Autonomous Treasury AI

Real-time treasury management platform that scrapes live money market data from 12 global sources, forecasts liquidity with LSTM/GRU/Transformer ensemble models, and automates regulatory compliance (CRR/SLR/ALM/LCR).

![LiquiFi Dashboard](screenshots/command-center.png)

### Command Center
24h liquidity forecast, cash position waterfall, yield attribution, and active alerts.

![Command Center](screenshots/command-center.png)

### AI Engine
Monte Carlo simulation (300 paths), gap detection, and model performance metrics.

![AI Engine](screenshots/ai-engine.png)

### Risk & Compliance
Instrument exposure vs regulatory limits, stress test scenarios, and compliance engine (LCR/NSFR/SLR).

![Risk & Compliance](screenshots/risk-compliance.png)

## What it does

- **213 live data fields** scraped from RBI, FBIL, CCIL, FRED, ECB, PBoC, BIS, World Bank, akshare, and yfinance — no paid APIs
- **ML ensemble forecasting** — LSTM, GRU, and Transformer models with walk-forward cross-validation and Monte Carlo stress testing (300 paths, VaR/CVaR)
- **10-tab treasury dashboard** with real-time WebSocket rate ticker, instrument exposure visualization, and compliance engine
- **Regulatory automation** — CRR/SLR position tracking, ALM gap analysis, LCR/NSFR computation, branch-level reporting
- **Multi-AI orchestration** — parallel data collection across Claude Code, Kimi, and Codex agents

## Architecture

```
Frontend (React 18 + Vite)          Backend (FastAPI + Python 3.14)
┌─────────────────────────┐         ┌──────────────────────────────┐
│ React Dashboard         │ WS/REST │ FastAPI + WebSocket Server   │
│ - 10 tabs (Command,     │◄───────►│ - Rate Manager (priority     │
│   AI Engine, Risk,      │         │   merge from 12 scrapers)    │
│   Execution, Regulatory,│         │ - ML Forecast (ensemble)     │
│   Instruments, Analytics│         │ - Monte Carlo (300 paths)    │
│   Branches, Optimizer,  │         │ - Regulatory Engine          │
│   Settings)             │         │ - JWT Auth + RBAC            │
│ - Recharts + Lucide     │         ├──────────────────────────────┤
└─────────────────────────┘         │ PostgreSQL 15 + Redis 7      │
                                    │ - Alembic migrations         │
                                    │ - Dual-write (DB + files)    │
                                    └──────────────────────────────┘
```

## Data Sources (all free, no API keys required)

| Region | Source | Fields | Update Frequency |
|--------|--------|--------|------------------|
| India | RBI, CCIL, FBIL WASDM API | 46 | 30s |
| US | FRED public CSV, Treasury Fiscal Data API | 50 | Daily |
| Europe | ECB SDW API | 13 | Daily |
| China | ChinaMoney CFETS, akshare | 27 | Daily |
| Global | yfinance (FX, commodities, equity indices) | 22 | 15min-delayed |
| Central Banks | BIS sdmx1 (49 central banks) | 30 | Daily |
| Macro | World Bank (CPI, GDP, lending rates) | 25 | Annual |

## Quick Start

### Prerequisites

- Python 3.12+ (tested on 3.14)
- Node.js 18+
- Docker (for PostgreSQL + Redis)

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start PostgreSQL
docker compose -f docker-compose.dev.yml up -d postgres

# Run database migrations
DATABASE_URL=postgresql://liquifi_dev:${POSTGRES_PASSWORD}@localhost:5433/liquifi_dev \
  alembic upgrade head

# Start the server
DATABASE_URL=postgresql://liquifi_dev:${POSTGRES_PASSWORD}@localhost:5433/liquifi_dev \
  python main.py
```

The backend starts at `http://localhost:8000` with WebSocket support.

### Frontend

```bash
# From project root
npm install
npm run dev
```

Opens at `http://localhost:5173`.

### Train ML Models

```bash
cd backend
source venv/bin/activate

# Train all 3 models (LSTM + GRU + Transformer)
python train.py --epochs 100

# Train with walk-forward cross-validation
python train.py --epochs 100 --walk-forward

# Train specific model with time budget
python train.py --models gru --hours 0.5
```

### Collect Global Data

```bash
cd backend

# Scrape all 12 sources at once (213 fields)
python ai_bridge.py scrape-all --pretty

# Collect a specific region
python multi_ai_collector.py collect --region india
python multi_ai_collector.py collect --region us

# Continuous collection loop
python multi_ai_collector.py loop --region india --interval 120

# Check data coverage
python ai_bridge.py data-coverage --pretty

# Merge all regions into unified dataset
python multi_ai_collector.py merge
```

## Project Structure

```
├── src/                          # React frontend
│   ├── components/
│   │   ├── layout/               # Header, Footer, RateTicker, TabNav
│   │   ├── shared/               # StatBox, StatusBadge, MiniSparkline, Toast
│   │   └── tabs/                 # 10 dashboard tabs
│   ├── engine/                   # Backend connection, state management
│   ├── generators/               # Forecast, rates, Monte Carlo (client-side)
│   ├── constants/                # Rate fields, instruments, regulatory rules
│   └── services/api.js           # REST + WebSocket client
│
├── backend/
│   ├── main.py                   # FastAPI app + WebSocket server
│   ├── config.py                 # All configuration constants
│   ├── train.py                  # Multi-model training pipeline
│   ├── multi_ai_collector.py     # Parallel data collection orchestrator
│   ├── ai_bridge.py              # CLI interface for AI tools
│   ├── models/
│   │   ├── database.py           # SQLAlchemy engine + session
│   │   ├── data_store.py         # PostgreSQL data models (5 tables)
│   │   ├── regulatory.py         # CRR/SLR/ALM/LCR models
│   │   └── user.py               # JWT auth + user model
│   ├── data/
│   │   ├── scrapers/             # 12 data source scrapers
│   │   ├── cache.py              # Dual-mode DB + file cache
│   │   ├── rate_manager.py       # Rate priority merge + drift simulation
│   │   ├── training_store.py     # Live snapshot persistence
│   │   └── validation.py         # Data quality checks
│   ├── ml/
│   │   ├── model.py              # LSTM, GRU, Transformer architectures
│   │   ├── ensemble.py           # Weighted ensemble inference
│   │   ├── forecast.py           # Multi-model forecasting
│   │   ├── monte_carlo.py        # Stress testing (VaR/CVaR)
│   │   └── dataset.py            # Feature engineering (24 features)
│   ├── alembic/                  # Database migrations
│   ├── routers/                  # FastAPI route handlers
│   ├── scripts/
│   │   └── migrate_files_to_pg.py  # One-time file→PostgreSQL migration
│   └── tests/                    # 74 tests
│
├── docker-compose.dev.yml        # PostgreSQL 15 + Redis 7
└── package.json                  # Frontend dependencies
```

## ML Models

Three models trained on temporal financial data with 24 engineered features:

| Model | RMSE | Beats Naive Baseline | Ensemble Weight |
|-------|------|---------------------|-----------------|
| GRU | 8.87 | Yes (17.30 baseline) | 34.8% |
| LSTM | 9.15 | Yes | 33.7% |
| Transformer | 9.81 | Yes | 31.5% |

Features include 6 rates, 3 temporal encodings, 3 lagged values, 5 spreads, 3 momentum indicators, and 4 calendar effects.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | System health + scraper status |
| `/api/rates` | GET | Current rate snapshot (34 Indian fields) |
| `/api/forecast` | GET | ML ensemble forecast (24h horizon) |
| `/api/monte-carlo` | GET | Stress test paths + VaR/CVaR |
| `/api/data-quality` | GET | Data quality report |
| `/api/model/retrain` | POST | Trigger retraining (API key required) |
| `/ws` | WebSocket | Real-time rate + forecast push |

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `LIQUIFI_RETRAIN_KEY` | Production | API key for retrain endpoint |
| `LIQUIFI_JWT_SECRET` | Production | JWT signing secret |
| `FRED_API_KEY` | No | FRED API key (public CSV works without it) |

## Tests

```bash
cd backend
source venv/bin/activate
pytest tests/ -v --ignore=tests/test_ccil_scraper.py
```

74 tests covering API endpoints, forecasting, Monte Carlo, rate management, scraper orchestration, data store models, and training pipeline.

## License

Private — all rights reserved.
