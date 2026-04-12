/* Krishi Rakshak — Vanilla JS SPA Router (History API)
   Provides instant page transitions with slide/fade animations.
   Usage: automatically active when this script is loaded via nav.js
   Pages link normally; router intercepts clicks and swaps content.
*/

(function () {
  'use strict';

  // Pages that use a full separate JS bundle — skip SPA for these
  const SKIP_SPA = new Set([
    'index.html', 'login.html', 'map.html', 'chat.html', 'dashboard.html',
  ]);

  // Transition overlay element
  let overlay = null;

  function ensureOverlay() {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'spa-overlay';
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:8000;background:#112a17;' +
        'opacity:0;pointer-events:none;transition:opacity .22s cubic-bezier(.19,1,.22,1);';
      document.body.appendChild(overlay);
    }
  }

  function fadeOut() {
    ensureOverlay();
    overlay.style.pointerEvents = 'all';
    overlay.style.opacity = '1';
    return new Promise(r => setTimeout(r, 230));
  }

  function fadeIn() {
    ensureOverlay();
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
  }

  function isSamePage(href) {
    const url = new URL(href, location.href);
    const file = url.pathname.split('/').pop() || 'index.html';
    const current = location.pathname.split('/').pop() || 'index.html';
    return file === current;
  }

  function shouldSkip(href) {
    try {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin) return true;
      const file = url.pathname.split('/').pop() || 'index.html';
      if (SKIP_SPA.has(file)) return true;
      return false;
    } catch {
      return true;
    }
  }

  async function navigate(href) {
    if (isSamePage(href)) return;
    if (shouldSkip(href)) { location.href = href; return; }

    await fadeOut();
    history.pushState({}, '', href);
    location.href = href; // simple full-load with fade — sufficient for MPA
  }

  // Intercept all local anchor clicks
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    if (a.target === '_blank' || a.download) return;
    if (shouldSkip(href)) return;
    e.preventDefault();
    navigate(href);
  }, { capture: true });

  // On popstate — fade in (already on page)
  window.addEventListener('popstate', () => {
    fadeIn();
  });

  // On DOMContentLoaded — fade in to show page has loaded
  function onLoad() {
    ensureOverlay();
    overlay.style.opacity = '1';
    overlay.style.transition = 'none';
    requestAnimationFrame(() => {
      overlay.style.transition = 'opacity .35s cubic-bezier(.19,1,.22,1)';
      requestAnimationFrame(() => { overlay.style.opacity = '0'; });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onLoad);
  } else {
    onLoad();
  }

  // Expose for programmatic navigation
  window.krishipush = navigate;
})();
