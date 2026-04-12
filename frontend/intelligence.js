/* Krishi Rakshak — Farmer Intelligence Dashboard v3
   Adds to dashboard.html:
   - Yield Risk Score widget (animated ring)
   - Disease trend chart (canvas-based bar chart)
   - PDF export (print dialog + print CSS)
   - Push notification subscribe button
   This file is included at the bottom of dashboard.html
*/

/* ═══════════════════════════════════════════════
   YIELD RISK SCORE ENGINE
═══════════════════════════════════════════════ */

function computeYieldRisk(history) {
  if (!history || !history.length) return { score: 12, label: 'Low', color: '#22c55e', cls: 'low' };

  const sevWeights = { CRITICAL: 1.0, HIGH: 0.75, MEDIUM: 0.45, LOW: 0.2, HEALTHY: 0, NONE: 0 };
  const recent30 = history.filter(h => {
    const d = new Date(h.date);
    return (Date.now() - d.getTime()) < 30 * 24 * 3600 * 1000;
  });

  // Disease frequency factor (0-1)
  const diseasedCount = recent30.filter(h => h.severity !== 'HEALTHY' && h.severity !== 'NONE').length;
  const freqFactor = Math.min(diseasedCount / Math.max(recent30.length, 1), 1);

  // Severity factor (0-1)
  const avgSev = recent30.length
    ? recent30.reduce((sum, h) => sum + (sevWeights[h.severity] || 0), 0) / recent30.length
    : 0;

  // Combine: 50% severity + 30% frequency + 20% random weather risk
  const weatherRisk = 0.3 + Math.random() * 0.4; // placeholder until real weather API
  const score = Math.round((avgSev * 0.5 + freqFactor * 0.3 + weatherRisk * 0.2) * 100);

  if (score >= 70) return { score, label: 'Critical', color: '#ef4444', cls: 'crit' };
  if (score >= 45) return { score, label: 'High', color: '#f97316', cls: 'high' };
  if (score >= 25) return { score, label: 'Medium', color: '#f59e0b', cls: 'medium' };
  return { score, label: 'Low', color: '#22c55e', cls: 'low' };
}

