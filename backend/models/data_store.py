"""Data store models for PostgreSQL migration.

Replaces flat-file storage (JSONL, CSV, JSON) with SQLAlchemy tables:
- rate_snapshots: regional scraper output (was 8 JSONL files)
- live_snapshots: training live data (was live_snapshots.csv)
- scraper_cache: per-key TTL cache (was data/_cache/*.json)
- collection_status: per-region last-collection info (was collection_status.json)
- training_metadata: training meta + ensemble weights (was training_meta.json + ensemble_weights.json)
"""

from sqlalchemy import Column, Float, Index, Integer, String, Text
from models.database import Base


class RateSnapshot(Base):
    """One scraper collection run for a region. Replaces 8 JSONL files."""

    __tablename__ = "rate_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(String(64), nullable=False)
    region = Column(String(32), nullable=False)
    fields_count = Column(Integer, nullable=False, default=0)
    rates = Column(Text, nullable=False)  # JSON text

    __table_args__ = (
        Index("ix_rate_snap_region_ts", "region", "timestamp"),
    )


class LiveSnapshot(Base):
    """Hourly live snapshot row for training. Replaces live_snapshots.csv."""

    __tablename__ = "live_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(String(64), nullable=False)
    date = Column(String(16), nullable=False)
    hour = Column(Integer, nullable=False)
    mibor = Column(Float, nullable=False)
    repo = Column(Float, nullable=False)
    cblo = Column(Float, nullable=False)
    usdinr = Column(Float, nullable=False)
    gsec = Column(Float, nullable=False)
    call_avg = Column(Float, nullable=False)
    balance = Column(Float, nullable=False)

    __table_args__ = (
        Index("ix_live_snap_date_hour", "date", "hour"),
    )


class ScraperCache(Base):
    """Per-key TTL cache. Replaces data/_cache/*.json files."""

    __tablename__ = "scraper_cache"

    key = Column(String(256), primary_key=True)
    payload = Column(Text, nullable=False)  # JSON text
    created_at = Column(Float, nullable=False)  # epoch seconds
    ttl = Column(Integer, nullable=True)  # seconds; NULL = use default


class CollectionStatus(Base):
    """Per-region last-collection info. Replaces collection_status.json."""

    __tablename__ = "collection_status"

    region = Column(String(32), primary_key=True)
    last_collection = Column(String(64), nullable=False)
    last_fields_count = Column(Integer, nullable=False, default=0)
    last_fields = Column(Text, nullable=False)  # JSON text (list of field names)


class TrainingMetadata(Base):
    """Training run metadata and ensemble weights. Replaces training_meta.json + ensemble_weights.json."""

    __tablename__ = "training_metadata"

    id = Column(Integer, primary_key=True, autoincrement=True)
    metadata_type = Column(String(32), nullable=False)  # "training_meta" or "ensemble_weights"
    payload = Column(Text, nullable=False)  # JSON text
    created_at = Column(Float, nullable=False)  # epoch seconds

    __table_args__ = (
        Index("ix_training_meta_type", "metadata_type"),
    )
