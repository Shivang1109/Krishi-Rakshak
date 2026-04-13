'use strict';

const API = window.KRISHI_API_BASE || 'http://127.0.0.1:8000';

// ── State ────────────────────────────────────────────────────────────────────
const loadedSections = new Set();
let currentFile = null;
let currentResult = null;
let cameraStream = null;

// ── Utility ──────────────────────────────────────────────────────────────────
function escHtml(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function setProgress(pct) {
  const fill = document.getElementById('sp-fill');
  if (fill) fill.style.width = pct + '%';
}

function setStep(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'sp-step' + (state ? ' ' + state : '');
}

function getSession() {
  try { return JSON.parse(localStorage.getItem('kr_session')); } catch { return null; }
}

function getSessionId() {
  const s = getSession();
  if (s && s.phone) return s.phone;
  let anon = localStorage.getItem('kr_anon_session');
  if (!anon) {
    anon = (crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'anon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('kr_anon_session', anon);
  }
  return anon;
}

// ── Auth guard (allows 1 anonymous scan) ─────────────────────────────────────
(function authGuard() {
  const s = getSession();
  if (!s || !s.token) {
    // Allow access for anonymous scan — home.html handles the gate after 1 scan
    const anon = parseInt(localStorage.getItem('kr_anon_scans') || '0');
    if (anon >= 1) {
      // Already used free scan — redirect to login
      window.location.replace('login.html');
    }
    // else: allow through for the free scan
  }
})();

// ── Sidebar user info ─────────────────────────────────────────────────────────
function initSidebarUser() {
  const s = getSession();
  if (!s) return;
  const name = s.name || 'Farmer';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const av = document.getElementById('sb-av');
  const sbName = document.getElementById('sb-name');
  const sbCrop = document.getElementById('sb-crop');
  if (av) av.textContent = initials;
  if (sbName) sbName.textContent = name;

  // Crop: try profile first, fall back to session crop, then '—'
  const profile = (() => { try { return JSON.parse(localStorage.getItem('kr_farmer_profile')); } catch { return null; } })();
  const cropDisplay = (profile?.crops?.length ? profile.crops[0] : null) || s.crop || '—';
  if (sbCrop) sbCrop.textContent = cropDisplay;

  // Update page title with farmer name
  document.title = name.split(' ')[0] + ' · Krishi Rakshak';
}

// ── Section navigation ────────────────────────────────────────────────────────
function showSection(secId, btn) {
  document.querySelectorAll('.spa-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('sec-' + secId);
  if (target) target.classList.add('active');

  // Sync sidebar
  document.querySelectorAll('.sb-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Sync mobile nav
  document.querySelectorAll('.mob-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.sec === secId);
  });

  if (!loadedSections.has(secId)) {
    loadedSections.add(secId);
    lazyLoad(secId);
  }
}

function lazyLoad(secId) {
  switch (secId) {
    case 'weather': {
      // Try profile coords first, then silently request GPS
      const profile = (() => { try { return JSON.parse(localStorage.getItem('kr_farmer_profile')); } catch { return null; } })();
      if (profile && profile.lat && profile.lng) {
        fetchWeather(profile.lat, profile.lng);
      } else if (navigator.geolocation) {
        // Silent GPS — show skeleton while waiting
        const content = document.getElementById('weather-content');
        if (content) content.innerHTML = '<div style="color:rgba(134,239,172,.4);font-size:.85rem;padding:12px 0;display:flex;align-items:center;gap:8px"><div class="spinner"></div> Detecting your location…</div>';
        navigator.geolocation.getCurrentPosition(
          pos => fetchWeather(pos.coords.latitude, pos.coords.longitude),
          () => {
            const c = document.getElementById('weather-content');
            if (c) c.innerHTML = '<div style="color:rgba(134,239,172,.4);font-size:.85rem;padding:12px 0">📍 Enter your location above to see weather.</div>';
          },
          { timeout: 8000 }
        );
      }
      break;
    }
    case 'market': {
      // Pre-fill crop and state from session/profile, then auto-load
      const s = getSession();
      const profile = (() => { try { return JSON.parse(localStorage.getItem('kr_farmer_profile')); } catch { return null; } })();
      const cropRaw = (profile?.crops?.[0] || s?.crop || '').replace(/[^a-zA-Z]/g, '').trim();
      const state = profile?.state || s?.state || '';
      const cropMap = {
        'Paddy': 'Paddy', 'Rice': 'Paddy', 'Wheat': 'Wheat', 'Tomato': 'Tomato',
        'Potato': 'Potato', 'Maize': 'Maize', 'Corn': 'Maize', 'Chilli': 'Chilli',
        'Mango': 'Mango', 'Banana': 'Banana', 'Sugarcane': 'Sugarcane', 'Onion': 'Onion',
      };
      const stateMap = {
        'Maharashtra': 'Maharashtra', 'Punjab': 'Punjab', 'UP': 'Uttar Pradesh',
        'Uttar Pradesh': 'Uttar Pradesh', 'Karnataka': 'Karnataka', 'Gujarat': 'Gujarat',
        'Andhra Pradesh': 'Andhra Pradesh', 'Tamil Nadu': 'Tamil Nadu',
        'West Bengal': 'West Bengal', 'Bihar': 'Bihar', 'Haryana': 'Haryana',
        'Madhya Pradesh': 'Madhya Pradesh', 'Rajasthan': 'Rajasthan', 'Telangana': 'Telangana',
      };
      const cropSel = document.getElementById('mk-crop');
      const stateSel = document.getElementById('mk-state');
      if (cropSel && cropMap[cropRaw]) cropSel.value = cropMap[cropRaw];
      if (stateSel && stateMap[state]) stateSel.value = stateMap[state];
      // Auto-load if we have both
      if ((cropSel?.value) && (stateSel?.value)) loadMarket();
      break;
    }
    case 'chat':
      initInlineChat();
      break;
    case 'irrigation':
      // ready on user action
      break;
    case 'soil': {
      // Pre-fill dropdown from session and auto-render immediately
      const s = getSession();
      const profile = (() => { try { return JSON.parse(localStorage.getItem('kr_farmer_profile')); } catch { return null; } })();
      const cropRaw = (profile?.crops?.[0] || s?.crop || '').replace(/[^a-zA-Z]/g,'').toLowerCase().trim();
      // Map common aliases to SOIL_DATA keys
      const cropAliasMap = { rice:'paddy', corn:'maize', sugarcane:'sugarcane', chili:'chilli', pepper:'chilli' };
      const cropKey = SOIL_DATA[cropRaw] ? cropRaw : (cropAliasMap[cropRaw] || 'paddy');
      const sel = document.getElementById('soil-crop-sel');
      if (sel) {
        sel.value = cropKey;
        updateSoilGuide();
      } else {
        // DOM not ready yet — retry once after paint
        requestAnimationFrame(() => {
          const s2 = document.getElementById('soil-crop-sel');
          if (s2) { s2.value = cropKey; updateSoilGuide(); }
        });
      }
      break;
    }
    case 'calendar':
      loadCalendar();
      break;
    case 'history':
      loadHistory();
      break;
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────
function logout() {
  localStorage.removeItem('kr_session');
  window.location.replace('login.html');
}

// ── Daily tip ─────────────────────────────────────────────────────────────────
async function loadDailyTip() {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = 'kr_tip_' + today;
  const cached = localStorage.getItem(cacheKey);
  const el = document.getElementById('tip-text');
  if (!el) return;

  if (cached) {
    el.textContent = cached;
    return;
  }
  try {
    const res = await fetch(API + '/daily-tip');
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const tip = data.tip || data.text || data.message || JSON.stringify(data);
    localStorage.setItem(cacheKey, tip);
    el.textContent = tip;
  } catch {
    el.textContent = 'Keep your fields clean and monitor leaves regularly for early signs of disease.';
  }
}

// ── Image Quality Check ───────────────────────────────────────────────────────
function checkImageQuality(file, callback) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const w = img.naturalWidth, h = img.naturalHeight;
    if (w < 224 || h < 224) {
      callback({ status: 'bad', color: '#ef4444', msg: '❌ Image too small (min 224×224px) — use a closer shot' });
      return;
    }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 200 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let totalLum = 0, n = data.length / 4;
    // Laplacian variance for blur
    let sumSq = 0, sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      totalLum += lum;
      sum += lum; sumSq += lum * lum;
    }
    const avgLum = totalLum / n;
    const variance = (sumSq / n) - (sum / n) * (sum / n);

    if (avgLum < 50) {
      callback({ status: 'warn', color: '#f59e0b', msg: '⚠️ Image too dark — use natural daylight or a brighter area' });
    } else if (avgLum > 220) {
      callback({ status: 'warn', color: '#f59e0b', msg: '⚠️ Image overexposed — avoid direct sunlight on the leaf' });
    } else if (variance < 80) {
      callback({ status: 'warn', color: '#f59e0b', msg: '⚠️ Image may be blurry — hold camera steady and tap to focus' });
    } else {
      callback({ status: 'good', color: '#22c55e', msg: '✅ Good image quality — ready to analyze' });
    }
  };
  img.onerror = () => { URL.revokeObjectURL(url); callback({ status: 'good', color: '#22c55e', msg: '✅ Image loaded' }); };
  img.src = url;
}

function renderQualityBar(result) {
  let bar = document.getElementById('quality-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'quality-bar';
    bar.style.cssText = 'margin-top:10px;padding:8px 12px;border-radius:10px;font-size:.78rem;font-weight:600;display:flex;align-items:center;gap:8px;transition:all .3s;';
    const dz = document.getElementById('dz');
    if (dz) dz.parentNode.insertBefore(bar, dz.nextSibling);
  }
  bar.style.background = result.color + '18';
  bar.style.border = `1px solid ${result.color}44`;
  bar.style.color = result.color;
  bar.textContent = result.msg;
}

// ── Scan: file select ─────────────────────────────────────────────────────────
function onFileSelect(file) {
  if (!file) return;
  if (!['image/jpeg','image/png','image/jpg','image/webp'].includes(file.type)) {
    alert('Please upload a JPEG or PNG image.');
    return;
  }
  currentFile = file;
  const preview = document.getElementById('dz-preview');
  const empty = document.getElementById('dz-empty');
  const btnScan = document.getElementById('btn-scan');
  if (preview) {
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
  }
  if (empty) empty.style.display = 'none';
  if (btnScan) btnScan.disabled = true; // disable until quality check passes

  checkImageQuality(file, result => {
    renderQualityBar(result);
    if (btnScan) btnScan.disabled = (result.status === 'bad');
  });
}

// ── Scan: drag-drop ───────────────────────────────────────────────────────────
(function initDragDrop() {
  const dz = document.getElementById('dz');
  if (!dz) return;
  // Click on drop zone (but not on the button inside) opens file picker
  dz.addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON') return;
    document.getElementById('file-in').click();
  });
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) onFileSelect(f);
  });
})();

