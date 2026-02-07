"""Tests for FastAPI endpoints."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app
import config

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] in ("ok", "degraded", "partial")
    assert "model_loaded" in data
    assert "connected_clients" in data
    assert "scraping" in data
    assert "real_fields_count" in data["scraping"]
    assert "total_fields" in data["scraping"]


def test_rates():
    r = client.get("/api/rates")
    assert r.status_code == 200
    data = r.json()
    assert "rates" in data
    assert "source" in data
    assert "dataQuality" in data
    assert len(data["rates"]) == len(config.RATE_FIELDS)
    # Source map should partition all fields
    all_fields = set(data["source"]["real"]) | set(data["source"]["simulated"])
    assert all_fields == set(config.RATE_FIELDS)
    # Data quality fields
    dq = data["dataQuality"]
    assert "realFieldsCount" in dq
    assert "totalFields" in dq
    assert dq["totalFields"] == len(config.RATE_FIELDS)


def test_forecast():
    r = client.get("/api/forecast")
    assert r.status_code == 200
    data = r.json()
    assert "clockData" in data
    assert len(data["clockData"]) == 24
    for entry in data["clockData"]:
        assert "hour" in entry
        assert "balance" in entry
        assert "predicted" in entry
        assert "ci95_upper" in entry
        assert "inflow" in entry
        assert "outflow" in entry
        assert entry["inflow"] >= 0
        assert entry["outflow"] >= 0


def test_monte_carlo():
    r = client.get("/api/monte-carlo")
    assert r.status_code == 200
    data = r.json()
    assert len(data["paths"]) == config.MC_PATHS
    assert "metrics" in data
    assert data["metrics"]["lar_99"] <= data["metrics"]["lar_95"]


def test_cashflow_history():
    r = client.get("/api/cashflow-history")
    assert r.status_code == 200
    data = r.json()
    assert len(data["history"]) == 90


def test_retrain_requires_api_key():
    r = client.post("/api/model/retrain")
    assert r.status_code == 401


def test_retrain_rejects_bad_key():
    r = client.post("/api/model/retrain", headers={"X-Api-Key": "wrong-key"})
    assert r.status_code == 401


def test_retrain_accepts_correct_key():
    # Note: In TestClient, the background asyncio.create_task for training
    # may hang. We mock the training import to verify just the auth + response.
    import main
    original = main._retrain_in_progress
    main._retrain_in_progress = True  # Simulate already training
    r = client.post("/api/model/retrain", headers={"X-Api-Key": config.RETRAIN_API_KEY})
    assert r.status_code == 409  # Conflict — already training
    main._retrain_in_progress = original
