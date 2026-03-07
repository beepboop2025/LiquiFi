"""LiquiFi FastAPI backend — real-time Indian money market rates + ML forecasting."""

import asyncio
import hmac
import json
import logging
import time
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Header, Request, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("liquifi")

# Authentication imports
try:
    from models.database import init_database_with_defaults, get_db
    from middleware.auth import get_current_user
    from routers.auth import router as auth_router
    from routers.regulatory import router as regulatory_router
    from models.user import User
    _auth_available = True
except ImportError:
    _auth_available = False
    logger.warning("Authentication module not available. Install dependencies: pip install python-jose[cryptography] passlib[bcrypt] sqlalchemy")
from data.rate_manager import RateManager
from data.training_store import append_live_snapshot, get_live_stats
from data.data_quality import record_data_quality, get_data_quality_monitor
from data.historical_fetcher import estimate_data_sufficiency
from ml.forecast import get_forecast
from ml.monte_carlo import run_monte_carlo
from ml.monitoring import get_performance_tracker

# ---------------------------------------------------------------------------
# Globals (thread-safe with asyncio.Lock)
# ---------------------------------------------------------------------------
rate_manager = RateManager()
_clients_lock = asyncio.Lock()
connected_clients: set[WebSocket] = set()
_model_loaded = False
_models_loaded: list[str] = []
_last_scrape_ts: str | None = None
_last_live_append_ts: str | None = None
_retrain_in_progress = False
_retrain_lock = asyncio.Lock()

# Rate limiter for retrain endpoint
_retrain_timestamps: deque[float] = deque()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model_loaded, _models_loaded
    
    # Initialize database and create default admin if needed
    if _auth_available:
        try:
            init_database_with_defaults()
            logger.info("Database initialized")
        except Exception as e:
            logger.error(f"Database initialization failed: {e}")

        # Seed regulatory demo data (idempotent)
        try:
            from models.database import get_db_context
            from seed_data.regulatory_seed import seed_regulatory_data
            with get_db_context() as db:
                seeded = seed_regulatory_data(db)
                if seeded:
                    logger.info("Regulatory seed data loaded")
        except Exception as e:
            logger.warning(f"Regulatory seed data failed: {e}")
    
    # Load all available models (LSTM, GRU, Transformer) at startup
    try:
        from ml.forecast import load_model, _models
        _model_loaded = load_model()
        _models_loaded = list(_models.keys())
        logger.info("Models loaded: %s (success=%s)", _models_loaded, _model_loaded)
    except Exception as exc:
        logger.warning("Could not load models: %s", exc, exc_info=True)
        _model_loaded = False

    # Log data sufficiency status
    try:
        sufficiency = estimate_data_sufficiency()
        logger.info(
            "Data status: %s — %s",
            sufficiency.get("status", "unknown"),
            sufficiency.get("message", ""),
        )
    except Exception as exc:
        logger.warning("Data sufficiency check failed: %s", exc)

    # Start background loops
    rate_task = asyncio.create_task(_rate_loop())
    retrain_check_task = asyncio.create_task(_auto_retrain_check_loop())
    try:
        yield
    finally:
        rate_task.cancel()
        retrain_check_task.cancel()
        try:
            await rate_task
        except asyncio.CancelledError:
            pass
        try:
            await retrain_check_task
        except asyncio.CancelledError:
            pass
        # Close all WebSocket connections on shutdown
        async with _clients_lock:
            for ws in list(connected_clients):
                try:
                    await ws.close()
                except Exception:
                    pass
            connected_clients.clear()
        logger.info("Lifespan shutdown complete: tasks cancelled, WebSocket connections closed")


app = FastAPI(title="LiquiFi Backend", version="2.0.0", lifespan=lifespan)

# Include authentication router if available
if _auth_available:
    app.include_router(auth_router)
    app.include_router(regulatory_router)
    # Configure middleware.auth.get_db to use the actual dependency
    import middleware.auth as auth_middleware
    auth_middleware.get_db = get_db
    logger.info("Authentication system initialized")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# HTTPS enforcement middleware (production)
# ---------------------------------------------------------------------------
if config.REQUIRE_HTTPS:
    _HTTPS_EXEMPT = {"/api/health"}

    @app.middleware("http")
    async def enforce_https(request: Request, call_next):
        if request.url.scheme != "https" and request.url.path not in _HTTPS_EXEMPT:
            return JSONResponse(
                status_code=403,
                content={"status": "error", "message": "HTTPS required."},
            )
        return await call_next(request)