// ── Mobile nav sync ───────────────────────────────────────────────────────────
function syncMobNav(btn) {
  document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ── Scan: run ─────────────────────────────────────────────────────────────────
async function runScan() {
  if (!currentFile) return;

  // Anonymous scan gate
  const session = getSession();
  if (!session || !session.token) {
    const used = parseInt(localStorage.getItem('kr_anon_scans') || '0');
    if (used >= 1) {
      showLoginModal();
      return;
    }
  }

  const progress = document.getElementById('scan-progress');
  const btnScan = document.getElementById('btn-scan');
  if (progress) progress.style.display = 'block';
  if (btnScan) btnScan.disabled = true;

  setProgress(10);
  setStep('sp1', 'active');
  setStep('sp2', '');
  setStep('sp3', '');

  const fd = new FormData();
  fd.append('file', currentFile);
  fd.append('session_id', getSessionId());
  fd.append('save_history', session ? 'true' : 'false');

  try {
    setProgress(30);
    setStep('sp1', 'done');
    setStep('sp2', 'active');

    const res = await fetch(API + '/predict', { method: 'POST', body: fd });
    setProgress(70);
    setStep('sp2', 'done');
    setStep('sp3', 'active');

    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.status);
    const data = await res.json();

    setProgress(100);
    setStep('sp3', 'done');

    // Track anonymous scan usage
    if (!session || !session.token) {
      localStorage.setItem('kr_anon_scans', '1');
    }

    currentResult = data;
    saveLastDiagnosis(data.top_prediction);
    renderResult(data);

    // Show "login to save" banner for anonymous users
    if (!session || !session.token) {
      showAnonBanner();
    }
  } catch (err) {
    const errMsg = err.message || 'Unknown error';
    const progress2 = document.getElementById('scan-progress');
    if (progress2) progress2.style.display = 'none';
    const errBanner = document.createElement('div');
    errBanner.style.cssText = 'margin-top:12px;padding:12px 16px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);border-radius:10px;color:#f87171;font-size:.83rem;';
    errBanner.textContent = '❌ Scan failed: ' + errMsg;
    document.getElementById('sec-scan')?.querySelector('.scan-hero')?.after(errBanner);
    setTimeout(() => errBanner.remove(), 5000);
    if (btnScan) btnScan.disabled = false;
  } finally {
    setTimeout(() => {
      if (progress) progress.style.display = 'none';
      setProgress(0);
    }, 500);
  }
}

