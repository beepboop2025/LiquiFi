"""Prometheus metrics middleware for FastAPI."""

import time
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from prometheus_client import (
    Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST,
)
from starlette.responses import Response as StarletteResponse

# --- Metrics ---

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency",
    ["method", "endpoint"],
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
)

ACTIVE_REQUESTS = Gauge(
    "http_active_requests",
    "Currently active HTTP requests",
)

MODEL_INFERENCE_TIME = Histogram(
    "model_inference_duration_seconds",
    "ML model inference latency",
    ["model_name"],
    buckets=[0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30],
)

RATE_ENGINE_LATENCY = Histogram(
    "rate_engine_request_duration_seconds",
    "Scala rate engine response time",
    ["endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2],
)

SCRAPER_ERRORS = Counter(
    "scraper_errors_total",
    "Data scraper error count",
    ["scraper_name"],
)

CACHE_HITS = Counter(
    "cache_hits_total",
    "Cache hit count",
    ["cache_name"],
)

CACHE_MISSES = Counter(
    "cache_misses_total",
    "Cache miss count",
    ["cache_name"],
)


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Middleware that records request metrics for Prometheus."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/metrics":
            return StarletteResponse(
                content=generate_latest(),
                media_type=CONTENT_TYPE_LATEST,
            )

        method = request.method
        path = request.url.path

        ACTIVE_REQUESTS.inc()
        start = time.perf_counter()

        try:
            response = await call_next(request)
            status = str(response.status_code)
        except Exception:
            status = "500"
            raise
        finally:
            duration = time.perf_counter() - start
            ACTIVE_REQUESTS.dec()
            REQUEST_COUNT.labels(method=method, endpoint=path, status=status).inc()
            REQUEST_LATENCY.labels(method=method, endpoint=path).observe(duration)

        return response
