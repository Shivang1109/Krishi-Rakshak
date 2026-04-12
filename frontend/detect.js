'use strict';

const API = window.KRISHI_API_BASE || 'http://127.0.0.1:8000';

const severityTranslations = {
  healthy: { hi: 'स्वस्थ', te: 'ఆరోగ్యం', ta: 'ஆரோக்கியம்', mr: 'निरोगी', bn: 'সুস্থ', en: 'Healthy' },
  early: { hi: 'प्रारंभिक', te: 'ప్రారంభ', ta: 'ஆரம்ப', mr: 'सुरुवाती', bn: 'প্রারম্ভিক', en: 'Early' },
  moderate: { hi: 'मध्यम', te: 'మధ్యమం', ta: 'மிதமான', mr: 'मध्यम', bn: 'মাঝারি', en: 'Moderate' },
  severe: { hi: 'गंभीर', te: 'తీవ్ర', ta: 'கடுமையான', mr: 'गंभीर', bn: 'গুরুতর', en: 'Severe' },
};

let diseaseTranslations = {};
let tfModel = null;
let labelsJson = null;

/* ── Init translations ── */
fetch('disease-translations.json')
  .then((r) => r.json())
  .then((d) => { diseaseTranslations = d; })
  .catch(() => {});

fetch('static/labels.json')
  .then((r) => r.json())
  .then((d) => { labelsJson = d; })
  .catch(() => {});

/* ── API links ── */
document.querySelectorAll('a[data-api]').forEach((a) => {
  const p = a.getAttribute('data-api');
  if (p) a.href = API + p;
});

/* ── Tabs ── */
document.querySelectorAll('.dt-tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.dt-tab').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.det-panel').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('panel-' + t.dataset.tab).classList.add('active');
  });
});

/* ── Voice prefs ── */
const voiceLang = document.getElementById('voice-lang');
const voiceAuto = document.getElementById('voice-auto');
if (localStorage.getItem('preferred_language')) {
  voiceLang.value = localStorage.getItem('preferred_language');
}
if (localStorage.getItem('kr_voice_auto') === '1') voiceAuto.checked = true;
voiceLang.addEventListener('change', () => localStorage.setItem('preferred_language', voiceLang.value));
voiceAuto.addEventListener('change', () => localStorage.setItem('kr_voice_auto', voiceAuto.checked ? '1' : '0'));

/* ── Single upload ── */
let fileSingle = null;
const dzS = document.getElementById('dz-single');
const inS = document.getElementById('in-single');
const prevS = document.getElementById('dz-prev-s');
const innerS = document.getElementById('dz-inner-s');
const imgPrev = document.getElementById('img-prev-s');

document.getElementById('btn-browse-s').addEventListener('click', () => inS.click());
inS.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (f) setSingleFile(f);
});
dzS.addEventListener('click', (e) => {
  if (!e.target.closest('button,img')) inS.click();
});
document.getElementById('btn-rm-s').addEventListener('click', () => {
  fileSingle = null;
  inS.value = '';
  prevS.style.display = 'none';
  innerS.style.display = 'flex';
  document.getElementById('btn-run-s').disabled = true;
  document.getElementById('det-single-results').style.display = 'none';
});

