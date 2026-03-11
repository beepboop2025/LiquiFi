# LiquiFi

**Autonomous treasury management platform with real-time FX monitoring, ML-driven forecasting, and automated hedging execution.**

LiquiFi connects to 12 global data sources, forecasts liquidity using LSTM/GRU/Transformer ensemble models, and automates regulatory compliance -- all from a single glassmorphism dashboard with smooth animations and WebSocket-driven live updates.

---

## Features

- **Real-Time FX Rate Monitoring** -- Live WebSocket ticker for USD/INR, EUR/INR, GBP/INR, JPY/INR, and 30+ additional money market fields scraped from RBI, CCIL, FBIL, FRED, ECB, and more.
- **Automated Hedging Execution Engine** -- Order lifecycle management with a circuit breaker that prevents runaway execution during volatile markets, including half-open probe limiting to avoid oscillation.
- **ML Ensemble Forecasting** -- LSTM, GRU, and Transformer models trained on 24 engineered features with walk-forward cross-validation. 24-hour forecast horizon with weighted ensemble inference.
- **Monte Carlo Stress Testing** -- 300-path simulation with VaR and CVaR computation for tail risk analysis.
- **Risk Management Dashboard** -- Instrument exposure visualization, stress test scenarios, and a compliance engine covering CRR, SLR, ALM gap analysis, LCR, and NSFR.
- **Portfolio Analytics and P&L Tracking** -- Cash position waterfall, yield attribution, and active alert management.
- **Backend Simulation Engine** -- Full order lifecycle simulation with rate drift modeling and priority-based rate merging from multiple data sources.
- **Regulatory Automation** -- CRR/SLR position tracking, ALM gap analysis, LCR/NSFR computation, and branch-level reporting.
- **Desktop Application** -- Ships as a native macOS app via Electron with the Python backend bundled as an extra resource.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 5 |
| Visualization | Recharts, Lucide React |
| Desktop | Electron 33, electron-builder |
| Backend | FastAPI, Python 3.12+ |
| Machine Learning | LSTM, GRU, Transformer (custom), Monte Carlo simulation |
| Database | PostgreSQL 15, Redis 7, Alembic migrations |
| Real-Time | WebSocket (server push + client subscription) |
| Infrastructure | Docker Compose |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.12+
- Docker (for PostgreSQL and Redis)

### Frontend

```bash
npm install
npm run dev
```

The development server starts at `http://localhost:5173`.

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start PostgreSQL and Redis
docker compose -f docker-compose.dev.yml up -d

# Run database migrations
alembic upgrade head

# Start the server
python main.py
```

The API server starts at `http://localhost:8000` with WebSocket support on `/ws`.

### Desktop (Electron)

```bash
# Development
npm run electron:dev

# Production build (macOS)
npm run electron:build
```

## License

MIT