# ---------------------------------------------------------------------------
# Background: scrape + push rates + record performance
# ---------------------------------------------------------------------------
async def _rate_loop():
    """Scrape real rates every SCRAPE_INTERVAL_S, push to WebSocket clients every RATE_PUSH_INTERVAL_S."""
    global _last_scrape_ts, _last_live_append_ts
    last_scrape = 0.0
    perf_tracker = get_performance_tracker()

    while True:
        now = time.monotonic()
        did_scrape = False
        # Scrape at configured interval
        if now - last_scrape >= config.SCRAPE_INTERVAL_S:
            try:
                await asyncio.to_thread(rate_manager.scrape)
                _last_scrape_ts = datetime.now(timezone.utc).isoformat()
                logger.info("Scraped rates — real fields: %d", len(rate_manager.real_fields_available))
                did_scrape = True
            except Exception as exc:
                logger.error("Scrape failed: %s", exc, exc_info=True)
            last_scrape = now

        # Build snapshot with micro-drift between scrapes
        snapshot = rate_manager.snapshot()

        # Record data quality metrics
        try:
            scrape_stats = rate_manager.get_scrape_stats()
            source_map = rate_manager.get_source_map()
            record_data_quality(
                real_fields=scrape_stats.get("real_fields", []),
                simulated_fields=scrape_stats.get("fallback_fields", []),
                source_breakdown=source_map,
            )
        except Exception as exc:
            logger.warning("Data quality recording failed: %s", exc)

        if did_scrape:
            try:
                rate_buffer = rate_manager.get_rate_buffer()
                if rate_buffer:
                    latest_raw = rate_buffer[-1]
                    wrote = append_live_snapshot(latest_raw)
                    if wrote:
                        _last_live_append_ts = datetime.now(timezone.utc).isoformat()
            except Exception as exc:
                logger.warning("Live snapshot append failed: %s", exc, exc_info=True)

            # Record actual balance for performance tracking
            try:
                balance = snapshot.get("_balance") or snapshot.get("estimated_balance")
                if balance is not None:
                    perf_tracker.record_actual(float(balance))
            except Exception as exc:
                logger.debug("Performance tracking failed: %s", exc)

        rate_history = list(rate_manager.get_history())
        source = rate_manager.get_source_map()
        scrape_stats = rate_manager.get_scrape_stats()
        ws_staleness = scrape_stats.get("last_scrape_age_seconds", float("inf"))

        try:
            payload = json.dumps({
                "type": "rates",
                "data": {
                    "rates": snapshot,
                    "rateHistory": rate_history,
                    "source": source,
                    "dataQuality": {
                        "realFieldsCount": scrape_stats.get("real_fields_count", 0),
                        "totalFields": len(config.RATE_FIELDS),
                        "fallbackFields": scrape_stats.get("fallback_fields", []),
                        "stalenessSeconds": round(ws_staleness, 1) if ws_staleness != float("inf") else None,
                    },
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }, allow_nan=False)
        except (ValueError, TypeError) as exc:
            logger.warning("WebSocket payload serialization failed (NaN/Inf in data): %s", exc)
            await asyncio.sleep(config.RATE_PUSH_INTERVAL_S)
            continue

        # Push to all connected WebSocket clients (concurrently)
        # Snapshot clients under lock, then release lock for I/O
        async with _clients_lock:
            clients_snapshot = list(connected_clients)

        if clients_snapshot:
            results = await asyncio.gather(
                *[_safe_send(ws, payload) for ws in clients_snapshot],
                return_exceptions=True,
            )
            disconnected = {
                ws for ws, result in zip(clients_snapshot, results)
                if isinstance(result, Exception) or result is False
            }
            if disconnected:
                async with _clients_lock:
                    connected_clients.difference_update(disconnected)
                logger.info("Removed %d disconnected WebSocket clients", len(disconnected))

        await asyncio.sleep(config.RATE_PUSH_INTERVAL_S)


async def _auto_retrain_check_loop():
    """Periodically check if model performance has degraded and trigger retrain."""
    global _model_loaded, _retrain_in_progress

    while True:
        await asyncio.sleep(config.AUTO_RETRAIN_INTERVAL_S)

        if _retrain_in_progress:
            continue

        try:
            tracker = get_performance_tracker()
            should, reason = tracker.should_retrain()
            if should:
                logger.info("Auto-retrain triggered: %s", reason)
                async with _retrain_lock:
                    if _retrain_in_progress:
                        continue
                    _retrain_in_progress = True

                try:
                    from train import run_training
                    await asyncio.to_thread(run_training)
                    from ml.forecast import load_model
                    _model_loaded = load_model()
                    logger.info("Auto-retrain completed and models reloaded")
                except Exception as exc:
                    logger.error("Auto-retrain failed: %s", exc, exc_info=True)
                finally:
                    async with _retrain_lock:
                        _retrain_in_progress = False
        except Exception as exc:
            logger.error("Auto-retrain check failed: %s", exc)


async def _safe_send(ws: WebSocket, payload: str) -> bool:
    """Send payload to a WebSocket client. Returns False if failed."""
    try:
        await ws.send_text(payload)
        return True
    except Exception as exc:
        logger.debug("WebSocket send failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------
_WS_IDLE_TIMEOUT_S = 300  # 5 minutes


@app.websocket("/ws/rates")
async def ws_rates(ws: WebSocket):
    await ws.accept()
    async with _clients_lock:
        connected_clients.add(ws)
    logger.info("WebSocket client connected (%d total)", len(connected_clients))
    try:
        while True:
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=_WS_IDLE_TIMEOUT_S)
            except asyncio.TimeoutError:
                logger.info("WebSocket client idle for %ds — closing", _WS_IDLE_TIMEOUT_S)
                await ws.close(code=1000, reason="Idle timeout")
                break
    except WebSocketDisconnect:
        logger.debug("WebSocket client disconnected normally")
    except Exception as exc:
        logger.warning("WebSocket error: %s", exc)
    finally:
        async with _clients_lock:
            connected_clients.discard(ws)
        logger.info("WebSocket client disconnected (%d total)", len(connected_clients))


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    live_stats = get_live_stats()
    scrape_stats = rate_manager.get_scrape_stats()
    scrape_age_raw = scrape_stats.get("last_scrape_age_seconds", float("inf"))
    scrape_age = scrape_age_raw if scrape_age_raw != float("inf") else None
    real_count = scrape_stats.get("real_fields_count", 0)
    total_fields = len(config.RATE_FIELDS)

    if scrape_age is None or (scrape_age and scrape_age > 120) or real_count == 0:
        status = "degraded"
    elif real_count < total_fields * 0.5:
        status = "partial"
    else:
        status = "ok"

    dq_monitor = get_data_quality_monitor()
    quality_snapshot = dq_monitor.get_current_quality()

    # Performance tracker summary
    perf_tracker = get_performance_tracker()
    perf_summary = perf_tracker.get_performance_summary()

    body = {
        "status": status,
        "model_loaded": _model_loaded,
        "models_loaded": _models_loaded,
        "last_scrape": _last_scrape_ts,
        "last_live_append": _last_live_append_ts,
        "live_data_rows": live_stats["rows"],
        "live_data_last_timestamp": live_stats["last_timestamp"],
        "connected_clients": len(connected_clients),
        "scraping": {
            "real_fields_count": real_count,
            "total_fields": total_fields,
            "fallback_fields": scrape_stats.get("fallback_fields", []),
            "staleness_seconds": round(scrape_age, 1) if scrape_age is not None else None,
        },
        "data_quality": quality_snapshot.to_dict() if quality_snapshot else None,
        "model_performance": perf_summary,
        "retrain_in_progress": _retrain_in_progress,
    }
    if status == "degraded":
        return JSONResponse(status_code=503, content=body)
    return body


@app.get("/api/rates")
async def get_rates():
    snapshot = rate_manager.snapshot()
    source = rate_manager.get_source_map()
    scrape_stats = rate_manager.get_scrape_stats()
    staleness = scrape_stats.get("last_scrape_age_seconds", float("inf"))
    return {
        "rates": snapshot,
        "source": source,
        "dataQuality": {
            "realFieldsCount": scrape_stats.get("real_fields_count", 0),
            "totalFields": len(config.RATE_FIELDS),
            "fallbackFields": scrape_stats.get("fallback_fields", []),
            "stalenessSeconds": round(staleness, 1) if staleness != float("inf") else None,
        },
    }


@app.get("/api/forecast")
async def forecast():
    snapshot = rate_manager.snapshot()
    rate_buffer = rate_manager.get_rate_buffer()
    try:
        clock_data = await asyncio.to_thread(get_forecast, snapshot, rate_buffer)

        # Record prediction for performance tracking
        try:
            perf_tracker = get_performance_tracker()
            predicted_balances = [h["predicted"] for h in clock_data]
            source = "ensemble" if len(_models_loaded) > 1 else (_models_loaded[0] if _models_loaded else "synthetic")
            perf_tracker.record_prediction(predicted_balances, model_source=source)
        except Exception:
            pass

        return {
            "clockData": clock_data,
            "source": "ensemble" if len(_models_loaded) > 1 else ("lstm" if _model_loaded else "synthetic"),
            "modelsUsed": _models_loaded,
        }
    except Exception as exc:
        logger.error("Forecast generation failed: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": f"Forecast failed: {type(exc).__name__}"},
        )