function setSingleFile(f) {
  if (!['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(f.type)) {
    alert('Use JPEG or PNG');
    return;
  }
  fileSingle = f;
  imgPrev.src = URL.createObjectURL(f);
  innerS.style.display = 'none';
  prevS.style.display = 'block';
  document.getElementById('btn-run-s').disabled = false;
}

document.getElementById('btn-run-s').addEventListener('click', runSingle);

// ── Session helpers ──────────────────────────────────────────────────────────
function getSessionId() {
  try {
    const u = JSON.parse(localStorage.getItem('kr_session'));
    if (u && u.phone) return u.phone;
  } catch {}
  // Fallback: anonymous session stored in localStorage
  let s = localStorage.getItem('kr_anon_session');
  if (!s) {
    s = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'anon_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('kr_anon_session', s);
  }
  return s;
}

function getPlantLabel() {
  const el = document.getElementById('plant-label-input');
  return (el && el.value.trim()) || 'My Plant';
}

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

async function runSingle() {
  if (!fileSingle) return;
  const prog = document.getElementById('prog-s');
  const fill = document.getElementById('prog-fill-s');
  prog.style.display = 'block';
  fill.style.width = '30%';
  const fd = new FormData();
  fd.append('file', fileSingle);
  fd.append('session_id', getSessionId());
  fd.append('plant_label', getPlantLabel());
  fd.append('save_history', 'true');

  try {
    const res = await fetch(API + '/predict', { method: 'POST', body: fd });
    fill.style.width = '70%';
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || res.status);
    const data = await res.json();
    fill.style.width = '100%';
    saveLastDiagnosis(data.top_prediction);
    renderSingle(data);
    if (voiceAuto.checked) speakDiagnosis(data.top_prediction, 'speak-text-s');
  } catch (err) {
    console.warn('Server predict failed, trying offline', err);
    try {
      const off = await predictOffline(fileSingle);
      if (off) {
        saveLastDiagnosis(off);
        renderSingle({ top_prediction: off, top_k: [] });
        queueOfflineSync(fileSingle, off);
      } else throw err;
    } catch (e2) {
      alert('Prediction failed: ' + (e2 && e2.message ? e2.message : err.message));
    }
  } finally {
    setTimeout(() => {
      prog.style.display = 'none';
      fill.style.width = '0%';
    }, 400);
  }
}

