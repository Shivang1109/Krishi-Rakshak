/* Krishi Rakshak — shared API base (load before app / inline scripts) */
(function () {
  'use strict';
  function resolve() {
    var m = document.querySelector('meta[name="krishi-api-base"]');
    if (m && m.content) return m.content.trim().replace(/\/$/, '');
    try {
      var s = localStorage.getItem('krishi_api_base');
      if (s) return s.trim().replace(/\/$/, '');
    } catch (e) {}
    return 'http://127.0.0.1:8000';
  }
  window.KRISHI_API_BASE = resolve();
})();
