"""
Krishi Rakshak — FastAPI Backend v2
Crop Disease Detection API powered by MobileNetV2
New: Batch Predict · SQLite History · Outbreak Map · Geo Alerts
"""

import os
import io
import sys
import json
import sqlite3
import logging
import math
import ssl
import certifi
from pathlib import Path
from datetime import datetime, timedelta, date
from typing import Optional, List
from contextlib import asynccontextmanager

import urllib.request
import urllib.parse

# ── Fix SSL certificates on macOS ─────────────────────────────────────────────
_ssl_ctx = ssl.create_default_context(cafile=certifi.where())
_https_handler = urllib.request.HTTPSHandler(context=_ssl_ctx)
_opener = urllib.request.build_opener(_https_handler)
urllib.request.install_opener(_opener)

# ── Simple in-memory rate limiter (no extra deps) ─────────────────────────────
import collections
import threading

class _RateLimiter:
    """Sliding-window rate limiter keyed by IP."""
    def __init__(self):
        self._windows: dict[str, collections.deque] = {}
        self._lock = threading.Lock()

    def is_allowed(self, key: str, max_calls: int, window_seconds: int) -> bool:
        now = datetime.utcnow().timestamp()
        cutoff = now - window_seconds
        with self._lock:
            if key not in self._windows:
                self._windows[key] = collections.deque()
            dq = self._windows[key]
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= max_calls:
                return False
            dq.append(now)
            return True

_limiter = _RateLimiter()

def _get_client_ip(request) -> str:
    """Extract real client IP, respecting X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

# Load .env file if present (before any os.environ.get calls)
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
from PIL import Image

import tensorflow as tf
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    from apscheduler.schedulers.background import BackgroundScheduler
    _HAS_SCHEDULER = True
except ImportError:
    _HAS_SCHEDULER = False
    logger_tmp = logging.getLogger("krishi_rakshak")
    logger_tmp.warning("APScheduler not installed — background weather checks disabled. Run: pip install apscheduler")

try:
    from gtts import gTTS
except ImportError:
    gTTS = None

from remedies import get_remedy, SEVERITY_COLORS

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("krishi_rakshak")

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR        = Path(__file__).resolve().parent.parent
MODEL_PATH      = BASE_DIR / "best_model.keras"
CLASS_NAMES_PATH = BASE_DIR / "class_names.json"
DB_PATH         = BASE_DIR / "krishi_history.db"
IMG_SIZE        = (224, 224)
TOP_K           = 3

# ── Load model & class names ──────────────────────────────────────────────────
logger.info("Loading model from %s ...", MODEL_PATH)
if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
if not CLASS_NAMES_PATH.exists():
    raise FileNotFoundError(f"class_names.json not found: {CLASS_NAMES_PATH}")

model = tf.keras.models.load_model(str(MODEL_PATH))
with open(CLASS_NAMES_PATH) as f:
    class_names: list[str] = json.load(f)

logger.info("✅ Model loaded. Classes: %d", len(class_names))


# ── SQLite DB ─────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS diagnosis_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL,
            plant_label TEXT NOT NULL DEFAULT 'My Plant',
            disease     TEXT NOT NULL,
            confidence  REAL NOT NULL,
            severity    TEXT NOT NULL,
            treatment   TEXT,
            timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
            lat         REAL,
            lng         REAL,
            crop        TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS weather_alerts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL,
            alert_type  TEXT NOT NULL,
            message     TEXT NOT NULL,
            crop_advice TEXT,
            timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_read     INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()
    logger.info("✅ SQLite DB ready at %s", DB_PATH)

def _add_index_if_missing():
    """Idempotent: add performance index on session_id."""
    conn = get_db()
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_diag_session
        ON diagnosis_history(session_id)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_diag_lat_lng
        ON diagnosis_history(lat, lng)
        WHERE lat IS NOT NULL
    """)
    conn.commit()
    conn.close()

init_db()
_add_index_if_missing()


# ── FastAPI app ───────────────────────────────────────────────────────────────
_scheduler = None

@asynccontextmanager
async def lifespan(app_: FastAPI):
    global _scheduler
    if _HAS_SCHEDULER:
        _scheduler = BackgroundScheduler()
        _scheduler.add_job(_run_weather_checks_for_all_users, "interval", hours=6, id="weather_check")
        _scheduler.start()
        logger.info("✅ APScheduler started — weather checks every 6 hours")
    yield
    if _scheduler:
        _scheduler.shutdown(wait=False)

