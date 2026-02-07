"""Database configuration for LiquiFi — SQLAlchemy + PostgreSQL setup."""

import os
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./liquifi.db"  # SQLite by default for development
)

# ---------------------------------------------------------------------------
# Engine and Session
# ---------------------------------------------------------------------------
_engine_kwargs = {
    "echo": os.getenv("LIQUIFI_SQL_ECHO", "false").lower() == "true",
}
# Only add connection pool settings for non-SQLite databases
if not DATABASE_URL.startswith("sqlite"):
    _engine_kwargs.update(pool_pre_ping=True, pool_size=10, max_overflow=20)
else:
    _engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **_engine_kwargs)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


# ---------------------------------------------------------------------------
# Dependency for FastAPI
# ---------------------------------------------------------------------------
def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that provides a database session.
    
    Usage:
        @app.get("/items")
        def get_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """Context manager for database sessions (for non-FastAPI contexts)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------
def init_database() -> None:
    """Create all tables in the database."""
    # Import models to ensure they're registered with Base
    from models.user import User
    from models.regulatory import (
        BankConfig, CRRDailyPosition, SLRDailyPosition,
        ALMBucket, LiquidityMetrics, Branch, BranchPosition, RegulatoryReport,
    )
    from models.data_store import (
        RateSnapshot, LiveSnapshot, ScraperCache,
        CollectionStatus, TrainingMetadata,
    )

    Base.metadata.create_all(bind=engine)


def init_database_with_defaults() -> None:
    """Create tables and initialize with default data."""
    init_database()
    
    with get_db_context() as db:
        from models.user import create_default_admin
        admin = create_default_admin(db)
        if admin:
            import logging
            logging.getLogger("liquifi.db").info(
                f"Created default admin user: {admin.email}"
            )
