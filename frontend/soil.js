'use strict';
/* ═══════════════════════════════════════════════════════════════
   Krishi Rakshak — Soil Health Card Reader + Fertiliser Calculator
   soil.js — pure frontend, calls /read-soil-card for OCR
═══════════════════════════════════════════════════════════════ */

const API = window.KRISHI_API_BASE || 'http://127.0.0.1:8000';

// ── Fertiliser data (ICAR recommended doses) ─────────────────────────────────
const FERTILISER_DATA = {
  paddy: {
    label: 'Paddy / Rice', emoji: '🌾',
    target_yields: [30, 40, 50, 60],
    npk: [[40,20,20],[50,25,25],[60,30,30],[70,35,35]],
    splits: {
      N: ['50% basal at transplanting','25% at tillering (21 days)','25% at panicle initiation'],
      P: ['100% basal before transplanting'],
      K: ['50% basal','50% at tillering (21 days)'],
    },
  },
  wheat: {
    label: 'Wheat', emoji: '🌾',
    target_yields: [20, 30, 40, 50],
    npk: [[60,30,20],[90,40,30],[120,50,40],[150,60,50]],
    splits: {
      N: ['50% basal at sowing','25% at CRI stage (21 days)','25% at jointing (45 days)'],
      P: ['100% basal at sowing'],
      K: ['100% basal at sowing'],
    },
  },
  tomato: {
    label: 'Tomato', emoji: '🍅',
    target_yields: [80, 120, 160, 200],
    npk: [[60,30,30],[90,45,45],[120,60,60],[150,75,75]],
    splits: {
      N: ['33% at transplanting','33% at 30 days','34% at 60 days'],
      P: ['100% basal at transplanting'],
      K: ['50% basal','50% at fruit set (45 days)'],
    },
  },
  potato: {
    label: 'Potato', emoji: '🥔',
    target_yields: [60, 80, 100, 120],
    npk: [[60,30,60],[80,40,80],[100,50,100],[120,60,120]],
    splits: {
      N: ['50% basal at planting','25% at earthing up (30 days)','25% at 45 days'],
      P: ['100% basal at planting'],
      K: ['50% basal','50% at earthing up (30 days)'],
    },
  },
  maize: {
    label: 'Maize / Corn', emoji: '🌽',
    target_yields: [25, 35, 45, 55],
    npk: [[50,25,20],[70,35,25],[90,45,30],[110,55,35]],
    splits: {
      N: ['50% basal at sowing','25% at knee-high (30 days)','25% at tasseling (50 days)'],
      P: ['100% basal at sowing'],
      K: ['100% basal at sowing'],
    },
  },
  chilli: {
    label: 'Chilli', emoji: '🌶️',
    target_yields: [20, 30, 40, 50],
    npk: [[50,25,25],[70,35,35],[90,45,45],[110,55,55]],
    splits: {
      N: ['33% at transplanting','33% at 30 days','34% at 60 days'],
      P: ['100% basal at transplanting'],
      K: ['50% basal','50% at fruit set'],
    },
  },
  mango: {
    label: 'Mango', emoji: '🥭',
    target_yields: [5, 8, 12, 16],
    npk: [[0.5,0.25,0.5],[0.75,0.35,0.75],[1.0,0.5,1.0],[1.25,0.6,1.25]],
    splits: {
      N: ['50% in June (post-harvest)','50% in October (pre-flowering)'],
      P: ['100% in June'],
      K: ['50% in June','50% in October'],
    },
    unit_label: 'kg/tree',
  },
  banana: {
    label: 'Banana', emoji: '🍌',
    target_yields: [100, 150, 200, 250],
    npk: [[100,30,150],[150,45,200],[200,60,250],[250,75,300]],
    splits: {
      N: ['25% at 2 months','25% at 3 months','25% at 4 months','25% at 5 months'],
      P: ['100% at planting'],
      K: ['25% at 2 months','25% at 3 months','25% at 4 months','25% at 5 months'],
    },
    unit_label: 'g/plant',
  },
  sugarcane: {
    label: 'Sugarcane', emoji: '🎋',
    target_yields: [200, 300, 400, 500],
    npk: [[80,40,40],[120,60,60],[160,80,80],[200,100,100]],
    splits: {
      N: ['33% at planting','33% at 30 days','34% at 60 days'],
      P: ['100% basal at planting'],
      K: ['50% basal','50% at 60 days'],
    },
  },
};

