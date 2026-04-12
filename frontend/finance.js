'use strict';
/* ═══════════════════════════════════════════════════════════════
   Krishi Rakshak — Finance & Profit Calculator (finance.js)
   Pure frontend, localStorage persistence
═══════════════════════════════════════════════════════════════ */

// ── Storage helpers ──────────────────────────────────────────────────────────
const LS_KEY = 'kr_finance_v1';
function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || { crops: [] }; } catch { return { crops: [] }; }
}
function save(data) { localStorage.setItem(LS_KEY, JSON.stringify(data)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const CATEGORIES = ['Seed', 'Fertiliser', 'Pesticide', 'Labour', 'Irrigation', 'Land Rent', 'Transport', 'Other'];
const CAT_COLORS = {
  'Seed': '#22c55e', 'Fertiliser': '#a8ff3e', 'Pesticide': '#f59e0b',
  'Labour': '#14b8a6', 'Irrigation': '#60a5fa', 'Land Rent': '#c084fc',
  'Transport': '#fb923c', 'Other': '#94a3b8',
};
const QUICK_ADD = [
  { label: '+ Labour Day', cat: 'Labour', item: 'Daily Labour', amount: 500 },
  { label: '+ Urea Bag', cat: 'Fertiliser', item: 'Urea (50kg)', amount: 350 },
  { label: '+ DAP Bag', cat: 'Fertiliser', item: 'DAP (50kg)', amount: 1350 },
  { label: '+ Pesticide', cat: 'Pesticide', item: 'Spray', amount: 250 },
  { label: '+ Irrigation', cat: 'Irrigation', item: 'Pump/Canal', amount: 200 },
];

let state = load();
let activeCropId = state.crops[0]?.id || null;

// ── Bootstrap ────────────────────────────────────────────────────────────────
document.getElementById('fin-app').innerHTML = `
<style>
:root{--green:#22c55e;--lime:#a8ff3e;--bg:#0c1f12;--bg-card:#1a3d22;--border:rgba(74,222,128,.08);--border-h:rgba(74,222,128,.22);--t1:#f0fdf4;--tm:rgba(134,239,172,.45);--fh:'Syne',sans-serif;--fm:'JetBrains Mono',monospace;--fb:'DM Sans',sans-serif;}
*{box-sizing:border-box;margin:0;padding:0;}
body{background:radial-gradient(ellipse 90% 65% at 50% -5%,#2a6e3a 0%,#183421 40%,#112a17 70%);color:var(--t1);font-family:var(--fb);min-height:100vh;}
/* NAV */
.fn-nav{position:sticky;top:0;z-index:100;background:rgba(12,31,18,.95);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);padding:0 20px;}
.fn-nav-inner{max-width:1300px;margin:0 auto;height:56px;display:flex;align-items:center;gap:16px;}
.fn-logo{font-family:var(--fh);font-weight:800;font-size:.95rem;color:var(--t1);text-decoration:none;display:flex;align-items:center;gap:8px;}
.fn-nav-links{display:flex;gap:4px;margin-left:auto;flex-wrap:wrap;}
.fn-nav-links a{color:var(--tm);text-decoration:none;font-size:.75rem;padding:5px 10px;border-radius:8px;transition:all .2s;}
.fn-nav-links a:hover,.fn-nav-links a.active{color:var(--t1);background:rgba(255,255,255,.06);}
/* LAYOUT */
.fin-wrap{max-width:1300px;margin:0 auto;padding:24px 16px 80px;display:grid;grid-template-columns:240px 1fr;gap:20px;}
@media(max-width:768px){.fin-wrap{grid-template-columns:1fr;}}
/* SIDEBAR */
.fin-sb{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:16px;height:fit-content;position:sticky;top:72px;}
.fin-sb-title{font-family:var(--fh);font-size:.78rem;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;}
.crop-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;transition:all .2s;border:1px solid transparent;margin-bottom:4px;}
.crop-item:hover{background:rgba(34,197,94,.06);border-color:var(--border-h);}
.crop-item.active{background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.25);}
.crop-item-name{font-size:.85rem;font-weight:500;flex:1;}
.crop-item-del{opacity:0;font-size:.75rem;color:rgba(239,68,68,.6);padding:2px 6px;border-radius:4px;transition:opacity .2s;}
.crop-item:hover .crop-item-del{opacity:1;}
.btn-add-crop{width:100%;margin-top:8px;padding:10px;background:rgba(34,197,94,.08);border:1px dashed rgba(34,197,94,.25);border-radius:10px;color:var(--green);font-size:.82rem;cursor:pointer;transition:all .2s;}
.btn-add-crop:hover{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.4);}
.sb-compare-btn{width:100%;margin-top:12px;padding:9px;background:rgba(168,255,62,.06);border:1px solid rgba(168,255,62,.2);border-radius:10px;color:var(--lime);font-size:.78rem;cursor:pointer;transition:all .2s;}
.sb-compare-btn:hover{background:rgba(168,255,62,.12);}
/* MAIN PANEL */
.fin-main{display:flex;flex-direction:column;gap:18px;}
.fin-card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:20px;}
.fin-card-title{font-family:var(--fh);font-size:.9rem;font-weight:700;color:var(--t1);margin-bottom:16px;display:flex;align-items:center;gap:8px;}
/* EXPENSE FORM */
.exp-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:10px;align-items:end;}
@media(max-width:900px){.exp-grid{grid-template-columns:1fr 1fr;}}
@media(max-width:480px){.exp-grid{grid-template-columns:1fr;}}
.fg{display:flex;flex-direction:column;gap:5px;}
.fg label{font-size:.65rem;color:var(--tm);text-transform:uppercase;letter-spacing:.07em;}
.fg input,.fg select{background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:8px;padding:9px 12px;color:var(--t1);font-family:var(--fb);font-size:.85rem;outline:none;transition:border .2s;width:100%;}
.fg input:focus,.fg select:focus{border-color:rgba(34,197,94,.4);}
.fg select option{background:#112a17;}
.btn-add-exp{padding:9px 18px;background:var(--green);border:none;border-radius:8px;color:#0a1a0e;font-weight:700;font-size:.82rem;cursor:pointer;white-space:nowrap;height:38px;transition:opacity .2s;}
.btn-add-exp:hover{opacity:.85;}
.quick-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
.quick-btn{padding:6px 12px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;font-size:.75rem;color:var(--tm);cursor:pointer;transition:all .2s;}
.quick-btn:hover{border-color:var(--border-h);color:var(--t1);}
/* EXPENSE LIST */
.exp-list{margin-top:14px;display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;}
.exp-row{display:flex;align-items:center;gap:10px;padding:9px 12px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px;}
.exp-cat-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.exp-row-info{flex:1;font-size:.82rem;}
.exp-row-cat{font-size:.68rem;color:var(--tm);}
.exp-row-amt{font-family:var(--fm);font-size:.85rem;color:var(--lime);}
.exp-row-del{font-size:.75rem;color:rgba(239,68,68,.5);cursor:pointer;padding:2px 6px;border-radius:4px;transition:color .2s;}
.exp-row-del:hover{color:#f87171;}
/* SUMMARY CARDS */
.sum-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;}
@media(max-width:600px){.sum-grid{grid-template-columns:1fr 1fr;}}
.sum-card{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:12px;padding:14px;}
.sum-card-val{font-family:var(--fh);font-size:1.4rem;font-weight:800;color:var(--lime);}
.sum-card-label{font-size:.7rem;color:var(--tm);margin-top:3px;}
/* DONUT CHART */
.donut-wrap{display:flex;gap:20px;align-items:center;flex-wrap:wrap;}
.donut{width:120px;height:120px;border-radius:50%;flex-shrink:0;}
.donut-legend{display:flex;flex-direction:column;gap:6px;flex:1;}
.dl-item{display:flex;align-items:center;gap:8px;font-size:.75rem;}
.dl-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
.dl-pct{font-family:var(--fm);font-size:.7rem;color:var(--tm);margin-left:auto;}
/* PROFIT SECTION */
.profit-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;}
@media(max-width:500px){.profit-grid{grid-template-columns:1fr;}}
.profit-result{border-radius:14px;padding:18px;border:1px solid;}
.profit-result.positive{background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.25);}
.profit-result.negative{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.25);}
.profit-result.neutral{background:rgba(255,255,255,.04);border-color:var(--border);}
.pr-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:.84rem;}
.pr-row:last-child{border-bottom:none;}
.pr-row .val{font-family:var(--fm);font-weight:600;}
.pr-net{font-family:var(--fh);font-size:1.5rem;font-weight:800;margin-top:10px;}
.pr-roi{font-size:.78rem;color:var(--tm);margin-top:4px;}
/* COMPARISON */
.compare-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;}
.cmp-card{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center;}
.cmp-crop{font-size:.82rem;font-weight:600;margin-bottom:8px;}
.cmp-bar-wrap{height:80px;display:flex;align-items:flex-end;justify-content:center;margin-bottom:8px;}
.cmp-bar{width:40px;border-radius:4px 4px 0 0;min-height:4px;transition:height .5s ease;}
.cmp-val{font-family:var(--fh);font-size:1rem;font-weight:700;}
.cmp-val.pos{color:#4ade80;}.cmp-val.neg{color:#f87171;}
/* EMPTY STATE */
.fin-empty{text-align:center;padding:48px 20px;color:var(--tm);}
.fin-empty-icon{font-size:2.5rem;margin-bottom:12px;}
/* PRINT */
@media print{
  .fn-nav,.fin-sb,.btn-add-exp,.quick-row,.exp-row-del,.btn-add-crop,.sb-compare-btn,.btn-export,.no-print{display:none!important;}
  body{background:#fff!important;color:#000!important;}
  .fin-wrap{grid-template-columns:1fr!important;padding:0!important;}
  .fin-card{border:1px solid #ccc!important;background:#fff!important;break-inside:avoid;}
  .fin-card-title,.sum-card-val,.pr-net{color:#000!important;}
  .sum-card-label,.pr-roi,.exp-row-cat{color:#555!important;}
  .exp-row-amt,.dl-pct{color:#166534!important;}
}
</style>

<!-- NAV injected by nav.js -->

<div class="fin-wrap">
  <!-- Sidebar -->
  <aside class="fin-sb">
    <div class="fin-sb-title">My Crops</div>
    <div id="crop-list"></div>
    <button class="btn-add-crop" onclick="openAddCrop()">+ Add Crop</button>
    <button class="sb-compare-btn" onclick="showCompare()">📊 Compare All Crops</button>
  </aside>

  <!-- Main -->
  <main class="fin-main" id="fin-main"></main>
</div>

<!-- Add Crop Modal -->
<div id="modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:500;display:none;align-items:center;justify-content:center;">
  <div style="background:#1a3d22;border:1px solid rgba(74,222,128,.2);border-radius:18px;padding:28px;width:min(420px,90vw);">
    <div style="font-family:var(--fh);font-size:1.1rem;font-weight:800;margin-bottom:18px;">🌱 Add New Crop</div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div class="fg"><label>Crop Name</label><input id="m-crop-name" placeholder="e.g. Tomato, Wheat"/></div>
      <div class="fg"><label>Field Area (Acres)</label><input id="m-crop-area" type="number" value="1" min="0.1" step="0.1"/></div>
      <div class="fg"><label>Sowing Date</label><input id="m-crop-sow" type="date"/></div>
      <div class="fg"><label>Expected Harvest Date</label><input id="m-crop-harvest" type="date"/></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:18px;">
      <button onclick="closeModal()" style="flex:1;padding:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:rgba(240,253,242,.6);cursor:pointer;">Cancel</button>
      <button onclick="addCrop()" style="flex:1;padding:10px;background:#22c55e;border:none;border-radius:10px;color:#0a1a0e;font-weight:700;cursor:pointer;">Add Crop</button>
    </div>
  </div>
</div>
`;

// ── Render sidebar crop list ─────────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('crop-list');
  if (!list) return;
  if (!state.crops.length) {
    list.innerHTML = '<div style="font-size:.78rem;color:var(--tm);padding:8px 4px;">No crops yet. Add one!</div>';
    return;
  }
  list.innerHTML = state.crops.map(c => `
    <div class="crop-item ${c.id === activeCropId ? 'active' : ''}" onclick="selectCrop('${c.id}')">
      <span style="font-size:1rem">${cropEmoji(c.name)}</span>
      <span class="crop-item-name">${c.name}</span>
      <span class="crop-item-del" onclick="deleteCrop(event,'${c.id}')">✕</span>
    </div>
  `).join('');
}

function cropEmoji(name) {
  const n = name.toLowerCase();
  if (n.includes('tomato')) return '🍅';
  if (n.includes('wheat')) return '🌾';
  if (n.includes('paddy') || n.includes('rice')) return '🌾';
  if (n.includes('potato')) return '🥔';
  if (n.includes('onion')) return '🧅';
  if (n.includes('chilli')) return '🌶️';
  if (n.includes('mango')) return '🥭';
  if (n.includes('banana')) return '🍌';
  if (n.includes('sugarcane')) return '🎋';
  if (n.includes('maize') || n.includes('corn')) return '🌽';
  return '🌱';
}

// ── Render main panel ────────────────────────────────────────────────────────
function renderMain() {
  const main = document.getElementById('fin-main');
  if (!main) return;

  if (!state.crops.length) {
    main.innerHTML = `<div class="fin-empty"><div class="fin-empty-icon">📊</div><p>Add your first crop to start tracking expenses and profits.</p></div>`;
    return;
  }

  const crop = state.crops.find(c => c.id === activeCropId);
  if (!crop) { activeCropId = state.crops[0].id; renderMain(); return; }

  const totalSpent = (crop.expenses || []).reduce((s, e) => s + e.amount, 0);
  const area = crop.field_area_acres || 1;
  const costPerAcre = totalSpent / area;

  // Category breakdown
  const catTotals = {};
  (crop.expenses || []).forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
  const donutCSS = buildDonut(catTotals, totalSpent);

  // Profit forecast
  const expectedYield = crop.expected_yield_quintals || 0;
  const expectedPrice = crop.expected_price_per_quintal || getLastMandiPrice(crop.name);
  const grossIncome = expectedYield * expectedPrice;
  const netProfit = grossIncome - totalSpent;
  const roi = totalSpent > 0 ? ((netProfit / totalSpent) * 100).toFixed(1) : 0;
  const profitClass = netProfit > 0 ? 'positive' : netProfit < 0 ? 'negative' : 'neutral';
  const profitColor = netProfit > 0 ? '#4ade80' : netProfit < 0 ? '#f87171' : 'var(--tm)';

  main.innerHTML = `
  <!-- Crop header -->
  <div class="fin-card" style="padding:16px 20px;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-family:var(--fh);font-size:1.3rem;font-weight:800;">${cropEmoji(crop.name)} ${crop.name}</div>
        <div style="font-size:.75rem;color:var(--tm);margin-top:3px;">
          ${crop.field_area_acres} acres
          ${crop.sowing_date ? ' · Sown: ' + crop.sowing_date : ''}
          ${crop.expected_harvest_date ? ' · Harvest: ' + crop.expected_harvest_date : ''}
        </div>
      </div>
      <button class="btn-export no-print" onclick="exportPDF('${crop.id}')" style="padding:8px 16px;background:rgba(168,255,62,.08);border:1px solid rgba(168,255,62,.2);border-radius:10px;color:var(--lime);font-size:.78rem;cursor:pointer;">📄 Export Season Report</button>
    </div>
  </div>

  <!-- Expense Entry -->
  <div class="fin-card">
    <div class="fin-card-title">➕ Add Expense</div>
    <div class="exp-grid">
      <div class="fg">
        <label>Category</label>
        <select id="e-cat">${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
      </div>
      <div class="fg"><label>Item / Description</label><input id="e-item" placeholder="e.g. Urea 50kg bag"/></div>
      <div class="fg"><label>Amount (₹)</label><input id="e-amt" type="number" placeholder="0" min="0"/></div>
      <div class="fg"><label>Date</label><input id="e-date" type="date" value="${today()}"/></div>
      <button class="btn-add-exp" onclick="addExpense('${crop.id}')">Add</button>
    </div>
    <div class="quick-row">
      ${QUICK_ADD.map(q => `<button class="quick-btn" onclick="quickAdd('${crop.id}','${q.cat}','${q.item}',${q.amount})">${q.label}</button>`).join('')}
    </div>
    <!-- Expense list -->
    <div class="exp-list" id="exp-list">
      ${renderExpenseList(crop)}
    </div>
  </div>

  <!-- Cost Summary -->
  <div class="fin-card">
    <div class="fin-card-title">💰 Cost Summary</div>
    <div class="sum-grid">
      <div class="sum-card">
        <div class="sum-card-val">₹${totalSpent.toLocaleString('en-IN')}</div>
        <div class="sum-card-label">Total Spent So Far</div>
      </div>
      <div class="sum-card">
        <div class="sum-card-val">₹${Math.round(costPerAcre).toLocaleString('en-IN')}</div>
        <div class="sum-card-label">Cost Per Acre</div>
      </div>
      <div class="sum-card">
        <div class="sum-card-val">${(crop.expenses || []).length}</div>
        <div class="sum-card-label">Expense Entries</div>
      </div>
    </div>
    ${totalSpent > 0 ? `
    <div class="donut-wrap">
      <div class="donut" style="background:${donutCSS};"></div>
      <div class="donut-legend">
        ${Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).map(([cat, amt]) => `
          <div class="dl-item">
            <div class="dl-dot" style="background:${CAT_COLORS[cat]||'#94a3b8'}"></div>
            <span>${cat}</span>
            <span class="dl-pct">${((amt/totalSpent)*100).toFixed(0)}% · ₹${amt.toLocaleString('en-IN')}</span>
          </div>
        `).join('')}
      </div>
    </div>` : '<div style="color:var(--tm);font-size:.82rem;">No expenses yet.</div>'}
  </div>

  <!-- Profit Forecast -->
  <div class="fin-card">
    <div class="fin-card-title">📈 Profit Forecast</div>
    <div class="profit-grid">
      <div class="fg"><label>Expected Yield (Quintals)</label>
        <input id="p-yield" type="number" value="${expectedYield||''}" placeholder="e.g. 40" oninput="updateForecast('${crop.id}')"/>
      </div>
      <div class="fg"><label>Expected Price (₹/quintal)</label>
        <input id="p-price" type="number" value="${expectedPrice||''}" placeholder="e.g. 1800" oninput="updateForecast('${crop.id}')"/>
      </div>
    </div>
    <div class="profit-result ${profitClass}" id="profit-result">
      ${renderProfitResult(grossIncome, totalSpent, netProfit, roi, profitColor)}
    </div>
  </div>
  `;
}

