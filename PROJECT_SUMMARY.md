# Krishi Rakshak — Project Summary

> AI-powered crop disease intelligence platform for Indian farmers.
> MobileNetV2 · FastAPI · SQLite · Claude AI · Flutter · PWA

---

## Overview

Krishi Rakshak ("Crop Protector") is a full-stack web + mobile application that helps Indian farmers diagnose crop diseases from leaf photos using a fine-tuned MobileNetV2 deep learning model. Beyond disease detection, it provides a complete farming toolkit — weather forecasts, live mandi prices, irrigation planning, crop insurance guidance, a community forum, and a multilingual AI advisor.

The platform is designed for low-bandwidth rural environments, ships as a Progressive Web App (PWA), and has a companion Flutter mobile app.

---

## Project Structure

```
Krishi_Rakshak/
├── backend/
│   ├── main.py              # FastAPI application (all API routes)
│   ├── remedies.py          # Disease treatment database (54 diseases)
│   ├── requirements.txt     # Python dependencies
│   └── requirements-dev.txt
├── frontend/
│   ├── index.html           # Public landing page
│   ├── login.html           # Farmer login / register
│   ├── home.html            # Post-login SPA dashboard (scan, weather, market, AI chat, tools)
│   ├── detect.html          # Disease detection (single + batch)
│   ├── weather.html         # Hyper-local weather forecast
│   ├── market.html          # Live mandi prices + trend chart
│   ├── soil.html            # Soil / fertiliser calculator
│   ├── irrigation.html      # Irrigation schedule planner
│   ├── insurance.html       # PMFBY insurance assistant
│   ├── loans.html           # Kisan credit / loan guide
│   ├── finance.html         # Farm finance overview
│   ├── tracker.html         # Disease history tracker
│   ├── calendar.html        # Crop growth stage calendar
│   ├── map.html             # Disease outbreak heatmap
│   ├── forum.html           # Community Q&A forum
│   ├── chat.html            # Full-page Krishi Mitra AI chat
│   ├── dashboard.html       # Sidebar dashboard layout
│   ├── app.js               # Landing page logic (Three.js, upload, results)
│   ├── home-app.js          # SPA dashboard logic (scan, weather, market, chat, tools)
│   ├── detect.js            # Detect page logic (single + batch)
│   ├── soil.js              # Soil calculator logic
│   ├── finance.js           # Finance page logic
│   ├── bg.js                # Three.js animated background
│   ├── intelligence.js      # AI intelligence helpers
│   ├── onboarding.js        # Farmer onboarding wizard
│   ├── router.js            # Client-side routing
│   ├── nav.js               # Shared nav injector + cursor + chatbot loader
│   ├── chat-bubble.js       # Sidebar AI chat widget (login-gated)
│   ├── config.js            # API base URL config
│   ├── style.css            # Landing page styles
│   ├── nav.css              # Shared nav + cursor styles (all pages)
│   ├── dashboard.css        # Dashboard / auth page styles
│   ├── sw.js                # Service worker (PWA offline)
│   ├── manifest.json        # PWA manifest
│   ├── disease-translations.json
│   └── static/
│       ├── labels.json
│       └── tfjs_model/      # TensorFlow.js model for client-side inference
├── mobile/
│   └── krishi_rakshak_app/  # Flutter mobile app
│       └── lib/
│           ├── main.dart
│           ├── screens/
│           │   ├── home_screen.dart
│           │   └── result_screen.dart
│           └── services/
│               └── api_service.dart
├── forum_uploads/           # Uploaded forum images (runtime, git-ignored)
├── tests/
│   └── test_api.py          # API smoke tests (pytest)
├── best_model.keras         # Trained MobileNetV2 model
├── class_names.json         # 54 class labels
├── krishi_history.db        # SQLite database (runtime, git-ignored)
├── Dockerfile
├── docker-compose.yml
└── .env                     # API keys (git-ignored)
```

---

## ML Model

| Property | Value |
|---|---|
| Architecture | MobileNetV2 (transfer learning from ImageNet) |
| Input size | 224 × 224 RGB |
| Output | 54-class softmax |
| Preprocessing | `mobilenet_v2.preprocess_input` (scale to [-1, 1]) |
| Top-K | Returns top-3 predictions with confidence |
| Confidence threshold | < 0.40 → "Unrecognised" response |
| Model file | `best_model.keras` |

### Supported Crops & Disease Classes (54 total)

| Crop | Classes |
|---|---|
| Banana | Cordana Leaf Spot, Pestalotiopsis, Sigatoka, Healthy |
| Chilli | Whitefly, Yellowing, Anthracnose, Damping Off, Leaf Curl Virus, Leaf Spot, Veinal Mottle Virus, Healthy |
| Corn / Maize | Gray Leaf Spot, Common Rust, Northern Leaf Blight, Healthy |
| Mango | Anthracnose, Bacterial Canker, Cutting Weevil, Die Back, Gall Midge, Powdery Mildew, Sooty Mould, Healthy |
| Paddy / Rice | Dead Heart, Bacterial Leaf Blight, Bacterial Leaf Streak, Bacterial Panicle Blight, Blast, Brown Spot, Downy Mildew, Hispa, Tungro, Healthy |
| Potato | Early Blight, Late Blight, Healthy |
| Sugarcane | Red Rot, Woolly Aphid, Healthy |
| Tomato | Bacterial Spot, Early Blight, Late Blight, Leaf Mold, Septoria Leaf Spot, Spider Mites, Target Spot, TYLCV, Mosaic Virus, Healthy |
| Wheat | Brown Rust, Yellow Rust, Healthy |

