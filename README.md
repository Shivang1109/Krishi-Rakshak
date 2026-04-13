<div align="center">

# 🌾 Krishi Rakshak

**AI-powered crop disease intelligence for Indian farmers**

Diagnose crop diseases in under 2 seconds · 54 diseases · 9 crops · Multilingual AI advisor

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![TensorFlow](https://img.shields.io/badge/TensorFlow-2.15+-FF6F00?style=flat&logo=tensorflow&logoColor=white)](https://tensorflow.org)
[![Flutter](https://img.shields.io/badge/Flutter-Mobile-02569B?style=flat&logo=flutter&logoColor=white)](https://flutter.dev)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

### 🚀 Live Demo

| | URL |
|---|---|
| 🌐 **Frontend** | [https://d3bsxgl8cuk253.cloudfront.net](https://d3bsxgl8cuk253.cloudfront.net) |
| ⚙️ **Backend API** | [https://d2edjmigl4cl66.cloudfront.net](https://d2edjmigl4cl66.cloudfront.net) |
| 📦 **GitHub** | [https://github.com/Shivang1109/Krishi-Rakshak](https://github.com/Shivang1109/Krishi-Rakshak) |

</div>

---

## The Problem

₹50,000 crore is lost to crop disease every year in India. Most farmers have no fast, affordable way to identify what's wrong — let alone get treatment advice in their own language.

## What is Krishi Rakshak?

Krishi Rakshak ("Crop Protector") is a full-stack web + mobile platform that lets any farmer photograph a diseased leaf and get an instant AI diagnosis — with severity rating, treatment protocol, and prevention strategy — in under 2 seconds.

Beyond disease detection it bundles everything a farmer needs in one place: hyper-local weather, live mandi prices, irrigation planning, PMFBY insurance guidance, KCC loan info, a crop calendar, a community forum, and a 24/7 multilingual AI advisor (Krishi Mitra).

The frontend is a zero-build-step PWA (plain HTML/CSS/JS) that works on low-bandwidth rural connections and can be installed on any Android or iOS home screen. A Flutter mobile app is included for native camera access.

---

## How It Works

| Step | What happens |
|---|---|
| 📸 **Scan** | Photograph a diseased leaf using your phone camera or upload from gallery |
| 🧠 **Diagnose** | MobileNetV2 AI identifies the disease with a confidence score in under 2 seconds |
| 💊 **Act** | Get treatment steps, pesticide names, and prevention tips in your language |

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

## Project Structure

```
Krishi_Rakshak/
├── backend/
│   ├── main.py              # FastAPI app — all API routes
│   ├── remedies.py          # Treatment database for all 54 diseases
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/
│   ├── index.html           # Public landing page
│   ├── login.html           # Farmer auth
│   ├── home.html            # Post-login SPA dashboard
│   ├── detect.html          # Disease detection (single + batch)
│   ├── weather.html         # Weather forecast
│   ├── market.html          # Mandi prices
│   ├── soil.html            # Soil / fertiliser calculator
│   ├── irrigation.html      # Irrigation planner
│   ├── insurance.html       # PMFBY insurance wizard
│   ├── loans.html           # Kisan loan guide
│   ├── finance.html         # Farm finance overview
│   ├── tracker.html         # Disease history
│   ├── calendar.html        # Crop calendar
│   ├── map.html             # Outbreak heatmap
│   ├── forum.html           # Community forum
│   ├── chat.html            # Full-page AI chat
│   ├── dashboard.html       # Sidebar dashboard layout
│   ├── nav.js               # Shared nav + cursor + chatbot injector
│   ├── home-app.js          # SPA dashboard logic
│   ├── app.js               # Landing page logic
│   ├── detect.js            # Detect page logic
│   ├── soil.js              # Soil calculator logic
│   ├── finance.js           # Finance page logic
│   ├── chat-bubble.js       # Sidebar AI widget (login-gated)
│   ├── bg.js                # Three.js background animation
│   ├── intelligence.js      # AI intelligence helpers
│   ├── onboarding.js        # Farmer onboarding wizard
│   ├── router.js            # Client-side routing
│   ├── config.js            # API base URL config
│   ├── style.css / nav.css / dashboard.css
│   ├── sw.js                # Service worker (PWA)
│   ├── manifest.json        # PWA manifest
│   ├── disease-translations.json
│   └── static/
│       ├── labels.json
│       └── tfjs_model/      # TensorFlow.js model (client-side inference)
├── mobile/
│   └── krishi_rakshak_app/  # Flutter mobile app
│       └── lib/
│           ├── main.dart
│           ├── screens/     # home_screen.dart, result_screen.dart
│           └── services/    # api_service.dart
├── forum_uploads/           # Uploaded forum images (runtime)
├── tests/
│   └── test_api.py
├── best_model.keras         # Trained MobileNetV2
├── class_names.json         # 54 class labels
├── krishi_history.db        # SQLite database (runtime)
├── Dockerfile
└── docker-compose.yml
```

---

## Quick Start

### Prerequisites

- Python 3.11+
- `best_model.keras` in the repo root (the trained model)
- An Anthropic API key for the AI chatbot

### 1. Configure environment

Create a `.env` file in the repo root:

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
```

Open [http://localhost:3000/frontend/index.html](http://localhost:3000/frontend/index.html)

### 4. Docker (optional)

```bash
docker-compose up --build
```

---

## API Reference

Key endpoints (full interactive docs at `/docs`):

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check + model status |
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
| `DATAGOV_KEY` | ❌ Optional | data.gov.in key for live mandi prices. Demo data shown if not set. |

---

## Mobile App

```bash
cd mobile/krishi_rakshak_app
flutter pub get
flutter run
```

---

## Running Tests

```bash
pytest tests/test_api.py -v
```

---

## Design Notes

- **No build step** — the frontend is plain HTML/CSS/JS. Serve statically, no toolchain needed.
- **PWA** — installable on Android/iOS via the browser. Service worker handles offline caching.
- **Privacy** — outbreak map coordinates are rounded to ~1km before storage. No individual farm locations stored.
- **Multilingual** — AI chatbot responds in the farmer's chosen language (Hindi, English, Telugu, Tamil, Marathi, Bengali).
- **Offline-first model** — MobileNetV2 exported to TensorFlow.js in `frontend/static/tfjs_model/` for fully client-side inference.

---

<div align="center">
Made with ❤️ for Indian Farmers
</div>