function showAnonBanner() {
  const existing = document.getElementById('anon-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'anon-banner';
  banner.style.cssText = 'margin-top:16px;padding:14px 18px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.25);border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;';
  banner.innerHTML = `
    <div style="font-size:.85rem;color:#f0fdf4;">🌾 <strong>Login to save this result</strong>, get PDF reports, scan history & weather alerts</div>
    <a href="login.html" style="padding:8px 18px;background:#22c55e;border-radius:8px;color:#0a1a0e;font-weight:700;font-size:.82rem;text-decoration:none;white-space:nowrap;">Login Free →</a>`;
  document.getElementById('result-card')?.after(banner);
}

function showLoginModal() {
  let modal = document.getElementById('login-gate-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'login-gate-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="background:#0c1f12;border:1px solid rgba(34,197,94,.3);border-radius:20px;padding:32px;max-width:420px;width:100%;text-align:center;">
        <div style="font-size:2.5rem;margin-bottom:12px;">🌾</div>
        <h2 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;margin-bottom:10px;">You've used your free scan!</h2>
        <p style="font-size:.85rem;color:rgba(134,239,172,.6);line-height:1.6;margin-bottom:20px;">Login to unlock unlimited scans, save history, get PDF reports, weather alerts and the Krishi Mitra AI advisor.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <a href="login.html" style="padding:11px 28px;background:#22c55e;border-radius:10px;color:#0a1a0e;font-weight:700;font-size:.9rem;text-decoration:none;">Login / Register Free</a>
          <button onclick="document.getElementById('login-gate-modal').remove()" style="padding:11px 20px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:rgba(240,253,242,.6);font-size:.85rem;cursor:pointer;">Maybe later</button>
        </div>
        <p style="font-size:.72rem;color:rgba(134,239,172,.3);margin-top:16px;">Join 12,847+ farmers already using Krishi Rakshak</p>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
}

// ── Scan: save to localStorage ────────────────────────────────────────────────
function saveLastDiagnosis(top) {
  try {
    localStorage.setItem('kr_last_diagnosis', JSON.stringify({
      disease:    top.display_name,
      confidence: top.confidence,
      severity:   top.confidence_severity || top.graded_severity || 'moderate',
      crop:       top.crop || '',
      timestamp:  new Date().toISOString(),
    }));
  } catch {}
}

// ── Scan: render result ───────────────────────────────────────────────────────
const SEV_COLORS = { healthy: '#22c55e', early: '#86efac', moderate: '#fbbf24', severe: '#ef4444' };
const SEV_LABELS = { healthy: 'Healthy ✓', early: 'Early Stage', moderate: 'Moderate', severe: 'Severe ⚠' };

// ── First-line treatment map (FIX 2) ─────────────────────────────────────────
const IMMEDIATE_ACTION = {
  // Banana
  'banana_cordana':        { action: 'Apply Mancozeb 75% WP @ 2.5g/L or Carbendazim 50% WP @ 1g/L. Spray every 10 days.', days: 3 },
  'banana_pestalotiopsis': { action: 'Apply Copper Oxychloride 50% WP @ 3g/L. Remove infected leaves immediately.', days: 2 },
  'banana_sigatoka':       { action: 'Apply Propiconazole 25% EC @ 1ml/L or Tridemorph 80% EC @ 0.5ml/L. Spray fortnightly.', days: 3 },
  // Chilli
  'chilli_anthracnose':    { action: 'Apply Carbendazim 50% WP @ 1g/L + Mancozeb 75% WP @ 2g/L. Repeat after 7 days.', days: 2 },
  'chilli_leaf_curl_virus':{ action: 'Control whitefly vector with Imidacloprid 17.8% SL @ 0.3ml/L. Remove infected plants.', days: 1 },
  'chilli_leaf_spot':      { action: 'Apply Copper Hydroxide 77% WP @ 2g/L. Avoid overhead irrigation.', days: 3 },
  // Corn/Maize
  'corn_gray_leaf_spot':   { action: 'Apply Azoxystrobin 23% SC @ 1ml/L or Propiconazole 25% EC @ 1ml/L. Spray at first sign.', days: 3 },
  'corn_common_rust':      { action: 'Apply Mancozeb 75% WP @ 2.5g/L. Spray in early morning. Repeat after 10 days.', days: 3 },
  'corn_northern_blight':  { action: 'Apply Propiconazole 25% EC @ 1ml/L or Tebuconazole 250 EW @ 1ml/L. Two sprays 14 days apart.', days: 3 },
  // Mango
  'mango_anthracnose':     { action: 'Apply Carbendazim 50% WP @ 1g/L or Copper Oxychloride 50% WP @ 3g/L. Spray at fruit set.', days: 3 },
  'mango_powdery_mildew':  { action: 'Apply Wettable Sulphur 80% WP @ 3g/L or Hexaconazole 5% SC @ 2ml/L. Spray at flowering.', days: 2 },
  'mango_bacterial_canker':{ action: 'Apply Copper Oxychloride 50% WP @ 3g/L. Prune infected branches 15cm below lesion.', days: 1 },
  // Paddy
  'paddy_blast':           { action: 'Apply Tricyclazole 75% WP @ 0.6g/L or Isoprothiolane 40% EC @ 1.5ml/L. Spray immediately.', days: 1 },
  'paddy_bacterial_leaf_blight': { action: 'Apply Copper Oxychloride 50% WP @ 3g/L. Drain field and avoid excess N fertiliser.', days: 2 },
  'paddy_brown_spot':      { action: 'Apply Mancozeb 75% WP @ 2.5g/L or Edifenphos 50% EC @ 1ml/L. Spray at boot stage.', days: 3 },
  'paddy_hispa':           { action: 'Apply Chlorpyrifos 20% EC @ 2ml/L or Monocrotophos 36% SL @ 1.5ml/L. Clip leaf tips.', days: 2 },
  // Potato
  'potato_early_blight':   { action: 'Apply Mancozeb 75% WP @ 2.5g/L or Chlorothalonil 75% WP @ 2g/L. Spray every 7-10 days.', days: 3 },
  'potato_late_blight':    { action: 'Apply Metalaxyl 8% + Mancozeb 64% WP @ 2.5g/L IMMEDIATELY. This spreads fast.', days: 1 },
  // Sugarcane
  'sugarcane_red_rot':     { action: 'Destroy infected stools. Treat setts with Carbendazim 50% WP @ 1g/L for 30 min before planting.', days: 1 },
  'sugarcane_woolly_aphid':{ action: 'Apply Chlorpyrifos 20% EC @ 2ml/L or release Aphelinus mali parasitoid. Avoid water stress.', days: 2 },
  // Tomato
  'tomato_early_blight':   { action: 'Apply Mancozeb 75% WP @ 2.5g/L or Chlorothalonil 75% WP @ 2g/L. Spray every 7 days.', days: 3 },
  'tomato_late_blight':    { action: 'Apply Metalaxyl 8% + Mancozeb 64% WP @ 2.5g/L. Remove infected plants. Spray every 5 days.', days: 1 },
  'tomato_leaf_mold':      { action: 'Apply Copper Hydroxide 77% WP @ 2g/L. Improve ventilation. Avoid wetting foliage.', days: 3 },
  'tomato_bacterial_spot': { action: 'Apply Copper Oxychloride 50% WP @ 3g/L. Avoid overhead irrigation. Remove infected leaves.', days: 2 },
  'tomato_septoria_leaf_spot': { action: 'Apply Mancozeb 75% WP @ 2.5g/L or Chlorothalonil 75% WP @ 2g/L. Mulch around plants.', days: 3 },
  // Wheat
  'wheat_brown_rust':      { action: 'Apply Propiconazole 25% EC @ 0.1% or Tebuconazole 250 EW @ 1ml/L. Spray in early morning. Repeat after 15 days.', days: 2 },
  'wheat_yellow_rust':     { action: 'Apply Propiconazole 25% EC @ 1ml/L or Hexaconazole 5% SC @ 2ml/L. Act fast — spreads rapidly.', days: 1 },
};

function getImmediateAction(diseaseName) {
  const key = (diseaseName || '').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
  // Try exact match first, then partial
  if (IMMEDIATE_ACTION[key]) return IMMEDIATE_ACTION[key];
  for (const k of Object.keys(IMMEDIATE_ACTION)) {
    if (key.includes(k.split('_')[1]) || k.includes(key.split('_').slice(1).join('_'))) {
      return IMMEDIATE_ACTION[k];
    }
  }
  return null;
}

// ── Heatmap overlay (FIX 3) ──────────────────────────────────────────────────
let heatmapVisible = false;

function buildHeatmap(imgEl) {
  const existing = document.getElementById('heatmap-canvas');
  if (existing) { existing.remove(); heatmapVisible = false; return; }

  const canvas = document.createElement('canvas');
  canvas.id = 'heatmap-canvas';
  canvas.width = imgEl.naturalWidth || imgEl.width;
  canvas.height = imgEl.naturalHeight || imgEl.height;
  canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;border-radius:14px;pointer-events:none;`;

  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  // Draw source image to sample pixels
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').drawImage(imgEl, 0, 0, w, h);
  const pixels = tmp.getContext('2d').getImageData(0, 0, w, h).data;

  // Find high-saturation regions (disease spots = color anomalies)
  const gridW = 8, gridH = 8;
  const cellW = w / gridW, cellH = h / gridH;
  let maxSat = 0, hotspots = [];

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      let satSum = 0, count = 0;
      const x0 = Math.floor(gx * cellW), y0 = Math.floor(gy * cellH);
      const x1 = Math.floor((gx + 1) * cellW), y1 = Math.floor((gy + 1) * cellH);
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * w + x) * 4;
          const r = pixels[i] / 255, g = pixels[i+1] / 255, b = pixels[i+2] / 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          satSum += max === 0 ? 0 : (max - min) / max;
          count++;
        }
      }
      const avgSat = count ? satSum / count : 0;
      if (avgSat > maxSat) maxSat = avgSat;
      hotspots.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, sat: avgSat });
    }
  }

  // Draw top 3 hotspots as ellipses
  hotspots.sort((a, b) => b.sat - a.sat);
  const top3 = hotspots.slice(0, 3);
  top3.forEach((hs, i) => {
    const alpha = 0.35 - i * 0.08;
    const rx = cellW * 1.2, ry = cellH * 1.2;
    const grad = ctx.createRadialGradient(hs.cx, hs.cy, 0, hs.cx, hs.cy, Math.max(rx, ry));
    grad.addColorStop(0, `rgba(239,68,68,${alpha})`);
    grad.addColorStop(0.5, `rgba(251,146,60,${alpha * 0.6})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(hs.cx, hs.cy * (rx / ry), rx, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  });

  // Label
  ctx.fillStyle = 'rgba(239,68,68,0.9)';
  ctx.font = `bold ${Math.max(10, w * 0.04)}px sans-serif`;
  ctx.fillText('AI Focus Areas', 8, Math.max(16, w * 0.05));

  imgEl.parentElement.style.position = 'relative';
  imgEl.parentElement.appendChild(canvas);
  heatmapVisible = true;
}

function toggleHeatmap() {
  const imgEl = document.getElementById('rc-img');
  const btn = document.getElementById('heatmap-btn');
  if (!imgEl || !imgEl.src || imgEl.src === window.location.href) return;
  buildHeatmap(imgEl);
  if (btn) btn.textContent = heatmapVisible ? '🔍 Hide AI Focus' : '🔍 Show AI Focus Area';
}

// ── Crop profile update toast (FIX 4) ────────────────────────────────────────
function showCropUpdateToast(detectedCrop) {
  if (!detectedCrop) return;
  localStorage.setItem('kr_last_scanned_crop', detectedCrop);
  const s = getSession();
  const profile = (() => { try { return JSON.parse(localStorage.getItem('kr_farmer_profile')); } catch { return null; } })();
  const currentCrop = profile?.crops?.[0] || s?.crop || '';
  if (currentCrop.toLowerCase() === detectedCrop.toLowerCase()) return; // already matches

  const toast = document.createElement('div');
  toast.id = 'crop-toast';
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0c1f12;border:1px solid rgba(34,197,94,.3);border-radius:12px;padding:12px 18px;display:flex;align-items:center;gap:12px;z-index:8000;box-shadow:0 8px 32px rgba(0,0,0,.4);font-size:.82rem;white-space:nowrap;';
  toast.innerHTML = `
    <span style="color:#f0fdf4;">🌱 Crop detected: <strong>${escHtml(detectedCrop)}</strong> — update your profile?</span>
    <button onclick="updateProfileCrop('${escHtml(detectedCrop)}')" style="padding:5px 12px;background:#22c55e;border:none;border-radius:7px;color:#0a1a0e;font-weight:700;font-size:.78rem;cursor:pointer;">Yes</button>
    <button onclick="document.getElementById('crop-toast')?.remove()" style="padding:5px 10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:7px;color:rgba(240,253,242,.5);font-size:.78rem;cursor:pointer;">Skip</button>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}

function updateProfileCrop(crop) {
  try {
    const profile = JSON.parse(localStorage.getItem('kr_farmer_profile') || '{}');
    profile.crops = [crop];
    localStorage.setItem('kr_farmer_profile', JSON.stringify(profile));
    const sbCrop = document.getElementById('sb-crop');
    if (sbCrop) sbCrop.textContent = crop;
  } catch {}
  document.getElementById('crop-toast')?.remove();
}

function renderResult(data) {
  const top = data.top_prediction;
  const sev = top.confidence_severity || top.graded_severity || 'moderate';
  const pct = Math.round(top.confidence * 100);
  const color = SEV_COLORS[sev] || '#8b5cf6';
  const label = SEV_LABELS[sev] || sev.toUpperCase();
  const cropName = top.crop || 'Unknown Crop';

  // Banner
  const banner = document.getElementById('rc-banner');
  if (banner) { banner.className = 'rc-banner sev-' + sev; banner.style.color = color; }

  // Image + badge
  const rcImg = document.getElementById('rc-img');
  const rcBadge = document.getElementById('rc-img-badge');
  if (rcImg && currentFile) {
    rcImg.src = URL.createObjectURL(currentFile);
    rcImg.onload = () => { heatmapVisible = false; document.getElementById('heatmap-canvas')?.remove(); };
  }
  if (rcBadge) { rcBadge.textContent = label; rcBadge.style.cssText = `background:${color};color:#0a1a0e;`; }

  // Crop tag
  const cropTag = document.getElementById('rc-crop-tag');
  if (cropTag) cropTag.textContent = cropName.toUpperCase() + ' · AI DIAGNOSIS';

  // Name + desc
  const rcName = document.getElementById('rc-name');
  const rcDesc = document.getElementById('rc-desc');
  if (rcName) rcName.textContent = top.display_name;
  if (rcDesc) rcDesc.textContent = top.description || '';

  // FIX 1: Confidence bar always BLUE, label = "AI ACCURACY"
  const rcConfFill = document.getElementById('rc-conf-fill');
  const rcConfPct = document.getElementById('rc-conf-pct');
  const rcConfText = document.querySelector('.rc-conf-text');
  if (rcConfFill) { rcConfFill.style.width = pct + '%'; rcConfFill.style.background = 'linear-gradient(90deg,#3b82f6,#60a5fa)'; }
  if (rcConfPct) { rcConfPct.textContent = pct + '% accurate'; rcConfPct.style.color = '#60a5fa'; }
  if (rcConfText) rcConfText.innerHTML = 'AI ACCURACY <span title="This shows how confident the AI is in its identification, not how severe the disease is" style="cursor:help;opacity:.6">ℹ️</span>';

  // FIX 2: Immediate action banner
  const immAction = getImmediateAction(top.display_name);
  let immHtml = '';
  if (sev !== 'healthy' && immAction) {
    const bgMap = { severe: '#7f1d1d', moderate: '#78350f', early: '#1c3a1c' };
    const bdMap = { severe: '#ef4444', moderate: '#f59e0b', early: '#22c55e' };
    const bg = bgMap[sev] || '#1c3a1c';
    const bd = bdMap[sev] || '#22c55e';
    const icon = sev === 'severe' ? '⚡ IMMEDIATE ACTION REQUIRED' : '✅ RECOMMENDED ACTION';
    immHtml = `
      <div id="imm-action-banner" style="margin-bottom:14px;padding:14px 16px;background:${bg};border-left:4px solid ${bd};border-radius:0 10px 10px 0;border:1px solid ${bd}33;border-left:4px solid ${bd};">
        <div style="font-size:.68rem;font-weight:800;color:${bd};text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">${icon}</div>
        <div style="font-size:.83rem;color:#f0fdf4;line-height:1.6;margin-bottom:10px;">${escHtml(immAction.action)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <span style="font-size:.72rem;color:rgba(240,253,242,.5);">⏱️ Apply within ${immAction.days} day${immAction.days > 1 ? 's' : ''}</span>
          <a href="https://www.google.com/maps/search/agricultural+store+near+me" target="_blank" rel="noopener" style="padding:5px 12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:7px;color:#f0fdf4;font-size:.72rem;text-decoration:none;">📍 Find nearest agro store</a>
        </div>
      </div>`;
  }

  // FIX 3: Heatmap toggle button (inject into image wrap)
  setTimeout(() => {
    const wrap = document.querySelector('.rc-img-wrap');
    if (wrap && !document.getElementById('heatmap-btn')) {
      const btn = document.createElement('button');
      btn.id = 'heatmap-btn';
      btn.textContent = '🔍 Show AI Focus Area';
      btn.style.cssText = 'position:absolute;bottom:-28px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:3px 10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:99px;color:rgba(134,239,172,.6);font-size:.65rem;cursor:pointer;';
      btn.onclick = toggleHeatmap;
      wrap.style.paddingBottom = '32px';
      wrap.appendChild(btn);
    }
  }, 100);

  // FIX 6: Improved WhatsApp message
  const waBtn = document.getElementById('rc-wa');
  if (waBtn) {
    const treat = Array.isArray(top.treatment) ? top.treatment.slice(0, 2).join('\n• ') : (top.treatment || '');
    const immLine = immAction ? immAction.action : treat;
    const waText = `🌾 *Krishi Rakshak Diagnosis Report*\n━━━━━━━━━━━━━━━\n🌿 Crop: ${cropName}\n🦠 Disease: ${top.display_name}\n⚠️ Severity: ${label}\n🎯 AI Accuracy: ${pct}%\n📅 Date: ${new Date().toLocaleDateString('en-IN')}\n\n💊 *Immediate Treatment:*\n${immLine}\n\n🔗 Diagnosed by Krishi Rakshak AI — Free for Indian Farmers\n━━━━━━━━━━━━━━━`;
    waBtn.onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(waText), '_blank');
  }

  // Inject immediate action banner before tabs
  const tabsEl = document.querySelector('.rc-tabs');
  const existingImm = document.getElementById('imm-action-banner');
  if (existingImm) existingImm.remove();
  if (immHtml && tabsEl) tabsEl.insertAdjacentHTML('beforebegin', immHtml);

  const card = document.getElementById('result-card');
  if (card) { card.classList.add('show'); card.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  // FIX 4: Crop profile update toast
  setTimeout(() => showCropUpdateToast(cropName), 1500);

  // Default tab
  rcTab(document.querySelector('.rc-tab'), 'symptoms');
}

// ── Scan: tab switcher (FIX 5) ───────────────────────────────────────────────
const DISEASE_PEAK_MONTHS = {
  'blast': [6,7,8,9], 'blight': [7,8,9,10], 'rust': [10,11,12,1,2],
  'mildew': [3,4,5,10,11], 'spot': [7,8,9], 'rot': [6,7,8],
  'anthracnose': [6,7,8,9], 'sigatoka': [7,8,9,10], 'hispa': [7,8,9],
};

function getPeakMonths(diseaseName) {
  const d = (diseaseName || '').toLowerCase();
  for (const [key, months] of Object.entries(DISEASE_PEAK_MONTHS)) {
    if (d.includes(key)) return months;
  }
  return [7, 8, 9];
}

const TREATMENT_PRODUCTS = {
  'blast':     [{ name:'Tricyclazole 75% WP', dose:'0.6g/L', price:'₹180-220/acre', link:'Tricyclazole' }, { name:'Isoprothiolane 40% EC', dose:'1.5ml/L', price:'₹150-180/acre', link:'Isoprothiolane' }],
  'blight':    [{ name:'Metalaxyl+Mancozeb WP', dose:'2.5g/L', price:'₹200-250/acre', link:'Metalaxyl+Mancozeb' }, { name:'Chlorothalonil 75% WP', dose:'2g/L', price:'₹120-150/acre', link:'Chlorothalonil' }],
  'rust':      [{ name:'Propiconazole 25% EC', dose:'1ml/L', price:'₹160-200/acre', link:'Propiconazole' }, { name:'Tebuconazole 250 EW', dose:'1ml/L', price:'₹180-220/acre', link:'Tebuconazole' }],
  'mildew':    [{ name:'Wettable Sulphur 80% WP', dose:'3g/L', price:'₹80-100/acre', link:'Wettable+Sulphur' }, { name:'Hexaconazole 5% SC', dose:'2ml/L', price:'₹140-170/acre', link:'Hexaconazole' }],
  'default':   [{ name:'Mancozeb 75% WP', dose:'2.5g/L', price:'₹100-130/acre', link:'Mancozeb' }, { name:'Carbendazim 50% WP', dose:'1g/L', price:'₹120-150/acre', link:'Carbendazim' }, { name:'Copper Oxychloride 50% WP', dose:'3g/L', price:'₹90-120/acre', link:'Copper+Oxychloride' }],
};

function getProducts(diseaseName) {
  const d = (diseaseName || '').toLowerCase();
  for (const [key, prods] of Object.entries(TREATMENT_PRODUCTS)) {
    if (key !== 'default' && d.includes(key)) return prods;
  }
  return TREATMENT_PRODUCTS.default;
}

function rcTab(btn, tab) {
  document.querySelectorAll('.rc-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const content = document.getElementById('rc-tab-content');
  if (!content || !currentResult) return;

  const top = currentResult.top_prediction;
  const diseaseName = top.display_name || '';

  switch (tab) {
    case 'symptoms': {
      const items = Array.isArray(top.symptoms) ? top.symptoms : (top.symptoms ? [top.symptoms] : []);
      const sev = top.confidence_severity || top.graded_severity || 'moderate';
      const stageMap = { healthy: 'None', early: 'Early', moderate: 'Mid', severe: 'Advanced' };
      const stageColor = { healthy: '#22c55e', early: '#86efac', moderate: '#fbbf24', severe: '#ef4444' };
      const stageBadge = `<div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:${stageColor[sev]}18;border:1px solid ${stageColor[sev]}44;border-radius:99px;font-size:.7rem;font-weight:600;color:${stageColor[sev]};margin-bottom:12px;">Stage of infection visible: ${stageMap[sev] || 'Unknown'}</div>`;
      if (!items.length) { content.innerHTML = stageBadge + '<div style="color:rgba(134,239,172,.4);font-size:.83rem">No symptom data available.</div>'; return; }
      content.innerHTML = stageBadge + items.map((item, i) => {
        const icon = i < Math.ceil(items.length / 2) ? '🔴' : '🟡';
        return `<div class="rc-list-item"><span class="ri-icon">${icon}</span><span>${escHtml(item)}</span></div>`;
      }).join('');
      break;
    }
    case 'treatment': {
      const items = Array.isArray(top.treatment) ? top.treatment : (top.treatment ? [top.treatment] : []);
      const timings = ['Within 24 hours', 'Days 3–7', 'Day 14–15'];
      const costs = ['₹100–150/acre', '₹150–200/acre', '₹100–150/acre'];
      const stepperHtml = items.length ? `
        <div style="display:flex;gap:0;margin-bottom:16px;overflow-x:auto;padding-bottom:4px;">
          ${items.slice(0, 3).map((step, i) => `
            <div style="flex:1;min-width:140px;padding:12px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:${i===0?'10px 0 0 10px':i===items.slice(0,3).length-1?'0 10px 10px 0':'0'};border-right:${i<items.slice(0,3).length-1?'none':'1px solid rgba(34,197,94,.15)'};">
              <div style="font-family:'JetBrains Mono',monospace;font-size:.6rem;color:rgba(134,239,172,.4);margin-bottom:4px;">STEP ${i+1}</div>
              <div style="font-size:.8rem;color:#f0fdf4;line-height:1.5;margin-bottom:8px;">${escHtml(step)}</div>
              <div style="font-size:.68rem;color:rgba(134,239,172,.5);">⏱️ ${timings[i] || 'As needed'}</div>
              <div style="font-size:.68rem;color:rgba(134,239,172,.4);">💰 ${costs[i] || '₹100–200/acre'}</div>
            </div>`).join('<div style="width:1px;background:rgba(34,197,94,.2);flex-shrink:0;"></div>')}
        </div>` : '';

      const products = getProducts(diseaseName);
      const productsHtml = `
        <div style="font-size:.65rem;color:rgba(134,239,172,.45);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;">Recommended Products</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${products.map(p => `
            <div style="padding:12px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <div style="flex:1;min-width:140px;">
                <div style="font-size:.83rem;font-weight:600;margin-bottom:2px;">${escHtml(p.name)}</div>
                <div style="font-size:.72rem;color:rgba(134,239,172,.5);">Dose: ${escHtml(p.dose)} · ${escHtml(p.price)}</div>
              </div>
              <a href="https://www.agrostar.in/search?q=${encodeURIComponent(p.link)}" target="_blank" rel="noopener" style="padding:5px 12px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);border-radius:7px;color:#4ade80;font-size:.72rem;text-decoration:none;white-space:nowrap;">🛒 AgroStar</a>
            </div>`).join('')}
        </div>`;

      content.innerHTML = stepperHtml + productsHtml;
      break;
    }
    case 'prevention': {
      const items = Array.isArray(top.prevention) ? top.prevention : (top.prevention ? [top.prevention] : []);
      const peakMonths = getPeakMonths(diseaseName);
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const calHtml = `
        <div style="margin-bottom:14px;">
          <div style="font-size:.65rem;color:rgba(134,239,172,.45);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;">Peak Disease Season</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${monthNames.map((m, i) => {
              const isPeak = peakMonths.includes(i + 1);
              return `<div style="padding:4px 8px;border-radius:6px;font-size:.68rem;font-weight:${isPeak?'700':'400'};background:${isPeak?'rgba(239,68,68,.15)':'rgba(255,255,255,.03)'};border:1px solid ${isPeak?'rgba(239,68,68,.3)':'rgba(255,255,255,.06)'};color:${isPeak?'#f87171':'rgba(134,239,172,.35)'};">${m}</div>`;
            }).join('')}
          </div>
        </div>`;

      const listHtml = items.map(i => `<div class="rc-list-item"><span class="ri-icon">🛡️</span><span>${escHtml(i)}</span></div>`).join('');

      const reminderHtml = `
        <button onclick="setDiseaseReminder('${escHtml(diseaseName)}')" style="margin-top:12px;padding:8px 16px;background:rgba(168,255,62,.08);border:1px solid rgba(168,255,62,.2);border-radius:8px;color:#a8ff3e;font-size:.78rem;cursor:pointer;width:100%;">
          🔔 Set reminder before peak season
        </button>`;

      content.innerHTML = calHtml + (listHtml || '<div style="color:rgba(134,239,172,.4);font-size:.83rem">No prevention data.</div>') + reminderHtml;
      break;
    }
    case 'alts': {
      const alts = currentResult.top_k || [];
      const pct = currentResult.top_prediction?.confidence ? Math.round(currentResult.top_prediction.confidence * 100) : 100;
      const lowConfBanner = pct < 75 ? `<div style="padding:10px 14px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:10px;font-size:.78rem;color:#fbbf24;margin-bottom:12px;">⚠️ Confidence below 75% — try scanning again with better lighting for a more accurate result.<br/><button onclick="resetScan()" style="margin-top:6px;padding:4px 12px;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.3);border-radius:6px;color:#fbbf24;font-size:.72rem;cursor:pointer;">🔄 Scan Again</button></div>` : '';
      const differentiators = ['Check leaf shape', 'Look at lesion color', 'Check stem/root', 'Compare with healthy leaf'];
      content.innerHTML = lowConfBanner + (alts.length
        ? alts.map((a, i) => `
            <div class="rc-list-item" style="flex-direction:column;gap:4px;">
              <div style="display:flex;align-items:center;gap:10px;width:100%;">
                <span style="flex:1;font-weight:600;">${escHtml(a.display_name)}</span>
                <span style="font-family:'JetBrains Mono',monospace;font-size:.75rem;color:#a8ff3e">${a.confidence_pct || Math.round(a.confidence * 100) + '%'}</span>
              </div>
              <div style="font-size:.72rem;color:rgba(134,239,172,.45);">🔍 ${differentiators[i] || 'Compare symptoms carefully'}</div>
            </div>`).join('')
        : '<div style="color:rgba(134,239,172,.4);font-size:.83rem">No alternatives available.</div>');
      break;
    }
  }
}

function setDiseaseReminder(diseaseName) {
  if (!('Notification' in window)) { alert('Notifications not supported in this browser.'); return; }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      new Notification('🌾 Krishi Rakshak Reminder', {
        body: `Inspect your crop for ${diseaseName} — peak season is approaching. Check leaves carefully.`,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M20 4C13 10 11 17 13 24a7 7 0 0014 0c2-7 0-14-7-20z" fill="%2322c55e"/></svg>'
      });
      alert('✅ Reminder set! You\'ll be notified before peak disease season.');
    } else {
      alert('Please allow notifications to set reminders.');
    }
  });
}