### Severity Grading

- **Remedy severity** (from `remedies.py`): `none` · `medium` · `high` · `critical`
- **Confidence severity** (from model confidence): `healthy` · `early` (< 0.50) · `moderate` (0.50–0.75) · `severe` (> 0.75)

---

## Backend — FastAPI

**File:** `backend/main.py`
**Runtime:** Python 3.11, Uvicorn, TensorFlow ≥ 2.15
**Database:** SQLite (`krishi_history.db`)
**Port:** 8000

### API Endpoints

#### Health
| Method | Path | Description |
|---|---|---|
| GET | `/` | Service info |
| GET | `/health` | Health check + model status |
| GET | `/classes` | List all 54 class names |

#### Prediction
| Method | Path | Description |
|---|---|---|
| POST | `/predict` | Single image → disease diagnosis + treatment |
| POST | `/batch-predict` | Up to 10 images → per-image results + field summary |

#### History
| Method | Path | Description |
|---|---|---|
| GET | `/history/{session_id}` | All diagnoses grouped by plant, with trend |
| DELETE | `/history/{session_id}` | Delete all history for a session |

#### Outbreak Map
| Method | Path | Description |
|---|---|---|
| GET | `/outbreak-map` | Aggregated disease clusters (privacy-safe, rounded to 2dp) |
| GET | `/my-area-alerts` | Active disease alerts within radius_km of a location |

#### Market Prices
| Method | Path | Description |
|---|---|---|
| GET | `/mandi-prices` | Live mandi prices via data.gov.in API (1-hour cache) |

#### Weather
| Method | Path | Description |
|---|---|---|
| GET | `/weather` | Current conditions + 7-day forecast + farmer alerts |
| GET | `/alerts/{session_id}` | Unread weather alerts for a farmer |
| POST | `/alerts/{alert_id}/read` | Mark alert as read |
| POST | `/alerts/check-now/{session_id}` | Manually trigger weather check |

#### Irrigation
| Method | Path | Description |
|---|---|---|
| POST | `/irrigation-schedule` | ET₀-based irrigation schedule (Hargreaves method) |

#### Soil
| Method | Path | Description |
|---|---|---|
| POST | `/read-soil-card` | OCR a soil health card image (pytesseract) |

#### Chat / AI
| Method | Path | Description |
|---|---|---|
| POST | `/chat` | Krishi Mitra AI chatbot (Claude claude-3-5-haiku) |
| GET | `/daily-tip` | AI-generated daily farming tip |
| POST | `/text-to-speech` | Convert text to MP3 via gTTS |

#### Forum
| Method | Path | Description |
|---|---|---|
| GET | `/forum/posts` | List posts (filterable by crop) |
| POST | `/forum/posts` | Create a new post (with optional image upload) |
| GET | `/forum/posts/{post_id}` | Get post + answers |
| POST | `/forum/posts/{post_id}/answers` | Add an answer |
| POST | `/forum/posts/{post_id}/upvote` | Toggle upvote on post |
| POST | `/forum/answers/{answer_id}/upvote` | Toggle upvote on answer |
| GET | `/forum/similar` | Find similar posts by keyword |

### Database Schema (SQLite)

```sql
diagnosis_history   -- scan records per session
  id, session_id, plant_label, disease, confidence,
  severity, treatment, timestamp, lat, lng, crop

weather_alerts      -- push-style weather notifications
  id, session_id, alert_type, message, crop_advice,
  timestamp, is_read

price_history       -- 7-day mandi price trend
  id, crop, market, state, district, modal_price,
  min_price, max_price, price_date, fetched_at

forum_posts         -- community Q&A
forum_answers
forum_upvotes
```

### Key Dependencies

```
fastapi==0.115.6
uvicorn[standard]==0.32.1
tensorflow>=2.15.0,<2.20.0
pillow==11.1.0
numpy==2.1.3
anthropic>=0.25.0      # Claude AI
gtts>=2.5.0            # Text-to-speech
apscheduler>=3.10.0    # Background weather checks
pytesseract>=0.3.10    # Soil card OCR
```

---

## Frontend

**Tech:** Vanilla HTML/CSS/JS — no framework, no build step
**Fonts:** Syne (headings) · DM Sans (body) · JetBrains Mono (code/data)
**3D:** Three.js (landing page background via `bg.js`)
**Charts:** Chart.js (mandi price trends)

### Page Architecture

