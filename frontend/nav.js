/* Krishi Rakshak — Shared Navigation Injector
   Include after nav.css: <script src="nav.js"></script>
   Reads data-page attribute on <body> to mark active link.
   Usage: <body data-page="weather"> */
(function () {
  'use strict';

  const LINKS = [
    { href: 'home.html',    icon: '🏠', label: 'Home' },
    { href: 'detect.html',  icon: '🔬', label: 'Detect' },
    { href: 'weather.html', icon: '🌦️', label: 'Weather' },
    { href: 'market.html',  icon: '💰', label: 'Market' },
    { href: 'chat.html',    icon: '🤖', label: 'Krishi Mitra' },
    { href: 'tracker.html', icon: '📊', label: 'History' },
  ];

  const BOTTOM = [
    { href: 'home.html',    icon: '🏠', label: 'Home' },
    { href: 'detect.html',  icon: '🔬', label: 'Detect' },
    { href: 'weather.html', icon: '🌦️', label: 'Weather' },
    { href: 'market.html',  icon: '💰', label: 'Prices' },
    { href: 'forum.html',   icon: '👨‍🌾', label: 'Forum' },
  ];

  const currentPage = document.body.dataset.page || '';
  const currentFile = location.pathname.split('/').pop() || 'index.html';

  function isActive(href) {
    return href === currentFile || href.replace('.html', '') === currentPage;
  }

  // ── Inject top nav ──────────────────────────────────────────────────────────
  const nav = document.createElement('nav');
  nav.className = 'kr-nav';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Main navigation');
  nav.innerHTML = `
    <div class="kr-nav-inner">
      <a class="kr-logo" href="home.html" aria-label="Krishi Rakshak Home">
        <svg width="24" height="24" viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 4C13 10 11 17 13 24a7 7 0 0014 0c2-7 0-14-7-20z" fill="#22c55e"/>
          <path d="M14 19c-5 2-9 5-8 10 3-1 6-3 7-6" fill="#4ade80" opacity=".7"/>
          <path d="M26 19c5 2 9 5 8 10-3-1-6-3-7-6" fill="#4ade80" opacity=".7"/>
        </svg>
        Krishi Rakshak
      </a>
      <div class="kr-nav-links" role="list">
        ${LINKS.map(l => `
          <a href="${l.href}" class="${isActive(l.href) ? 'active' : ''}" role="listitem">
            ${l.icon} ${l.label}
          </a>`).join('')}
      </div>
    </div>`;

  // Insert before first child of body
  document.body.insertBefore(nav, document.body.firstChild);

  // ── Inject bottom nav ───────────────────────────────────────────────────────
  const bnav = document.createElement('nav');
  bnav.className = 'kr-bottom-nav';
  bnav.setAttribute('aria-label', 'Mobile navigation');
  bnav.innerHTML = BOTTOM.map(l => `
    <a class="kr-bn-item ${isActive(l.href) ? 'active' : ''}" href="${l.href}">
      <span class="kr-bn-icon" aria-hidden="true">${l.icon}</span>
      <span>${l.label}</span>
    </a>`).join('');
  document.body.appendChild(bnav);

  // ── Inject Three.js background ─────────────────────────────────────────────
  if (!document.getElementById('kr-three-bg')) {
    const bgScript = document.createElement('script');
    bgScript.src = 'bg.js';
    document.body.appendChild(bgScript);
  }

  // ── Inject noise overlay ────────────────────────────────────────────────────
  if (!document.querySelector('.kr-noise')) {
    const noise = document.createElement('div');
    noise.className = 'kr-noise';
    noise.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(noise, document.body.firstChild);
  }

  // ── Inject floating spore particles ────────────────────────────────────────
  if (!document.querySelector('.kr-spores')) {
    const sporeWrap = document.createElement('div');
    sporeWrap.className = 'kr-spores';
    sporeWrap.setAttribute('aria-hidden', 'true');
    const sporeCount = 18;
    for (let i = 0; i < sporeCount; i++) {
      const s = document.createElement('div');
      s.className = 'kr-spore';
      const left = Math.random() * 100;
      const duration = 12 + Math.random() * 20;
      const delay = Math.random() * 15;
      const size = 1.5 + Math.random() * 2.5;
      const opacity = 0.2 + Math.random() * 0.4;
      s.style.cssText = `left:${left}%;width:${size}px;height:${size}px;opacity:${opacity};animation-duration:${duration}s;animation-delay:-${delay}s;`;
      sporeWrap.appendChild(s);
    }
    document.body.insertBefore(sporeWrap, document.body.firstChild);
  }

  // ── Cursor disabled — using system default ─────────────────────────────────

  // ── Auth guard — redirect to login if session missing ──────────────────────
  const PROTECTED_PAGES = new Set([
    'home.html','detect.html','weather.html','market.html','soil.html',
    'irrigation.html','calendar.html','tracker.html','map.html',
    'insurance.html','loans.html','finance.html','forum.html',
    'chat.html','dashboard.html',
  ]);

  function getSession() {
    try { return JSON.parse(localStorage.getItem('kr_session')); } catch { return null; }
  }

  const thisFile = location.pathname.split('/').pop() || 'index.html';
  if (PROTECTED_PAGES.has(thisFile)) {
    const sess = getSession();
    if (!sess || !sess.token) {
      // Save intended destination so we can redirect back after login
      sessionStorage.setItem('kr_redirect_after_login', thisFile);
      window.location.replace('login.html');
    }
  }

  // ── After login redirect ────────────────────────────────────────────────────
  if (thisFile === 'home.html') {
    const dest = sessionStorage.getItem('kr_redirect_after_login');
    if (dest && dest !== 'home.html') {
      sessionStorage.removeItem('kr_redirect_after_login');
      window.location.replace(dest);
    }
  }

  // ── Inject chatbot bubble (only when farmer is logged in) ──────────────────
  function isLoggedIn() {
    const s = getSession();
    return !!(s && s.token);
  }

  if (isLoggedIn() && !document.getElementById('kr-bubble-root')) {
    const script = document.createElement('script');
    script.src = 'chat-bubble.js';
    document.body.appendChild(script);
  }

  // ── Register service worker ─────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // ── Inject SPA router ───────────────────────────────────────────────────────
  if (!window._krishiRouterLoaded) {
    window._krishiRouterLoaded = true;
    const rs = document.createElement('script');
    rs.src = 'router.js';
    document.body.appendChild(rs);
  }

  // ── Inject Mandi Price Ticker ───────────────────────────────────────────────
  // Only inject once, and not on fullscreen pages
  const SKIP_TICKER = new Set(['map.html', 'chat.html', 'login.html', 'index.html']);
  const currentFileT = location.pathname.split('/').pop() || 'index.html';
  if (!document.querySelector('.kr-ticker-wrap') && !SKIP_TICKER.has(currentFileT)) {
    const TICKER_ITEMS = [
      { crop: '🌾 Wheat',    price: '₹2,275/q', change: '+1.2%', up: true  },
      { crop: '🍅 Tomato',   price: '₹1,840/q', change: '-0.8%', up: false },
      { crop: '🌽 Maize',    price: '₹1,960/q', change: '+2.1%', up: true  },
      { crop: '🌶️ Chilli',   price: '₹8,500/q', change: '-1.5%', up: false },
      { crop: '🥔 Potato',   price: '₹1,120/q', change: '+0.9%', up: true  },
      { crop: '🍌 Banana',   price: '₹2,100/q', change: '+1.8%', up: true  },
    ];
    const itemsHtml = TICKER_ITEMS.map(t =>
      `<span class="kr-ticker-item">
        ${t.crop} <strong>${t.price}</strong>
        <span class="${t.up ? 'up' : 'down'}">${t.change}</span>
        <span style="color:rgba(168,255,62,.25)">|</span>
      </span>`
    ).join('') + TICKER_ITEMS.map(t =>
      `<span class="kr-ticker-item">
        ${t.crop} <strong>${t.price}</strong>
        <span class="${t.up ? 'up' : 'down'}">${t.change}</span>
        <span style="color:rgba(168,255,62,.25)">|</span>
      </span>`
    ).join('');

    const ticker = document.createElement('div');
    ticker.className = 'kr-ticker-wrap kr-no-print';
    ticker.innerHTML = `<div class="kr-ticker-inner">${itemsHtml}</div>`;
    // Insert right after nav
    const krnav = document.querySelector('.kr-nav');
    if (krnav && krnav.nextSibling) {
      krnav.parentNode.insertBefore(ticker, krnav.nextSibling);
    }
  }
})();