// ── Scan: reset ───────────────────────────────────────────────────────────────
function resetScan() {
  currentFile = null;
  currentResult = null;

  const preview = document.getElementById('dz-preview');
  const empty = document.getElementById('dz-empty');
  const btnScan = document.getElementById('btn-scan');
  const card = document.getElementById('result-card');
  const fileIn = document.getElementById('file-in');
  const banner = document.getElementById('rc-banner');
  const rcBadge = document.getElementById('rc-img-badge');
  const rcName = document.getElementById('rc-name');
  const rcDesc = document.getElementById('rc-desc');
  const rcConfFill = document.getElementById('rc-conf-fill');
  const rcConfPct = document.getElementById('rc-conf-pct');
  const cropTag = document.getElementById('rc-crop-tag');

  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (empty) empty.style.display = '';
  if (btnScan) btnScan.disabled = true;
  if (card) card.classList.remove('show');
  if (fileIn) fileIn.value = '';
  if (banner) banner.className = 'rc-banner';
  if (rcBadge) rcBadge.textContent = '—';
  if (rcName) rcName.textContent = '—';
  if (rcDesc) rcDesc.textContent = '';
  if (rcConfFill) { rcConfFill.style.width = '0%'; rcConfFill.style.background = ''; }
  if (rcConfPct) { rcConfPct.textContent = '0%'; rcConfPct.style.color = ''; }
  if (cropTag) cropTag.textContent = 'Crop Detection';

  // Scroll back to top of scan section
  document.getElementById('sec-scan')?.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Scan: export PDF ──────────────────────────────────────────────────────────
function exportPDF() {
  if (!currentResult) return;
  const top = currentResult.top_prediction;
  const sev = top.confidence_severity || top.graded_severity || 'moderate';
  const sevColors = { healthy: '#16a34a', early: '#65a30d', moderate: '#d97706', severe: '#dc2626' };
  const sevColor = sevColors[sev] || '#7c3aed';
  const pct = Math.round(top.confidence * 100);
  const treat = Array.isArray(top.treatment) ? top.treatment : [top.treatment || ''];
  const symptoms = Array.isArray(top.symptoms) ? top.symptoms : [];
  const now = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });
  const session = getSession();
  const farmerName = session?.name || 'Farmer';
  const farmerCrop = session?.crop || top.crop || 'Unknown';
  const imgSrc = document.getElementById('rc-img')?.src || '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Krishi Rakshak — Diagnosis Report</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;color:#1a1a1a;background:#fff;padding:32px;max-width:800px;margin:0 auto;}
  .header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #16a34a;padding-bottom:16px;margin-bottom:24px;}
  .logo{font-size:22px;font-weight:800;color:#15803d;}
  .logo span{font-size:13px;font-weight:400;color:#6b7280;display:block;}
  .report-id{font-size:11px;color:#9ca3af;text-align:right;}
  .section{margin-bottom:22px;}
  .section-title{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:10px;font-weight:700;}
  .result-banner{background:${sevColor}12;border:1.5px solid ${sevColor}44;border-radius:12px;padding:18px 20px;display:flex;align-items:flex-start;gap:20px;}
  .sev-badge{background:${sevColor};color:#fff;font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px;letter-spacing:.06em;display:inline-block;margin-bottom:8px;}
  .disease-name{font-size:20px;font-weight:800;color:#111;margin-bottom:6px;}
  .description{font-size:13px;color:#4b5563;line-height:1.6;}
  .conf-circle{width:80px;height:80px;border-radius:50%;border:5px solid ${sevColor};display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;}
  .conf-pct{font-size:20px;font-weight:800;color:${sevColor};line-height:1;}
  .conf-lbl{font-size:9px;color:#9ca3af;}
  .list-item{display:flex;gap:10px;padding:9px 12px;background:#f9fafb;border-radius:8px;margin-bottom:7px;font-size:13px;color:#374151;line-height:1.5;}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px;}
  .info-item{background:#f3f4f6;border-radius:8px;padding:12px 14px;}
  .info-label{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#9ca3af;margin-bottom:4px;}
  .info-val{font-size:14px;font-weight:700;color:#111;}
  .prevention-box{background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px 16px;font-size:13px;color:#065f46;line-height:1.6;}
  .leaf-img{width:100%;max-height:220px;object-fit:cover;border-radius:10px;border:1px solid #e5e7eb;}
  .footer{border-top:1px solid #e5e7eb;padding-top:14px;margin-top:28px;display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;}
  .disclaimer{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:11px;color:#92400e;margin-top:16px;}
  @media print{body{padding:20px;}}
</style>
</head>
<body>
<div class="header">
  <div class="logo">🌾 Krishi Rakshak<span>AI Crop Disease Intelligence Platform</span></div>
  <div class="report-id">Report Date: ${now}<br/>Farmer: ${farmerName}<br/>Crop: ${farmerCrop}</div>
</div>
${imgSrc ? `<div class="section"><div class="section-title">Scanned Leaf Image</div><img class="leaf-img" src="${imgSrc}" alt="Scanned leaf"/></div>` : ''}
<div class="section">
  <div class="section-title">Diagnosis Result</div>
  <div class="result-banner">
    <div style="flex:1">
      <span class="sev-badge">${sev.toUpperCase()}</span>
      <div class="disease-name">${escHtml(top.display_name)}</div>
      <div class="description">${escHtml(top.description || '')}</div>
    </div>
    <div class="conf-circle">
      <span class="conf-pct">${pct}%</span>
      <span class="conf-lbl">confidence</span>
    </div>
  </div>
</div>
<div class="info-grid">
  <div class="info-item"><div class="info-label">Severity Level</div><div class="info-val" style="color:${sevColor}">${sev.toUpperCase()}</div></div>
  <div class="info-item"><div class="info-label">Crop</div><div class="info-val">${escHtml(top.crop || farmerCrop)}</div></div>
  <div class="info-item"><div class="info-label">AI Confidence</div><div class="info-val">${pct}%</div></div>
  <div class="info-item"><div class="info-label">Model</div><div class="info-val">MobileNetV2 v2</div></div>
</div>
${symptoms.length ? `<div class="section"><div class="section-title">⚠️ Symptoms Detected</div>${symptoms.map(s => `<div class="list-item"><span>⚠️</span>${escHtml(s)}</div>`).join('')}</div>` : ''}
<div class="section">
  <div class="section-title">💊 Recommended Treatment</div>
  ${treat.map(t => `<div class="list-item"><span>✅</span>${escHtml(t)}</div>`).join('')}
</div>
${top.prevention ? `<div class="section"><div class="section-title">🛡️ Prevention</div><div class="prevention-box">${escHtml(Array.isArray(top.prevention) ? top.prevention.join(' ') : top.prevention)}</div></div>` : ''}
<div class="disclaimer">⚠️ This report is generated by AI and is for guidance only. Always consult a certified agronomist or your local KVK before applying treatments.</div>
<div class="footer">
  <span>Krishi Rakshak · AI-Powered Crop Protection</span>
  <span>Generated: ${now}</span>
</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.onload = () => setTimeout(() => win.print(), 300);
}

// ── Camera ────────────────────────────────────────────────────────────────────
function openCamera() {
  const modal = document.getElementById('cam-modal');
  if (modal) modal.style.display = 'flex';
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then(stream => {
      cameraStream = stream;
      const video = document.getElementById('cam-video');
      if (video) { video.srcObject = stream; video.play(); }
    })
    .catch(err => {
      alert('Camera access denied: ' + err.message);
      closeCamera();
    });
}

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const modal = document.getElementById('cam-modal');
  if (modal) modal.style.display = 'none';
  const video = document.getElementById('cam-video');
  if (video) video.srcObject = null;
}

function captureCamera() {
  const video = document.getElementById('cam-video');
  const canvas = document.getElementById('cam-canvas');
  if (!video || !canvas) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    if (!blob) return;
    const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
    closeCamera();
    onFileSelect(file);
  }, 'image/jpeg', 0.92);
}

// ── Weather ───────────────────────────────────────────────────────────────────
const WEATHER_ICONS = {
  sunny: '☀️', partly_cloudy: '⛅', cloudy: '☁️',
  rainy: '🌧️', heavy_rain: '🌧️', thunderstorm: '⛈️',
  foggy: '🌫️', snowy: '❄️',
};

function weatherIcon(code) {
  return WEATHER_ICONS[code] || '🌤️';
}

async function searchWeatherLoc() {
  const input = document.getElementById('weather-loc');
  const q = input ? input.value.trim() : '';
  if (!q) return;
  const content = document.getElementById('weather-content');
  if (content) content.innerHTML = '<div class="spinner"></div>';
  try {
    const geo = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'en' }
    });
    const places = await geo.json();
    if (!places.length) throw new Error('Location not found');
    const { lat, lon } = places[0];
    await fetchWeather(lat, lon);
  } catch (err) {
    if (content) content.innerHTML = `<div style="color:#f87171;font-size:.85rem">Error: ${escHtml(err.message)}</div>`;
  }
}

async function geoWeather() {
  if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
  const content = document.getElementById('weather-content');
  if (content) content.innerHTML = '<div class="spinner"></div>';
  navigator.geolocation.getCurrentPosition(
    pos => fetchWeather(pos.coords.latitude, pos.coords.longitude),
    err => { if (content) content.innerHTML = `<div style="color:#f87171;font-size:.85rem">GPS error: ${escHtml(err.message)}</div>`; }
  );
}

async function fetchWeather(lat, lng) {
  const content = document.getElementById('weather-content');
  if (content) content.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await fetch(`${API}/weather?lat=${lat}&lng=${lng}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    // Cache for AI context
    try { sessionStorage.setItem('kr_weather_cache', JSON.stringify(data)); } catch {}
    renderWeather(data);
  } catch (err) {
    if (content) content.innerHTML = `<div style="color:#f87171;font-size:.85rem">Weather unavailable: ${escHtml(err.message)}</div>`;
  }
}

function renderWeather(data) {
  const content = document.getElementById('weather-content');
  if (!content) return;
  const cur = data.current || {};
  const forecast = data.forecast || [];
  const farmerAlerts = data.farmer_alerts || [];

  const forecastHtml = forecast.map((d, i) => {
    const days = ['Today','Tomorrow','Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const label = i < 2 ? days[i] : (new Date(d.date)).toLocaleDateString('en-IN',{weekday:'short'});
    return `
    <div class="fc-card">
      <div class="fc-day">${label}</div>
      <div class="fc-icon">${weatherIcon(d.icon)}</div>
      <div class="fc-temps">${Math.round(d.temp_max ?? 0)}° / ${Math.round(d.temp_min ?? 0)}°</div>
      <div class="fc-rain">💧 ${d.precip_sum ?? 0}mm</div>
    </div>`;
  }).join('');

  const alertsHtml = farmerAlerts.map(a => `
    <div class="we-alert ${escHtml(a.type || '')}">
      <span>${a.icon || '⚠️'}</span>
      <span>${escHtml(a.message || '')}</span>
    </div>`).join('');

  content.innerHTML = `
    <div class="weather-embed">
      <div class="we-current">
        <div style="font-size:3rem">${weatherIcon(cur.icon)}</div>
        <div>
          <div class="we-temp">${Math.round(cur.temperature ?? 0)}°C</div>
          <div class="we-desc">${escHtml(cur.description || '')}</div>
        </div>
        <div class="we-stats">
          <div class="we-stat"><span class="we-stat-label">Humidity</span><span class="we-stat-val">${cur.humidity_pct ?? '—'}%</span></div>
          <div class="we-stat"><span class="we-stat-label">Wind</span><span class="we-stat-val">${cur.wind_kmh ?? '—'} km/h</span></div>
          <div class="we-stat"><span class="we-stat-label">Rain Prob.</span><span class="we-stat-val">${cur.rain_prob_pct ?? '—'}%</span></div>
        </div>
      </div>
      <div class="forecast-row">${forecastHtml}</div>
      ${alertsHtml ? `<div class="we-alerts">${alertsHtml}</div>` : ''}
    </div>`;
}

// ── Market ────────────────────────────────────────────────────────────────────
function skeletonRows(n) {
  return Array.from({ length: n }, () =>
    `<tr>${Array.from({ length: 4 }, () => `<td><div style="height:14px;background:rgba(255,255,255,.06);border-radius:4px;animation:spin .7s linear infinite"></div></td>`).join('')}</tr>`
  ).join('');
}

async function loadMarket() {
  const crop = document.getElementById('mk-crop')?.value || 'Wheat';
  const state = document.getElementById('mk-state')?.value || 'Maharashtra';
  const content = document.getElementById('market-content');
  if (!content) return;

  // Check sessionStorage cache (1 hour)
  const cacheKey = `mandi_${crop}_${state}`;
  const cached = (() => { try { const c = JSON.parse(sessionStorage.getItem(cacheKey)); if (c && Date.now() - c.ts < 3600000) return c.data; } catch {} return null; })();

  if (cached) {
    renderMarket(cached);
    // Show stale badge if older than 30 min
    const age = Date.now() - ((() => { try { return JSON.parse(sessionStorage.getItem(cacheKey)).ts; } catch { return Date.now(); } })());
    if (age > 1800000) {
      const badge = document.createElement('div');
      badge.style.cssText = 'font-size:.72rem;color:#fbbf24;padding:6px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;margin-bottom:10px;';
      badge.textContent = '⚠️ Data may be outdated — last fetched ' + Math.round(age / 60000) + ' min ago';
      content.prepend(badge);
    }
    return;
  }

  content.innerHTML = `<div style="overflow-x:auto"><table class="market-table"><thead><tr><th>Market</th><th>Min ₹</th><th>Max ₹</th><th>Modal ₹</th></tr></thead><tbody>${skeletonRows(5)}</tbody></table></div>`;

  try {
    const res = await fetch(`${API}/mandi-prices?crop=${encodeURIComponent(crop)}&state=${encodeURIComponent(state)}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    // Cache result
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data })); } catch {}
    // Cache best market for AI context
    try { if (data.best_market) sessionStorage.setItem('kr_mandi_cache', JSON.stringify(data)); } catch {}
    renderMarket(data);
  } catch (err) {
    // Try stale cache on failure
    const stale = (() => { try { return JSON.parse(sessionStorage.getItem(cacheKey))?.data; } catch { return null; } })();
    if (stale) {
      renderMarket(stale);
      const badge = document.createElement('div');
      badge.style.cssText = 'font-size:.72rem;color:#fbbf24;padding:6px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;margin-bottom:10px;';
      badge.textContent = '⚠️ Showing cached data — live prices unavailable';
      content.prepend(badge);
    } else {
      content.innerHTML = `<div style="color:#f87171;font-size:.85rem">Market data unavailable: ${escHtml(err.message)}</div>`;
    }
  }
}

function renderMarket(data) {
  const content = document.getElementById('market-content');
  if (!content) return;
  const markets = data.markets || data.records || [];
  const best = data.best_market || markets[0];

  // Best time to sell recommendation based on trend
  const risingCount = markets.filter(m => m.trend === 'rising').length;
  const fallingCount = markets.filter(m => m.trend === 'falling').length;
  let sellTip = '';
  if (risingCount > fallingCount) {
    sellTip = `<div style="padding:10px 14px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:10px;font-size:.8rem;color:#4ade80;margin-bottom:14px;">📈 Prices are rising across most markets — <strong>good time to sell</strong> in the next 2–3 days.</div>`;
  } else if (fallingCount > risingCount) {
    sellTip = `<div style="padding:10px 14px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:10px;font-size:.8rem;color:#fbbf24;margin-bottom:14px;">📉 Prices are falling — consider <strong>holding stock</strong> for 3–5 days or selling at the best market now.</div>`;
  } else if (markets.length > 0) {
    sellTip = `<div style="padding:10px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:10px;font-size:.8rem;color:rgba(134,239,172,.6);margin-bottom:14px;">→ Prices are stable — sell when transport costs are lowest (early morning).</div>`;
  }

  const bestHtml = best ? `
    <div class="best-market-card">
      <div>
        <div style="font-size:.68rem;color:rgba(134,239,172,.45);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">Best Price Today</div>
        <div class="bmc-name">${escHtml(best.name || '—')}</div>
        <div style="font-size:.78rem;color:rgba(134,239,172,.5)">${escHtml(best.district || '')} ${escHtml(best.state || '')}</div>
      </div>
      <div style="text-align:right">
        <div class="bmc-price">₹${(best.price || best.modal || '—').toLocaleString?.('en-IN') ?? best.price ?? best.modal ?? '—'}</div>
        <div class="bmc-unit">per quintal</div>
      </div>
    </div>` : '';

  const rows = markets.map(m => {
    const trend = m.trend === 'rising' ? 'trend-up' : m.trend === 'falling' ? 'trend-down' : 'trend-stable';
    const arrow = m.trend === 'rising' ? '↑' : m.trend === 'falling' ? '↓' : '→';
    return `<tr>
      <td>${escHtml(m.name || '—')}</td>
      <td>₹${m.min?.toLocaleString('en-IN') ?? '—'}</td>
      <td>₹${m.max?.toLocaleString('en-IN') ?? '—'}</td>
      <td><span class="${trend}">${arrow} ₹${m.modal?.toLocaleString('en-IN') ?? '—'}</span></td>
    </tr>`;
  }).join('');

  content.innerHTML = `
    ${bestHtml}
    ${sellTip}
    <div style="overflow-x:auto">
      <table class="market-table">
        <thead><tr><th>Market</th><th>Min ₹</th><th>Max ₹</th><th>Modal ₹</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="color:rgba(134,239,172,.4)">No data found.</td></tr>'}</tbody>
      </table>
    </div>`;
}

// ── Outbreak Map ──────────────────────────────────────────────────────────────
let leafletLoaded = false;
let outbreakMap = null;

function loadLeaflet() {
  return new Promise((resolve, reject) => {
    if (leafletLoaded) { resolve(); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => { leafletLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function initOutbreakMap() {
  try {
    await loadLeaflet();
    if (!outbreakMap) {
      outbreakMap = L.map('outbreak-map').setView([20.5937, 78.9629], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(outbreakMap);
    }
    const res = await fetch(`${API}/outbreak-map`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const outbreaks = data.outbreaks || data.markers || data || [];
    const sevColorMap = { healthy: '#22c55e', low: '#86efac', moderate: '#fbbf24', high: '#f97316', severe: '#ef4444' };
    outbreaks.forEach(o => {
      if (o.lat == null || o.lng == null) return;
      const color = sevColorMap[o.severity] || '#8b5cf6';
      L.circleMarker([o.lat, o.lng], {
        radius: 8 + (o.count || 1) * 0.5,
        fillColor: color,
        color: color,
        weight: 1,
        opacity: 0.9,
        fillOpacity: 0.45,
      }).bindPopup(`<b>${escHtml(o.disease || 'Unknown')}</b><br>${escHtml(o.location || '')}<br>Severity: ${escHtml(o.severity || '—')}`).addTo(outbreakMap);
    });

    const alerts = document.getElementById('map-alerts');
    if (alerts && data.alerts) {
      alerts.innerHTML = data.alerts.map(a => `<div class="we-alert">${escHtml(a)}</div>`).join('');
    }
  } catch (err) {
    const mapEl = document.getElementById('outbreak-map');
    if (mapEl) mapEl.innerHTML = `<div style="padding:20px;color:#f87171;font-size:.85rem">Map unavailable: ${escHtml(err.message)}</div>`;
  }
}

// ── Forum ─────────────────────────────────────────────────────────────────────
async function loadForumPosts() {
  const list = document.getElementById('forum-posts-list');
  if (!list) return;
  list.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await fetch(`${API}/forum/posts?sort=recent`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    renderForumPosts(data.posts || data);
  } catch (err) {
    list.innerHTML = `<div style="color:#f87171;font-size:.85rem">Could not load posts: ${escHtml(err.message)}</div>`;
  }
}

function renderForumPosts(posts) {
  const list = document.getElementById('forum-posts-list');
  if (!list) return;
  if (!posts || !posts.length) {
    list.innerHTML = '<div style="color:rgba(134,239,172,.4);font-size:.85rem">No posts yet. Be the first to ask!</div>';
    return;
  }
  list.innerHTML = posts.map(p => `
    <div class="forum-post-card">
      <div class="fp-title">${escHtml(p.title || '')}</div>
      <div class="fp-meta">
        <span>${escHtml(p.author || 'Farmer')}</span>
        <span>${timeAgo(p.created_at || p.timestamp)}</span>
        <span>${p.replies ?? 0} replies</span>
        ${p.crop_tag ? `<span class="fp-tag">${escHtml(p.crop_tag)}</span>` : ''}
      </div>
    </div>`).join('');
}

async function postForumQuestion() {
  const title = document.getElementById('forum-title')?.value.trim();
  const body = document.getElementById('forum-body')?.value.trim();
  const crop_tag = document.getElementById('forum-crop')?.value;
  if (!title || !body) { alert('Please fill in title and description.'); return; }

  try {
    const fd = new FormData();
    fd.append('session_id', getSessionId());
    fd.append('title', title);
    fd.append('body', body);
    if (crop_tag) fd.append('crop_tag', crop_tag);
    const res = await fetch(`${API}/forum/posts`, {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) throw new Error(res.status);
    document.getElementById('forum-title').value = '';
    document.getElementById('forum-body').value = '';
    document.getElementById('forum-crop').value = '';
    loadForumPosts();
  } catch (err) {
    alert('Failed to post: ' + err.message);
  }
}

// ── History ───────────────────────────────────────────────────────────────────
let historyItems = [];

async function loadHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  list.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await fetch(`${API}/history/${getSessionId()}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const plants = data.plants || [];
    historyItems = plants.flatMap(p => p.entries.map(e => ({ ...e, plant_label: p.plant_label, trend: p.trend })));
    if (!historyItems.length) {
      list.innerHTML = '<div style="color:rgba(134,239,172,.4);font-size:.85rem">No scan history yet. Run your first scan to see results here.</div>';
      return;
    }
    renderHistoryList(historyItems);
  } catch (err) {
    list.innerHTML = `<div style="color:#f87171;font-size:.85rem">History unavailable: ${escHtml(err.message)}</div>`;
  }
}

function renderHistoryList(items) {
  const list = document.getElementById('history-list');
  if (!list) return;
  const sevColors = { healthy: '#22c55e', early: '#86efac', moderate: '#fbbf24', severe: '#ef4444' };
  const trendIcon = { improving: '📈 Improving', worsening: '📉 Worsening', stable: '→ Stable' };

  // Filter bar
  const filterHtml = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <button onclick="filterHistory('all',this)" style="padding:5px 14px;border-radius:99px;font-size:.72rem;font-weight:600;cursor:pointer;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.3);color:#4ade80;" class="hist-filter active">All</button>
      <button onclick="filterHistory('severe',this)" style="padding:5px 14px;border-radius:99px;font-size:.72rem;font-weight:600;cursor:pointer;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(134,239,172,.5);" class="hist-filter">Severe only</button>
      <button onclick="filterHistory('healthy',this)" style="padding:5px 14px;border-radius:99px;font-size:.72rem;font-weight:600;cursor:pointer;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(134,239,172,.5);" class="hist-filter">Healthy only</button>
      <button onclick="filterHistory('week',this)" style="padding:5px 14px;border-radius:99px;font-size:.72rem;font-weight:600;cursor:pointer;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(134,239,172,.5);" class="hist-filter">Last 7 days</button>
    </div>`;

  const cards = items.map((item, idx) => {
    const sev = item.severity || 'moderate';
    const color = sevColors[sev] || '#8b5cf6';
    const trend = item.trend ? `<span style="font-size:.68rem;color:rgba(134,239,172,.5)">${trendIcon[item.trend] || ''}</span>` : '';
    return `
      <div class="forum-post-card" onclick="openHistoryModal(${idx})" style="cursor:pointer;">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:52px;height:52px;border-radius:8px;background:rgba(255,255,255,.05);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.4rem">🌿</div>
          <div style="flex:1">
            <div style="font-size:.88rem;font-weight:600;margin-bottom:4px">${escHtml(item.disease || item.display_name || '—')}</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span style="font-size:.68rem;font-weight:700;padding:2px 8px;border-radius:99px;background:${color}22;color:${color};border:1px solid ${color}44">${sev.toUpperCase()}</span>
              <span style="font-size:.72rem;color:rgba(134,239,172,.4)">${timeAgo(item.timestamp || item.created_at)}</span>
              ${item.confidence != null ? `<span style="font-size:.72rem;font-family:'JetBrains Mono',monospace;color:#a8ff3e">${Math.round(item.confidence * 100)}%</span>` : ''}
              ${trend}
            </div>
          </div>
          <span style="color:rgba(134,239,172,.3);font-size:.9rem">›</span>
        </div>
      </div>`;
  }).join('');

  list.innerHTML = filterHtml + cards;
}

function filterHistory(type, btn) {
  document.querySelectorAll('.hist-filter').forEach(b => {
    b.style.background = 'rgba(255,255,255,.04)';
    b.style.borderColor = 'rgba(255,255,255,.08)';
    b.style.color = 'rgba(134,239,172,.5)';
  });
  btn.style.background = 'rgba(34,197,94,.15)';
  btn.style.borderColor = 'rgba(34,197,94,.3)';
  btn.style.color = '#4ade80';

  let filtered = historyItems;
  const now = Date.now();
  if (type === 'severe') filtered = historyItems.filter(i => i.severity === 'severe');
  else if (type === 'healthy') filtered = historyItems.filter(i => i.severity === 'healthy');
  else if (type === 'week') filtered = historyItems.filter(i => now - new Date(i.timestamp || i.created_at).getTime() < 7 * 86400000);
  renderHistoryList(filtered);
}

function openHistoryModal(idx) {
  const item = historyItems[idx];
  if (!item) return;
  const sevColors = { healthy: '#22c55e', early: '#86efac', moderate: '#fbbf24', severe: '#ef4444' };
  const color = sevColors[item.severity] || '#8b5cf6';
  const treat = Array.isArray(item.treatment) ? item.treatment : (item.treatment ? [item.treatment] : []);
  const symptoms = Array.isArray(item.symptoms) ? item.symptoms : [];
  const prevention = Array.isArray(item.prevention) ? item.prevention : (item.prevention ? [item.prevention] : []);
  const pct = item.confidence != null ? Math.round(item.confidence * 100) : '—';
  const date = new Date(item.timestamp || item.created_at).toLocaleDateString('en-IN', { dateStyle: 'medium' });

  // WhatsApp share text
  const waText = `🌾 Krishi Rakshak Diagnosis\n\nCrop: ${item.crop || item.plant_label || '—'}\nDisease: ${item.disease || '—'}\nSeverity: ${(item.severity || '').toUpperCase()}\nConfidence: ${pct}%\nDate: ${date}\n\nTreatment: ${treat.slice(0,2).join('. ')}\n\n— Krishi Rakshak`;

  let modal = document.getElementById('history-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'history-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9000;display:flex;align-items:flex-end;justify-content:center;padding:0;';
    modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:#0c1f12;border:1px solid rgba(34,197,94,.2);border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:600px;max-height:85vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
        <span style="font-family:'Syne',sans-serif;font-weight:800;font-size:1rem;">Diagnosis Detail</span>
        <button onclick="document.getElementById('history-modal').style.display='none'" style="background:none;border:none;color:rgba(134,239,172,.5);font-size:1.2rem;cursor:pointer;">✕</button>
      </div>
      <div style="background:${color}12;border:1.5px solid ${color}33;border-radius:14px;padding:16px;margin-bottom:16px;">
        <div style="font-size:.65rem;color:rgba(134,239,172,.5);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">${escHtml(item.crop || item.plant_label || 'Crop')}</div>
        <div style="font-family:'Syne',sans-serif;font-size:1.2rem;font-weight:800;margin-bottom:8px;">${escHtml(item.disease || '—')}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <span style="font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:99px;background:${color}22;color:${color};border:1px solid ${color}44">${(item.severity || '').toUpperCase()}</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:.85rem;color:#a8ff3e">${pct}% confidence</span>
          <span style="font-size:.72rem;color:rgba(134,239,172,.4)">${date}</span>
        </div>
      </div>
      ${symptoms.length ? `<div style="margin-bottom:14px;"><div style="font-size:.65rem;color:rgba(134,239,172,.45);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;">⚠️ Symptoms</div>${symptoms.map(s => `<div style="padding:8px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;margin-bottom:6px;font-size:.82rem;">${escHtml(s)}</div>`).join('')}</div>` : ''}
      ${treat.length ? `<div style="margin-bottom:14px;"><div style="font-size:.65rem;color:rgba(134,239,172,.45);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;">💊 Treatment</div>${treat.map(t => `<div style="padding:8px 12px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:8px;margin-bottom:6px;font-size:.82rem;">✅ ${escHtml(t)}</div>`).join('')}</div>` : ''}
      ${prevention.length ? `<div style="margin-bottom:16px;"><div style="font-size:.65rem;color:rgba(134,239,172,.45);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;">🛡️ Prevention</div>${prevention.map(p => `<div style="padding:8px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;margin-bottom:6px;font-size:.82rem;">${escHtml(p)}</div>`).join('')}</div>` : ''}
      <button onclick="window.open('https://wa.me/?text=${encodeURIComponent(waText)}','_blank')" style="width:100%;padding:12px;background:rgba(37,211,102,.12);border:1px solid rgba(37,211,102,.3);border-radius:10px;color:#25d366;font-weight:600;font-size:.85rem;cursor:pointer;">📱 Share via WhatsApp</button>
    </div>`;
  modal.style.display = 'flex';
}

// ── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  initSidebarUser();
  loadDailyTip();
  loadedSections.add('scan');

  // Auto-load weather if profile has coordinates
  const profile = (() => { try { return JSON.parse(localStorage.getItem('kr_farmer_profile')); } catch { return null; } })();
  if (profile && profile.lat && profile.lng) {
    loadedSections.add('weather');
    fetchWeather(profile.lat, profile.lng);
  }
})();

// ── Inline Chat (Krishi Mitra) ────────────────────────────────────────────────
let icLang = 'English';
const IC_HIST_KEY = 'kr_chat_history';

function icGetHistory() { try { return JSON.parse(localStorage.getItem(IC_HIST_KEY)) || []; } catch { return []; } }
function icSaveHistory(h) { localStorage.setItem(IC_HIST_KEY, JSON.stringify(h.slice(-20))); }

function icSetLang(btn) {
  document.querySelectorAll('.ic-lang').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  icLang = btn.dataset.lang;
}

function icScroll() {
  const el = document.getElementById('ic-messages');
  if (el) el.scrollTop = el.scrollHeight;
}

function icAddMsg(role, text) {
  const el = document.getElementById('ic-messages');
  if (!el) return;
  const div = document.createElement('div');
  div.className = 'ic-msg ' + role;
  const bubble = document.createElement('div');
  bubble.className = 'ic-bubble';
  bubble.textContent = text;
  if (role === 'bot') {
    const av = document.createElement('div');
    av.style.cssText = 'width:28px;height:28px;border-radius:50%;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.2);display:flex;align-items:center;justify-content:center;font-size:.8rem;flex-shrink:0;margin-top:2px;';
    av.textContent = '🌿';
    div.appendChild(av);
  }
  div.appendChild(bubble);
  el.appendChild(div);
  icScroll();
}

function icShowTyping() {
  const el = document.getElementById('ic-messages');
  if (!el) return;
  const div = document.createElement('div');
  div.className = 'ic-msg bot';
  div.id = 'ic-typing';
  div.innerHTML = '<div style="width:28px;height:28px;border-radius:50%;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.2);display:flex;align-items:center;justify-content:center;font-size:.8rem;flex-shrink:0;">🌿</div><div class="ic-typing"><span></span><span></span><span></span></div>';
  el.appendChild(div);
  icScroll();
}
function icHideTyping() { document.getElementById('ic-typing')?.remove(); }

function icGetCtx() {
  try {
    const s = getSession();
    const profile = (() => { try { return JSON.parse(localStorage.getItem('kr_farmer_profile')); } catch { return null; } })();
    const diag = (() => { try { return JSON.parse(localStorage.getItem('kr_last_diagnosis')); } catch { return null; } })();
    const weather = (() => { try { return JSON.parse(sessionStorage.getItem('kr_weather_cache')); } catch { return null; } })();
    const mandi = (() => { try { return JSON.parse(sessionStorage.getItem('kr_mandi_cache')); } catch { return null; } })();

    const crop = profile?.crops?.[0] || s?.crop || 'Unknown';
    const location = profile?.state || s?.state || 'India';
    let ctx = `Farmer's crop: ${crop}. Location: ${location}.`;
    if (diag) ctx += ` Last scan: ${diag.disease} (${Math.round(diag.confidence * 100)}% confidence, ${diag.severity} severity) on ${new Date(diag.timestamp).toLocaleDateString('en-IN')}.`;
    if (weather?.current) ctx += ` Today's weather: ${Math.round(weather.current.temperature)}°C, humidity ${weather.current.humidity_pct}%, rain ${weather.current.rain_prob_pct}%.`;
    if (mandi?.best_market) ctx += ` Best mandi price for ${crop}: ₹${mandi.best_market.price}/quintal at ${mandi.best_market.name}.`;
    return ctx;
  } catch {
    return 'Indian farmer';
  }
}

function icGetSmartChips() {
  const chips = [];
  try {
    const diag = JSON.parse(localStorage.getItem('kr_last_diagnosis'));
    if (diag && diag.severity === 'severe') chips.push({ label: `💊 Treatment for ${diag.disease}`, msg: `What is the treatment for ${diag.disease}?` });
    const weather = JSON.parse(sessionStorage.getItem('kr_weather_cache'));
    if (weather?.current?.temperature > 38) chips.push({ label: '🌡️ Heat stress tips', msg: 'My crop is under heat stress, what should I do?' });
    const s = getSession();
    const profile = JSON.parse(localStorage.getItem('kr_farmer_profile') || '{}');
    const crop = profile?.crops?.[0] || s?.crop;
    if (crop) chips.push({ label: `💧 When to irrigate ${crop}?`, msg: `When should I irrigate my ${crop} crop?` });
  } catch {}
  chips.push({ label: '📋 Government schemes', msg: 'What government schemes are available for farmers?' });
  chips.push({ label: '💰 Best time to sell', msg: 'When is the best time to sell my crop at mandi?' });
  return chips.slice(0, 4);
}

async function icSend() {
  const inp = document.getElementById('ic-input');
  const text = inp?.value.trim();
  if (!text) return;
  inp.value = '';

  icAddMsg('user', text);
  const hist = icGetHistory();
  hist.push({ role: 'user', content: text });
  icSaveHistory(hist);

  icShowTyping();

  try {
    const res = await fetch(`${API}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, language: icLang, crop_context: icGetCtx(), history: icGetHistory().slice(-16) }),
    });
    icHideTyping();
    if (!res.ok) { icAddMsg('bot', 'Sorry, could not connect. Please try again.'); return; }

    // Streaming bubble
    const el = document.getElementById('ic-messages');
    const div = document.createElement('div');
    div.className = 'ic-msg bot';
    div.innerHTML = '<div style="width:28px;height:28px;border-radius:50%;background:rgba(34,197,94,.15);border:1px solid rgba(34,197,94,.2);display:flex;align-items:center;justify-content:center;font-size:.8rem;flex-shrink:0;margin-top:2px;">🌿</div>';
    const bubble = document.createElement('div');
    bubble.className = 'ic-bubble';
    div.appendChild(bubble);
    el.appendChild(div);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '', buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const chunk = line.slice(6);
        if (chunk === '[DONE]') break;
        if (chunk.startsWith('[ERROR]')) { bubble.textContent = 'Sorry, AI error.'; break; }
        fullText += chunk.replace(/\\n/g, '\n');
        bubble.textContent = fullText;
        icScroll();
      }
    }
    if (fullText) {
      const h = icGetHistory();
      h.push({ role: 'assistant', content: fullText });
      icSaveHistory(h);
    }
  } catch {
    icHideTyping();
    // Fallback non-streaming
    try {
      const res = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, language: icLang, crop_context: icGetCtx(), history: icGetHistory().slice(-16) }),
      });
      if (res.ok) {
        const d = await res.json();
        icAddMsg('bot', d.reply);
        const h = icGetHistory();
        h.push({ role: 'assistant', content: d.reply });
        icSaveHistory(h);
      } else {
        icAddMsg('bot', 'Connection error. Make sure the backend is running.');
      }
    } catch {
      icAddMsg('bot', 'Connection error. Make sure the backend is running.');
    }
  }
}

function icChip(text) {
  const inp = document.getElementById('ic-input');
  if (inp) inp.value = text;
  icSend();
}

// Init chat with welcome message when section first loads
function initInlineChat() {
  const el = document.getElementById('ic-messages');
  if (!el || el.children.length > 0) return;
  const hist = icGetHistory();
  if (hist.length) {
    hist.slice(-10).forEach(m => icAddMsg(m.role === 'user' ? 'user' : 'bot', m.content));
  } else {
    const s = getSession();
    const profile = (() => { try { return JSON.parse(localStorage.getItem('kr_farmer_profile')); } catch { return null; } })();
    const crop = profile?.crops?.[0] || s?.crop || '';
    const greeting = crop
      ? `Namaste! 🌱 I'm Krishi Mitra. I can see you grow ${crop}. Ask me about diseases, fertilisers, weather, or government schemes.`
      : "Namaste! 🌱 I'm Krishi Mitra, your AI farm advisor. Ask me anything about crop diseases, fertilisers, weather, or government schemes.";
    icAddMsg('bot', greeting);
  }
  // Render smart chips
  const chipsEl = document.querySelector('#sec-chat .ic-chip')?.parentElement;
  if (chipsEl) {
    const smartChips = icGetSmartChips();
    chipsEl.innerHTML = smartChips.map(c =>
      `<button class="ic-chip" onclick="icChip('${c.msg.replace(/'/g,"\\'")}')">` + c.label + `</button>`
    ).join('');
  }
}

// ── Irrigation ────────────────────────────────────────────────────────────────
async function loadIrrigation() {
  const crop = document.getElementById('irr-crop')?.value || 'paddy';
  const stage = document.getElementById('irr-stage')?.value || 'mid';
  const area = parseFloat(document.getElementById('irr-area')?.value) || 1;
  const soil = document.getElementById('irr-soil')?.value || 'loamy';
  const method = document.getElementById('irr-method')?.value || 'drip';
  const result = document.getElementById('irr-result');
  if (!result) return;

  // Need lat/lng — try profile first, then GPS
  const profile = (() => { try { return JSON.parse(localStorage.getItem('kr_farmer_profile')); } catch { return null; } })();
  const lat = profile?.lat || 20.5937;
  const lng = profile?.lng || 78.9629;

  result.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await fetch(`${API}/irrigation-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crop, growth_stage: stage, field_area_acres: area, soil_type: soil, lat, lng, method }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Server error ${res.status}`);
    }
    const d = await res.json();
    result.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
        <div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:12px;padding:14px;text-align:center;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:1.4rem;font-weight:700;color:#a8ff3e">${d.water_needed_litres?.toLocaleString('en-IN') || '—'}</div>
          <div style="font-size:.68rem;color:rgba(134,239,172,.5);margin-top:3px;text-transform:uppercase">Litres needed</div>
        </div>
        <div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:12px;padding:14px;text-align:center;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:1.4rem;font-weight:700;color:#a8ff3e">${d.irrigation_interval_days || '—'}</div>
          <div style="font-size:.68rem;color:rgba(134,239,172,.5);margin-top:3px;text-transform:uppercase">Days interval</div>
        </div>
        <div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:12px;padding:14px;text-align:center;">
          <div style="font-family:'JetBrains Mono',monospace;font-size:1.4rem;font-weight:700;color:#a8ff3e">${d.next_irrigation_date || '—'}</div>
          <div style="font-size:.68rem;color:rgba(134,239,172,.5);margin-top:3px;text-transform:uppercase">Next irrigation</div>
        </div>
      </div>
      <div style="font-size:.78rem;color:rgba(134,239,172,.6);padding:10px 14px;background:rgba(168,255,62,.06);border:1px solid rgba(168,255,62,.15);border-radius:10px;">${escHtml(d.money_saved_vs_flood || '')}</div>
      <div style="margin-top:14px;">
        <div style="font-size:.72rem;color:rgba(134,239,172,.45);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;">7-Day Schedule</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${(d.weekly_schedule || []).map(day => `
            <div style="display:flex;align-items:center;gap:12px;padding:9px 14px;background:${day.irrigate ? 'rgba(34,197,94,.08)' : 'rgba(255,255,255,.03)'};border:1px solid ${day.irrigate ? 'rgba(34,197,94,.2)' : 'rgba(255,255,255,.06)'};border-radius:9px;">
              <span style="font-size:.82rem;font-weight:600;min-width:90px">${escHtml(day.day)}</span>
              <span style="font-size:.75rem;color:rgba(134,239,172,.5)">${escHtml(day.date)}</span>
              <span style="margin-left:auto;font-size:.78rem;color:${day.irrigate ? '#4ade80' : 'rgba(134,239,172,.3)'}">${day.irrigate ? '💧 ' + day.amount_litres?.toLocaleString('en-IN') + 'L' : '—'}</span>
            </div>`).join('')}
        </div>
      </div>`;
  } catch (err) {
    result.innerHTML = `<div style="color:#f87171;font-size:.85rem">Failed to calculate: ${escHtml(err.message)}</div>`;
  }
}

// ── Crop Calendar ─────────────────────────────────────────────────────────────
const CROP_STAGES = {
  Paddy:    [{name:'Nursery',day:0,dur:25},{name:'Transplanting',day:25,dur:5},{name:'Vegetative',day:30,dur:33},{name:'Panicle Init.',day:63,dur:20},{name:'Flowering',day:83,dur:25},{name:'Harvest',day:108,dur:12}],
  Wheat:    [{name:'Germination',day:0,dur:10},{name:'Tillering',day:10,dur:30},{name:'Jointing',day:40,dur:25},{name:'Heading',day:65,dur:20},{name:'Grain Fill',day:85,dur:30},{name:'Harvest',day:115,dur:15}],
  Tomato:   [{name:'Nursery',day:0,dur:25},{name:'Transplanting',day:25,dur:5},{name:'Vegetative',day:30,dur:25},{name:'Flowering',day:55,dur:20},{name:'Fruit Set',day:75,dur:25},{name:'Harvest',day:100,dur:20}],
  Potato:   [{name:'Planting',day:0,dur:10},{name:'Emergence',day:10,dur:15},{name:'Earthing Up',day:25,dur:15},{name:'Tuber Init.',day:40,dur:25},{name:'Bulking',day:65,dur:25},{name:'Harvest',day:90,dur:10}],
  Maize:    [{name:'Germination',day:0,dur:10},{name:'Seedling',day:10,dur:20},{name:'Knee-High',day:30,dur:20},{name:'Tasseling',day:50,dur:15},{name:'Silking',day:65,dur:20},{name:'Harvest',day:85,dur:25}],
  Chilli:   [{name:'Nursery',day:0,dur:30},{name:'Transplanting',day:30,dur:5},{name:'Vegetative',day:35,dur:30},{name:'Flowering',day:65,dur:25},{name:'Fruiting',day:90,dur:40},{name:'Harvest',day:130,dur:20}],
  Mango:    [{name:'Dormancy',day:0,dur:60},{name:'Flowering',day:60,dur:30},{name:'Fruit Set',day:90,dur:30},{name:'Fruit Dev.',day:120,dur:60},{name:'Maturity',day:180,dur:30},{name:'Harvest',day:210,dur:30}],
  Banana:   [{name:'Planting',day:0,dur:30},{name:'Vegetative',day:30,dur:90},{name:'Shooting',day:120,dur:30},{name:'Flowering',day:150,dur:30},{name:'Bunch Dev.',day:180,dur:60},{name:'Harvest',day:240,dur:30}],
  Sugarcane:[{name:'Germination',day:0,dur:30},{name:'Tillering',day:30,dur:60},{name:'Grand Growth',day:90,dur:180},{name:'Maturity',day:270,dur:60},{name:'Harvest',day:330,dur:35}],
};
const CROP_EMOJI_MAP = {Paddy:'🌾',Wheat:'🌾',Tomato:'🍅',Potato:'🥔',Maize:'🌽',Chilli:'🌶️',Mango:'🥭',Banana:'🍌',Sugarcane:'🎋'};

function loadCalendar() {
  const el = document.getElementById('calendar-content');
  if (!el) return;
  const s = getSession();
  const profile = (() => { try { return JSON.parse(localStorage.getItem('kr_farmer_profile')); } catch { return null; } })();
  const crops = profile?.crops || (s?.crop ? [s.crop.replace(/[^a-zA-Z]/g,'').trim()] : ['Paddy']);

  const today = Date.now();
  const rows = crops.map(cropName => {
    const stages = CROP_STAGES[cropName] || CROP_STAGES['Paddy'];
    const emoji = CROP_EMOJI_MAP[cropName] || '🌱';
    // Assume sowing was 30 days ago if no calendar data
    const calCrops = (() => { try { return JSON.parse(localStorage.getItem('kr_cal_crops')) || []; } catch { return []; } })();
    const entry = calCrops.find(c => c.label === cropName || c.crop === cropName.toLowerCase());
    const sowDate = entry ? new Date(entry.sow).getTime() : today - 30 * 86400000;
    const dayNum = Math.floor((today - sowDate) / 86400000);
    const currentStage = stages.find(s => dayNum >= s.day && dayNum < s.day + s.dur) || stages[stages.length - 1];
    const totalDays = stages[stages.length - 1].day + stages[stages.length - 1].dur;
    const progress = Math.min(100, Math.round((dayNum / totalDays) * 100));

    return `
      <div style="margin-bottom:20px;padding:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <span style="font-size:1.5rem">${emoji}</span>
          <div>
            <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:.95rem">${escHtml(cropName)}</div>
            <div style="font-size:.72rem;color:rgba(134,239,172,.5)">Day ${dayNum} · ${escHtml(currentStage?.name || 'Growing')}</div>
          </div>
          <div style="margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:#a8ff3e">${progress}%</div>
        </div>
        <div style="height:6px;background:rgba(255,255,255,.08);border-radius:6px;overflow:hidden;margin-bottom:12px;">
          <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,#22c55e,#a8ff3e);border-radius:6px;transition:width .8s ease;"></div>
        </div>
        <div style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px;">
          ${stages.map(st => {
            const isActive = currentStage?.name === st.name;
            const isDone = dayNum >= st.day + st.dur;
            return `<div style="flex-shrink:0;padding:5px 12px;border-radius:8px;font-size:.72rem;background:${isActive ? 'rgba(34,197,94,.15)' : isDone ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.02)'};border:1px solid ${isActive ? 'rgba(34,197,94,.3)' : 'rgba(255,255,255,.06)'};color:${isActive ? '#4ade80' : isDone ? 'rgba(134,239,172,.4)' : 'rgba(134,239,172,.25)'};">${escHtml(st.name)}</div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  el.innerHTML = rows || '<div style="color:rgba(134,239,172,.4);font-size:.85rem">No crops set up. Complete your profile to see calendar.</div>';
}

// ── Soil Guide ────────────────────────────────────────────────────────────────
const SOIL_DATA = {
  paddy:    { emoji:'🌾', name:'Paddy / Rice',  N:'120kg Urea', P:'50kg DAP',  K:'33kg MOP',  tip:'Apply N in 3 splits: 50% basal, 25% tillering, 25% panicle initiation.' },
  wheat:    { emoji:'🌾', name:'Wheat',          N:'130kg Urea', P:'55kg DAP',  K:'33kg MOP',  tip:'Apply 50% N basal, 25% at CRI stage (21 days), 25% at jointing (45 days).' },
  tomato:   { emoji:'🍅', name:'Tomato',         N:'150kg Urea', P:'65kg DAP',  K:'50kg MOP',  tip:'Apply N in 3 equal splits at transplanting, 30 days, and 60 days.' },
  potato:   { emoji:'🥔', name:'Potato',         N:'130kg Urea', P:'65kg DAP',  K:'67kg MOP',  tip:'Apply 50% N basal, 25% at earthing up, 25% at 45 days.' },
  maize:    { emoji:'🌽', name:'Maize',          N:'130kg Urea', P:'55kg DAP',  K:'33kg MOP',  tip:'Apply 50% N basal, 25% at knee-high, 25% at tasseling.' },
  chilli:   { emoji:'🌶️', name:'Chilli',         N:'120kg Urea', P:'55kg DAP',  K:'40kg MOP',  tip:'Apply N in 3 equal splits at transplanting, 30 days, and 60 days.' },
  mango:    { emoji:'🥭', name:'Mango',          N:'1kg Urea/tree', P:'0.5kg DAP/tree', K:'0.8kg MOP/tree', tip:'Apply 50% in June (post-harvest) and 50% in October (pre-flowering).' },
  banana:   { emoji:'🍌', name:'Banana',         N:'200g Urea/plant', P:'100g DAP/plant', K:'300g MOP/plant', tip:'Apply in 4 equal splits at 2, 3, 4, and 5 months after planting.' },
  sugarcane:{ emoji:'🎋', name:'Sugarcane',      N:'200kg Urea', P:'65kg DAP',  K:'67kg MOP',  tip:'Apply N in 3 splits: 33% at planting, 33% at 30 days, 34% at 60 days.' },
};

function updateSoilGuide() {
  const sel = document.getElementById('soil-crop-sel');
  const content = document.getElementById('soil-guide-content');
  if (!sel || !content) return;
  if (typeof SOIL_DATA === 'undefined') {
    content.innerHTML = '<div style="color:rgba(134,239,172,.4);font-size:.85rem;padding:12px 0">Loading data…</div>';
    setTimeout(updateSoilGuide, 200);
    return;
  }

  const crop = sel.value || 'paddy';
  const d = SOIL_DATA[crop] || SOIL_DATA.paddy;

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;">
      <div style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:.65rem;color:rgba(134,239,172,.45);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Nitrogen (N)</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;color:#a8ff3e">${d.N}</div>
        <div style="font-size:.68rem;color:rgba(134,239,172,.4);margin-top:3px;">per acre</div>
      </div>
      <div style="background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.2);border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:.65rem;color:rgba(134,239,172,.45);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Phosphorus (P)</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;color:#93c5fd">${d.P}</div>
        <div style="font-size:.68rem;color:rgba(134,239,172,.4);margin-top:3px;">per acre</div>
      </div>
      <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:.65rem;color:rgba(134,239,172,.45);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;">Potassium (K)</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;color:#fbbf24">${d.K}</div>
        <div style="font-size:.68rem;color:rgba(134,239,172,.4);margin-top:3px;">per acre</div>
      </div>
    </div>
    <div style="padding:14px 16px;background:rgba(168,255,62,.06);border:1px solid rgba(168,255,62,.15);border-radius:12px;">
      <div style="font-size:.72rem;color:#a8ff3e;font-weight:600;margin-bottom:5px;">💡 Application Schedule</div>
      <div style="font-size:.83rem;color:rgba(240,253,242,.75);line-height:1.65;">${d.tip}</div>
    </div>
    <div style="margin-top:14px;padding:12px 16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;font-size:.78rem;color:rgba(134,239,172,.5);">
      ⚠️ These are general ICAR recommendations. For precise doses, get your soil tested at your nearest KVK (Krishi Vigyan Kendra).
    </div>`;
}