| Page | Auth Required | Description |
|---|---|---|
| `index.html` | No | Public landing — hero, features, crops showcase |
| `login.html` | No | Farmer login / register |
| `home.html` | Yes | SPA dashboard — Scan, Weather, Market, AI Chat, Irrigation, Soil, Calendar, History |
| `detect.html` | Yes | Single image + batch (up to 10) disease detection |
| `weather.html` | Yes | Hyper-local weather with Nominatim geocoding |
| `market.html` | Yes | Mandi prices, 7-day chart, transport cost estimator |
| `soil.html` | Yes | Fertiliser dose calculator |
| `irrigation.html` | Yes | ET₀-based irrigation schedule |
| `insurance.html` | Yes | PMFBY 5-step wizard |
| `loans.html` | Yes | KCC loan guide |
| `finance.html` | Yes | Farm finance overview |
| `tracker.html` | Yes | Disease history per plant with trend |
| `calendar.html` | Yes | Crop growth stage calendar |
| `map.html` | Yes | Disease outbreak heatmap (Leaflet.js) |
| `forum.html` | Yes | Community Q&A |
| `chat.html` | Yes | Full-page Krishi Mitra AI chat |
| `dashboard.html` | Yes | Sidebar dashboard layout |

### home.html — SPA Dashboard

`home.html` is a single-page app powered by `home-app.js`. It contains all core tools in one file with a sidebar nav and no page reloads:

- 🔬 Scan Crop — drop zone, camera, AI diagnosis, result card with tabs
- 🌦️ Weather — location search + GPS, 7-day forecast
- 💰 Mandi Prices — crop + state selector, live prices
- 🤖 Krishi Mitra AI — inline multilingual chat
- 💧 Irrigation Planner — ET₀ calculator
- 🌱 Soil Calculator — quick fertiliser guide
- 📅 Crop Calendar
- 📊 Scan History

### Shared Infrastructure (`nav.js` + `nav.css`)

Injected on every authenticated page:
- Top navigation bar (13 links)
- Bottom navigation for mobile (5 items)
- Custom cursor — green dot + ring with smooth lerp tracking
- Noise overlay — subtle grain texture
- Chatbot bubble — right-edge sidebar tab, only loads when `kr_session` exists

### CSS Architecture

| File | Purpose |
|---|---|
| `style.css` | Landing page + detect page design system |
| `nav.css` | Shared nav, cursor, cards, forms, buttons |
| `dashboard.css` | Auth layout, sidebar, scan results |

### PWA

- `manifest.json` — installable, theme color `#22c55e`
- `sw.js` — service worker for offline support
- `frontend/static/tfjs_model/` — TensorFlow.js model for fully client-side inference (no backend needed)

### Local Storage Keys

| Key | Contents |
|---|---|
| `kr_session` | `{ token, phone, name, crop }` — farmer session |
| `kr_farmer_profile` | Onboarding data (crops, state, lat/lng, language) |
| `kr_chat_history` | Last 20 chat messages |
| `kr_chat_lang` | Selected chat language |
| `kr_last_diagnosis` | Most recent scan result |
| `kr_cal_crops` | Crop calendar entries |
| `kr_daily_tip` | Cached daily tip |

---

## Mobile App (Flutter)

**Location:** `mobile/krishi_rakshak_app/`

| File | Purpose |
|---|---|
| `lib/main.dart` | App entry point |
| `lib/screens/home_screen.dart` | Home screen with camera/upload |
| `lib/screens/result_screen.dart` | Diagnosis result display |
| `lib/services/api_service.dart` | FastAPI backend calls |

Key packages: `http`, `image_picker`, `permission_handler`, `cached_network_image`, `lottie`, `google_fonts`

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude AI for chatbot, daily tips, forum moderation |
| `DATAGOV_KEY` | No | data.gov.in API key for live mandi prices (demo data shown if absent) |

---

## Deployment

### Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend — serve from repo root
python -m http.server 3000
```

### Docker

```bash
docker-compose up --build
# API at http://localhost:8000
```

### API Base URL

Configured via `<meta name="krishi-api-base" content="http://127.0.0.1:8000"/>` in each HTML page, read by `config.js` into `window.KRISHI_API_BASE`.

---

## Testing

```bash
pytest tests/test_api.py -v
```

---

## Key Design Decisions

- **No auth server** — session is a simple token in localStorage. Suitable for MVP/demo.
- **Privacy on outbreak map** — coordinates rounded to ~1km before storage. No individual farm locations exposed.
- **Confidence threshold** — predictions below 40% return "Unrecognised" rather than a low-confidence guess.
- **Demo mandi prices** — if `DATAGOV_KEY` is not set, the backend returns realistic synthetic data so the UI always works.
- **No build step** — entire frontend is plain HTML/CSS/JS, served as static files.
- **Multilingual AI** — `/chat` passes the selected language to Claude, which responds in Hindi, Telugu, Tamil, Marathi, Bengali, or English.
- **Dataset excluded from git** — the `Dataset/` folder (crop training images) is in `.gitignore` due to size.
