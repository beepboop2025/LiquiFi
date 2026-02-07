"""Unit tests for data_store models using in-memory SQLite."""

import json
import time

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models.database import Base
from models.data_store import (
    RateSnapshot,
    LiveSnapshot,
    ScraperCache,
    CollectionStatus,
    TrainingMetadata,
)


@pytest.fixture()
def session():
    """Create an in-memory SQLite session with all tables."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    sess = Session()
    yield sess
    sess.close()


# -----------------------------------------------------------------------
# RateSnapshot
# -----------------------------------------------------------------------

class TestRateSnapshot:
    def test_roundtrip(self, session):
        rates = {"repo": 6.5, "mibor": 6.75}
        snap = RateSnapshot(
            timestamp="2026-01-15T10:00:00Z",
            region="india",
            fields_count=2,
            rates=json.dumps(rates),
        )
        session.add(snap)
        session.commit()

        row = session.query(RateSnapshot).first()
        assert row.region == "india"
        assert row.fields_count == 2
        assert json.loads(row.rates) == rates

    def test_multiple_regions(self, session):
        for region in ("india", "us", "europe"):
            session.add(RateSnapshot(
                timestamp="2026-01-15T10:00:00Z",
                region=region,
                fields_count=1,
                rates=json.dumps({"test": 1}),
            ))
        session.commit()

        india = session.query(RateSnapshot).filter_by(region="india").all()
        assert len(india) == 1
        assert session.query(RateSnapshot).count() == 3


# -----------------------------------------------------------------------
# LiveSnapshot
# -----------------------------------------------------------------------

class TestLiveSnapshot:
    def test_roundtrip(self, session):
        snap = LiveSnapshot(
            timestamp="2026-01-15T10:00:00Z",
            date="2026-01-15",
            hour=10,
            mibor=6.75,
            repo=6.50,
            cblo=6.55,
            usdinr=83.25,
            gsec=7.15,
            call_avg=6.65,
            balance=245.0,
        )
        session.add(snap)
        session.commit()

        row = session.query(LiveSnapshot).first()
        assert row.mibor == 6.75
        assert row.hour == 10
        assert row.balance == 245.0

    def test_multiple_hours(self, session):
        for h in range(24):
            session.add(LiveSnapshot(
                timestamp=f"2026-01-15T{h:02d}:00:00Z",
                date="2026-01-15",
                hour=h,
                mibor=6.75, repo=6.50, cblo=6.55,
                usdinr=83.25, gsec=7.15, call_avg=6.65,
                balance=245.0 + h,
            ))
        session.commit()
        assert session.query(LiveSnapshot).count() == 24


# -----------------------------------------------------------------------
# ScraperCache
# -----------------------------------------------------------------------

class TestScraperCache:
    def test_roundtrip(self, session):
        payload = {"repo": 6.5, "source": "rbi"}
        entry = ScraperCache(
            key="rbi",
            payload=json.dumps(payload),
            created_at=time.time(),
            ttl=300,
        )
        session.add(entry)
        session.commit()

        row = session.query(ScraperCache).get("rbi")
        assert json.loads(row.payload) == payload
        assert row.ttl == 300

    def test_upsert(self, session):
        """Simulate upsert by querying then updating."""
        session.add(ScraperCache(
            key="ecb", payload='{"old": true}', created_at=1.0, ttl=60,
        ))
        session.commit()

        row = session.query(ScraperCache).get("ecb")
        row.payload = '{"new": true}'
        row.created_at = 2.0
        session.commit()

        updated = session.query(ScraperCache).get("ecb")
        assert json.loads(updated.payload) == {"new": True}
        assert updated.created_at == 2.0
        assert session.query(ScraperCache).count() == 1

    def test_null_ttl(self, session):
        session.add(ScraperCache(
            key="test", payload="{}", created_at=time.time(), ttl=None,
        ))
        session.commit()
        row = session.query(ScraperCache).get("test")
        assert row.ttl is None


# -----------------------------------------------------------------------
# CollectionStatus
# -----------------------------------------------------------------------

class TestCollectionStatus:
    def test_roundtrip(self, session):
        fields = ["repo", "mibor", "cblo"]
        entry = CollectionStatus(
            region="india",
            last_collection="2026-01-15T10:00:00Z",
            last_fields_count=3,
            last_fields=json.dumps(fields),
        )
        session.add(entry)
        session.commit()

        row = session.query(CollectionStatus).get("india")
        assert row.last_fields_count == 3
        assert json.loads(row.last_fields) == fields

    def test_upsert(self, session):
        session.add(CollectionStatus(
            region="us",
            last_collection="2026-01-15T08:00:00Z",
            last_fields_count=10,
            last_fields=json.dumps(["a", "b"]),
        ))
        session.commit()

        row = session.query(CollectionStatus).get("us")
        row.last_collection = "2026-01-15T12:00:00Z"
        row.last_fields_count = 15
        row.last_fields = json.dumps(["a", "b", "c"])
        session.commit()

        updated = session.query(CollectionStatus).get("us")
        assert updated.last_fields_count == 15
        assert updated.last_collection == "2026-01-15T12:00:00Z"


# -----------------------------------------------------------------------
# TrainingMetadata
# -----------------------------------------------------------------------

class TestTrainingMetadata:
    def test_roundtrip(self, session):
        meta = {"rmse": 9.15, "epochs": 100}
        entry = TrainingMetadata(
            metadata_type="training_meta",
            payload=json.dumps(meta),
            created_at=time.time(),
        )
        session.add(entry)
        session.commit()

        row = session.query(TrainingMetadata).first()
        assert row.metadata_type == "training_meta"
        assert json.loads(row.payload)["rmse"] == 9.15

    def test_multiple_types(self, session):
        session.add(TrainingMetadata(
            metadata_type="training_meta",
            payload='{"v": 1}',
            created_at=1.0,
        ))
        session.add(TrainingMetadata(
            metadata_type="ensemble_weights",
            payload='{"lstm": 0.34}',
            created_at=2.0,
        ))
        session.commit()

        metas = session.query(TrainingMetadata).filter_by(
            metadata_type="training_meta",
        ).all()
        assert len(metas) == 1

        weights = session.query(TrainingMetadata).filter_by(
            metadata_type="ensemble_weights",
        ).all()
        assert len(weights) == 1

    def test_latest_by_type(self, session):
        """Verify we can get the most recent entry per type."""
        for i in range(3):
            session.add(TrainingMetadata(
                metadata_type="training_meta",
                payload=json.dumps({"version": i}),
                created_at=float(i),
            ))
        session.commit()

        latest = (
            session.query(TrainingMetadata)
            .filter_by(metadata_type="training_meta")
            .order_by(TrainingMetadata.created_at.desc())
            .first()
        )
        assert json.loads(latest.payload)["version"] == 2