function renderExpenseList(crop) {
  const exps = (crop.expenses || []).slice().reverse();
  if (!exps.length) return '<div style="color:var(--tm);font-size:.78rem;padding:8px 0;">No expenses yet.</div>';
  return exps.map(e => `
    <div class="exp-row">
      <div class="exp-cat-dot" style="background:${CAT_COLORS[e.category]||'#94a3b8'}"></div>
      <div class="exp-row-info">
        <div>${e.item}</div>
        <div class="exp-row-cat">${e.category} · ${e.date}</div>
      </div>
      <div class="exp-row-amt">₹${e.amount.toLocaleString('en-IN')}</div>
      <span class="exp-row-del" onclick="deleteExpense('${crop.id}','${e.id}')">✕</span>
    </div>
  `).join('');
}

function renderProfitResult(gross, cost, net, roi, color) {
  if (!gross && !cost) return '<div style="color:var(--tm);font-size:.82rem;">Enter yield and price above to see forecast.</div>';
  return `
    <div class="pr-row"><span>Gross Income</span><span class="val" style="color:#4ade80">₹${gross.toLocaleString('en-IN')}</span></div>
    <div class="pr-row"><span>Total Cost</span><span class="val" style="color:#f87171">₹${cost.toLocaleString('en-IN')}</span></div>
    <div class="pr-net" style="color:${color}">${net >= 0 ? '✅' : '❌'} Net ${net >= 0 ? 'Profit' : 'Loss'}: ₹${Math.abs(net).toLocaleString('en-IN')}</div>
    <div class="pr-roi">ROI: ${roi}% ${net >= 0 ? '· Good season!' : '· Review your costs'}</div>
  `;
}