@app.get("/api/monte-carlo")
async def monte_carlo():
    snapshot = rate_manager.snapshot()
    try:
        result = await asyncio.to_thread(run_monte_carlo, snapshot)
        return result
    except Exception as exc:
        logger.error("Monte Carlo simulation failed: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": f"Monte Carlo failed: {type(exc).__name__}"},
        )


@app.get("/api/cashflow-history")
async def cashflow_history():
    history = _generate_cashflow_history()
    return {"history": history}


@app.get("/api/data-quality")
async def data_quality():
    """Get detailed data quality metrics and recommendations."""
    monitor = get_data_quality_monitor()
    current = monitor.get_current_quality()
    trend = monitor.get_quality_trend(hours=24)
    recommendations = monitor.get_recommendations()

    # Data sufficiency for training
    sufficiency = {}
    try:
        sufficiency = estimate_data_sufficiency()
    except Exception as exc:
        logger.warning("Data sufficiency check failed: %s", exc)

    return {
        "current": current.to_dict() if current else None,
        "trend": trend,
        "recommendations": recommendations,
        "data_sufficiency": sufficiency,
    }


@app.get("/api/model/performance")
async def model_performance():
    """Get model performance metrics (prediction vs actual)."""
    tracker = get_performance_tracker()
    return tracker.get_performance_summary()