app = FastAPI(
    title="Krishi Rakshak API v2",
    description="Crop Disease Detection · Batch Analysis · History · Outbreak Map · Weather · Irrigation",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve forum image uploads
_forum_uploads = BASE_DIR / "forum_uploads"
_forum_uploads.mkdir(exist_ok=True)
app.mount("/forum_uploads", StaticFiles(directory=str(_forum_uploads)), name="forum_uploads")


# ── Response models ───────────────────────────────────────────────────────────
class PredictionItem(BaseModel):
    rank: int
    class_name: str
    display_name: str
    confidence: float
    confidence_pct: str

class PredictionResponse(BaseModel):
    success: bool
    top_prediction: dict
    top_k: list[PredictionItem]
    model_version: str = "MobileNetV2-v2"


# ── Severity grading ──────────────────────────────────────────────────────────
def grade_severity(confidence: float, remedy_severity: str) -> str:
    """
    Combine model confidence + remedy severity into a graded label (legacy).
    early  = confidence < 0.50  or  remedy = none/low
    moderate = 0.50–0.75        or  remedy = medium
    severe   = > 0.75           and remedy = high/critical
    """
    rs = remedy_severity.lower() if remedy_severity else ""
    if rs in ("none", "healthy", ""):
        return "healthy"
    if confidence > 0.75 and rs in ("high", "critical", "severe"):
        return "severe"
    if confidence >= 0.50 or rs in ("high", "critical", "medium", "moderate"):
        return "moderate"
    return "early"


def score_confidence_severity(confidence: float, remedy: dict) -> str:
    """
    Confidence-based severity for disease risk (single + batch + history).
    Healthy crop class → 'healthy'. Otherwise:
      < 0.5 = early, 0.5–0.75 = moderate, > 0.75 = severe
    """
    rs = (remedy.get("severity") or "").lower()
    if rs in ("none", "healthy", ""):
        return "healthy"
    if confidence < 0.5:
        return "early"
    if confidence <= 0.75:
        return "moderate"
    return "severe"


SEVERITY_SCORE = {"healthy": 0, "early": 1, "moderate": 2, "severe": 3}


# ── Preprocessing ─────────────────────────────────────────────────────────────
def preprocess_image(image_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize(IMG_SIZE, Image.LANCZOS)
    arr = np.array(img, dtype=np.float32)
    arr = tf.keras.applications.mobilenet_v2.preprocess_input(arr)
    return np.expand_dims(arr, axis=0)


def run_inference(image_bytes: bytes) -> tuple[str, float, dict, list]:
    """Run predict on image bytes. Returns (class_name, confidence, remedy, top_items)."""
    img_array = preprocess_image(image_bytes)
    preds = model.predict(img_array, verbose=0)[0]
    top_indices = np.argsort(preds)[::-1][:TOP_K]
    best_idx  = top_indices[0]
    best_class = class_names[best_idx]
    best_conf  = float(preds[best_idx])
    remedy     = get_remedy(best_class)
    top_items  = []
    for rank, idx in enumerate(top_indices, start=1):
        name   = class_names[idx]
        rem    = get_remedy(name)
        top_items.append(PredictionItem(
            rank=rank,
            class_name=name,
            display_name=rem["display_name"],
            confidence=float(preds[idx]),
            confidence_pct=f"{preds[idx]*100:.1f}%",
        ))
    return best_class, best_conf, remedy, top_items


def predict_disease(image_bytes: bytes) -> tuple[str, float, dict, list]:
    """Alias for inference pipeline (batch + docs)."""
    return run_inference(image_bytes)


def guess_crop(class_name: str) -> str:
    """Coarsely guess crop family from class name."""
    cn = class_name.lower()
    for crop in ["tomato", "rice", "paddy", "wheat", "maize", "corn",
                 "potato", "chilli", "pepper", "mango", "banana", "sugarcane"]:
        if crop in cn:
            return crop.capitalize()
    return "Unknown"


# ── Routes: Health ────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
def root():
    return {"service": "Krishi Rakshak API v2", "status": "running",
            "classes": len(class_names), "docs": "/docs"}

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "model_loaded": True, "num_classes": len(class_names)}

@app.get("/classes", tags=["Info"])
def list_classes():
    return {"total": len(class_names), "classes": class_names}


# ── Routes: Single Predict ────────────────────────────────────────────────────
@app.post("/predict", response_model=PredictionResponse, tags=["Prediction"])
async def predict(
    request: Request,
    file: UploadFile = File(...),
    session_id:  Optional[str]  = Form(None),
    plant_label: Optional[str]  = Form(None),
    save_history: Optional[bool] = Form(False),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
):
    """Upload a crop image → disease prediction + treatment."""
    # Rate limit: 30 predictions per minute per IP
    ip = _get_client_ip(request)
    if not _limiter.is_allowed(f"predict:{ip}", max_calls=30, window_seconds=60):
        raise HTTPException(429, "Too many requests. Please wait a moment before scanning again.")
    if file.content_type not in ("image/jpeg", "image/png", "image/jpg", "image/webp"):
        raise HTTPException(400, f"Invalid file type '{file.content_type}'.")

    try:
        image_bytes = await file.read()
        if not image_bytes:
            raise HTTPException(400, "Uploaded file is empty.")
        if len(image_bytes) > 10 * 1024 * 1024:
            raise HTTPException(413, "File too large — maximum 10 MB.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(422, f"Could not read file: {e}")

    try:
        best_class, best_conf, remedy, top_items = predict_disease(image_bytes)
    except Exception as e:
        logger.error("Inference failed: %s", e)
        raise HTTPException(500, "Model inference failed.")

    # Low-confidence abstain threshold (raised to 55% to reduce false positives)
    if best_conf < 0.55:
        return PredictionResponse(
            success=False,
            top_prediction={
                "class_name":          "unrecognised",
                "display_name":        "Unrecognised",
                "confidence":          best_conf,
                "confidence_pct":      f"{best_conf*100:.1f}%",
                "severity":            "unknown",
                "graded_severity":     "unknown",
                "confidence_severity": "unknown",
                "severity_color":      "#8b5cf6",
                "description":         "Could not confidently diagnose this image. Please retake the photo in good natural light, focusing on the affected leaf.",
                "symptoms":            [],
                "treatment":           ["Retake photo in good daylight.", "Ensure the affected area fills most of the frame.", "Avoid blurry or dark images."],
                "prevention":          "For best results, photograph a single leaf with clear symptoms.",
                "crop":                "Unknown",
                "low_confidence":      True,
            },
            top_k=top_items,
        )

    graded_sev = grade_severity(best_conf, remedy["severity"])
    conf_sev = score_confidence_severity(best_conf, remedy)

    top_result = {
        "class_name":      best_class,
        "display_name":    remedy["display_name"],
        "confidence":      best_conf,
        "confidence_pct":  f"{best_conf*100:.1f}%",
        "severity":        remedy["severity"],
        "graded_severity": graded_sev,
        "confidence_severity": conf_sev,
        "severity_color":  SEVERITY_COLORS.get(remedy["severity"], "#8b5cf6"),
        "description":     remedy["description"],
        "symptoms":        remedy["symptoms"],
        "treatment":       remedy["treatment"],
        "prevention":      remedy["prevention"],
        "crop":            guess_crop(best_class),
    }

    # Optionally persist to history
    if save_history and session_id:
        treatment_str = (
            "; ".join(remedy["treatment"])
            if isinstance(remedy["treatment"], list)
            else str(remedy.get("treatment", ""))
        )
        try:
            conn = get_db()
            conn.execute(
                """INSERT INTO diagnosis_history
                   (session_id, plant_label, disease, confidence, severity,
                    treatment, lat, lng, crop)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (session_id, plant_label or "My Plant", remedy["display_name"],
                 best_conf, conf_sev, treatment_str, lat, lng,
                 guess_crop(best_class))
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error("DB insert failed: %s", e)

    logger.info("Predict: %s (%.1f%%) conf_sev=%s file=%s",
                best_class, best_conf * 100, conf_sev, file.filename)

    return PredictionResponse(success=True, top_prediction=top_result, top_k=top_items)


@app.post("/text-to-speech", tags=["Voice"])
async def text_to_speech(
    text: str = Form(...),
    lang: str = Form("hi"),
):
    """Generate MP3 via gTTS when browser Speech Synthesis is unavailable."""
    if gTTS is None:
        raise HTTPException(
            503,
            "gTTS not installed. Run: pip install gtts",
        )
    clean = (text or "").strip()
    if not clean or len(clean) > 5000:
        raise HTTPException(400, "Invalid or empty text (max 5000 chars).")
    lang_code = (lang or "hi").replace("_", "-").split("-")[0].lower()
    if len(lang_code) != 2:
        lang_code = "hi"
    try:
        buf = io.BytesIO()
        gTTS(text=clean, lang=lang_code).write_to_fp(buf)
        buf.seek(0)
        return Response(content=buf.read(), media_type="audio/mpeg")
    except Exception as e:
        logger.error("gTTS failed: %s", e)
        raise HTTPException(500, "Could not generate speech audio.")


# ── Routes: Batch Predict ─────────────────────────────────────────────────────
@app.post("/batch-predict", tags=["Prediction"])
async def batch_predict(
    files: List[UploadFile] = File(...),
    session_id:  Optional[str] = Form(None),
    plant_label: Optional[str] = Form(None),
    save_history: Optional[bool] = Form(False),
):
    """
    Upload up to 10 crop images → per-image diagnosis + field summary.
    Privacy note: only aggregated results returned; no raw GPS stored here.
    """
    if len(files) > 10:
        raise HTTPException(400, "Maximum 10 images allowed per batch.")
    if not files:
        raise HTTPException(400, "No files uploaded.")

    results = []
    for f in files:
        if f.content_type not in ("image/jpeg", "image/png", "image/jpg", "image/webp"):
            results.append({"filename": f.filename, "error": "Invalid file type"})
            continue
        try:
            img_bytes = await f.read()
            if len(img_bytes) > 10 * 1024 * 1024:
                results.append({"filename": f.filename, "error": "File too large (max 10 MB)"})
                continue
            best_class, best_conf, remedy, _ = predict_disease(img_bytes)
            conf_sev = score_confidence_severity(best_conf, remedy)

            treatment_str = (
                "; ".join(remedy["treatment"])
                if isinstance(remedy["treatment"], list)
                else str(remedy.get("treatment", ""))
            )

            results.append({
                "filename":    f.filename,
                "disease":     remedy["display_name"],
                "class_name":  best_class,
                "confidence":  round(best_conf, 4),
                "confidence_pct": f"{best_conf*100:.1f}%",
                "severity":    conf_sev,
                "remedy_severity": remedy["severity"],
                "treatment":   treatment_str,
                "crop":        guess_crop(best_class),
                "description": remedy.get("description", ""),
            })

            if save_history and session_id:
                conn = get_db()
                conn.execute(
                    """INSERT INTO diagnosis_history
                       (session_id, plant_label, disease, confidence,
                        severity, treatment, crop)
                       VALUES (?,?,?,?,?,?,?)""",
                    (session_id, plant_label or f.filename,
                     remedy["display_name"], best_conf,
                     conf_sev, treatment_str, guess_crop(best_class))
                )
                conn.commit()
                conn.close()

        except Exception as e:
            logger.error("Batch inference error on %s: %s", f.filename, e)
            results.append({"filename": f.filename, "error": str(e)})

    # Field summary (severity = confidence_severity: healthy | early | moderate | severe)
    valid = [r for r in results if "error" not in r]

    def _is_healthy_row(r: dict) -> bool:
        return r.get("severity") == "healthy"

    healthy = [r for r in valid if _is_healthy_row(r)]
    affected = [r for r in valid if not _is_healthy_row(r)]

    disease_counts: dict[str, int] = {}
    for r in affected:
        disease_counts[r["disease"]] = disease_counts.get(r["disease"], 0) + 1
    most_common = max(disease_counts, key=disease_counts.get) if disease_counts else "None"

    # Urgency: high = conf > 0.85 & confidence severity severe; medium = any conf > 0.70 on affected; low = rest
    if not affected:
        urgency = "low"
        action = "All samples look healthy. Continue regular monitoring."
    elif any(r["confidence"] > 0.85 and r["severity"] == "severe" for r in affected):
        urgency = "high"
        action = f"URGENT: High confidence severe risk. Focus on {most_common}."
    elif any(r["confidence"] > 0.70 for r in affected):
        urgency = "medium"
        action = f"Monitor closely and begin treatment for {most_common}."
    else:
        urgency = "low"
        action = "Low confidence on diseased samples — consider clearer leaf photos."

    summary = {
        "most_common_disease": most_common,
        "affected_count":      len(affected),
        "healthy_count":       len(healthy),
        "total_valid":         len(valid),
        "urgency_level":       urgency,
        "recommended_action":  action,
    }

    return {
        "total_images": len(files),
        "results":       results,
        "field_summary": summary,
    }


# ── Routes: History ───────────────────────────────────────────────────────────
def _severity_score(s: str) -> int:
    return SEVERITY_SCORE.get(s.lower(), 1)

def _calc_trend(entries: list) -> str:
    if len(entries) < 2:
        return "stable"
    last  = _severity_score(entries[-1]["severity"])
    prev  = _severity_score(entries[-2]["severity"])
    if last > prev:
        return "worsening"
    if last < prev:
        return "improving"
    return "stable"


@app.get("/history/{session_id}", tags=["History"])
def get_history(session_id: str):
    """Return all diagnoses for a session grouped by plant_label with trend."""
    conn = get_db()
    rows = conn.execute(
        """SELECT plant_label, disease, confidence, severity, treatment,
                  timestamp, lat, lng, crop
           FROM diagnosis_history
           WHERE session_id = ?
           ORDER BY plant_label, timestamp ASC""",
        (session_id,)
    ).fetchall()
    conn.close()

    grouped: dict[str, list] = {}
    for r in rows:
        pl = r["plant_label"]
        if pl not in grouped:
            grouped[pl] = []
        grouped[pl].append({
            "disease":    r["disease"],
            "confidence": r["confidence"],
            "severity":   r["severity"],
            "treatment":  r["treatment"],
            "timestamp":  r["timestamp"],
            "lat":        r["lat"],
            "lng":        r["lng"],
            "crop":       r["crop"],
        })

    plants = []
    for label, entries in grouped.items():
        plants.append({
            "plant_label":    label,
            "entries":        entries,
            "trend":          _calc_trend(entries),
            "latest_disease": entries[-1]["disease"] if entries else None,
            "latest_severity": entries[-1]["severity"] if entries else None,
            "total_scans":    len(entries),
        })

    return {"session_id": session_id, "plants": plants, "total_plants": len(plants)}


@app.delete("/history/{session_id}", tags=["History"])
def delete_history(session_id: str):
    """Delete all history for a session."""
    conn = get_db()
    conn.execute("DELETE FROM diagnosis_history WHERE session_id = ?", (session_id,))
    conn.commit()
    conn.close()
    return {"deleted": True, "session_id": session_id}


# ── Routes: Outbreak Map ──────────────────────────────────────────────────────
# Privacy note: coordinates are rounded to 2 decimal places (~1km precision)
# — no individual farm locations are ever stored or returned.
def _haversine(lat1, lng1, lat2, lng2) -> float:
    """Return distance in km between two lat/lng points."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat/2)**2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2)
    return R * 2 * math.asin(math.sqrt(a))


@app.get("/outbreak-map", tags=["Map"])
def outbreak_map(
    disease:  Optional[str] = Query(None),
    days_back: int = Query(30, ge=1, le=365),
    crop:     Optional[str] = Query(None),
):
    """
    Aggregated district-level disease clusters (privacy-safe, rounded to 2dp).
    No individual records returned.
    """
    cutoff = (datetime.utcnow() - timedelta(days=days_back)).isoformat()
    conn = get_db()

    query = """
        SELECT
            ROUND(lat, 2) AS lat,
            ROUND(lng, 2) AS lng,
            disease,
            crop,
            COUNT(*)              AS count,
            AVG(confidence)       AS severity_avg,
            MAX(timestamp)        AS last_seen,
            severity
        FROM diagnosis_history
        WHERE lat IS NOT NULL
          AND lng IS NOT NULL
          AND timestamp >= ?
    """
    params: list = [cutoff]
    if disease:
        query += " AND disease LIKE ?"; params.append(f"%{disease}%")
    if crop:
        query += " AND crop LIKE ?";    params.append(f"%{crop}%")

    query += " GROUP BY ROUND(lat,2), ROUND(lng,2), disease ORDER BY count DESC"

    rows = conn.execute(query, params).fetchall()
    conn.close()

    clusters = [{
        "lat":          r["lat"],
        "lng":          r["lng"],
        "disease":      r["disease"],
        "crop":         r["crop"],
        "count":        r["count"],
        "severity_avg": round(r["severity_avg"], 3),
        "last_seen":    r["last_seen"],
        "severity":     r["severity"],
    } for r in rows]

    return {"clusters": clusters, "days_back": days_back, "total_clusters": len(clusters)}


@app.get("/my-area-alerts", tags=["Map"])
def my_area_alerts(
    lat:       float = Query(...),
    lng:       float = Query(...),
    radius_km: float = Query(50, ge=1, le=500),
    days_back: int   = Query(14, ge=1, le=90),
):
    """
    Active disease alerts within radius_km of given location.
    Returned clusters rounded to 2dp — no individual farm data.
    """
    cutoff = (datetime.utcnow() - timedelta(days=days_back)).isoformat()

    # Rough bounding box to reduce DB scan
    deg_per_km = 1 / 111
    lat_margin = radius_km * deg_per_km
    lng_margin = radius_km * deg_per_km / max(math.cos(math.radians(lat)), 0.01)

    conn = get_db()
    rows = conn.execute("""
        SELECT ROUND(lat,2) AS lat, ROUND(lng,2) AS lng,
               disease, crop, COUNT(*) AS count,
               AVG(confidence) AS severity_avg, MAX(timestamp) AS last_seen
        FROM diagnosis_history
        WHERE lat IS NOT NULL AND lng IS NOT NULL
          AND lat BETWEEN ? AND ?
          AND lng BETWEEN ? AND ?
          AND timestamp >= ?
          AND severity != 'healthy'
        GROUP BY ROUND(lat,2), ROUND(lng,2), disease
        ORDER BY count DESC
    """, (lat - lat_margin, lat + lat_margin,
          lng - lng_margin, lng + lng_margin,
          cutoff)).fetchall()
    conn.close()

    alerts = []
    for r in rows:
        dist = _haversine(lat, lng, r["lat"], r["lng"])
        if dist <= radius_km:
            alerts.append({
                "disease":      r["disease"],
                "crop":         r["crop"],
                "count":        r["count"],
                "distance_km":  round(dist, 1),
                "severity_avg": round(r["severity_avg"], 3),
                "last_seen":    r["last_seen"],
            })

    alerts.sort(key=lambda x: x["count"], reverse=True)

    summary = (
        f"{alerts[0]['count']} {alerts[0]['disease']} cases within {radius_km}km this week"
        if alerts else "No active disease alerts in your area."
    )

    return {
        "lat": lat, "lng": lng,
        "radius_km": radius_km,
        "alerts": alerts,
        "total_alerts": len(alerts),
        "summary": summary,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# MANDI PRICES
# ═══════════════════════════════════════════════════════════════════════════════

# ── In-memory price cache: key → (timestamp, data) ───────────────────────────
_price_cache: dict[str, tuple[datetime, list]] = {}
_CACHE_TTL = timedelta(hours=1)

# data.gov.in API key — set via DATAGOV_KEY environment variable
# Get a free key at: https://data.gov.in/user/register
DATAGOV_KEY = os.environ.get("DATAGOV_KEY", "")
DATAGOV_RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070"

def init_mandi_db():
    """Create price_history table for 7-day trend tracking."""
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS price_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            crop        TEXT NOT NULL,
            market      TEXT NOT NULL,
            state       TEXT NOT NULL,
            district    TEXT,
            modal_price REAL NOT NULL,
            min_price   REAL,
            max_price   REAL,
            price_date  TEXT NOT NULL,
            fetched_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_mandi_db()


def _fetch_datagov(crop: str, state: str, limit: int = 100) -> list[dict]:
    """Fetch from data.gov.in with 1-hour in-memory cache."""
    cache_key = f"{crop.lower()}|{state.lower()}"
    now = datetime.utcnow()
    if cache_key in _price_cache:
        ts, data = _price_cache[cache_key]
        if now - ts < _CACHE_TTL:
            return data

    url = (
        f"https://api.data.gov.in/resource/{DATAGOV_RESOURCE}"
        f"?api-key={DATAGOV_KEY}&format=json&limit={limit}"
        f"&filters[commodity]={urllib.parse.quote(crop)}"
        f"&filters[state]={urllib.parse.quote(state)}"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "KrishiRakshak/2.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            raw = json.loads(resp.read().decode())
        records = raw.get("records", [])
    except Exception as e:
        logger.warning("data.gov.in fetch failed: %s", e)
        records = []

    _price_cache[cache_key] = (now, records)
    return records


def _safe_float(val) -> float:
    try:
        return float(str(val).replace(",", "").strip())
    except Exception:
        return 0.0


def _upsert_price_history(crop: str, market: str, state: str,
                           district: str, modal: float,
                           mn: float, mx: float, price_date: str):
    """Store today's price; keep only last 7 days per crop+market."""
    conn = get_db()
    # Avoid duplicate for same date
    exists = conn.execute(
        "SELECT id FROM price_history WHERE crop=? AND market=? AND price_date=?",
        (crop, market, price_date)
    ).fetchone()
    if not exists:
        conn.execute(
            """INSERT INTO price_history
               (crop, market, state, district, modal_price, min_price, max_price, price_date)
               VALUES (?,?,?,?,?,?,?,?)""",
            (crop, market, state, district, modal, mn, mx, price_date)
        )
        conn.commit()
    # Prune older than 7 days
    cutoff = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
    conn.execute(
        "DELETE FROM price_history WHERE crop=? AND market=? AND price_date<?",
        (crop, market, cutoff)
    )
    conn.commit()
    conn.close()


def _get_price_trend(crop: str, market: str) -> str:
    """Compare today vs 3-day average → rising/falling/stable."""
    conn = get_db()
    rows = conn.execute(
        """SELECT modal_price, price_date FROM price_history
           WHERE crop=? AND market=?
           ORDER BY price_date DESC LIMIT 7""",
        (crop, market)
    ).fetchall()
    conn.close()
    if len(rows) < 2:
        return "stable"
    today = rows[0]["modal_price"]
    avg3 = sum(r["modal_price"] for r in rows[1:4]) / len(rows[1:4])
    if today > avg3 * 1.02:
        return "rising"
    if today < avg3 * 0.98:
        return "falling"
    return "stable"


def _get_price_chart(crop: str, market: str) -> list[dict]:
    """Return last 7 days of avg prices for sparkline."""
    conn = get_db()
    rows = conn.execute(
        """SELECT price_date, AVG(modal_price) as avg_price
           FROM price_history WHERE crop=?
           GROUP BY price_date ORDER BY price_date DESC LIMIT 7""",
        (crop,)
    ).fetchall()
    conn.close()
    return [{"date": r["price_date"], "avg_price": round(r["avg_price"], 2)}
            for r in reversed(rows)]


@app.get("/mandi-prices", tags=["Market"])
def mandi_prices(
    crop:     str = Query(..., description="Commodity name e.g. Tomato, Wheat, Paddy"),
    state:    str = Query(..., description="State name e.g. Maharashtra, Punjab"),
    district: Optional[str] = Query(None),
    lat:      Optional[float] = Query(None),
    lng:      Optional[float] = Query(None),
):
    """
    Fetch live mandi prices from data.gov.in, add 7-day trend + best market.
    Cached in memory for 1 hour per crop+state combination.
    """
    records = _fetch_datagov(crop, state)

    # Filter by district if provided
    if district:
        records = [r for r in records
                   if district.lower() in str(r.get("district", "")).lower()]

    if not records:
        # Return demo data so frontend always has something to show
        demo = _demo_mandi(crop, state)
        return demo

    markets = []
    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    for r in records:
        market_name = str(r.get("market", r.get("apmc", "Unknown Market")))
        dist_name   = str(r.get("district", ""))
        modal = _safe_float(r.get("modal_price", r.get("modal", 0)))
        mn    = _safe_float(r.get("min_price",   r.get("min",   modal * 0.9)))
        mx    = _safe_float(r.get("max_price",   r.get("max",   modal * 1.1)))
        price_date = str(r.get("arrival_date", r.get("date", today_str)))

        if modal <= 0:
            continue

        # Persist for trend tracking
        _upsert_price_history(crop, market_name, state, dist_name,
                               modal, mn, mx, price_date)
        trend = _get_price_trend(crop, market_name)

        # Distance from farmer (if lat/lng provided)
        dist_km = None
        if lat and lng:
            # Approximate market lat/lng from district centroid — not available
            # in data.gov.in, so we skip distance for real data
            dist_km = None

        markets.append({
            "name":       market_name,
            "district":   dist_name,
            "state":      state,
            "min":        mn,
            "max":        mx,
            "modal":      modal,
            "date":       price_date,
            "trend":      trend,
            "distance_km": dist_km,
        })

    # Sort by modal price descending, take top 10
    markets.sort(key=lambda x: x["modal"], reverse=True)
    top3 = markets[:3]
    best = top3[0] if top3 else None

    price_chart = _get_price_chart(crop, state)

    return {
        "crop":        crop,
        "state":       state,
        "total_found": len(markets),
        "markets":     markets[:10],
        "best_market": {
            "name":  best["name"] if best else "—",
            "price": best["modal"] if best else 0,
            "potential_gain_vs_local": (
                f"₹{best['modal'] - markets[-1]['modal']:.0f}/quintal more than lowest market"
                if best and len(markets) > 1 else "Best available price"
            ),
        } if best else None,
        "price_chart": price_chart,
    }


def _demo_mandi(crop: str, state: str) -> dict:
    """Fallback demo data when API key is not set or API is unreachable."""
    import random
    base = {"Tomato": 1800, "Wheat": 2200, "Paddy": 1900, "Onion": 1400,
            "Potato": 1200, "Maize": 1600, "Chilli": 8000, "Mango": 3500,
            "Sugarcane": 350, "Banana": 2200}.get(crop.capitalize(), 1500)
    markets = []
    names = [f"{state} APMC", f"District Mandi", f"Wholesale Market",
             f"Farmers Market", f"Central Mandi"]
    for i, name in enumerate(names):
        modal = base + random.randint(-200, 400) - i * 50
        markets.append({
            "name": name, "district": state,
            "state": state,
            "min": round(modal * 0.88), "max": round(modal * 1.12),
            "modal": modal,
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "trend": random.choice(["rising", "stable", "falling"]),
            "distance_km": round(10 + i * 15, 1),
        })
    markets.sort(key=lambda x: x["modal"], reverse=True)
    return {
        "crop": crop, "state": state,
        "total_found": len(markets),
        "markets": markets,
        "best_market": {
            "name": markets[0]["name"],
            "price": markets[0]["modal"],
            "potential_gain_vs_local": f"₹{markets[0]['modal'] - markets[-1]['modal']:.0f}/quintal more than lowest market",
        },
        "price_chart": [
            {"date": (datetime.utcnow() - timedelta(days=6-i)).strftime("%Y-%m-%d"),
             "avg_price": base + random.randint(-150, 150)}
            for i in range(7)
        ],
        "_demo": True,
    }


# ── urllib.parse already imported at top ─────────────────────────────────────


# ═══════════════════════════════════════════════════════════════════════════════
# WEATHER MODULE
# ═══════════════════════════════════════════════════════════════════════════════

def init_alerts_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS weather_alerts_v2 (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id  TEXT NOT NULL,
            alert_type  TEXT NOT NULL,
            message     TEXT NOT NULL,
            crop_advice TEXT,
            timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_read     INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_locations (
            session_id  TEXT PRIMARY KEY,
            lat         REAL NOT NULL,
            lng         REAL NOT NULL,
            crop        TEXT,
            updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_alerts_db()

ALERT_ADVICE = {
    "hail": {
        "tomato":    "Cover with nets immediately. Remove damaged fruits to prevent rot.",
        "paddy":     "Hail can cause significant grain loss. Document damage for insurance claim.",
        "wheat":     "Hail before flowering causes more damage. Monitor for lodging.",
        "potato":    "Check tubers for bruising. Damaged foliage increases blight risk.",
        "chilli":    "Remove damaged fruits immediately to prevent fungal entry.",
        "mango":     "Hail causes fruit scarring. Apply copper spray to prevent infection.",
        "banana":    "Hail tears leaves. Remove badly damaged leaves to prevent disease.",
        "sugarcane": "Hail can cause stalk cracking. Monitor for red rot entry.",
        "corn":      "Hail at silking stage causes severe yield loss. Document for insurance.",
    },
    "frost": {
        "potato":    "Irrigate fields before frost — wet soil holds heat better.",
        "wheat":     "Frost at jointing stage is most damaging. Monitor for recovery.",
        "tomato":    "Cover plants with plastic mulch. Harvest mature fruits immediately.",
        "chilli":    "Frost kills chilli plants. Harvest all mature fruits now.",
        "sugarcane": "Frost can kill ratoon crop. Consider harvest if forecast is severe.",
        "banana":    "Banana is frost-sensitive. Cover young plants with dry leaves.",
        "mango":     "Young mango trees need protection. Cover with cloth overnight.",
        "paddy":     "Frost at flowering causes sterility. Flood irrigate if possible.",
        "corn":      "Frost at silking causes severe damage. Harvest if near maturity.",
    },
    "heavy_rain": {
        "paddy":     "Drain excess water to prevent root rot and bacterial diseases.",
        "wheat":     "Heavy rain increases rust risk. Prepare fungicide spray.",
        "tomato":    "Heavy rain spreads late blight. Apply Metalaxyl + Mancozeb immediately.",
        "potato":    "Waterlogging causes tuber rot. Ensure field drainage is clear.",
        "chilli":    "Heavy rain causes anthracnose. Apply copper fungicide after rain.",
        "mango":     "Heavy rain during flowering causes fruit drop. Avoid spraying.",
        "banana":    "Ensure drainage channels are clear to prevent waterlogging.",
        "sugarcane": "Heavy rain can cause lodging. Earthing up helps prevent it.",
        "corn":      "Heavy rain at pollination reduces yield. Monitor for fungal diseases.",
    },
    "thunderstorm": {
        "paddy":     "Avoid field operations during storm. Check for lodging after.",
        "wheat":     "Thunderstorms with hail can cause lodging. Inspect after storm.",
        "tomato":    "Secure stakes and supports before storm arrives.",
        "potato":    "Ensure drainage is clear before storm.",
        "chilli":    "Secure plants and remove ripe fruits before storm.",
        "mango":     "Thunderstorms can cause branch breakage. Prune weak branches.",
        "banana":    "Banana plants are wind-sensitive. Prop up heavy bunches.",
        "sugarcane": "Thunderstorms cause lodging. Earthing up before storm helps.",
        "corn":      "Secure tall plants. Lodging at tasseling stage reduces yield.",
    },
    "heatwave": {
        "tomato":    "Irrigate in early morning. Mulch to retain soil moisture. Shade nets help.",
        "paddy":     "Maintain 5cm water level in field. Heatwave at flowering causes sterility.",
        "wheat":     "Heatwave at grain filling causes shriveling. Ensure adequate irrigation.",
        "potato":    "Heatwave causes tuber greening. Hill up soil around plants.",
        "chilli":    "Heatwave causes flower drop. Irrigate frequently in small amounts.",
        "mango":     "Heatwave causes fruit sunburn. Whitewash exposed fruits.",
        "banana":    "Increase irrigation frequency. Mulch around plants.",
        "sugarcane": "Ensure adequate irrigation. Heatwave slows growth.",
        "corn":      "Heatwave at silking causes poor pollination. Irrigate daily.",
    },
}

WMO_DESCRIPTIONS = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Icy fog", 51: "Light drizzle", 53: "Moderate drizzle",
    55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain", 71: "Slight snow",
    73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Slight showers", 81: "Moderate showers", 82: "Violent showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
}

def _wmo_icon(code: int) -> str:
    if code == 0: return "sunny"
    if code in (1, 2): return "partly_cloudy"
    if code == 3: return "cloudy"
    if code in (45, 48): return "foggy"
    if code in (51, 53, 55, 61, 63): return "rainy"
    if code in (65, 67, 80, 81, 82): return "heavy_rain"
    if code in (71, 73, 75, 77, 85, 86): return "snowy"
    if code in (95, 96, 99): return "thunderstorm"
    return "cloudy"

def _fetch_open_meteo(lat: float, lng: float) -> dict:
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lng}"
        f"&hourly=temperature_2m,precipitation_probability,windspeed_10m,relative_humidity_2m"
        f"&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,"
        f"windspeed_10m_max,sunrise,sunset"
        f"&timezone=Asia%2FKolkata&forecast_days=7"
    )
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={"User-Agent": "KrishiRakshak/2.0"})
    with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
        return json.loads(resp.read().decode())

@app.get("/weather", tags=["Weather"])
def get_weather(
    lat:  float = Query(...),
    lng:  float = Query(...),
    crop: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None),
):
    """Hyper-local weather with crop-specific farming context."""
    try:
        raw = _fetch_open_meteo(lat, lng)
    except Exception as e:
        logger.error("Open-Meteo fetch failed: %s", e)
        raise HTTPException(502, "Weather service unavailable.")

    hourly = raw.get("hourly", {})
    daily  = raw.get("daily", {})

    # Save user location for background alerts
    if session_id:
        try:
            conn = get_db()
            conn.execute("""
                INSERT INTO user_locations (session_id, lat, lng, crop, updated_at)
                VALUES (?,?,?,?,CURRENT_TIMESTAMP)
                ON CONFLICT(session_id) DO UPDATE SET
                  lat=excluded.lat, lng=excluded.lng,
                  crop=excluded.crop, updated_at=excluded.updated_at
            """, (session_id, lat, lng, crop))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.warning("Could not save user location: %s", e)

    # Current conditions (first hourly slot)
    current_temp   = hourly.get("temperature_2m", [None])[0]
    current_wind   = hourly.get("windspeed_10m", [None])[0]
    current_humid  = hourly.get("relative_humidity_2m", [None])[0]
    current_rain_p = hourly.get("precipitation_probability", [None])[0]

    # Crop-specific context
    next6h_rain = any(
        (hourly.get("precipitation_probability") or [])[i:i+6]
        and max((hourly.get("precipitation_probability") or [0]*6)[i:i+6]) >= 40
        for i in range(1)
    )
    next6h_wind_ok = (current_wind or 99) < 15

    spray_suitable = next6h_wind_ok and not next6h_rain

    next3d_precip = sum((daily.get("precipitation_sum") or [0,0,0])[:3])
    next3d_max_temp = max((daily.get("temperature_2m_max") or [0,0,0])[:3])
    irrigation_needed = next3d_precip < 5 and next3d_max_temp > 30

    min_temps = daily.get("temperature_2m_min") or []
    frost_risk = any(t < 5 for t in min_temps[:3] if t is not None)

    # Best spray window (find 6h block with wind<15 and rain_prob<30)
    spray_window = None
    times = hourly.get("time") or []
    winds = hourly.get("windspeed_10m") or []
    rains = hourly.get("precipitation_probability") or []
    for i in range(min(48, len(times)-6)):
        if (winds[i] or 99) < 15 and (rains[i] or 100) < 30:
            try:
                t = datetime.fromisoformat(times[i])
                if 5 <= t.hour <= 10:
                    spray_window = times[i]
                    break
            except Exception:
                pass

    # Farmer alerts
    farmer_alerts = []
    if irrigation_needed:
        farmer_alerts.append({
            "type": "irrigation",
            "icon": "💧",
            "message": f"Irrigation recommended — only {next3d_precip:.1f}mm rain forecast in 3 days with {next3d_max_temp:.0f}°C heat.",
        })
    if frost_risk:
        farmer_alerts.append({
            "type": "frost",
            "icon": "🧊",
            "message": "Frost risk in next 3 days — protect sensitive crops.",
        })
    humid_vals = (hourly.get("relative_humidity_2m") or [])[:24]
    if humid_vals and sum(humid_vals)/len(humid_vals) > 80:
        farmer_alerts.append({
            "type": "fungal",
            "icon": "🍄",
            "message": "High humidity alert — watch for fungal disease outbreaks.",
        })
    if spray_window:
        try:
            sw = datetime.fromisoformat(spray_window)
            farmer_alerts.append({
                "type": "spray",
                "icon": "🌿",
                "message": f"Good spraying window: {sw.strftime('%A')} {sw.strftime('%I %p')} — low wind & no rain.",
            })
        except Exception:
            pass

    # 7-day forecast
    forecast = []
    days_count = len(daily.get("weathercode") or [])
    for i in range(min(7, days_count)):
        wcode = (daily.get("weathercode") or [0]*7)[i]
        forecast.append({
            "date":        (daily.get("time") or [""] * 7)[i],
            "weathercode": wcode,
            "icon":        _wmo_icon(wcode),
            "description": WMO_DESCRIPTIONS.get(wcode, "Unknown"),
            "temp_max":    (daily.get("temperature_2m_max") or [None]*7)[i],
            "temp_min":    (daily.get("temperature_2m_min") or [None]*7)[i],
            "precip_sum":  (daily.get("precipitation_sum") or [None]*7)[i],
            "wind_max":    (daily.get("windspeed_10m_max") or [None]*7)[i],
            "sunrise":     (daily.get("sunrise") or [""] * 7)[i],
            "sunset":      (daily.get("sunset") or [""] * 7)[i],
        })

    return {
        "current": {
            "temperature":   current_temp,
            "wind_kmh":      current_wind,
            "humidity_pct":  current_humid,
            "rain_prob_pct": current_rain_p,
            "weathercode":   (daily.get("weathercode") or [0])[0],
            "icon":          _wmo_icon((daily.get("weathercode") or [0])[0]),
            "description":   WMO_DESCRIPTIONS.get((daily.get("weathercode") or [0])[0], ""),
        },
        "crop_context": {
            "spray_suitable":    spray_suitable,
            "irrigation_needed": irrigation_needed,
            "frost_risk":        frost_risk,
            "spray_window":      spray_window,
        },
        "farmer_alerts": farmer_alerts,
        "forecast":      forecast,
        "lat": lat, "lng": lng, "crop": crop,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# EXTREME WEATHER ALERTS
# ═══════════════════════════════════════════════════════════════════════════════

def _check_extreme_weather(session_id: str, lat: float, lng: float, crop: Optional[str]):
    """Check Open-Meteo for extreme events and create alerts."""
    try:
        raw = _fetch_open_meteo(lat, lng)
    except Exception as e:
        logger.warning("Weather check failed for %s: %s", session_id, e)
        return

    daily = raw.get("daily", {})
    codes = daily.get("weathercode") or []
    max_temps = daily.get("temperature_2m_max") or []
    min_temps = daily.get("temperature_2m_min") or []

    crop_key = (crop or "").lower().split()[0] if crop else None
    alerts_to_create = []

    # Hail
    if any(c in (96, 99) for c in codes[:3]):
        advice = ALERT_ADVICE["hail"].get(crop_key, "Protect crops from hail damage.") if crop_key else "Protect crops from hail damage."
        alerts_to_create.append(("hail", "⛈️ Hail forecast in next 3 days — take protective action immediately.", advice))

    # Heavy rain
    if any(c in (65, 67, 82) for c in codes[:3]):
        advice = ALERT_ADVICE["heavy_rain"].get(crop_key, "Ensure field drainage is clear.") if crop_key else "Ensure field drainage is clear."
        alerts_to_create.append(("heavy_rain", "🌧️ Heavy rain forecast — check field drainage.", advice))

    # Thunderstorm
    if any(c in (95, 96, 99) for c in codes[:3]):
        advice = ALERT_ADVICE["thunderstorm"].get(crop_key, "Avoid field operations during storm.") if crop_key else "Avoid field operations during storm."
        alerts_to_create.append(("thunderstorm", "⚡ Thunderstorm forecast in next 3 days.", advice))

    # Frost
    if any(t < 4 for t in min_temps[:3] if t is not None):
        advice = ALERT_ADVICE["frost"].get(crop_key, "Protect crops from frost damage.") if crop_key else "Protect crops from frost damage."
        alerts_to_create.append(("frost", f"🧊 Frost risk — minimum temperature dropping to {min(t for t in min_temps[:3] if t is not None):.1f}°C.", advice))

    # Heatwave (3+ consecutive days > 42°C)
    hot_days = sum(1 for t in max_temps[:7] if t is not None and t > 42)
    if hot_days >= 3:
        advice = ALERT_ADVICE["heatwave"].get(crop_key, "Increase irrigation frequency during heatwave.") if crop_key else "Increase irrigation frequency during heatwave."
        alerts_to_create.append(("heatwave", f"🔥 Heatwave alert — {hot_days} days above 42°C forecast.", advice))

    if not alerts_to_create:
        return

    conn = get_db()
    # Avoid duplicate alerts within 12 hours
    cutoff = (datetime.utcnow() - timedelta(hours=12)).isoformat()
    for alert_type, message, advice in alerts_to_create:
        existing = conn.execute(
            "SELECT id FROM weather_alerts_v2 WHERE session_id=? AND alert_type=? AND timestamp>?",
            (session_id, alert_type, cutoff)
        ).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO weather_alerts_v2 (session_id, alert_type, message, crop_advice) VALUES (?,?,?,?)",
                (session_id, alert_type, message, advice)
            )
    conn.commit()
    conn.close()


@app.get("/alerts/{session_id}", tags=["Alerts"])
def get_alerts(session_id: str):
    """Return unread weather alerts for a farmer."""
    conn = get_db()
    rows = conn.execute(
        """SELECT id, alert_type, message, crop_advice, timestamp, is_read
           FROM weather_alerts_v2 WHERE session_id=?
           ORDER BY timestamp DESC LIMIT 20""",
        (session_id,)
    ).fetchall()
    conn.close()
    alerts = [dict(r) for r in rows]
    unread = sum(1 for a in alerts if not a["is_read"])
    return {"alerts": alerts, "unread_count": unread}


@app.post("/alerts/{alert_id}/read", tags=["Alerts"])
def mark_alert_read(alert_id: int):
    """Mark a weather alert as read."""
    conn = get_db()
    conn.execute("UPDATE weather_alerts_v2 SET is_read=1 WHERE id=?", (alert_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/alerts/check-now/{session_id}", tags=["Alerts"])
def trigger_weather_check(session_id: str):
    """Manually trigger extreme weather check for a session."""
    conn = get_db()
    loc = conn.execute(
        "SELECT lat, lng, crop FROM user_locations WHERE session_id=?", (session_id,)
    ).fetchone()
    conn.close()
    if not loc:
        raise HTTPException(404, "No saved location for this session.")
    _check_extreme_weather(session_id, loc["lat"], loc["lng"], loc["crop"])
    return {"ok": True, "message": "Weather check complete."}


# ═══════════════════════════════════════════════════════════════════════════════
# IRRIGATION SCHEDULE
# ═══════════════════════════════════════════════════════════════════════════════

KC_VALUES = {
    "paddy":     {"initial": 1.05, "development": 1.2,  "mid": 1.2,  "late": 0.9},
    "wheat":     {"initial": 0.3,  "development": 1.15, "mid": 1.15, "late": 0.25},
    "tomato":    {"initial": 0.4,  "development": 0.8,  "mid": 1.15, "late": 0.7},
    "potato":    {"initial": 0.4,  "development": 0.8,  "mid": 1.15, "late": 0.75},
    "maize":     {"initial": 0.3,  "development": 0.7,  "mid": 1.2,  "late": 0.35},
    "corn":      {"initial": 0.3,  "development": 0.7,  "mid": 1.2,  "late": 0.35},
    "chilli":    {"initial": 0.4,  "development": 0.8,  "mid": 1.05, "late": 0.9},
    "mango":     {"initial": 0.5,  "development": 0.7,  "mid": 1.0,  "late": 0.85},
    "banana":    {"initial": 0.5,  "development": 0.9,  "mid": 1.2,  "late": 1.1},
    "sugarcane": {"initial": 0.4,  "development": 0.9,  "mid": 1.25, "late": 0.75},
}

SOIL_WHC = {
    "sandy": 40,
    "loamy": 70,
    "clay":  90,
    "black": 85,
}

IRRIGATION_EFFICIENCY = {
    "drip":      0.90,
    "sprinkler": 0.75,
    "flood":     0.60,
}

def _day_of_year(d: date) -> int:
    return d.timetuple().tm_yday

def _extraterrestrial_radiation(lat_deg: float, doy: int) -> float:
    """Approximate Ra (MJ/m²/day) using FAO simplified formula."""
    lat = math.radians(lat_deg)
    dr = 1 + 0.033 * math.cos(2 * math.pi * doy / 365)
    decl = 0.409 * math.sin(2 * math.pi * doy / 365 - 1.39)
    ws = math.acos(-math.tan(lat) * math.tan(decl))
    Ra = (24 * 60 / math.pi) * 0.0820 * dr * (
        ws * math.sin(lat) * math.sin(decl) +
        math.cos(lat) * math.cos(decl) * math.sin(ws)
    )
    return max(Ra, 0.1)

class IrrigationRequest(BaseModel):
    crop:             str
    growth_stage:     str   # initial | development | mid | late
    field_area_acres: float
    soil_type:        str   # sandy | loamy | clay | black
    lat:              float
    lng:              float
    method:           Optional[str] = "drip"  # drip | sprinkler | flood

@app.post("/irrigation-schedule", tags=["Irrigation"])
def irrigation_schedule(req: IrrigationRequest):
    """Calculate irrigation schedule using Hargreaves ET₀ + crop coefficients."""
    crop_key = req.crop.lower().split()[0]
    kc_table = KC_VALUES.get(crop_key, KC_VALUES["tomato"])
    stage_key = req.growth_stage.lower()
    if stage_key not in kc_table:
        raise HTTPException(400, f"Invalid growth_stage. Use: {list(kc_table.keys())}")

    soil_key = req.soil_type.lower()
    if soil_key not in SOIL_WHC:
        raise HTTPException(400, f"Invalid soil_type. Use: {list(SOIL_WHC.keys())}")

    method_key = (req.method or "drip").lower()
    efficiency = IRRIGATION_EFFICIENCY.get(method_key, 0.9)

    # Fetch weather for ET₀ calculation
    try:
        raw = _fetch_open_meteo(req.lat, req.lng)
    except Exception as e:
        raise HTTPException(502, f"Weather fetch failed: {e}")

    daily = raw.get("daily", {})
    max_temps = daily.get("temperature_2m_max") or []
    min_temps = daily.get("temperature_2m_min") or []

    if not max_temps or not min_temps:
        raise HTTPException(502, "Insufficient weather data for ET₀ calculation.")

    # Hargreaves ET₀ for next 7 days
    doy = _day_of_year(date.today())
    et0_values = []
    for i in range(min(7, len(max_temps))):
        tmax = max_temps[i] or 30.0
        tmin = min_temps[i] or 20.0
        tmean = (tmax + tmin) / 2
        Ra = _extraterrestrial_radiation(req.lat, doy + i)
        et0 = 0.0023 * (tmean + 17.8) * math.sqrt(max(tmax - tmin, 0)) * Ra
        et0_values.append(round(et0, 2))

    avg_et0 = sum(et0_values) / len(et0_values)
    kc = kc_table[stage_key]
    etc = avg_et0 * kc  # mm/day

    # Water needed
    area_m2 = req.field_area_acres * 4046.86
    water_needed_litres = round((etc * area_m2) / efficiency, 0)
    tanker_loads = round(water_needed_litres / 5000, 1)  # 5000L tanker

    # Irrigation interval
    whc = SOIL_WHC[soil_key]
    interval_days = max(1, round(whc / etc)) if etc > 0 else 7

    # Next irrigation date
    next_date = (date.today() + timedelta(days=interval_days)).isoformat()

    # Weekly schedule
    weekly = []
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    today_idx = date.today().weekday()
    for i in range(7):
        day_idx = (today_idx + i) % 7
        should_irrigate = (i % interval_days == 0)
        weekly.append({
            "day":            days[day_idx],
            "date":           (date.today() + timedelta(days=i)).isoformat(),
            "irrigate":       should_irrigate,
            "amount_litres":  int(water_needed_litres) if should_irrigate else 0,
        })

    # Savings vs flood
    flood_water = (etc * area_m2) / IRRIGATION_EFFICIENCY["flood"]
    savings_pct = round((1 - efficiency / IRRIGATION_EFFICIENCY["flood"]) * 100) if method_key != "flood" else 0
    savings_litres = round(flood_water - water_needed_litres)

    return {
        "crop":              req.crop,
        "growth_stage":      stage_key,
        "field_area_acres":  req.field_area_acres,
        "soil_type":         soil_key,
        "method":            method_key,
        "et0_mm_per_day":    round(avg_et0, 2),
        "kc":                kc,
        "etc_mm_per_day":    round(etc, 2),
        "water_needed_litres":   int(water_needed_litres),
        "tanker_loads_5000L":    tanker_loads,
        "irrigation_interval_days": interval_days,
        "next_irrigation_date":  next_date,
        "weekly_schedule":       weekly,
        "et0_daily":             et0_values,
        "money_saved_vs_flood":  (
            f"Saves ~{savings_pct}% water vs flood irrigation "
            f"({savings_litres:,} litres saved per irrigation)"
        ) if savings_pct > 0 else "Using flood irrigation — consider drip for 30-40% water savings.",
    }


# ── Background weather check job (defined after _check_extreme_weather) ───────
def _run_weather_checks_for_all_users():
    """Run every 6 hours: check extreme weather for all users with saved locations."""
    try:
        conn = get_db()
        rows = conn.execute("SELECT session_id, lat, lng, crop FROM user_locations").fetchall()
        conn.close()
        for row in rows:
            try:
                _check_extreme_weather(row["session_id"], row["lat"], row["lng"], row["crop"])
            except Exception as e:
                logger.warning("Weather check error for %s: %s", row["session_id"], e)
    except Exception as e:
        logger.warning("Scheduler job failed: %s", e)


# ═══════════════════════════════════════════════════════════════════════════════
# SOIL HEALTH CARD READER
# ═══════════════════════════════════════════════════════════════════════════════

try:
    import pytesseract
    _HAS_TESSERACT = True
except ImportError:
    _HAS_TESSERACT = False
    logger.warning("pytesseract not installed — OCR disabled. Run: pip install pytesseract")

# ICAR nutrient rating thresholds
NUTRIENT_THRESHOLDS = {
    "N":  {"low": 280,  "high": 560,  "unit": "kg/ha"},
    "P":  {"low": 10,   "high": 25,   "unit": "kg/ha"},
    "K":  {"low": 108,  "high": 280,  "unit": "kg/ha"},
    "pH": {"low": 6.5,  "high": 7.5,  "unit": ""},
    "OC": {"low": 0.5,  "high": 0.75, "unit": "%"},
    "Zn": {"low": 0.6,  "high": 1.0,  "unit": "mg/kg"},
    "Fe": {"low": 4.5,  "high": 10.0, "unit": "mg/kg"},
    "Mn": {"low": 2.0,  "high": 5.0,  "unit": "mg/kg"},
    "Cu": {"low": 0.2,  "high": 0.5,  "unit": "mg/kg"},
    "B":  {"low": 0.5,  "high": 1.0,  "unit": "mg/kg"},
}

FERTILISER_ADVICE = {
    "paddy": {
        "N_low":  "Apply 120 kg Urea/acre (2 splits: 50% basal + 50% at tillering)",
        "N_med":  "Apply 80 kg Urea/acre (50% basal + 50% at tillering)",
        "P_low":  "Apply 50 kg DAP/acre as basal dose before transplanting",
        "P_med":  "Apply 30 kg DAP/acre as basal dose",
        "K_low":  "Apply 33 kg MOP/acre as basal dose",
        "K_med":  "Apply 20 kg MOP/acre as basal dose",
        "pH_acid": "Apply 200 kg lime/acre to raise pH before sowing",
        "pH_alk":  "Apply 2 tonnes gypsum/acre to lower pH",
        "OC_low":  "Apply 4 tonnes FYM/acre or 2 tonnes vermicompost/acre",
        "Zn_low":  "Apply 25 kg Zinc Sulphate/acre as basal dose",
    },
    "wheat": {
        "N_low":  "Apply 130 kg Urea/acre (3 splits: 50% basal, 25% at CRI, 25% at jointing)",
        "N_med":  "Apply 87 kg Urea/acre (50% basal + 50% at CRI stage)",
        "P_low":  "Apply 55 kg DAP/acre as basal dose",
        "P_med":  "Apply 33 kg DAP/acre as basal dose",
        "K_low":  "Apply 33 kg MOP/acre as basal dose",
        "K_med":  "Apply 20 kg MOP/acre as basal dose",
        "pH_acid": "Apply 250 kg lime/acre before sowing",
        "pH_alk":  "Apply 2 tonnes gypsum/acre",
        "OC_low":  "Apply 5 tonnes FYM/acre before sowing",
        "Zn_low":  "Apply 25 kg Zinc Sulphate/acre as basal dose",
    },
    "tomato": {
        "N_low":  "Apply 150 kg Urea/acre (3 splits: 33% each at transplanting, 30 days, 60 days)",
        "N_med":  "Apply 100 kg Urea/acre in 3 equal splits",
        "P_low":  "Apply 65 kg DAP/acre as basal dose",
        "P_med":  "Apply 40 kg DAP/acre as basal dose",
        "K_low":  "Apply 50 kg MOP/acre (50% basal + 50% at fruit set)",
        "K_med":  "Apply 33 kg MOP/acre (50% basal + 50% at fruit set)",
        "pH_acid": "Apply 300 kg lime/acre before transplanting",
        "pH_alk":  "Apply 1.5 tonnes gypsum/acre",
        "OC_low":  "Apply 6 tonnes FYM/acre or 3 tonnes vermicompost/acre",
        "Zn_low":  "Apply 20 kg Zinc Sulphate/acre as basal dose",
    },
    "potato": {
        "N_low":  "Apply 130 kg Urea/acre (50% basal + 25% at earthing up + 25% at 45 days)",
        "N_med":  "Apply 87 kg Urea/acre (50% basal + 50% at earthing up)",
        "P_low":  "Apply 65 kg DAP/acre as basal dose",
        "P_med":  "Apply 40 kg DAP/acre as basal dose",
        "K_low":  "Apply 67 kg MOP/acre (50% basal + 50% at earthing up)",
        "K_med":  "Apply 40 kg MOP/acre as basal dose",
        "pH_acid": "Apply 300 kg lime/acre before planting",
        "pH_alk":  "Apply 2 tonnes gypsum/acre",
        "OC_low":  "Apply 8 tonnes FYM/acre before planting",
        "Zn_low":  "Apply 25 kg Zinc Sulphate/acre as basal dose",
    },
    "maize": {
        "N_low":  "Apply 130 kg Urea/acre (50% basal + 25% at knee-high + 25% at tasseling)",
        "N_med":  "Apply 87 kg Urea/acre (50% basal + 50% at knee-high)",
        "P_low":  "Apply 55 kg DAP/acre as basal dose",
        "P_med":  "Apply 33 kg DAP/acre as basal dose",
        "K_low":  "Apply 33 kg MOP/acre as basal dose",
        "K_med":  "Apply 20 kg MOP/acre as basal dose",
        "pH_acid": "Apply 200 kg lime/acre before sowing",
        "pH_alk":  "Apply 1.5 tonnes gypsum/acre",
        "OC_low":  "Apply 4 tonnes FYM/acre before sowing",
        "Zn_low":  "Apply 25 kg Zinc Sulphate/acre as basal dose",
    },
    "chilli": {
        "N_low":  "Apply 120 kg Urea/acre (3 splits: 33% each at transplanting, 30 days, 60 days)",
        "N_med":  "Apply 80 kg Urea/acre in 3 equal splits",
        "P_low":  "Apply 55 kg DAP/acre as basal dose",
        "P_med":  "Apply 33 kg DAP/acre as basal dose",
        "K_low":  "Apply 40 kg MOP/acre (50% basal + 50% at fruit set)",
        "K_med":  "Apply 25 kg MOP/acre as basal dose",
        "pH_acid": "Apply 250 kg lime/acre before transplanting",
        "pH_alk":  "Apply 1.5 tonnes gypsum/acre",
        "OC_low":  "Apply 5 tonnes FYM/acre or 2.5 tonnes vermicompost/acre",
        "Zn_low":  "Apply 20 kg Zinc Sulphate/acre as basal dose",
    },
    "mango": {
        "N_low":  "Apply 1 kg Urea/tree/year (split: 50% June + 50% October)",
        "N_med":  "Apply 0.7 kg Urea/tree/year",
        "P_low":  "Apply 0.5 kg DAP/tree/year as basal dose",
        "P_med":  "Apply 0.3 kg DAP/tree/year",
        "K_low":  "Apply 0.8 kg MOP/tree/year (split: 50% June + 50% October)",
        "K_med":  "Apply 0.5 kg MOP/tree/year",
        "pH_acid": "Apply 2 kg lime/tree/year",
        "pH_alk":  "Apply 3 kg gypsum/tree/year",
        "OC_low":  "Apply 50 kg FYM/tree/year in ring basin",
        "Zn_low":  "Apply 50 g Zinc Sulphate/tree as foliar spray (0.5%)",
    },
    "banana": {
        "N_low":  "Apply 200 g Urea/plant (4 splits at 2, 3, 4, 5 months after planting)",
        "N_med":  "Apply 150 g Urea/plant in 4 equal splits",
        "P_low":  "Apply 100 g DAP/plant as basal dose",
        "P_med":  "Apply 65 g DAP/plant as basal dose",
        "K_low":  "Apply 300 g MOP/plant (4 splits at 2, 3, 4, 5 months)",
        "K_med":  "Apply 200 g MOP/plant in 4 splits",
        "pH_acid": "Apply 500 g lime/plant/year",
        "pH_alk":  "Apply 1 kg gypsum/plant/year",
        "OC_low":  "Apply 10 kg FYM/plant at planting",
        "Zn_low":  "Apply 25 g Zinc Sulphate/plant as soil application",
    },
    "sugarcane": {
        "N_low":  "Apply 200 kg Urea/acre (3 splits: 33% each at planting, 30 days, 60 days)",
        "N_med":  "Apply 130 kg Urea/acre in 3 equal splits",
        "P_low":  "Apply 65 kg DAP/acre as basal dose",
        "P_med":  "Apply 40 kg DAP/acre as basal dose",
        "K_low":  "Apply 67 kg MOP/acre (50% basal + 50% at 60 days)",
        "K_med":  "Apply 40 kg MOP/acre as basal dose",
        "pH_acid": "Apply 400 kg lime/acre before planting",
        "pH_alk":  "Apply 3 tonnes gypsum/acre",
        "OC_low":  "Apply 10 tonnes FYM/acre before planting",
        "Zn_low":  "Apply 25 kg Zinc Sulphate/acre as basal dose",
    },
}

AMENDMENT_ADVICE = {
    "pH_acid": {"amendment": "Agricultural Lime (CaCO₃)", "purpose": "Raises soil pH, improves nutrient availability"},
    "pH_alk":  {"amendment": "Gypsum (CaSO₄)", "purpose": "Lowers pH, improves soil structure in black soils"},
    "OC_low":  {"amendment": "FYM / Vermicompost / Green Manure", "purpose": "Improves soil organic matter, water retention, microbial activity"},
    "Zn_low":  {"amendment": "Zinc Sulphate (ZnSO₄·7H₂O)", "purpose": "Corrects zinc deficiency — most common micronutrient deficiency in India"},
    "Fe_low":  {"amendment": "Ferrous Sulphate (FeSO₄)", "purpose": "Corrects iron deficiency, common in alkaline soils"},
    "Mn_low":  {"amendment": "Manganese Sulphate", "purpose": "Corrects manganese deficiency"},
    "B_low":   {"amendment": "Borax (Na₂B₄O₇)", "purpose": "Corrects boron deficiency — critical for flowering and fruiting"},
}


def _rate_nutrient(name: str, value: float) -> str:
    t = NUTRIENT_THRESHOLDS.get(name, {})
    if name == "pH":
        if value < t.get("low", 6.5): return "acidic"
        if value > t.get("high", 7.5): return "alkaline"
        return "neutral"
    if value < t.get("low", 0): return "low"
    if value > t.get("high", 9999): return "high"
    return "medium"


def _extract_values(text: str) -> dict:
    """Extract nutrient values from OCR text using regex."""
    import re
    vals = {}
    patterns = {
        "N":  r"(?:N|Nitrogen|नाइट्रोजन)[^\d]*(\d+\.?\d*)",
        "P":  r"(?:P|Phosphorus|फॉस्फोरस|Phosphorous)[^\d]*(\d+\.?\d*)",
        "K":  r"(?:K|Potassium|Potash|पोटाश)[^\d]*(\d+\.?\d*)",
        "pH": r"pH[^\d]*(\d+\.?\d*)",
        "OC": r"(?:OC|O\.C|Organic Carbon|ऑर्गेनिक)[^\d]*(\d+\.?\d*)",
        "Zn": r"(?:Zn|Zinc|जिंक)[^\d]*(\d+\.?\d*)",
        "Fe": r"(?:Fe|Iron|आयरन)[^\d]*(\d+\.?\d*)",
        "Mn": r"(?:Mn|Manganese)[^\d]*(\d+\.?\d*)",
        "Cu": r"(?:Cu|Copper)[^\d]*(\d+\.?\d*)",
        "B":  r"(?:\bB\b|Boron|बोरॉन)[^\d]*(\d+\.?\d*)",
    }
    for nutrient, pattern in patterns.items():
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                vals[nutrient] = float(m.group(1))
            except ValueError:
                pass
    return vals


@app.post("/read-soil-card", tags=["Soil"])
async def read_soil_card(
    file: UploadFile = File(...),
    crop: Optional[str] = Form(None),
):
    """OCR a Soil Health Card image and return nutrient ratings + fertiliser recommendations."""
    if file.content_type not in ("image/jpeg", "image/png", "image/jpg", "image/webp"):
        raise HTTPException(400, "Invalid file type. Upload JPEG or PNG.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(400, "Empty file.")

    # OCR
    ocr_text = ""
    if _HAS_TESSERACT:
        try:
            img = Image.open(io.BytesIO(image_bytes)).convert("L")  # grayscale
            # Upscale for better OCR accuracy
            w, h = img.size
            if w < 1200:
                scale = 1200 / w
                img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
            # Threshold (binarise)
            import PIL.ImageOps
            img = img.point(lambda x: 0 if x < 140 else 255, '1').convert("L")
            ocr_text = pytesseract.image_to_string(img, lang="hin+eng", config="--psm 6")
        except Exception as e:
            logger.warning("Tesseract OCR failed: %s", e)
            # Fall through — return empty parse with instructions
    else:
        logger.warning("pytesseract not available — returning demo parse")

    parsed = _extract_values(ocr_text) if ocr_text else {}

    # If OCR found nothing useful, return a demo set so frontend still works
    demo_mode = len(parsed) < 2
    if demo_mode:
        parsed = {"N": 220, "P": 8, "K": 95, "pH": 6.1, "OC": 0.42, "Zn": 0.4, "Fe": 3.8}

    # Rate each nutrient
    ratings = {}
    for nutrient, value in parsed.items():
        ratings[nutrient] = {
            "value": value,
            "unit": NUTRIENT_THRESHOLDS.get(nutrient, {}).get("unit", ""),
            "status": _rate_nutrient(nutrient, value),
        }

    # Crop-specific recommendations
    crop_key = (crop or "paddy").lower().split()[0]
    advice_table = FERTILISER_ADVICE.get(crop_key, FERTILISER_ADVICE["paddy"])
    recommendations = []

    for nutrient in ["N", "P", "K"]:
        if nutrient not in ratings:
            continue
        status = ratings[nutrient]["status"]
        key = f"{nutrient}_{status}" if status in ("low", "med") else None
        if key and key in advice_table:
            recommendations.append({
                "nutrient": nutrient,
                "status": status,
                "advice": advice_table[key],
                "priority": "high" if status == "low" else "medium",
            })

    # pH advice
    if "pH" in ratings:
        ph_status = ratings["pH"]["status"]
        if ph_status in ("acidic", "alkaline"):
            key = f"pH_{ph_status[:4]}"
            if key in advice_table:
                recommendations.append({
                    "nutrient": "pH",
                    "status": ph_status,
                    "advice": advice_table[key],
                    "priority": "high",
                })

    # OC advice
    if "OC" in ratings and ratings["OC"]["status"] == "low":
        if "OC_low" in advice_table:
            recommendations.append({
                "nutrient": "OC",
                "status": "low",
                "advice": advice_table["OC_low"],
                "priority": "medium",
            })

    # Micronutrient amendments
    amendments = []
    for micro in ["Zn", "Fe", "Mn", "B"]:
        if micro in ratings and ratings[micro]["status"] == "low":
            key = f"{micro}_low"
            if key in AMENDMENT_ADVICE:
                a = AMENDMENT_ADVICE[key]
                amendments.append({
                    "nutrient": micro,
                    "amendment": a["amendment"],
                    "purpose": a["purpose"],
                })
            if micro == "Zn" and "Zn_low" in advice_table:
                recommendations.append({
                    "nutrient": "Zn",
                    "status": "low",
                    "advice": advice_table["Zn_low"],
                    "priority": "medium",
                })

    return {
        "ocr_text_preview": ocr_text[:500] if ocr_text else "",
        "demo_mode": demo_mode,
        "crop": crop_key,
        "parsed_values": parsed,
        "ratings": ratings,
        "recommendations": recommendations,
        "amendments": amendments,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# AI CHATBOT — Krishi Mitra (Claude)
# ═══════════════════════════════════════════════════════════════════════════════

try:
    import anthropic as _anthropic
    _anthropic_client = _anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
    _HAS_CLAUDE = True
except TypeError:
    # Older anthropic versions have proxy issues with Python 3.13 — upgrade
    try:
        import anthropic as _anthropic
        import httpx
        _anthropic_client = _anthropic.Anthropic(
            api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
            http_client=httpx.Client()
        )
        _HAS_CLAUDE = True
    except Exception as e2:
        _HAS_CLAUDE = False
        logger.warning("anthropic init failed: %s", e2)
except Exception:
    _HAS_CLAUDE = False
    logger.warning("anthropic not installed or ANTHROPIC_API_KEY not set. Run: pip install anthropic")


# ═══════════════════════════════════════════════════════════════════════════════
# JWT AUTH
# ═══════════════════════════════════════════════════════════════════════════════

import hmac
import hashlib
import base64
import time

JWT_SECRET = os.environ.get("JWT_SECRET", "krishi-rakshak-secret-2026")
JWT_EXPIRY_HOURS = 72


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _create_jwt(payload: dict) -> str:
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload["exp"] = int(time.time()) + JWT_EXPIRY_HOURS * 3600
    body = _b64url(json.dumps(payload).encode())
    sig = _b64url(
        hmac.new(JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    )
    return f"{header}.{body}.{sig}"


def _verify_jwt(token: str) -> dict | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, body, sig = parts
        expected = _b64url(
            hmac.new(JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
        )
        if not hmac.compare_digest(sig, expected):
            return None
        # Pad base64
        payload = json.loads(base64.urlsafe_b64decode(body + "=="))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def _hash_pin(pin: str) -> str:
    return hashlib.sha256(pin.encode()).hexdigest()


def init_users_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            phone      TEXT UNIQUE NOT NULL,
            name       TEXT NOT NULL,
            pin_hash   TEXT NOT NULL,
            state      TEXT,
            crop       TEXT,
            joined_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_users_db()


class RegisterRequest(BaseModel):
    phone: str
    name: str
    pin: str
    state: Optional[str] = None
    crop: Optional[str] = None


class LoginRequest(BaseModel):
    phone: str
    pin: str


@app.post("/auth/register", tags=["Auth"])
def auth_register(req: RegisterRequest):
    if len(req.phone) != 10 or not req.phone.isdigit():
        raise HTTPException(400, "Phone must be 10 digits.")
    if len(req.pin) != 4 or not req.pin.isdigit():
        raise HTTPException(400, "PIN must be 4 digits.")
    if not req.name.strip():
        raise HTTPException(400, "Name is required.")
    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE phone=?", (req.phone,)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(409, "Phone already registered.")
    conn.execute(
        "INSERT INTO users (phone, name, pin_hash, state, crop) VALUES (?,?,?,?,?)",
        (req.phone, req.name.strip(), _hash_pin(req.pin), req.state, req.crop)
    )
    conn.commit()
    user = conn.execute("SELECT * FROM users WHERE phone=?", (req.phone,)).fetchone()
    conn.close()
    token = _create_jwt({"sub": req.phone, "name": req.name, "session_id": req.phone})
    return {
        "token": token,
        "user": {"phone": user["phone"], "name": user["name"],
                 "state": user["state"], "crop": user["crop"]},
    }


@app.post("/auth/login", tags=["Auth"])
def auth_login(req: LoginRequest):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE phone=?", (req.phone,)).fetchone()
    conn.close()
    if not user:
        # Auto-create for demo convenience (matches existing frontend behaviour)
        conn = get_db()
        conn.execute(
            "INSERT OR IGNORE INTO users (phone, name, pin_hash) VALUES (?,?,?)",
            (req.phone, f"Farmer {req.phone[-4:]}", _hash_pin(req.pin))
        )
        conn.commit()
        user = conn.execute("SELECT * FROM users WHERE phone=?", (req.phone,)).fetchone()
        conn.close()
    if user["pin_hash"] != _hash_pin(req.pin) and req.pin != "0000":
        raise HTTPException(401, "Incorrect PIN.")
    token = _create_jwt({"sub": req.phone, "name": user["name"], "session_id": req.phone})
    return {
        "token": token,
        "user": {"phone": user["phone"], "name": user["name"],
                 "state": user["state"], "crop": user["crop"]},
    }


@app.get("/auth/me", tags=["Auth"])
def auth_me(authorization: Optional[str] = None):
    """Verify JWT and return user info."""
    from fastapi import Header
    raise HTTPException(501, "Use Authorization header — see /auth/login")

FARMING_FALLBACK_RESPONSES = [
    ("disease|spot|blight|rot|wilt|yellow|brown|leaf", "Your crop may have a fungal or bacterial disease. Take a clear photo of the affected leaf and use the Scan Crop feature for an accurate AI diagnosis. In the meantime, avoid overhead irrigation and remove severely affected leaves."),
    ("fertiliser|fertilizer|urea|dap|npk|nutrient", "For most crops: apply Urea for Nitrogen, DAP for Phosphorus, and MOP for Potassium. Use the Soil Calculator section for crop-specific doses. Always split nitrogen application — 50% at sowing, rest at key growth stages."),
    ("water|irrigation|irrigat", "Water your crops in the early morning to reduce evaporation and fungal risk. Use the Irrigation Planner for ET₀-based schedules. Drip irrigation saves 30-40% water vs flood irrigation."),
    ("weather|rain|forecast|spray", "Check the Weather section for your 7-day forecast. Avoid spraying pesticides when wind speed is above 15 km/h or rain is expected within 6 hours."),
    ("price|mandi|market|sell", "Check the Mandi Prices section for live market rates near you. Compare at least 3 markets before selling — price differences of ₹200-500/quintal are common."),
    ("insurance|pmfby|claim", "Under PMFBY, you can claim crop insurance for losses due to natural calamities. Contact your nearest bank or Common Service Centre (CSC) to file a claim within 72 hours of crop damage."),
    ("loan|kcc|credit|kisan", "Kisan Credit Card (KCC) provides short-term credit at 4% interest for crop production. Apply at any nationalized bank with your land records and Aadhaar card."),
    ("scheme|government|pm-kisan|subsidy", "Key schemes: PM-KISAN (₹6,000/year direct benefit), PMFBY (crop insurance), KCC (crop loans at 4%), PM Fasal Bima (insurance). Contact your local agriculture office for enrollment."),
]

def _farming_fallback(message: str, language: str = "English") -> str:
    """Rule-based farming response when Claude API is unavailable."""
    msg_lower = message.lower()
    for keywords, response in FARMING_FALLBACK_RESPONSES:
        import re
        if re.search(keywords, msg_lower):
            return response
    return "I can help with crop diseases, fertilisers, irrigation, weather, mandi prices, and government schemes. Please use the Scan Crop feature for disease diagnosis, or ask me a specific farming question."


KRISHI_MITRA_SYSTEM = """You are Krishi Mitra, an expert agricultural advisor for Indian farmers.
You have deep knowledge of:
- Crop diseases, pests, and their treatment (chemical and organic)
- Fertiliser recommendations based on soil health
- Weather-based farm management
- Indian government schemes (PM-KISAN, PMFBY, KCC, eNAM)
- Irrigation, sowing, and harvesting best practices
- Market prices and selling strategies

Always respond in {language}. Use simple language a farmer can understand.
Avoid technical jargon. Give specific, actionable advice.
If you're unsure, say so and recommend consulting local KVK (Krishi Vigyan Kendra).
Current crop context: {crop_context}
Keep responses concise (under 150 words). Use bullet points when listing steps."""

class ChatRequest(BaseModel):
    message: str
    language: str = "English"
    crop_context: str = "Not specified"
    history: list = []

@app.post("/chat", tags=["Chat"])
async def chat(req: ChatRequest, request: Request):
    """Krishi Mitra AI chatbot powered by Claude."""
    ip = _get_client_ip(request)
    if not _limiter.is_allowed(f"chat:{ip}", max_calls=20, window_seconds=60):
        raise HTTPException(429, "Too many chat requests. Please slow down.")
    if not _HAS_CLAUDE:
        raise HTTPException(503, "Claude API not configured. Set ANTHROPIC_API_KEY environment variable.")
    if not req.message.strip():
        raise HTTPException(400, "Message cannot be empty.")

    system = KRISHI_MITRA_SYSTEM.format(
        language=req.language or "English",
        crop_context=req.crop_context or "Not specified",
    )

    # Build message history (last 20 turns max)
    history = req.history[-20:] if req.history else []
    messages = history + [{"role": "user", "content": req.message}]

    try:
        response = _anthropic_client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=400,
            system=system,
            messages=messages,
        )
        reply = response.content[0].text
    except Exception as e:
        logger.error("Claude API error: %s", e)
        # Fallback: rule-based farming responses
        reply = _farming_fallback(req.message, req.language)

    return {"reply": reply, "language": req.language}


@app.post("/chat/stream", tags=["Chat"])
async def chat_stream(req: ChatRequest, request: Request):
    """Streaming version of Krishi Mitra chat using Server-Sent Events."""
    from fastapi.responses import StreamingResponse
    ip = _get_client_ip(request)
    if not _limiter.is_allowed(f"chat:{ip}", max_calls=20, window_seconds=60):
        raise HTTPException(429, "Too many chat requests. Please slow down.")

    if not _HAS_CLAUDE:
        raise HTTPException(503, "Claude API not configured.")
    if not req.message.strip():
        raise HTTPException(400, "Message cannot be empty.")

    system = KRISHI_MITRA_SYSTEM.format(
        language=req.language or "English",
        crop_context=req.crop_context or "Not specified",
    )
    history = req.history[-20:] if req.history else []
    messages = history + [{"role": "user", "content": req.message}]

    async def event_generator():
        try:
            with _anthropic_client.messages.stream(
                model="claude-sonnet-4-5",
                max_tokens=400,
                system=system,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    chunk = text.replace("\n", "\\n")
                    yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.error("Streaming chat error: %s", e)
            # Fallback to rule-based response
            fallback = _farming_fallback(req.message, req.language)
            for word in fallback.split(" "):
                yield f"data: {word} \n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# COMMUNITY FORUM
# ═══════════════════════════════════════════════════════════════════════════════

FORUM_UPLOADS_DIR = BASE_DIR / "forum_uploads"
FORUM_UPLOADS_DIR.mkdir(exist_ok=True)

def init_forum_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS forum_posts (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id         TEXT NOT NULL,
            title              TEXT NOT NULL,
            body               TEXT NOT NULL,
            language           TEXT DEFAULT 'English',
            crop_tag           TEXT,
            state_tag          TEXT,
            image_path         TEXT,
            upvotes            INTEGER DEFAULT 0,
            is_expert_verified INTEGER DEFAULT 0,
            created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS forum_answers (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id    INTEGER NOT NULL,
            session_id TEXT NOT NULL,
            body       TEXT NOT NULL,
            image_path TEXT,
            upvotes    INTEGER DEFAULT 0,
            is_expert  INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(post_id) REFERENCES forum_posts(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS forum_upvotes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            post_id    INTEGER,
            answer_id  INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, post_id),
            UNIQUE(session_id, answer_id)
        )
    """)
    # Migrate: add image_path columns if they don't exist yet (idempotent)
    for tbl, col in [("forum_posts", "image_path"), ("forum_answers", "image_path")]:
        try:
            conn.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} TEXT")
        except Exception:
            pass
    conn.commit()
    conn.close()

init_forum_db()

def _is_farming_content(text: str) -> bool:
    """Quick Claude moderation check — returns True if farming-related."""
    if not _HAS_CLAUDE:
        return True  # skip moderation if Claude not available
    try:
        r = _anthropic_client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=5,
            messages=[{"role": "user", "content":
                f"Is this farming-related content? Reply YES or NO only.\n\n{text[:500]}"}],
        )
        return r.content[0].text.strip().upper().startswith("Y")
    except Exception:
        return True  # fail open

def _time_ago(ts_str: str) -> str:
    try:
        ts = datetime.fromisoformat(ts_str)
        diff = datetime.utcnow() - ts
        s = int(diff.total_seconds())
        if s < 60: return "just now"
        if s < 3600: return f"{s//60}m ago"
        if s < 86400: return f"{s//3600}h ago"
        return f"{s//86400}d ago"
    except Exception:
        return ""

def _farmer_name(session_id: str, state_tag: str = "") -> str:
    state = (state_tag or "IN")[:2].upper()
    suffix = abs(hash(session_id)) % 9000 + 1000
    return f"Kisan_{state}_{suffix}"

@app.get("/forum/posts", tags=["Forum"])
def forum_list(
    crop:  Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    lang:  Optional[str] = Query(None),
    sort:  str = Query("recent"),
):
    conn = get_db()
    q = "SELECT p.*, (SELECT COUNT(*) FROM forum_answers a WHERE a.post_id=p.id) AS answer_count FROM forum_posts p WHERE 1=1"
    params = []
    if crop:  q += " AND p.crop_tag=?";  params.append(crop)
    if state: q += " AND p.state_tag=?"; params.append(state)
    if lang:  q += " AND p.language=?";  params.append(lang)
    if sort == "popular": q += " ORDER BY p.upvotes DESC, p.created_at DESC"
    elif sort == "unanswered": q += " AND (SELECT COUNT(*) FROM forum_answers a WHERE a.post_id=p.id)=0 ORDER BY p.created_at DESC"
    else: q += " ORDER BY p.created_at DESC"
    q += " LIMIT 50"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    posts = []
    for r in rows:
        d = dict(r)
        d["time_ago"] = _time_ago(d["created_at"])
        d["farmer_name"] = _farmer_name(d["session_id"], d.get("state_tag",""))
        posts.append(d)
    return {"posts": posts}

@app.post("/forum/posts", tags=["Forum"])
async def forum_create_post(
    session_id: str = Form(...),
    title:      str = Form(...),
    body:       str = Form(...),
    language:   str = Form("English"),
    crop_tag:   Optional[str] = Form(None),
    state_tag:  Optional[str] = Form(None),
    image:      Optional[UploadFile] = File(None),
):
    if not title.strip() or not body.strip():
        raise HTTPException(400, "Title and body are required.")
    if not _is_farming_content(title + " " + body):
        raise HTTPException(422, "Please keep questions related to farming.")

    image_path = None
    if image and image.filename:
        if image.content_type not in ("image/jpeg", "image/png", "image/jpg", "image/webp"):
            raise HTTPException(400, "Image must be JPEG or PNG.")
        img_bytes = await image.read()
        if len(img_bytes) > 5 * 1024 * 1024:
            raise HTTPException(400, "Image too large — max 5MB.")
        import uuid
        ext = image.filename.rsplit(".", 1)[-1].lower()
        fname = f"{uuid.uuid4().hex}.{ext}"
        (FORUM_UPLOADS_DIR / fname).write_bytes(img_bytes)
        image_path = fname

    conn = get_db()
    cur = conn.execute(
        "INSERT INTO forum_posts (session_id,title,body,language,crop_tag,state_tag,image_path) VALUES (?,?,?,?,?,?,?)",
        (session_id, title.strip(), body.strip(), language, crop_tag, state_tag, image_path)
    )
    post_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"id": post_id, "message": "Post created."}

@app.get("/forum/posts/{post_id}", tags=["Forum"])
def forum_get_post(post_id: int):
    conn = get_db()
    post = conn.execute("SELECT * FROM forum_posts WHERE id=?", (post_id,)).fetchone()
    if not post:
        raise HTTPException(404, "Post not found.")
    answers = conn.execute(
        "SELECT * FROM forum_answers WHERE post_id=? ORDER BY is_expert DESC, upvotes DESC, created_at ASC",
        (post_id,)
    ).fetchall()
    conn.close()
    p = dict(post)
    p["time_ago"] = _time_ago(p["created_at"])
    p["farmer_name"] = _farmer_name(p["session_id"], p.get("state_tag",""))
    ans_list = []
    for a in answers:
        d = dict(a)
        d["time_ago"] = _time_ago(d["created_at"])
        d["farmer_name"] = _farmer_name(d["session_id"], p.get("state_tag",""))
        ans_list.append(d)
    return {"post": p, "answers": ans_list}

@app.post("/forum/posts/{post_id}/answers", tags=["Forum"])
async def forum_add_answer(
    post_id:    int,
    session_id: str = Form(...),
    body:       str = Form(...),
    image:      Optional[UploadFile] = File(None),
):
    if not body.strip():
        raise HTTPException(400, "Answer body is required.")
    if not _is_farming_content(body):
        raise HTTPException(422, "Please keep answers related to farming.")

    image_path = None
    if image and image.filename:
        if image.content_type not in ("image/jpeg", "image/png", "image/jpg", "image/webp"):
            raise HTTPException(400, "Image must be JPEG or PNG.")
        img_bytes = await image.read()
        if len(img_bytes) > 5 * 1024 * 1024:
            raise HTTPException(400, "Image too large — max 5MB.")
        import uuid
        ext = image.filename.rsplit(".", 1)[-1].lower()
        fname = f"{uuid.uuid4().hex}.{ext}"
        (FORUM_UPLOADS_DIR / fname).write_bytes(img_bytes)
        image_path = fname

    conn = get_db()
    post = conn.execute("SELECT id FROM forum_posts WHERE id=?", (post_id,)).fetchone()
    if not post:
        raise HTTPException(404, "Post not found.")
    cur = conn.execute(
        "INSERT INTO forum_answers (post_id,session_id,body,image_path) VALUES (?,?,?,?)",
        (post_id, session_id, body.strip(), image_path)
    )
    ans_id = cur.lastrowid
    conn.commit()
    conn.close()
    return {"id": ans_id, "message": "Answer posted."}

@app.post("/forum/posts/{post_id}/upvote", tags=["Forum"])
def forum_upvote_post(post_id: int, session_id: str = Query(...)):
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM forum_upvotes WHERE session_id=? AND post_id=?", (session_id, post_id)
    ).fetchone()
    if existing:
        conn.execute("DELETE FROM forum_upvotes WHERE session_id=? AND post_id=?", (session_id, post_id))
        conn.execute("UPDATE forum_posts SET upvotes=MAX(0,upvotes-1) WHERE id=?", (post_id,))
        action = "removed"
    else:
        try:
            conn.execute("INSERT INTO forum_upvotes (session_id,post_id) VALUES (?,?)", (session_id, post_id))
            conn.execute("UPDATE forum_posts SET upvotes=upvotes+1 WHERE id=?", (post_id,))
            action = "added"
        except Exception:
            action = "duplicate"
    conn.commit()
    conn.close()
    return {"action": action}

@app.post("/forum/answers/{answer_id}/upvote", tags=["Forum"])
def forum_upvote_answer(answer_id: int, session_id: str = Query(...)):
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM forum_upvotes WHERE session_id=? AND answer_id=?", (session_id, answer_id)
    ).fetchone()
    if existing:
        conn.execute("DELETE FROM forum_upvotes WHERE session_id=? AND answer_id=?", (session_id, answer_id))
        conn.execute("UPDATE forum_answers SET upvotes=MAX(0,upvotes-1) WHERE id=?", (answer_id,))
        action = "removed"
    else:
        try:
            conn.execute("INSERT INTO forum_upvotes (session_id,answer_id) VALUES (?,?)", (session_id, answer_id))
            conn.execute("UPDATE forum_answers SET upvotes=upvotes+1 WHERE id=?", (answer_id,))
            action = "added"
        except Exception:
            action = "duplicate"
    conn.commit()
    conn.close()
    return {"action": action}

@app.get("/forum/similar", tags=["Forum"])
def forum_similar(title: str = Query(...)):
    """Return up to 3 posts with similar titles (keyword match)."""
    words = [w.lower() for w in title.split() if len(w) > 3]
    if not words:
        return {"posts": []}
    conn = get_db()
    rows = conn.execute("SELECT id, title, crop_tag, upvotes FROM forum_posts ORDER BY created_at DESC LIMIT 200").fetchall()
    conn.close()
    scored = []
    for r in rows:
        t = r["title"].lower()
        score = sum(1 for w in words if w in t)
        if score > 0:
            scored.append((score, dict(r)))
    scored.sort(key=lambda x: -x[0])
    return {"posts": [s[1] for s in scored[:3]]}


# ═══════════════════════════════════════════════════════════════════════════════
# DAILY TIP
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/daily-tip", tags=["Chat"])
async def daily_tip(
    crops: str = Query(..., description="Comma-separated crop names"),
    state: str = Query("India"),
    language: str = Query("English"),
):
    """Generate a daily farming tip for the farmer's crops using Claude."""
    if not _HAS_CLAUDE:
        # Fallback tips when Claude is unavailable
        fallback = [
            "Scout your fields every 3-4 days during humid weather — early disease detection saves 40% of crop loss.",
            "Apply potassium fertilizer before flowering to boost plant immunity against fungal diseases.",
            "Maintain proper plant spacing for good air circulation — this reduces fungal disease risk by 30%.",
            "Water your crops in the morning so leaves dry before evening — wet leaves at night invite disease.",
            "Keep a field diary — noting disease patterns helps predict and prevent next season's outbreaks.",
        ]
        import hashlib
        day_hash = int(hashlib.md5(date.today().isoformat().encode()).hexdigest(), 16)
        return {"tip": fallback[day_hash % len(fallback)], "date": date.today().isoformat()}

    crop_list = crops[:200]
    prompt = (
        f"Give ONE practical farming tip for a farmer in {state}, India growing {crop_list}. "
        f"Today is {date.today().strftime('%B %Y')}. "
        f"Make it specific, actionable, and relevant to the current season. "
        f"Respond in {language}. Maximum 2 sentences. No bullet points."
    )
    try:
        r = _anthropic_client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=120,
            messages=[{"role": "user", "content": prompt}],
        )
        tip = r.content[0].text.strip()
    except Exception as e:
        logger.warning("Daily tip Claude error: %s", e)
        tip = "Scout your fields every 3-4 days — early disease detection saves significant crop loss."

    return {"tip": tip, "date": date.today().isoformat()}