function buildDonut(catTotals, total) {
  if (!total) return 'conic-gradient(#1a3d22 0deg 360deg)';
  let angle = 0;
  const parts = [];
  Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).forEach(([cat, amt]) => {
    const deg = (amt / total) * 360;
    parts.push(`${CAT_COLORS[cat]||'#94a3b8'} ${angle}deg ${angle+deg}deg`);
    angle += deg;
  });
  return `conic-gradient(${parts.join(',')})`;
}

function getLastMandiPrice(cropName) {
  try {
    const saved = localStorage.getItem('kr_last_mandi_price');
    if (saved) { const d = JSON.parse(saved); if (d.crop?.toLowerCase() === cropName.toLowerCase()) return d.price; }
  } catch {}
  return 0;
}

function today() { return new Date().toISOString().split('T')[0]; }

// ── Actions ──────────────────────────────────────────────────────────────────
function selectCrop(id) {
  activeCropId = id;
  renderSidebar();
  renderMain();
}

function openAddCrop() {
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'flex';
  document.getElementById('m-crop-sow').value = today();
}
function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }

function addCrop() {
  const name = document.getElementById('m-crop-name').value.trim();
  if (!name) { alert('Please enter a crop name.'); return; }
  const crop = {
    id: uid(), name,
    field_area_acres: parseFloat(document.getElementById('m-crop-area').value) || 1,
    sowing_date: document.getElementById('m-crop-sow').value,
    expected_harvest_date: document.getElementById('m-crop-harvest').value,
    expenses: [],
    expected_yield_quintals: 0,
    expected_price_per_quintal: 0,
  };
  state.crops.push(crop);
  activeCropId = crop.id;
  save(state);
  closeModal();
  renderSidebar();
  renderMain();
}