@app.post("/api/model/retrain")
async def retrain(x_api_key: str = Header(default="")):
    global _model_loaded, _models_loaded, _retrain_in_progress

    if not config.RETRAIN_API_KEY or not hmac.compare_digest(x_api_key, config.RETRAIN_API_KEY):
        logger.warning("Retrain attempt with invalid API key")
        return JSONResponse(status_code=401, content={"status": "error", "message": "Invalid or missing X-Api-Key header."})

    async with _retrain_lock:
        now = time.time()
        while _retrain_timestamps and now - _retrain_timestamps[0] > 60:
            _retrain_timestamps.popleft()
        if len(_retrain_timestamps) >= config.RETRAIN_RATE_LIMIT_PER_MIN:
            logger.warning("Retrain rate limit exceeded")
            return JSONResponse(status_code=429, content={"status": "error", "message": "Rate limit exceeded. Max 2 retrain requests per minute."})
        if _retrain_in_progress:
            return JSONResponse(status_code=409, content={"status": "error", "message": "Training already in progress."})
        _retrain_timestamps.append(now)
        _retrain_in_progress = True

    async def _do_retrain():
        global _model_loaded, _models_loaded, _retrain_in_progress
        try:
            from train import run_training
            meta = await asyncio.to_thread(run_training)
            from ml.forecast import load_model, _models
            _model_loaded = load_model()
            _models_loaded = list(_models.keys())
            logger.info("Models retrained and reloaded. Models: %s", _models_loaded)
        except Exception as exc:
            logger.error("Background retrain failed: %s", exc, exc_info=True)
        finally:
            async with _retrain_lock:
                _retrain_in_progress = False

    asyncio.create_task(_do_retrain())
    return {
        "status": "training",
        "message": "Retrain started in background (LSTM + GRU + Transformer). Check /api/health for status.",
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _generate_cashflow_history(days: int = 90) -> list[dict]:
    """Generate 90-day cash-flow history matching frontend shape."""
    import random
    data = []
    for i in range(days):
        is_payroll = i % 30 == 0
        is_gst = i % 30 == 20
        is_advtax = i in (14, 44, 74)
        inflow = random.uniform(15, 60) + (0 if is_payroll else random.uniform(0, 20))
        outflow = (
            random.uniform(10, 45)
            + (80 if is_payroll else 0)
            + (40 if is_gst else 0)
            + (60 if is_advtax else 0)
        )
        net = round(inflow - outflow, 1)
        data.append({
            "day": i,
            "label": f"D-{days - i}",
            "inflow": round(inflow, 1),
            "outflow": round(outflow, 1),
            "net": net,
            "payroll": is_payroll,
            "gst": is_gst,
            "advtax": is_advtax,
        })
    return data


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=config.HOST, port=config.PORT, reload=True)
