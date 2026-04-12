# Krishi Rakshak — PPT Presentation Guide
## For Hackathon Presentation

---

## SLIDE 1 — Title Slide
**Title:** Krishi Rakshak — AI Crop Disease Intelligence
**Subtitle:** Protecting Indian Farmers with Artificial Intelligence
**Visual:** The animated scan card from the landing page (screenshot it)
**Bottom line:** Built with MobileNetV2 · FastAPI · Claude AI · Flutter

---

## SLIDE 2 — The Problem
**Heading:** India Loses ₹50,000 Crore Every Year to Crop Diseases

**Points to include:**
- 70% of India's population depends on agriculture
- Farmers detect diseases too late — by the time they see symptoms, 30-40% of yield is already lost
- No access to agronomists in rural areas — nearest expert is often 50+ km away
- Existing apps require internet, are English-only, and give no treatment plan
- 2G/3G connectivity in rural India makes heavy apps unusable

**Visual suggestion:** A split image — healthy crop on left, diseased crop on right

---

## SLIDE 3 — Our Solution
**Heading:** Krishi Rakshak — Diagnose in 2 Seconds

**One line:** Upload a leaf photo → AI identifies the disease → Get treatment plan instantly

**Key differentiators:**
- Works on 2G connections (lightweight PWA)
- Multilingual: Hindi, English, Telugu, Tamil, Marathi, Bengali
- No agronomist needed — AI gives ICAR-approved treatment steps
- Free for all Indian farmers

**Visual suggestion:** Screenshot of the scan result card showing disease name, severity badge, confidence %, treatment steps

---

## SLIDE 4 — How It Works (3 Steps)
**Heading:** Simple as 1-2-3

**Step 1 — Scan:** Farmer takes a photo of the diseased leaf using phone camera or uploads from gallery

**Step 2 — Diagnose:** MobileNetV2 deep learning model analyzes the image in under 2 seconds, identifies disease from 54 possible conditions across 9 crops

**Step 3 — Act:** Farmer gets severity rating (Healthy / Moderate / Severe / Critical), full treatment protocol with exact chemical doses, prevention tips, and can share via WhatsApp

**Visual suggestion:** Three phone mockups showing each step

---

## SLIDE 5 — The AI Model
**Heading:** Powered by Deep Learning

**Stats to highlight:**
- Architecture: MobileNetV2 (Transfer Learning from ImageNet)
- Training dataset: Custom dataset of crop disease images
- 54 disease classes across 9 crops
- Top-3 predictions with confidence scores
- Confidence threshold: 55% (raised to reduce false positives)
- Severity grading: Healthy → Early → Moderate → Severe → Critical

**Crops covered:**
🍌 Banana · 🌶️ Chilli · 🌽 Corn · 🥭 Mango · 🌾 Paddy · 🥔 Potato · 🎋 Sugarcane · 🍅 Tomato · 🌾 Wheat

**Visual suggestion:** A grid of crop icons with disease count badges

---

## SLIDE 6 — Features Dashboard
**Heading:** One Dashboard, Everything a Farmer Needs

**Feature 1 — Disease Detector:** AI diagnosis for 54 diseases, PDF report download, WhatsApp share
**Feature 2 — Weather Forecast:** Hyper-local 7-day forecast, crop-specific spray window alerts, frost/heatwave warnings
**Feature 3 — Mandi Prices:** Live market prices from mandis across India, 7-day trend, best market recommendation
**Feature 4 — Krishi Mitra AI:** 24/7 AI advisor powered by Claude (Anthropic), responds in 6 Indian languages, streaming responses
**Feature 5 — Scan History:** Track every diagnosis, see if crop is improving or worsening over time
**Feature 6 — PDF Reports:** Professional diagnosis report for insurance claims and agronomist consultation

**Visual suggestion:** Screenshot of the SPA dashboard with sidebar visible

---

## SLIDE 7 — Tech Stack
**Heading:** Built on Production-Grade Technology