function deleteCrop(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this crop and all its expenses?')) return;
  state.crops = state.crops.filter(c => c.id !== id);
  if (activeCropId === id) activeCropId = state.crops[0]?.id || null;
  save(state);
  renderSidebar();
  renderMain();
}

function addExpense(cropId) {
  const cat  = document.getElementById('e-cat').value;
  const item = document.getElementById('e-item').value.trim();
  const amt  = parseFloat(document.getElementById('e-amt').value);
  const date = document.getElementById('e-date').value;
  if (!item || !amt || amt <= 0) { alert('Please fill in item and amount.'); return; }
  const crop = state.crops.find(c => c.id === cropId);
  if (!crop) return;
  crop.expenses = crop.expenses || [];
  crop.expenses.push({ id: uid(), category: cat, item, amount: amt, date: date || today() });
  save(state);
  document.getElementById('e-item').value = '';
  document.getElementById('e-amt').value = '';
  renderMain();
}

function quickAdd(cropId, cat, item, amount) {
  const crop = state.crops.find(c => c.id === cropId);
  if (!crop) return;
  crop.expenses = crop.expenses || [];
  crop.expenses.push({ id: uid(), category: cat, item, amount, date: today() });
  save(state);
  renderMain();
}

function deleteExpense(cropId, expId) {
  const crop = state.crops.find(c => c.id === cropId);
  if (!crop) return;
  crop.expenses = (crop.expenses || []).filter(e => e.id !== expId);
  save(state);
  renderMain();
}