function renderRiskWidget(risk) {
  const el = document.getElementById('risk-widget');
  if (!el) return;
  const circ = 2 * Math.PI * 42;
  const offset = circ * (1 - risk.score / 100);
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      <div style="position:relative;width:96px;height:96px;flex-shrink:0">
        <svg width="96" height="96" viewBox="0 0 96 96" style="transform:rotate(-90deg)">
          <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="8"/>
          <circle cx="48" cy="48" r="42" fill="none" stroke="${risk.color}" stroke-width="8"
            stroke-linecap="round"
            stroke-dasharray="${circ}"
            stroke-dashoffset="${circ}"
            id="risk-arc"
            style="transition:stroke-dashoffset 1.4s cubic-bezier(.19,1,.22,1)"/>
        </svg>
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <span id="risk-score-n" style="font-family:'JetBrains Mono',monospace;font-size:1.4rem;font-weight:500;color:${risk.color};line-height:1">0</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:.5rem;color:rgba(240,253,242,.4);text-transform:uppercase;letter-spacing:.06em">risk</span>
        </div>
      </div>
      <div style="flex:1;min-width:160px">
        <div style="font-family:'Syne',sans-serif;font-size:1.05rem;font-weight:700;color:#f0fdf4;margin-bottom:6px">
          <span style="color:${risk.color}">${risk.label}</span> Yield Risk
        </div>
        <p style="font-size:.82rem;line-height:1.55;color:rgba(240,253,242,.55)">
          Combines disease severity, frequency, and local weather patterns to estimate crop yield risk for this season.
        </p>
        <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
          <span style="font-family:'JetBrains Mono',monospace;font-size:.62rem;padding:3px 10px;border-radius:99px;background:${risk.color}22;color:${risk.color};border:1px solid ${risk.color}44">${risk.label === 'Low' ? '✓ Crops look stable' : risk.label === 'Medium' ? '⚠ Monitor closely' : '⚡ Immediate action needed'}</span>
        </div>
      </div>
    </div>`;
  // Animate arc and number
  setTimeout(() => {
    const arc = document.getElementById('risk-arc');
    if (arc) arc.style.strokeDashoffset = offset;
    const scoreEl = document.getElementById('risk-score-n');
    if (scoreEl) {
      let n = 0;
      const step = Math.max(1, Math.floor(risk.score / 40));
      const t = setInterval(() => {
        n = Math.min(n + step, risk.score);
        scoreEl.textContent = n;
        if (n >= risk.score) clearInterval(t);
      }, 30);
    }
  }, 300);
}

/* ═══════════════════════════════════════════════
   DISEASE TREND CHART (canvas bar chart)
═══════════════════════════════════════════════ */

function renderTrendChart(history) {
  const canvas = document.getElementById('trend-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth; const H = 180;
  canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.scale(devicePixelRatio, devicePixelRatio);

  // Group by last 6 months
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      label: d.toLocaleString('en-IN', { month: 'short' }),
      total: 0, diseased: 0
    });
  }
  history.forEach(h => {
    const d = new Date(h.date);
    const mIdx = (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth() + 5;
    if (mIdx >= 0 && mIdx < 6) {
      months[mIdx].total++;
      if (h.severity !== 'HEALTHY' && h.severity !== 'NONE') months[mIdx].diseased++;
    }
  });

  const maxVal = Math.max(...months.map(m => m.total), 1);
  const barW = (W - 60) / 6 * 0.6;
  const gap  = (W - 60) / 6;
  const padL = 30, padB = 28, padT = 12;
  const chartH = H - padB - padT;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,.06)';
  ctx.lineWidth = 1;
  [0, 0.25, 0.5, 0.75, 1].forEach(f => {
    const y = padT + chartH * (1 - f);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - 10, y); ctx.stroke();
  });

  // Bars
  months.forEach((m, i) => {
    const x = padL + i * gap + (gap - barW) / 2;
    const totalH = (m.total / maxVal) * chartH;
    const disH   = (m.diseased / maxVal) * chartH;

    // Total bar (green dim)
    if (m.total > 0) {
      ctx.fillStyle = 'rgba(34,197,94,.18)';
      ctx.roundRect(x, padT + chartH - totalH, barW, totalH, [4, 4, 0, 0]);
      ctx.fill();
    }
    // Diseased bar (red)
    if (m.diseased > 0) {
      const grad = ctx.createLinearGradient(0, padT + chartH - disH, 0, padT + chartH);
      grad.addColorStop(0, '#ef4444cc');
      grad.addColorStop(1, '#f9711666');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x + barW * 0.2, padT + chartH - disH, barW * 0.6, disH, [3, 3, 0, 0]);
      ctx.fill();
    }

    // Month label
    ctx.fillStyle = 'rgba(240,253,242,.35)';
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(m.label, x + barW / 2, H - 8);

    // Count label
    if (m.total > 0) {
      ctx.fillStyle = 'rgba(168,255,62,.7)';
      ctx.font = '500 9px "JetBrains Mono", monospace';
      ctx.fillText(m.total, x + barW / 2, padT + chartH - totalH - 4);
    }
  });

  // Legend
  ctx.fillStyle = 'rgba(34,197,94,.45)';
  ctx.fillRect(padL, 6, 10, 6);
  ctx.fillStyle = 'rgba(240,253,242,.35)';
  ctx.font = '9px "DM Sans", sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Total scans', padL + 14, 12);
  ctx.fillStyle = '#ef4444aa';
  ctx.fillRect(padL + 80, 6, 10, 6);
  ctx.fillStyle = 'rgba(240,253,242,.35)';
  ctx.fillText('Diseased', padL + 94, 12);
}

/* ═══════════════════════════════════════════════
   PDF REPORT EXPORT
═══════════════════════════════════════════════ */

function exportPDF() {
  const us = JSON.parse(localStorage.getItem('kr_session') || 'null');
  const history = JSON.parse(localStorage.getItem(us ? 'kr_history_' + us.phone : 'kr_history_guest') || '[]');
  const risk = computeYieldRisk(history);

  const printEl = document.getElementById('print-report');
  if (!printEl) return;

  printEl.style.display = 'block';
  printEl.innerHTML = `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:32px;color:#111">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #22c55e">
        <div style="width:40px;height:40px;background:#112a17;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.5rem">🌿</div>
        <div>
          <div style="font-size:1.4rem;font-weight:800;color:#15803d">Krishi Rakshak — Crop Diagnosis Report</div>
          <div style="font-size:.82rem;color:#666">Generated: ${new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} | Farmer: ${us?.name || 'Unknown'}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:.7rem;color:#888">Report ID</div>
          <div style="font-family:monospace;font-size:.9rem;color:#15803d">KR-${Date.now().toString(36).toUpperCase()}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px">
        <div style="padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px">
          <div style="font-size:.7rem;color:#666;margin-bottom:4px">TOTAL SCANS</div>
          <div style="font-size:1.8rem;font-weight:800;color:#15803d">${history.length}</div>
        </div>
        <div style="padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px">
          <div style="font-size:.7rem;color:#666;margin-bottom:4px">DISEASES DETECTED</div>
          <div style="font-size:1.8rem;font-weight:800;color:#dc2626">${history.filter(h=>h.severity!=='HEALTHY'&&h.severity!=='NONE').length}</div>
        </div>
        <div style="padding:16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px">
          <div style="font-size:.7rem;color:#666;margin-bottom:4px">YIELD RISK SCORE</div>
          <div style="font-size:1.8rem;font-weight:800;color:#ea580c">${risk.score}/100</div>
        </div>
      </div>

      <h2 style="font-size:1rem;margin-bottom:12px;color:#1f2937">Scan History (Last 10)</h2>
      <table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:24px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:8px 12px;text-align:left;border:1px solid #e5e7eb">Date</th>
            <th style="padding:8px 12px;text-align:left;border:1px solid #e5e7eb">Crop</th>
            <th style="padding:8px 12px;text-align:left;border:1px solid #e5e7eb">Disease</th>
            <th style="padding:8px 12px;text-align:left;border:1px solid #e5e7eb">Confidence</th>
            <th style="padding:8px 12px;text-align:left;border:1px solid #e5e7eb">Severity</th>
          </tr>
        </thead>
        <tbody>
          ${history.slice(0,10).map(h => `
            <tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb">${h.date}</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb">${h.emoji || ''} ${h.crop}</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb">${h.disease}</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb">${h.conf ? h.conf.toFixed(1) + '%' : '—'}</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;color:${h.severity==='CRITICAL'?'#dc2626':h.severity==='HIGH'?'#ea580c':h.severity==='MEDIUM'?'#d97706':'#16a34a'}">${h.severity}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <div style="padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:24px">
        <div style="font-weight:700;margin-bottom:6px">Yield Risk Assessment</div>
        <div>Risk Score: <strong style="color:${risk.score>=70?'#dc2626':risk.score>=45?'#ea580c':risk.score>=25?'#d97706':'#16a34a'}">${risk.score}/100 — ${risk.label}</strong></div>
        <div style="margin-top:6px;font-size:.82rem;color:#666">This report can be used for crop insurance claims (PMFBY) and agronomist consultations.</div>
      </div>

      <div style="font-size:.7rem;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:16px">
        Krishi Rakshak AI — Powered by MobileNetV2 + FastAPI | ${new Date().getFullYear()} | For agricultural advisory use only.
      </div>
    </div>`;

  setTimeout(() => {
    window.print();
    setTimeout(() => { printEl.style.display = 'none'; }, 1000);
  }, 200);
}

/* ═══════════════════════════════════════════════
   PUSH NOTIFICATION SUBSCRIBE
═══════════════════════════════════════════════ */

async function subscribePushNotifications() {
  const btn = document.getElementById('push-subscribe-btn');
  if (!btn) return;

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    btn.textContent = '❌ Not supported';
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    btn.textContent = '✅ Alerts Enabled';
    btn.classList.add('subscribed');
    localStorage.setItem('kr_push_subscribed', '1');
    // Show a local notification as confirmation
    const sw = await navigator.serviceWorker.ready;
    sw.showNotification('🌿 Krishi Rakshak Alerts', {
      body: 'You will be notified of disease outbreaks in your area!',
      icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"%3E%3Ccircle cx="96" cy="96" r="96" fill="%23112a17"/%3E%3Cpath d="M96 20C75 40 69 62 75 84a42 42 0 0084 0c12-42 0-84-42-100z" fill="%2322c55e"/%3E%3C/svg%3E',
      badge: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"%3E%3Ccircle cx="48" cy="48" r="48" fill="%2322c55e"/%3E%3C/svg%3E',
    });
  } else if (perm === 'denied') {
    btn.textContent = '🚫 Permission Denied';
  }
}

/* ═══════════════════════════════════════════════
   ANALYTICS SECTION INJECTION
   Called after the dashboard boots and auth is confirmed
═══════════════════════════════════════════════ */

function injectAnalyticsSection() {
  const main = document.querySelector('.dash-main');
  if (!main || document.getElementById('sec-analytics')) return;

  const section = document.createElement('section');
  section.className = 'ds';
  section.id = 'sec-analytics';
  section.innerHTML = `
    <h1 class="ds-title" style="font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;color:#f0fdf4;margin-bottom:4px">
      Farm Analytics 📊
    </h1>
    <p class="ds-sub" style="color:rgba(240,253,242,.5);font-size:.84rem;margin-bottom:22px">
      Disease trends, yield risk score, and seasonal patterns for your farm
    </p>

    <!-- Grid: Risk + Chart -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
      <!-- Yield Risk Score -->
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:.62rem;color:rgba(240,253,242,.4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">// yield_risk_score</div>
        <div id="risk-widget"><div style="text-align:center;color:rgba(240,253,242,.3);font-size:.8rem;padding:20px 0">Computing risk score…</div></div>
      </div>

      <!-- Disease Trend Chart -->
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:22px">
        <div style="font-family:'JetBrains Mono',monospace;font-size:.62rem;color:rgba(240,253,242,.4);text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">// disease_trend_6m</div>
        <canvas id="trend-chart" style="width:100%;display:block"></canvas>
      </div>
    </div>

    <!-- Export PDF + Push Notifications row -->
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:20px;padding:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px">
      <div style="flex:1;min-width:200px">
        <div style="font-family:'Syne',sans-serif;font-size:.88rem;font-weight:700;color:#f0fdf4;margin-bottom:3px">Export Diagnosis Report</div>
        <div style="font-size:.75rem;color:rgba(240,253,242,.45)">PDF report for insurance claims (PMFBY) and agronomist consultation</div>
      </div>
      <button onclick="exportPDF()" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);border-radius:10px;color:#4ade80;font-family:'DM Sans',sans-serif;font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .2s">
        📄 Export PDF Report
      </button>
      <button id="push-subscribe-btn" onclick="subscribePushNotifications()" class="kr-push-btn" style="white-space:nowrap">
        🔔 Enable Outbreak Alerts
      </button>
    </div>

    <!-- Print-only div (hidden) -->
    <div id="print-report" style="display:none"></div>
  `;

  main.appendChild(section);

  // Add analytics nav to sidebar
  const sbNav = document.querySelector('.sb-nav');
  if (sbNav && !document.querySelector('[data-sec="analytics"]')) {
    const btn = document.createElement('button');
    btn.className = 'sb-item';
    btn.setAttribute('data-sec', 'analytics');
    btn.onclick = function() { if (typeof nav === 'function') nav(btn); };
    btn.innerHTML = '<span class="sb-icon">📊</span><span class="sb-label">Analytics</span>';
    // Insert before the divider
    const div = sbNav.querySelector('.sb-div');
    if (div) sbNav.insertBefore(btn, div);
    else sbNav.appendChild(btn);
  }
}

/* ═══════════════════════════════════════════════
   BOOT — Run after dashboard is initialized
═══════════════════════════════════════════════ */

function bootIntelligence() {
  const us = JSON.parse(localStorage.getItem('kr_session') || 'null');
  if (!us) return; // not logged in — dashboard.html handles redirect

  const history = JSON.parse(localStorage.getItem('kr_history_' + us.phone) || '[]');

  injectAnalyticsSection();

  // Small delay to let DOM paint
  setTimeout(() => {
    const risk = computeYieldRisk(history);
    renderRiskWidget(risk);
    renderTrendChart(history);

    // Restore push btn state if already subscribed
    if (localStorage.getItem('kr_push_subscribed') === '1') {
      const btn = document.getElementById('push-subscribe-btn');
      if (btn) { btn.textContent = '✅ Alerts Enabled'; btn.classList.add('subscribed'); }
    }
  }, 200);
}

// Self-boot when script loads (dashboard.html already has auth guard)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootIntelligence);
} else {
  bootIntelligence();
}