function renderSingle(data) {
  const top = data.top_prediction;
  document.getElementById('det-single-results').style.display = 'block';
  document.getElementById('res-img-s').src = imgPrev.src;
  const sev = top.confidence_severity || top.graded_severity || 'moderate';
  const sevEl = document.getElementById('rr-sev-s');
  sevEl.textContent = sev.toUpperCase();
  const colors = { healthy: '#22c55e', early: '#86efac', moderate: '#fbbf24', severe: '#ef4444' };
  const c = colors[sev] || '#8b5cf6';
  sevEl.style.cssText = `background:${c}22;color:${c};border:1px solid ${c}44;padding:6px 14px;border-radius:99px;font-family:var(--fm);font-size:.68rem`;
  const circ = 2 * Math.PI * 46;
  document.getElementById('rr-fg-s').style.strokeDashoffset = circ * (1 - top.confidence);
  document.getElementById('rr-pct-s').textContent = Math.round(top.confidence * 100) + '%';
  document.getElementById('rr-name-s').textContent = top.display_name;
  document.getElementById('rr-desc-s').textContent = top.description || '';
  const speakHtml = buildSpeakHtml(top);
  document.getElementById('speak-text-s').innerHTML = speakHtml;
  const alts = data.top_k || [];
  document.getElementById('res-alts-s').innerHTML = alts.length
    ? '<p class="res-model-tag">Alternatives</p>' + alts.map((a) => `<div style="font-size:.8rem;color:var(--text-m)">${a.display_name} — ${a.confidence_pct}</div>`).join('')
    : '';

  document.getElementById('btn-tts-s').style.display =
    typeof window.speechSynthesis === 'undefined' ? 'inline-block' : 'none';
  window._lastTop = top;
  saveLastDiagnosis(top);

  const waShareWrap = document.getElementById('wa-share-wrap-s');
  if (waShareWrap) {
    const treat = Array.isArray(top.treatment) ? top.treatment.slice(0,3).join('\n') : (top.treatment || '');
    const waText = 'Krishi Rakshak Diagnosis\n\nDisease: ' + top.display_name + '\nSeverity: ' + sev.toUpperCase() + '\nConfidence: ' + Math.round(top.confidence * 100) + '%\n\nTreatment:\n' + treat + '\n\nKrishi Rakshak AI - https://krishirakshak.app';
    waShareWrap.innerHTML =
      '<a href="https://wa.me/?text=' + encodeURIComponent(waText) + '" target="_blank" rel="noopener" class="kr-wa-btn" style="margin-top:14px">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.847L0 24l6.335-1.523A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.913a9.89 9.89 0 01-5.032-1.375l-.361-.214-3.741.98.997-3.648-.235-.374A9.861 9.861 0 012.087 12C2.087 6.971 6.101 2.957 12 2.957S21.913 6.971 21.913 12 17.899 21.913 12 21.913z"/></svg>' +
      'Share on WhatsApp</a>' +
      '<button onclick="exportDiagnosisPDF()" class="kr-wa-btn" style="margin-top:14px;margin-left:8px;background:rgba(99,102,241,.15);border-color:rgba(99,102,241,.35);color:#a5b4fc">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' +
      'Download PDF Report</button>';
  }

function langKey() {
  return (voiceLang.value || 'hi-IN').split('-')[0];
}


function buildSpeechText(top) {

  const lk = langKey();
  const dn = top.display_name;
  const dLine = (diseaseTranslations[dn] && diseaseTranslations[dn][lk]) || dn;
  const sev = top.confidence_severity || top.graded_severity || 'moderate';
  const sLine = (severityTranslations[sev] && severityTranslations[sev][lk]) || sev;
  const treat = Array.isArray(top.treatment) ? top.treatment.join('; ') : (top.treatment || '');
  if (lk === 'hi') {
    return `आपकी फसल में ${dLine} पाई गई है। गंभीरता: ${sLine}। उपचार: ${treat}।`;
  }
  return `Diagnosis: ${dLine}. Severity: ${sLine}. Treatment: ${treat}.`;
}

function splitSentences(text) {
  return text.split(/(?<=[।.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function buildSpeakHtml(top) {
  const t = buildSpeechText(top);
  const parts = splitSentences(t);
  return parts.map((p, i) => `<span class="sent-chunk" data-i="${i}">${p}</span>`).join(' ');
}

function speakDiagnosis(top, textElId) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const text = buildSpeechText(top);
  const chunks = splitSentences(text);
  let idx = 0;
  const el = document.getElementById(textElId);
  function highlight() {
    el.querySelectorAll('.sent-chunk').forEach((s, i) => {
      s.classList.toggle('hl-speak', i === idx);
    });
  }
  function next() {
    if (idx >= chunks.length) {
      el.querySelectorAll('.sent-chunk').forEach((s) => s.classList.remove('hl-speak'));
      return;
    }
    const u = new SpeechSynthesisUtterance(chunks[idx]);
    u.lang = voiceLang.value;
    u.rate = parseFloat(document.getElementById('rate-s').value, 10) || 1;
    u.onend = () => {
      idx++;
      highlight();
      next();
    };
    highlight();
    window.speechSynthesis.speak(u);
  }
  next();
}

document.getElementById('btn-play-s').addEventListener('click', () => {
  const top = window._lastTop;
  if (!top) return;
  speakDiagnosis(top, 'speak-text-s');
});
document.getElementById('btn-pause-s').addEventListener('click', () => {
  if (window.speechSynthesis.speaking) window.speechSynthesis.pause();
});
document.getElementById('rate-s').addEventListener('change', () => {});

document.getElementById('btn-tts-s').addEventListener('click', async () => {
  const top = window._lastTop;
  if (!top) return;
  const fd = new FormData();
  fd.append('text', buildSpeechText(top));
  fd.append('lang', langKey());
  const res = await fetch(API + '/text-to-speech', { method: 'POST', body: fd });
  if (!res.ok) {
    alert('TTS failed');
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.getElementById('audio-tts-s');
  a.src = url;
  a.style.display = 'block';
  a.play();
});

/* ── Batch ── */
let batchFiles = [];
const inB = document.getElementById('in-batch');
const dzB = document.getElementById('dz-batch');
const grid = document.getElementById('thumb-grid');

document.getElementById('btn-pick-batch').addEventListener('click', () => inB.click());
inB.addEventListener('change', (e) => addBatchFiles([...e.target.files]));
dzB.addEventListener('dragover', (e) => {
  e.preventDefault();
  dzB.classList.add('drag-over');
});
dzB.addEventListener('dragleave', () => dzB.classList.remove('drag-over'));
dzB.addEventListener('drop', (e) => {
  e.preventDefault();
  dzB.classList.remove('drag-over');
  addBatchFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')));
});

function addBatchFiles(files) {
  for (const f of files) {
    if (batchFiles.length >= 10) break;
    if (!['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(f.type)) continue;
    batchFiles.push(f);
  }
  renderThumbs();
  document.getElementById('btn-run-batch').disabled = batchFiles.length === 0;
}

function renderThumbs() {
  grid.innerHTML = batchFiles
    .map(
      (f, i) => `
    <div class="thumb-item">
      <img src="${URL.createObjectURL(f)}" alt=""/>
      <button type="button" data-i="${i}" aria-label="Remove">×</button>
    </div>`,
    )
    .join('');
  grid.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = +b.dataset.i;
      batchFiles.splice(i, 1);
      renderThumbs();
      document.getElementById('btn-run-batch').disabled = batchFiles.length === 0;
    });
  });
}

document.getElementById('btn-run-batch').addEventListener('click', async () => {
  if (!batchFiles.length) return;
  const pb = document.getElementById('prog-batch');
  const pf = document.getElementById('prog-batch-fill');
  pb.classList.add('show');
  pf.style.width = '15%';
  const fd = new FormData();
  batchFiles.forEach((f) => fd.append('files', f));
  try {
    const res = await fetch(API + '/batch-predict', { method: 'POST', body: fd });
    pf.style.width = '60%';
    if (!res.ok) throw new Error('Batch failed ' + res.status);
    const data = await res.json();
    pf.style.width = '100%';
    renderBatch(data);
  } catch (e) {
    alert(e.message);
  } finally {
    setTimeout(() => {
      pb.classList.remove('show');
      pf.style.width = '0%';
    }, 400);
  }
});

function renderBatch(data) {
  document.getElementById('batch-results').style.display = 'block';
  const fs = data.field_summary;
  const urg = fs.urgency_level;
  document.getElementById('field-summary').innerHTML = `
    <span class="fs-urg ${urg}">${urg} urgency</span>
    <p style="font-family:var(--fb);font-size:.9rem;margin-bottom:8px">${fs.recommended_action || ''}</p>
    <p style="font-family:var(--fm);font-size:.72rem;color:var(--text-m)">
      Affected: ${fs.affected_count} · Healthy: ${fs.healthy_count} · Most common: ${fs.most_common_disease}
    </p>`;
  const list = document.getElementById('batch-list');
  list.innerHTML = (data.results || [])
    .map((r) => {
      if (r.error) {
        return `<div class="batch-row"><div></div><div style="color:#f87171">${r.filename}: ${r.error}</div></div>`;
      }
      const sev = r.severity || 'moderate';
      const thumb = batchFiles.find((f) => f.name === r.filename);
      const src = thumb ? URL.createObjectURL(thumb) : '';
      return `<div class="batch-row">
        <img src="${src}" alt=""/>
        <div>
          <span class="sev-pill ${sev}">${sev}</span>
          <div style="font-family:var(--fh);font-weight:700;font-size:.95rem">${r.disease}</div>
          <div style="font-family:var(--fm);font-size:.72rem;color:var(--text-m)">${r.filename} · ${r.confidence_pct}</div>
          <div style="height:4px;background:rgba(255,255,255,.06);border-radius:4px;margin-top:8px;overflow:hidden">
            <div style="height:4px;width:${Math.round(r.confidence * 100)}%;background:linear-gradient(90deg,var(--green),var(--lime))"></div>
          </div>
        </div>
      </div>`;
    })
    .join('');
}

/* ── Offline TFJS (optional) ── */
async function predictOffline(file) {
  if (typeof tf === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  try {
    if (!tfModel) {
      tfModel = await tf.loadGraphModel('static/tfjs_model/model.json', { requestInit: { cache: 'force-cache' } });
    }
  } catch {
    return null;
  }
  const bitmap = await createImageBitmap(file);
  let logits;
  try {
    logits = tf.tidy(() => {
      const expanded = tf.expandDims(tf.cast(tf.browser.fromPixels(bitmap), 'float32'), 0);
      const resized = tf.image.resizeBilinear(expanded, [224, 224]);
      const norm = resized.div(127.5).sub(1.0);
      return tfModel.predict(norm);
    });
  } finally {
    bitmap.close();
  }
  const arr = await logits.data();
  logits.dispose();
  let best = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i;
  const conf = arr[best];
  const className = Array.isArray(labelsJson) && labelsJson[best] ? labelsJson[best] : 'unknown';
  const isHealthy = /healthy|normal/i.test(className);
  return {
    display_name: className,
    confidence: conf,
    confidence_pct: (conf * 100).toFixed(1) + '%',
    confidence_severity: isHealthy ? 'healthy' : conf < 0.5 ? 'early' : conf <= 0.75 ? 'moderate' : 'severe',
    description: 'Offline TFJS inference — verify online when possible.',
    treatment: ['Verify with server when online.'],
    symptoms: [],
    prevention: '',
    severity: 'none',
  };
}

/* IndexedDB sync queue */
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('krishi_offline', 1);
    r.onerror = () => rej(r.error);
    r.onupgradeneeded = () => r.result.createObjectStore('sync', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result);
  });
}

function queueOfflineSync(file, _result) {
  const reader = new FileReader();
  reader.onload = () => {
    openDb().then((db) => {
      const tx = db.transaction('sync', 'readwrite');
      tx.objectStore('sync').add({ imageBase64: reader.result, ts: Date.now() });
      tx.oncomplete = () => updateSyncBadge();
    }).catch(() => {});
  };
  reader.readAsDataURL(file);
}

function updateSyncBadge() {
  openDb().then((db) => {
    const tx = db.transaction('sync', 'readonly');
    const rq = tx.objectStore('sync').count();
    rq.onsuccess = () => {
      const n = rq.result;
      const el = document.getElementById('sync-badge');
      if (n > 0) {
        el.textContent = n + ' diagnoses pending sync';
        el.classList.add('show');
      } else el.classList.remove('show');
    };
  }).catch(() => {});
}

async function flushSyncQueue() {
  if (!navigator.onLine) return;
  let db;
  try {
    db = await openDb();
  } catch {
    return;
  }
  const rows = await new Promise((res, rej) => {
    const t = db.transaction('sync', 'readonly');
    t.objectStore('sync').getAll().onsuccess = (e) => res(e.target.result || []);
    t.onerror = () => rej(t.error);
  });
  for (const row of rows) {
    try {
      const blob = await fetch(row.imageBase64).then((r) => r.blob());
      const fd = new FormData();
      fd.append('file', blob, 'sync.jpg');
      const res = await fetch(API + '/predict', { method: 'POST', body: fd });
      if (res.ok && row.id != null) {
        await new Promise((res, rej) => {
          const t = db.transaction('sync', 'readwrite');
          t.objectStore('sync').delete(row.id);
          t.oncomplete = () => res();
          t.onerror = () => rej(t.error);
        });
      }
    } catch {
      /* keep queued */
    }
  }
  updateSyncBadge();
}

window.addEventListener('online', flushSyncQueue);
updateSyncBadge();

/* PWA install */
let _install = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _install = e;
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:12px 20px;background:rgba(10,26,14,.98);border-top:1px solid rgba(34,197,94,.3);display:flex;align-items:center;gap:12px;font-family:DM Sans,sans-serif';
  bar.innerHTML = '<span style="font-size:1.4rem">🌿</span><div style="flex:1;color:#f0fdf4;font-size:.85rem"><strong>Install Krishi Rakshak</strong><br><span style="opacity:.7;font-size:.75rem">Works without internet</span></div><button type="button" style="padding:8px 16px;background:#22c55e;border:none;border-radius:8px;font-weight:700;cursor:pointer">Install</button>';
  bar.querySelector('button').onclick = () => {
    _install.prompt();
    _install.userChoice.finally(() => bar.remove());
  };
  document.body.appendChild(bar);
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

/* ── PDF Diagnosis Report ─────────────────────────────────────────────────── */
function exportDiagnosisPDF() {
  const top = window._lastTop;
  if (!top) return;

  const sev = top.confidence_severity || top.graded_severity || 'moderate';
  const sevColors = { healthy: '#16a34a', early: '#65a30d', moderate: '#d97706', severe: '#dc2626' };
  const sevColor = sevColors[sev] || '#7c3aed';
  const pct = Math.round(top.confidence * 100);
  const treat = Array.isArray(top.treatment) ? top.treatment : [top.treatment || ''];
  const symptoms = Array.isArray(top.symptoms) ? top.symptoms : [];
  const now = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });
  const session = (() => { try { return JSON.parse(localStorage.getItem('kr_session')); } catch { return null; } })();
  const farmerName = session?.name || 'Farmer';
  const farmerCrop = session?.crop || top.crop || 'Unknown';

  const imgSrc = document.getElementById('res-img-s')?.src || '';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Krishi Rakshak — Diagnosis Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: #fff; padding: 32px; max-width: 800px; margin: 0 auto; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #16a34a; padding-bottom: 16px; margin-bottom: 24px; }
  .logo { font-size: 22px; font-weight: 800; color: #15803d; }
  .logo span { font-size: 13px; font-weight: 400; color: #6b7280; display: block; }
  .report-id { font-size: 11px; color: #9ca3af; text-align: right; }
  .section { margin-bottom: 22px; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 10px; font-weight: 700; }
  .result-banner { background: ${sevColor}12; border: 1.5px solid ${sevColor}44; border-radius: 12px; padding: 18px 20px; display: flex; align-items: flex-start; gap: 20px; }
  .sev-badge { background: ${sevColor}; color: #fff; font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.06em; display: inline-block; margin-bottom: 8px; }
  .disease-name { font-size: 20px; font-weight: 800; color: #111; margin-bottom: 6px; }
  .description { font-size: 13px; color: #4b5563; line-height: 1.6; }
  .conf-circle { width: 80px; height: 80px; border-radius: 50%; border: 5px solid ${sevColor}; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; }
  .conf-pct { font-size: 20px; font-weight: 800; color: ${sevColor}; line-height: 1; }
  .conf-lbl { font-size: 9px; color: #9ca3af; }
  .list-item { display: flex; gap: 10px; padding: 9px 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 7px; font-size: 13px; color: #374151; line-height: 1.5; }
  .list-icon { flex-shrink: 0; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .info-item { background: #f3f4f6; border-radius: 8px; padding: 12px 14px; }
  .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: #9ca3af; margin-bottom: 4px; }
  .info-val { font-size: 14px; font-weight: 700; color: #111; }
  .prevention-box { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 14px 16px; font-size: 13px; color: #065f46; line-height: 1.6; }
  .leaf-img { width: 100%; max-height: 220px; object-fit: cover; border-radius: 10px; border: 1px solid #e5e7eb; }
  .footer { border-top: 1px solid #e5e7eb; padding-top: 14px; margin-top: 28px; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; }
  .disclaimer { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #92400e; margin-top: 16px; }
  @media print { body { padding: 20px; } }
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
      <div class="disease-name">${top.display_name}</div>
      <div class="description">${top.description || ''}</div>
    </div>
    <div class="conf-circle">
      <span class="conf-pct">${pct}%</span>
      <span class="conf-lbl">confidence</span>
    </div>
  </div>
</div>

<div class="info-grid" style="margin-bottom:22px">
  <div class="info-item"><div class="info-label">Severity Level</div><div class="info-val" style="color:${sevColor}">${sev.toUpperCase()}</div></div>
  <div class="info-item"><div class="info-label">Crop</div><div class="info-val">${top.crop || farmerCrop}</div></div>
  <div class="info-item"><div class="info-label">AI Confidence</div><div class="info-val">${pct}%</div></div>
  <div class="info-item"><div class="info-label">Model</div><div class="info-val">MobileNetV2 v2</div></div>
</div>

${symptoms.length ? `<div class="section">
  <div class="section-title">⚠️ Symptoms Detected</div>
  ${symptoms.map(s => `<div class="list-item"><span class="list-icon">⚠️</span>${s}</div>`).join('')}
</div>` : ''}

<div class="section">
  <div class="section-title">💊 Recommended Treatment</div>
  ${treat.map(t => `<div class="list-item"><span class="list-icon">✅</span>${t}</div>`).join('')}
</div>

${top.prevention ? `<div class="section">
  <div class="section-title">🛡️ Prevention</div>
  <div class="prevention-box">${top.prevention}</div>
</div>` : ''}

<div class="disclaimer">⚠️ This report is generated by AI and is for guidance only. Always consult a certified agronomist or your local KVK (Krishi Vigyan Kendra) before applying treatments.</div>

<div class="footer">
  <span>Krishi Rakshak · AI-Powered Crop Protection · krishi-rakshak.app</span>
  <span>Generated: ${now}</span>
</div>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    setTimeout(() => {
      win.print();
    }, 300);
  };
}