const PRODUCTS = {
  N: [
    { name: 'Urea (46% N)',  factor: 100/46,  bag_kg: 50, price: 270  },
    { name: 'CAN (26% N)',   factor: 100/26,  bag_kg: 50, price: 420  },
  ],
  P: [
    { name: 'DAP (46% P₂O₅)',  factor: 100/46, bag_kg: 50, price: 1350 },
    { name: 'SSP (16% P₂O₅)',  factor: 100/16, bag_kg: 50, price: 380  },
  ],
  K: [
    { name: 'MOP (60% K₂O)',   factor: 100/60, bag_kg: 50, price: 900  },
  ],
};

const ORGANIC = {
  N: { name: 'FYM (Farm Yard Manure)', factor: 80,  unit: 'kg FYM per kg N', price_per_tonne: 1500 },
  P: { name: 'Bone Meal (4% P)',       factor: 25,  unit: 'kg Bone Meal per kg P', price_per_tonne: 8000 },
  K: { name: 'Wood Ash (5% K)',        factor: 20,  unit: 'kg Wood Ash per kg K', price_per_tonne: 500  },
};

const NUTRIENT_META = {
  N:  { label: 'Nitrogen (N)',       unit: 'kg/ha', low: 280,  high: 560,  color: '#22c55e' },
  P:  { label: 'Phosphorus (P)',     unit: 'kg/ha', low: 10,   high: 25,   color: '#60a5fa' },
  K:  { label: 'Potassium (K)',      unit: 'kg/ha', low: 108,  high: 280,  color: '#f59e0b' },
  pH: { label: 'pH',                 unit: '',      low: 6.5,  high: 7.5,  color: '#a78bfa' },
  OC: { label: 'Organic Carbon',     unit: '%',     low: 0.5,  high: 0.75, color: '#fb923c' },
  Zn: { label: 'Zinc (Zn)',          unit: 'mg/kg', low: 0.6,  high: 1.0,  color: '#f472b6' },
  Fe: { label: 'Iron (Fe)',          unit: 'mg/kg', low: 4.5,  high: 10,   color: '#94a3b8' },
  Mn: { label: 'Manganese (Mn)',     unit: 'mg/kg', low: 2.0,  high: 5.0,  color: '#c084fc' },
  Cu: { label: 'Copper (Cu)',        unit: 'mg/kg', low: 0.2,  high: 0.5,  color: '#34d399' },
  B:  { label: 'Boron (B)',          unit: 'mg/kg', low: 0.5,  high: 1.0,  color: '#fbbf24' },
};

// ── App state ─────────────────────────────────────────────────────────────────
let activeTab = 'card';
let soilCardResult = null;
let calcState = { crop: 'paddy', yieldIdx: 1, area: 1, soil: 'loamy', organic: false, soilN: 0, soilP: 0, soilK: 0 };
let bagPrices = { Urea: 270, DAP: 1350, SSP: 380, MOP: 900, CAN: 420 };

