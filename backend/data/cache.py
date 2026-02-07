"""Dual-mode cache: PostgreSQL when available, file-based fallback.

Public API is unchanged — scrapers call get()/put()/invalidate() as before.
When DATABASE_URL points to PostgreSQL, cache uses the scraper_cache table.
Otherwise falls back to the original file-based JSON cache.
"""

import json
import logging
import os
import time
from pathlib import Path

import config

logger = logging.getLogger("liquifi.cache")


# ---------------------------------------------------------------------------
# Detect whether we should use DB-backed cache
# ---------------------------------------------------------------------------
def _use_db() -> bool:
    from models.database import DATABASE_URL
    return not DATABASE_URL.startswith("sqlite")


# ---------------------------------------------------------------------------
# DB-backed helpers (PostgreSQL)
# ---------------------------------------------------------------------------

def _db_get(key: str) -> dict | None:
    try:
        from models.database import get_db_context
        from models.data_store import ScraperCache
        with get_db_context() as db:
            row = db.query(ScraperCache).filter(ScraperCache.key == key).first()
            if row is None:
                return None
            ttl = row.ttl if row.ttl is not None else config.CACHE_TTL_S
            if time.time() - row.created_at > ttl:
                return None
            return json.loads(row.payload)
    except Exception as exc:
        logger.debug("DB cache read failed for key '%s': %s", key, exc)
        return None


def _db_put(key: str, payload: dict, ttl: int | None = None) -> None:
    try:
        from models.database import get_db_context
        from models.data_store import ScraperCache
        with get_db_context() as db:
            row = db.query(ScraperCache).filter(ScraperCache.key == key).first()
            payload_text = json.dumps(payload, default=str)
            now = time.time()
            if row is not None:
                row.payload = payload_text
                row.created_at = now
                row.ttl = ttl
            else:
                row = ScraperCache(
                    key=key, payload=payload_text, created_at=now, ttl=ttl,
                )
                db.add(row)
            db.commit()
    except Exception as exc:
        logger.warning("DB cache write failed for key '%s': %s", key, exc)


def _db_invalidate(key: str) -> None:
    try:
        from models.database import get_db_context
        from models.data_store import ScraperCache
        with get_db_context() as db:
            db.query(ScraperCache).filter(ScraperCache.key == key).delete()
            db.commit()
    except Exception as exc:
        logger.debug("DB cache invalidation failed for key '%s': %s", key, exc)


# ---------------------------------------------------------------------------
# File-based helpers (original implementation)
# ---------------------------------------------------------------------------

def _cache_dir() -> Path:
    p = Path(config.CACHE_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _file_get(key: str) -> dict | None:
    path = _cache_dir() / f"{key}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        ttl = data.get("_ttl", config.CACHE_TTL_S)
        if time.time() - data.get("_ts", 0) > ttl:
            return None
        return data.get("payload")
    except (json.JSONDecodeError, OSError) as exc:
        logger.debug("Cache read failed for key '%s': %s", key, exc)
        return None


def _file_put(key: str, payload: dict, ttl: int | None = None) -> None:
    path = _cache_dir() / f"{key}.json"
    entry = {"_ts": time.time(), "payload": payload}
    if ttl is not None:
        entry["_ttl"] = ttl
    try:
        path.write_text(json.dumps(entry))
    except OSError as exc:
        logger.warning("Cache write failed for key '%s': %s", key, exc)


def _file_invalidate(key: str) -> None:
    path = _cache_dir() / f"{key}.json"
    try:
        path.unlink(missing_ok=True)
    except OSError as exc:
        logger.debug("Cache invalidation failed for key '%s': %s", key, exc)


# ---------------------------------------------------------------------------
# Public API (same interface — zero changes needed in scrapers)
# ---------------------------------------------------------------------------

def get(key: str) -> dict | None:
    """Return cached value if present and not expired, else None."""
    if _use_db():
        return _db_get(key)
    return _file_get(key)


def put(key: str, payload: dict, ttl: int | None = None) -> None:
    """Write payload to cache with current timestamp and optional custom TTL."""
    if _use_db():
        _db_put(key, payload, ttl)
    else:
        _file_put(key, payload, ttl)


def invalidate(key: str) -> None:
    """Remove a cached entry."""
    if _use_db():
        _db_invalidate(key)
    else:
        _file_invalidate(key)