function updateForecast(cropId) {
  const crop = state.crops.find(c => c.id === cropId);
  if (!crop) return;
  const y = parseFloat(document.getElementById('p-yield')?.value) || 0;
  const p = parseFloat(document.getElementById('p-price')?.value) || 0;
  crop.expected_yield_quintals = y;
  crop.expected_price_per_quintal = p;
  // Save last price for market.html cross-reference
  if (p > 0) localStorage.setItem('kr_last_mandi_price', JSON.stringify({ crop: crop.name, price: p }));
  save(state);
  const gross = y * p;
  const totalSpent = (crop.expenses || []).reduce((s, e) => s + e.amount, 0);
  const net = gross - totalSpent;
  const roi = totalSpent > 0 ? ((net / totalSpent) * 100).toFixed(1) : 0;
  const profitClass = net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral';
  const color = net > 0 ? '#4ade80' : net < 0 ? '#f87171' : 'var(--tm)';
  const el = document.getElementById('profit-result');
  if (el) {
    el.className = `profit-result ${profitClass}`;
    el.innerHTML = renderProfitResult(gross, totalSpent, net, roi, color);
  }
}

// ── Comparison view ──────────────────────────────────────────────────────────
function showCompare() {
  const main = document.getElementById('fin-main');
  if (!main) return;
  if (!state.crops.length) { alert('No crops to compare.'); return; }

  const items = state.crops.map(c => {
    const cost = (c.expenses || []).reduce((s, e) => s + e.amount, 0);
    const gross = (c.expected_yield_quintals || 0) * (c.expected_price_per_quintal || 0);
    const net = gross - cost;
    return { name: c.name, cost, gross, net };
  });

  const maxAbs = Math.max(...items.map(i => Math.abs(i.net)), 1);

  main.innerHTML = `
  <div class="fin-card">
    <div class="fin-card-title" style="justify-content:space-between;">
      📊 Season Comparison
      <button onclick="renderMain()" style="font-size:.75rem;color:var(--tm);background:none;border:none;cursor:pointer;">← Back</button>
    </div>
    <div class="compare-grid">
      ${items.map(item => {
        const barH = Math.round((Math.abs(item.net) / maxAbs) * 72);
        const barColor = item.net >= 0 ? '#22c55e' : '#ef4444';
        return `
        <div class="cmp-card">
          <div class="cmp-crop">${cropEmoji(item.name)} ${item.name}</div>
          <div class="cmp-bar-wrap">
            <div class="cmp-bar" style="height:${barH}px;background:${barColor};"></div>
          </div>
          <div class="cmp-val ${item.net >= 0 ? 'pos' : 'neg'}">
            ${item.net >= 0 ? '+' : ''}₹${Math.abs(item.net).toLocaleString('en-IN')}
          </div>
          <div style="font-size:.68rem;color:var(--tm);margin-top:3px;">${item.net >= 0 ? 'Profit' : 'Loss'}</div>
          <div style="font-size:.68rem;color:var(--tm);margin-top:2px;">Cost: ₹${item.cost.toLocaleString('en-IN')}</div>
        </div>`;
      }).join('')}
    </div>
    ${items.length < 2 ? '<div style="color:var(--tm);font-size:.82rem;margin-top:12px;">Add more crops to compare.</div>' : ''}
  </div>`;
}