// ── Bootstrap HTML ────────────────────────────────────────────────────────────
document.getElementById('soil-app').innerHTML = `
<style>
:root{--green:#22c55e;--lime:#a8ff3e;--bg:#070f09;--card:rgba(255,255,255,.04);--border:rgba(255,255,255,.08);--border-h:rgba(74,222,128,.22);--t1:#f0fdf4;--tm:rgba(134,239,172,.45);--fh:'Syne',sans-serif;--fm:'JetBrains Mono',monospace;--fb:'DM Sans',sans-serif;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:radial-gradient(ellipse 90% 65% at 50% -5%,#2a6e3a 0%,#183421 40%,#112a17 70%);color:var(--t1);font-family:var(--fb);min-height:100vh;}
/* NAV */
.s-nav{position:sticky;top:0;z-index:100;background:rgba(7,15,9,.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:0 20px;}
.s-nav-inner{max-width:1200px;margin:0 auto;height:56px;display:flex;align-items:center;gap:16px;}
.s-logo{font-family:var(--fh);font-weight:800;font-size:.95rem;color:var(--t1);text-decoration:none;display:flex;align-items:center;gap:8px;}
.s-nav-links{display:flex;gap:4px;margin-left:auto;flex-wrap:wrap;}
.s-nav-links a{color:var(--tm);text-decoration:none;font-size:.75rem;padding:5px 10px;border-radius:8px;transition:all .2s;}
.s-nav-links a:hover,.s-nav-links a.active{color:var(--t1);background:rgba(255,255,255,.06);}
/* MAIN */
.s-main{max-width:1000px;margin:0 auto;padding:28px 16px 80px;}
.s-title{font-family:var(--fh);font-size:1.7rem;font-weight:800;margin-bottom:4px;}
.s-sub{color:var(--tm);font-size:.85rem;margin-bottom:24px;}
/* TABS */
.s-tabs{display:flex;gap:4px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:14px;padding:4px;margin-bottom:24px;width:fit-content;}
.s-tab{padding:9px 22px;border-radius:10px;font-size:.84rem;font-weight:600;cursor:pointer;transition:all .2s;border:none;background:none;color:var(--tm);}
.s-tab.active{background:rgba(34,197,94,.15);color:#4ade80;border:1px solid rgba(34,197,94,.3);}
/* CARDS */
.s-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:22px;margin-bottom:18px;}
.s-card-title{font-family:var(--fh);font-size:.95rem;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px;}
/* UPLOAD ZONE */
.upload-zone{border:2px dashed rgba(34,197,94,.25);border-radius:14px;padding:40px 20px;text-align:center;cursor:pointer;transition:all .2s;position:relative;}
.upload-zone:hover,.upload-zone.drag{border-color:rgba(34,197,94,.5);background:rgba(34,197,94,.04);}
.upload-zone input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;}
.uz-icon{font-size:2.5rem;margin-bottom:10px;}
.uz-text{font-size:.88rem;color:var(--tm);}
.uz-hint{font-size:.72rem;color:rgba(240,253,242,.3);margin-top:6px;}
.uz-preview{max-width:100%;max-height:200px;border-radius:10px;margin-top:12px;display:none;}
/* FORM ELEMENTS */
.fg{display:flex;flex-direction:column;gap:5px;margin-bottom:12px;}
.fg label{font-size:.65rem;color:var(--tm);text-transform:uppercase;letter-spacing:.07em;}
.fg select,.fg input{background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--t1);font-family:var(--fb);font-size:.88rem;outline:none;transition:border .2s;}
.fg select:focus,.fg input:focus{border-color:rgba(34,197,94,.4);}
.fg select option{background:#0f1f12;}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
@media(max-width:500px){.form-row{grid-template-columns:1fr;}}
/* BUTTONS */
.btn-primary{padding:11px 24px;background:var(--green);border:none;border-radius:10px;color:#0a1a0e;font-weight:700;font-size:.88rem;cursor:pointer;transition:opacity .2s;width:100%;}
.btn-primary:hover{opacity:.85;}
.btn-primary:disabled{opacity:.4;cursor:not-allowed;}
.btn-ghost{padding:9px 18px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:10px;color:var(--tm);font-size:.82rem;cursor:pointer;transition:all .2s;}
.btn-ghost:hover{border-color:var(--border-h);color:var(--t1);}
/* LOADING */
.s-loading{text-align:center;padding:40px;}
.s-spinner{width:36px;height:36px;border:3px solid rgba(34,197,94,.2);border-top-color:#22c55e;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px;}
@keyframes spin{to{transform:rotate(360deg)}}
/* NUTRIENT TABLE */
.nut-table{width:100%;border-collapse:collapse;}
.nut-table th{font-size:.65rem;color:var(--tm);text-transform:uppercase;letter-spacing:.07em;padding:8px 12px;text-align:left;border-bottom:1px solid var(--border);}
.nut-table td{padding:10px 12px;font-size:.85rem;border-bottom:1px solid rgba(255,255,255,.04);}
.nut-table tr:last-child td{border-bottom:none;}
.status-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;font-size:.7rem;font-weight:600;}
.status-low{background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.2);}
.status-medium,.status-neutral{background:rgba(245,158,11,.12);color:#fbbf24;border:1px solid rgba(245,158,11,.2);}
.status-high{background:rgba(34,197,94,.12);color:#4ade80;border:1px solid rgba(34,197,94,.2);}
.status-acidic{background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.2);}
.status-alkaline{background:rgba(168,85,247,.12);color:#c084fc;border:1px solid rgba(168,85,247,.2);}
/* RECOMMENDATION CARDS */
.rec-card{display:flex;gap:12px;padding:14px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:12px;margin-bottom:8px;}
.rec-priority-high{border-left:3px solid #ef4444;}
.rec-priority-medium{border-left:3px solid #f59e0b;}
.rec-nut{font-family:var(--fm);font-size:.75rem;font-weight:700;color:var(--lime);min-width:28px;}
.rec-body{flex:1;}
.rec-status{font-size:.68rem;color:var(--tm);margin-bottom:3px;}
.rec-advice{font-size:.83rem;line-height:1.5;}
/* CALC STEPS */
.step-header{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
.step-num{width:26px;height:26px;border-radius:50%;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);display:flex;align-items:center;justify-content:center;font-family:var(--fm);font-size:.75rem;color:#4ade80;flex-shrink:0;}
.step-title{font-family:var(--fh);font-size:.9rem;font-weight:700;}
/* YIELD SLIDER */
.yield-slider{width:100%;accent-color:var(--green);margin:8px 0;}
.yield-labels{display:flex;justify-content:space-between;font-size:.68rem;color:var(--tm);}
/* CROP GRID */
.crop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;}
.crop-btn{padding:10px 8px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:10px;text-align:center;cursor:pointer;transition:all .2s;font-size:.78rem;color:var(--tm);}
.crop-btn:hover{border-color:var(--border-h);color:var(--t1);}
.crop-btn.active{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.3);color:#4ade80;}
.crop-btn .ce{font-size:1.3rem;display:block;margin-bottom:4px;}
/* NPK RESULT TABLE */
.npk-table{width:100%;border-collapse:collapse;margin-bottom:16px;}
.npk-table th{font-size:.65rem;color:var(--tm);text-transform:uppercase;letter-spacing:.07em;padding:8px 12px;text-align:left;border-bottom:1px solid var(--border);}
.npk-table td{padding:10px 12px;font-size:.85rem;border-bottom:1px solid rgba(255,255,255,.04);}
.npk-table tr:last-child td{border-bottom:none;}
.npk-val{font-family:var(--fm);color:var(--lime);}
/* PRODUCT CARDS */
.prod-card{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:8px;}
.prod-name{font-size:.85rem;font-weight:600;margin-bottom:6px;}
.prod-row{display:flex;justify-content:space-between;font-size:.78rem;color:var(--tm);margin-bottom:3px;}
.prod-row span{color:var(--t1);}
.prod-bags{font-family:var(--fm);font-size:1rem;color:var(--lime);font-weight:700;}
/* SCHEDULE */
.sched-item{display:flex;gap:12px;padding:12px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;}
.sched-day{font-family:var(--fm);font-size:.72rem;color:var(--lime);min-width:60px;padding-top:2px;}
.sched-ops{font-size:.82rem;line-height:1.6;}
/* COST TABLE */
.cost-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.84rem;}
.cost-row:last-child{border-bottom:none;font-weight:700;font-size:.9rem;}
.cost-row input{width:80px;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:6px;padding:4px 8px;color:var(--t1);font-family:var(--fm);font-size:.78rem;text-align:right;outline:none;}
/* ORGANIC TOGGLE */
.org-toggle{display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(168,255,62,.06);border:1px solid rgba(168,255,62,.15);border-radius:10px;margin-bottom:16px;cursor:pointer;}
.toggle-switch{width:36px;height:20px;background:rgba(255,255,255,.1);border-radius:10px;position:relative;transition:background .2s;flex-shrink:0;}
.toggle-switch.on{background:rgba(34,197,94,.4);}
.toggle-knob{width:16px;height:16px;background:#fff;border-radius:50%;position:absolute;top:2px;left:2px;transition:left .2s;}
.toggle-switch.on .toggle-knob{left:18px;}
/* SHARE BTN */
.share-row{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;}
/* DEMO BANNER */
.demo-banner{padding:10px 14px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:10px;font-size:.75rem;color:#fbbf24;margin-bottom:16px;}
/* PRINT */
@media print{
  .s-nav,.s-tabs,.upload-zone,.btn-primary,.btn-ghost,.share-row,.no-print{display:none!important;}
  body{background:#fff!important;color:#000!important;}
  .s-card{border:1px solid #ccc!important;background:#fff!important;break-inside:avoid;}
}
</style>

<nav class="s-nav" style="display:none" aria-hidden="true"></nav>

<div class="s-main">
  <h1 class="s-title">🌱 Soil Health</h1>
  <p class="s-sub">Read your Soil Health Card and get crop-specific fertiliser recommendations</p>

  <div class="s-tabs">
    <button class="s-tab active" id="tab-card" onclick="switchTab('card')">📋 Soil Card Reader</button>
    <button class="s-tab" id="tab-calc" onclick="switchTab('calc')">🧮 Fertiliser Calculator</button>
  </div>

  <div id="panel-card"></div>
  <div id="panel-calc" style="display:none"></div>
</div>
`;

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.getElementById('tab-card').classList.toggle('active', tab === 'card');
  document.getElementById('tab-calc').classList.toggle('active', tab === 'calc');
  document.getElementById('panel-card').style.display = tab === 'card' ? 'block' : 'none';
  document.getElementById('panel-calc').style.display = tab === 'calc' ? 'block' : 'none';
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOIL CARD READER
// ═══════════════════════════════════════════════════════════════════════════════
function renderCardPanel() {
  document.getElementById('panel-card').innerHTML = `
  <div class="s-card">
    <div class="s-card-title">📷 Upload Soil Health Card Photo</div>
    <div class="form-row" style="margin-bottom:14px;">
      <div class="fg">
        <label>Your Crop (for recommendations)</label>
        <select id="sc-crop">
          ${Object.entries(FERTILISER_DATA).map(([k,v])=>`<option value="${k}">${v.emoji} ${v.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="upload-zone" id="sc-zone">
      <input type="file" id="sc-file" accept="image/*" onchange="handleCardFile(this.files[0])"/>
      <div class="uz-icon">📄</div>
      <div class="uz-text">Tap to upload or drag your Soil Health Card photo</div>
      <div class="uz-hint">Supports JPEG, PNG · Hindi + English cards supported</div>
      <img id="sc-preview" class="uz-preview"/>
    </div>
    <button class="btn-primary" id="sc-btn" onclick="readSoilCard()" style="margin-top:14px;" disabled>
      🔬 Read Soil Card
    </button>
  </div>
  <div id="sc-results"></div>
  `;

  // Drag-over styling
  const zone = document.getElementById('sc-zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) handleCardFile(f);
  });
}

function handleCardFile(file) {
  if (!file) return;
  const preview = document.getElementById('sc-preview');
  preview.src = URL.createObjectURL(file);
  preview.style.display = 'block';
  document.getElementById('sc-btn').disabled = false;
  document.getElementById('sc-btn').textContent = '🔬 Read Soil Card';
}

async function readSoilCard() {
  const fileInput = document.getElementById('sc-file');
  const file = fileInput.files[0];
  if (!file) return;
  const crop = document.getElementById('sc-crop').value;
  const btn = document.getElementById('sc-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Reading your soil card…';
  document.getElementById('sc-results').innerHTML = `
    <div class="s-loading"><div class="s-spinner"></div><p style="color:var(--tm);font-size:.85rem">Analysing nutrients with OCR…</p></div>`;

  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('crop', crop);
    const res = await fetch(`${API}/read-soil-card`, { method: 'POST', body: fd });
    if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'API error'); }
    soilCardResult = await res.json();
    renderCardResults(soilCardResult);
    // Save NPK to localStorage for calculator auto-fill
    const p = soilCardResult.parsed_values || {};
    if (p.N) localStorage.setItem('kr_soil_N', p.N);
    if (p.P) localStorage.setItem('kr_soil_P', p.P);
    if (p.K) localStorage.setItem('kr_soil_K', p.K);
  } catch(e) {
    document.getElementById('sc-results').innerHTML =
      `<div class="s-card"><p style="color:#f87171">❌ ${e.message}</p><p style="color:var(--tm);font-size:.78rem;margin-top:8px;">Make sure the backend is running and pytesseract is installed.</p></div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔬 Read Soil Card';
  }
}

