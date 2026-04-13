/* Krishi Rakshak — API base URL config
   Priority: meta tag → localStorage override → env detection → fallback */
(function () {
  'use strict';
  function resolve() {
    // 1. Meta tag (set per-page, easiest to change for deployment)
    var m = document.querySelector('meta[name="krishi-api-base"]');
    if (m && m.content && m.content !== 'http://127.0.0.1:8000') return m.content.trim().replace(/\/$/, '');
    // 2. localStorage override (for testing different backends)
    try {
      var s = localStorage.getItem('krishi_api_base');
      if (s) return s.trim().replace(/\/$/, '');
    } catch (e) {}
    // 3. Same-origin API (production: frontend + backend on same domain)
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return window.location.origin;
    }
    // 4. Local dev fallback
    return 'http://127.0.0.1:8000';
  }
  window.KRISHI_API_BASE = resolve();
})();