// ── PDF Export ───────────────────────────────────────────────────────────────
function exportPDF(cropId) {
  const crop = state.crops.find(c => c.id === cropId);
  if (!crop) return;
  const totalSpent = (crop.expenses || []).reduce((s, e) => s + e.amount, 0);
  const gross = (crop.expected_yield_quintals || 0) * (crop.expected_price_per_quintal || 0);
  const net = gross - totalSpent;

  // Inject print-only content
  let printDiv = document.getElementById('print-report');
  if (printDiv) printDiv.remove();
  printDiv = document.createElement('div');
  printDiv.id = 'print-report';
  printDiv.style.cssText = 'display:none;';
  printDiv.innerHTML = `
    <style>
      @media print {
        #print-report { display:block!important; }
        body > *:not(#print-report) { display:none!important; }
        #print-report { font-family:Arial,sans-serif; color:#000; padding:20px; }
        h1{font-size:1.4rem;margin-bottom:4px;} h2{font-size:1rem;margin:16px 0 8px;}
        table{width:100%;border-collapse:collapse;margin-bottom:16px;}
        th,td{border:1px solid #ccc;padding:7px 10px;font-size:.82rem;text-align:left;}
        th{background:#f0fdf4;font-weight:600;}
        .sum-row{font-weight:700;}
        .profit{color:#166534;} .loss{color:#dc2626;}
      }
    </style>
    <h1>🌿 Krishi Rakshak — Season Report</h1>
    <p style="color:#555;font-size:.85rem;">Crop: <strong>${crop.name}</strong> · Area: ${crop.field_area_acres} acres · Generated: ${new Date().toLocaleDateString('en-IN')}</p>
    <h2>Expense Ledger</h2>
    <table>
      <thead><tr><th>Date</th><th>Category</th><th>Item</th><th>Amount (₹)</th></tr></thead>
      <tbody>
        ${(crop.expenses || []).map(e => `<tr><td>${e.date}</td><td>${e.category}</td><td>${e.item}</td><td>₹${e.amount.toLocaleString('en-IN')}</td></tr>`).join('')}
        <tr class="sum-row"><td colspan="3">Total Expenses</td><td>₹${totalSpent.toLocaleString('en-IN')}</td></tr>
      </tbody>
    </table>
    <h2>Profit Summary</h2>
    <table>
      <tbody>
        <tr><td>Expected Yield</td><td>${crop.expected_yield_quintals || 0} quintals</td></tr>
        <tr><td>Expected Price</td><td>₹${crop.expected_price_per_quintal || 0}/quintal</td></tr>
        <tr><td>Gross Income</td><td>₹${gross.toLocaleString('en-IN')}</td></tr>
        <tr><td>Total Cost</td><td>₹${totalSpent.toLocaleString('en-IN')}</td></tr>
        <tr class="sum-row"><td>Net ${net >= 0 ? 'Profit' : 'Loss'}</td><td class="${net >= 0 ? 'profit' : 'loss'}">₹${Math.abs(net).toLocaleString('en-IN')}</td></tr>
        <tr><td>ROI</td><td>${totalSpent > 0 ? ((net/totalSpent)*100).toFixed(1) : 0}%</td></tr>
      </tbody>
    </table>
  `;
  document.body.appendChild(printDiv);
  window.print();
}

// ── Init ─────────────────────────────────────────────────────────────────────
renderSidebar();
renderMain();

// Close modal on overlay click
document.getElementById('modal-overlay')?.addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
