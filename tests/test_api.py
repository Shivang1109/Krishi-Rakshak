"""Smoke tests for Krishi Rakshak API (loads TensorFlow model — may take a few seconds)."""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from main import app  # noqa: E402

client = TestClient(app)


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is True


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["service"].startswith("Krishi Rakshak")


def test_classes_list():
    r = client.get("/classes")
    assert r.status_code == 200
    data = r.json()
    assert "classes" in data and len(data["classes"]) > 0
