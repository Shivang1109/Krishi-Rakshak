<div align="center">

# 🌾 Krishi Rakshak

**AI-powered crop disease intelligence for Indian farmers**

Diagnose crop diseases in under 2 seconds · 54 diseases · 9 crops · Multilingual AI advisor

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![TensorFlow](https://img.shields.io/badge/TensorFlow-2.15+-FF6F00?style=flat&logo=tensorflow&logoColor=white)](https://tensorflow.org)
[![Flutter](https://img.shields.io/badge/Flutter-Mobile-02569B?style=flat&logo=flutter&logoColor=white)](https://flutter.dev)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

</div>

---

## What is it?

Krishi Rakshak ("Crop Protector") is a full-stack web + mobile platform that lets any Indian farmer photograph a diseased leaf and get an instant AI diagnosis — with severity rating, treatment protocol, and prevention strategy — in under 2 seconds.

Beyond disease detection it bundles everything a farmer needs in one place: hyper-local weather, live mandi prices, irrigation planning, PMFBY insurance guidance, KCC loan info, a crop calendar, a disease outbreak map, a community forum, and a 24/7 multilingual AI advisor (Krishi Mitra).

The frontend is a zero-build-step PWA (plain HTML/CSS/JS) that works on low-bandwidth rural connections and can be installed on any Android or iOS home screen. A Flutter mobile app is included for native camera access.

---

## Features

| Feature | Description |
|---|---|
| 🔬 **Disease Detector** | Upload a leaf photo → MobileNetV2 diagnosis in < 2s. Single image or batch up to 10. |
| 🌦️ **Weather Forecast** | Hyper-local 7-day forecast via Open-Meteo. Spray suitability, frost/heatwave alerts. |
| 💰 **Mandi Prices** | Live market prices via data.gov.in. 7-day trend chart. Transport cost estimator. |
| 🌱 **Soil Calculator** | Fertiliser dose planner based on soil type, crop, and growth stage. |
| 💧 **Irrigation Planner** | ET₀-based schedule (Hargreaves method) for drip, sprinkler, or flood irrigation. |
| 🗺️ **Outbreak Map** | Real-time disease heatmap aggregated from all scans (privacy-safe, ~1km precision). |
| 🛡️ **Crop Insurance** | PMFBY 5-step wizard — eligibility check, premium calculator, claim guide. |
| 💳 **Kisan Loans** | KCC loan eligibility and government credit scheme guidance. |
| 📅 **Crop Calendar** | Personalised sowing-to-harvest schedule per crop and location. |
| 📊 **Disease Tracker** | Per-plant scan history with trend analysis (improving / worsening / stable). |
| 👨‍🌾 **Community Forum** | Q&A with farmers across India. Upvotes, image uploads, AI moderation. |
| 🤖 **Krishi Mitra AI** | 24/7 Claude-powered advisor in Hindi, English, Telugu, Tamil, Marathi, Bengali. |

---

## Tech Stack

| Layer | Technology |
|---|---|
| ML Model | MobileNetV2 (TensorFlow/Keras), transfer learning from ImageNet |
| Backend | FastAPI · Python 3.11 · Uvicorn · SQLite |
| AI | Anthropic Claude (claude-3-5-haiku) |
| Frontend | Vanilla HTML/CSS/JS · Three.js · Chart.js · Leaflet.js |
| Mobile | Flutter (Dart) |
| Deployment | Docker · docker-compose |
| Weather | Open-Meteo (free, no key) |
| Market data | data.gov.in API |
| TTS | gTTS |
| OCR | pytesseract (soil card reader) |

---

## Supported Crops & Diseases (54 classes)

| Crop | Diseases |
|---|---|
| 🍌 Banana | Cordana Leaf Spot, Pestalotiopsis, Sigatoka |
| 🌶️ Chilli | Whitefly, Yellowing, Anthracnose, Damping Off, Leaf Curl Virus, Leaf Spot, Veinal Mottle Virus |
| 🌽 Corn / Maize | Gray Leaf Spot, Common Rust, Northern Leaf Blight |
| 🥭 Mango | Anthracnose, Bacterial Canker, Cutting Weevil, Die Back, Gall Midge, Powdery Mildew, Sooty Mould |
| 🌾 Paddy / Rice | Dead Heart, Bacterial Leaf Blight, Bacterial Leaf Streak, Bacterial Panicle Blight, Blast, Brown Spot, Downy Mildew, Hispa, Tungro |
| 🥔 Potato | Early Blight, Late Blight |
| 🎋 Sugarcane | Red Rot, Woolly Aphid |
| 🍅 Tomato | Bacterial Spot, Early Blight, Late Blight, Leaf Mold, Septoria Leaf Spot, Spider Mites, Target Spot, TYLCV, Mosaic Virus |
| 🌾 Wheat | Brown Rust, Yellow Rust |

All 9 crops also have a **Healthy** class. Predictions below 40% confidence return an "Unrecognised" response rather than a low-confidence guess.

---

## Quick Start

### Prerequisites

- Python 3.11+
- `best_model.keras` in the repo root (the trained model)
- An Anthropic API key for the chatbot

### 1. Clone & configure

```bash
git clone https://github.com/your-org/krishi-rakshak.git
cd krishi-rakshak

# Copy and fill in your keys
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY
```

`.env` format:

```env
ANTHROPIC_API_KEY=sk-ant-...

# Optional — demo prices shown if not set
# DATAGOV_KEY=your_data_gov_in_key
```

### 2. Run the backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API docs available at [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Serve the frontend

```bash
# From the repo root
python -m http.server 3000
# or
npx serve .
```

Open [http://localhost:3000/frontend/index.html](http://localhost:3000/frontend/index.html)

### 4. Docker (optional)

```bash
docker-compose up --build
```

The API runs on port 8000. The SQLite database is mounted as a volume so data persists across restarts.

---

## Project Structure

```
Krishi_Rakshak/
├── backend/
│   ├── main.py              # FastAPI app — all API routes (2200+ lines)
│   ├── remedies.py          # Treatment database for all 54 diseases
│   └── requirements.txt
├── frontend/
│   ├── index.html           # Public landing page
│   ├── login.html           # Farmer auth
│   ├── home.html            # Post-login dashboard
│   ├── detect.html          # Disease detection (single + batch)
│   ├── weather.html         # Weather forecast
│   ├── market.html          # Mandi prices
│   ├── soil.html            # Soil / fertiliser calculator
│   ├── irrigation.html      # Irrigation planner
│   ├── insurance.html       # PMFBY insurance wizard
│   ├── loans.html           # Kisan loan guide
│   ├── tracker.html         # Disease history
│   ├── calendar.html        # Crop calendar
│   ├── map.html             # Outbreak heatmap
│   ├── forum.html           # Community forum
│   ├── chat.html            # Full-page AI chat
│   ├── nav.js               # Shared nav + cursor + chatbot injector
│   ├── chat-bubble.js       # Sidebar AI widget (login-gated)
│   ├── app.js               # Landing page logic
│   ├── style.css / nav.css / dashboard.css
│   ├── sw.js                # Service worker (PWA)
│   └── manifest.json
├── mobile/
│   └── krishi_rakshak_app/  # Flutter mobile app
├── tests/
│   └── test_api.py
├── best_model.keras         # Trained MobileNetV2
├── class_names.json         # 54 class labels
├── trainallcrops_fixed.py   # Training script
├── Dockerfile
└── docker-compose.yml
```

---

## API Reference

The full interactive docs are at `/docs` when the backend is running. Key endpoints:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/predict` | Single image diagnosis |
| `POST` | `/batch-predict` | Batch diagnosis (up to 10 images) |
| `GET` | `/history/{session_id}` | Scan history with trend |
| `GET` | `/outbreak-map` | Disease cluster heatmap data |
| `GET` | `/mandi-prices` | Live market prices |
| `GET` | `/weather` | Forecast + farmer alerts |
| `POST` | `/irrigation-schedule` | ET₀ irrigation plan |
| `POST` | `/chat` | Krishi Mitra AI chatbot |
| `GET` | `/daily-tip` | AI farming tip |
| `GET` | `/forum/posts` | Community posts |
| `POST` | `/forum/posts` | Create a post |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ Yes | Powers the chatbot, daily tips, and forum moderation |
| `DATAGOV_KEY` | ❌ Optional | [data.gov.in](https://data.gov.in) key for live mandi prices. Demo data is shown if not set. |

---

## Mobile App

A Flutter app lives in `mobile/krishi_rakshak_app/`. It uses the same FastAPI backend.

```bash
cd mobile/krishi_rakshak_app
flutter pub get
flutter run
```

Key packages: `http`, `image_picker`, `permission_handler`, `cached_network_image`, `lottie`, `google_fonts`.

---

## Running Tests

```bash
pytest tests/test_api.py -v
```

---

## Design Notes

- **No build step** — the frontend is plain HTML/CSS/JS. Open the files directly or serve them statically.
- **PWA** — installable on Android/iOS via the browser. Service worker handles offline caching.
- **Privacy** — outbreak map coordinates are rounded to 2 decimal places (~1km) before storage. No individual farm locations are ever stored or returned.
- **Multilingual** — the AI chatbot responds in the farmer's chosen language (Hindi, English, Telugu, Tamil, Marathi, Bengali).
- **Offline-first model** — the MobileNetV2 model can be exported to TensorFlow.js (`frontend/tfjs_model/`) for fully client-side inference with no backend required.

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
Made with ❤️ for Indian Farmers
</div>