| Layer | Technology |
|---|---|
| ML Model | MobileNetV2 (TensorFlow/Keras) |
| Backend | FastAPI (Python) + SQLite |
| AI Advisor | Claude Sonnet (Anthropic) |
| Frontend | Vanilla HTML/CSS/JS — PWA |
| Mobile | Flutter (Android + iOS) |
| Auth | JWT (HS256, server-side) |
| Deployment | Docker + Uvicorn |
| Weather | Open-Meteo API (free, no key) |
| Market Prices | data.gov.in API |

**Visual suggestion:** Tech stack icons arranged in layers (Model → Backend → Frontend)

---

## SLIDE 8 — Security & Architecture
**Heading:** Production-Ready, Not Just a Demo

**Points:**
- JWT authentication — real server-side token validation, not just localStorage
- Rate limiting — 30 predictions/min, 20 chat requests/min per IP (no extra dependencies)
- Privacy-first outbreak map — GPS coordinates rounded to ~1km, no individual farm data exposed
- Offline-capable PWA — service worker caches core assets, works on 2G
- Streaming AI responses — Server-Sent Events for real-time chat (no waiting)
- Confidence threshold — predictions below 55% return "Unrecognised" instead of misleading farmers

---

## SLIDE 9 — Demo Flow
**Heading:** Live Demo

**Walk through this exact sequence:**
1. Open landing page — show the animated scan card cycling through diseases
2. Click "Farmer Login" — register with phone + PIN
3. Dashboard loads — show sidebar, daily tip, greeting
4. Upload a diseased leaf photo (have one ready!)
5. Click "Analyze Disease" — show progress bar
6. Result card appears — point out: severity badge color, confidence bar, disease name
7. Click "Treatment" tab — show ICAR-approved steps
8. Click "PDF Report" — show the professional report
9. Click "WhatsApp" — show the formatted message
10. Switch to "Krishi Mitra AI" — ask "My tomato has yellow spots, what should I do?" in Hindi
11. Show streaming response in Hindi

**Pro tip:** Have a real diseased leaf photo ready before the demo. Use a tomato early blight or wheat rust image — model is most confident on these.

---

## SLIDE 10 — Impact & Market
**Heading:** The Opportunity

**Market size:**
- 140 million farming households in India
- ₹50,000 crore annual crop loss from diseases
- Only 1 agronomist per 1,000 farmers in rural India
- 750 million smartphone users in India by 2025

**Our traction (demo numbers):**
- 54 diseases covered
- 9 major crops
- 6 Indian languages
- Sub-2-second diagnosis
- Works on 2G connections

**Visual suggestion:** India map with farming state highlights

---

## SLIDE 11 — Business Model (Optional)
**Heading:** Path to Revenue

| Tier | Features | Price |
|---|---|---|
| Free | 10 scans/month, basic AI chat, weather | ₹0 |
| Kisan Pro | Unlimited scans, PDF reports, voice input | ₹49/month |
| Agri-Input Companies | B2B dashboard, disease heatmap API | Enterprise |

**Near-term:** Government partnerships (PMFBY, KCC), KVK integrations
**Long-term:** WhatsApp Bot, IVR for feature phones, crop yield prediction

---

## SLIDE 12 — Team & Closing
**Heading:** Built for Bharat's Farmers

**Closing line:** "Every farmer deserves an agronomist in their pocket — Krishi Rakshak makes that possible."

**Call to action:** Try it live at localhost:3000 (or your deployed URL)

**Visual suggestion:** The Krishi Rakshak logo with the tagline

---

## DESIGN NOTES FOR YOUR FRIEND

**Color scheme:** Dark green background (#070f09), bright green accents (#22c55e), lime highlights (#a8ff3e)

**Font:** Use a bold sans-serif for headings (Syne or similar), clean body font (DM Sans or Inter)

**Slide style:** Dark background slides will match the app's aesthetic and look more premium

**Screenshots to take before making PPT:**
1. Landing page hero (index.html)
2. Login page
3. Dashboard with scan section (home.html)
4. Result card after a scan (with a real disease detected)
5. PDF report
6. Krishi Mitra AI chat in Hindi
7. Weather section
8. Mandi prices section

**Total slides:** 12 (can trim to 8-10 for a 5-minute pitch)
**Recommended time per slide:** 30-45 seconds
**Total pitch time:** 6-8 minutes + 2 minutes demo