function statusClass(s) {
  return `status-${s}`;
}
function statusLabel(s) {
  return { low:'Low ↓', medium:'Medium', high:'High ↑', neutral:'Neutral ✓', acidic:'Acidic ↓', alkaline:'Alkaline ↑' }[s] || s;
}

function renderCardResults(data) {
  const ratings = data.ratings || {};
  const recs = data.recommendations || [];
  const amends = data.amendments || [];

  let html = '';

  if (data.demo_mode) {
    html += `<div class="demo-banner">⚠️ OCR could not extract values from this image — showing demo data. For best results, photograph the card in good lighting with text clearly visible.</div>`;
  }

  // Nutrient status table
  html += `<div class="s-card">
    <div class="s-card-title">🧪 Nutrient Status</div>
    <table class="nut-table">
      <thead><tr><th>Nutrient</th><th>Value</th><th>Status</th><th>ICAR Range</th></tr></thead>
      <tbody>
        ${Object.entries(ratings).map(([nut, r]) => {
          const meta = NUTRIENT_META[nut] || {};
          const range = nut === 'pH'
            ? '6.5 – 7.5 (neutral)'
            : `${meta.low} – ${meta.high} ${meta.unit}`;
          return `<tr>
            <td><span style="color:${meta.color||'#4ade80'};font-weight:600">${meta.label||nut}</span></td>
            <td class="npk-val">${r.value} ${r.unit}</td>
            <td><span class="status-pill ${statusClass(r.status)}">${statusLabel(r.status)}</span></td>
            <td style="font-size:.75rem;color:var(--tm)">${range}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;

  // Recommendations
  if (recs.length) {
    html += `<div class="s-card">
      <div class="s-card-title">💊 Fertiliser Recommendations — ${data.crop}</div>
      ${recs.map(r => `
        <div class="rec-card rec-priority-${r.priority}">
          <div class="rec-nut">${r.nutrient}</div>
          <div class="rec-body">
            <div class="rec-status">${statusLabel(r.status)} · ${r.priority === 'high' ? '🔴 High priority' : '🟡 Medium priority'}</div>
            <div class="rec-advice">${r.advice}</div>
          </div>
        </div>`).join('')}
    </div>`;
  }

  // Amendments
  if (amends.length) {
    html += `<div class="s-card">
      <div class="s-card-title">🪨 Soil Amendments Needed</div>
      ${amends.map(a => `
        <div class="rec-card rec-priority-medium">
          <div class="rec-nut">${a.nutrient}</div>
          <div class="rec-body">
            <div class="rec-status" style="font-weight:600;color:var(--t1)">${a.amendment}</div>
            <div class="rec-advice" style="color:var(--tm)">${a.purpose}</div>
          </div>
        </div>`).join('')}
    </div>`;
  }

  // Share / Export
  html += `<div class="share-row no-print">
    <button class="btn-ghost" onclick="window.print()">📄 Print / Save PDF</button>
    <button class="btn-ghost" onclick="shareWhatsApp()">📱 Share via WhatsApp</button>
    <button class="btn-ghost" onclick="switchTab('calc');renderCalcPanel()">🧮 Open Fertiliser Calculator →</button>
  </div>`;

  document.getElementById('sc-results').innerHTML = html;
}

function shareWhatsApp() {
  if (!soilCardResult) return;
  const r = soilCardResult.ratings || {};
  let msg = `🌱 *Soil Health Report — Krishi Rakshak*\n\n`;
  msg += `Crop: ${soilCardResult.crop}\n\n`;
  msg += `*Nutrient Status:*\n`;
  Object.entries(r).forEach(([n, v]) => { msg += `• ${n}: ${v.value} ${v.unit} — ${statusLabel(v.status)}\n`; });
  msg += `\n*Top Recommendations:*\n`;
  (soilCardResult.recommendations || []).slice(0, 3).forEach(rec => { msg += `• ${rec.nutrient}: ${rec.advice}\n`; });
  msg += `\nGenerated by Krishi Rakshak`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

