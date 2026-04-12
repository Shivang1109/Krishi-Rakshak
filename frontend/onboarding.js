/* Krishi Rakshak — First-Scan Onboarding
   Shown once after registration. Injected by home.html. */
(function () {
  'use strict';

  const LS_KEY = 'kr_onboarding_done';
  if (localStorage.getItem(LS_KEY)) return;

  const STEPS = [
    {
      icon: '🔬',
      title: 'Scan Your Crop',
      body: 'Take a clear photo of a diseased leaf in natural daylight. Our AI identifies 54 diseases across 9 crops in under 2 seconds.',
      cta: 'Next →',
    },
    {
      icon: '💊',
      title: 'Get Instant Treatment',
      body: 'Every diagnosis comes with ICAR-approved treatment steps, severity rating, and a WhatsApp-shareable report for your agronomist.',
      cta: 'Next →',
    },
    {
      icon: '🌦️',
      title: 'Your Farm Dashboard',
      body: 'Track disease history, check live mandi prices, get weather alerts, and chat with Krishi Mitra — your 24/7 AI farm advisor.',
      cta: "Let's Start 🌱",
    },
  ];

  let step = 0;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
#kr-onboard-overlay {
  position: fixed; inset: 0; z-index: 10000;
  background: rgba(5, 15, 7, 0.92);
  backdrop-filter: blur(12px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: ob-fade-in .3s ease;
}
@keyframes ob-fade-in { from { opacity: 0; } to { opacity: 1; } }
#kr-onboard-card {
  background: linear-gradient(135deg, #0c1f12, #112a17);
  border: 1px solid rgba(74, 222, 128, 0.2);
  border-radius: 24px;
  padding: 36px 32px 28px;
  max-width: 420px;
  width: 100%;
  text-align: center;
  box-shadow: 0 32px 80px rgba(0,0,0,.6);
  position: relative;
}
.ob-skip {
  position: absolute; top: 16px; right: 18px;
  font-size: .72rem; color: rgba(134,239,172,.35);
  cursor: pointer; background: none; border: none;
  transition: color .2s;
}
.ob-skip:hover { color: rgba(134,239,172,.7); }
.ob-icon { font-size: 3.2rem; margin-bottom: 18px; display: block; }
.ob-title {
  font-family: 'Syne', sans-serif; font-size: 1.4rem; font-weight: 800;
  color: #f0fdf4; margin-bottom: 12px;
}
.ob-body {
  font-size: .9rem; color: rgba(240,253,242,.6);
  line-height: 1.65; margin-bottom: 28px;
}
.ob-dots {
  display: flex; justify-content: center; gap: 7px; margin-bottom: 22px;
}
.ob-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgba(34,197,94,.2);
  transition: background .25s, transform .25s;
}
.ob-dot.active { background: #22c55e; transform: scale(1.3); }
.ob-cta {
  width: 100%; padding: 14px;
  background: linear-gradient(135deg, #16a34a, #15803d);
  border: none; border-radius: 14px;
  color: #fff; font-family: 'Syne', sans-serif;
  font-size: 1rem; font-weight: 700;
  cursor: pointer; transition: opacity .2s;
  box-shadow: 0 8px 24px rgba(34,197,94,.25);
}
.ob-cta:hover { opacity: .88; }
.ob-step-anim {
  animation: ob-step-in .25s ease;
}
@keyframes ob-step-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
  `;
  document.head.appendChild(style);

  // ── DOM ─────────────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.id = 'kr-onboard-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Welcome to Krishi Rakshak');

  function renderStep() {
    const s = STEPS[step];
    overlay.innerHTML = `
      <div id="kr-onboard-card">
        <button class="ob-skip" onclick="krOnboardDone()" aria-label="Skip onboarding">Skip</button>
        <div class="ob-step-anim">
          <span class="ob-icon">${s.icon}</span>
          <div class="ob-title">${s.title}</div>
          <div class="ob-body">${s.body}</div>
        </div>
        <div class="ob-dots">
          ${STEPS.map((_, i) => `<div class="ob-dot ${i === step ? 'active' : ''}"></div>`).join('')}
        </div>
        <button class="ob-cta" onclick="krOnboardNext()">${s.cta}</button>
      </div>`;
  }

  window.krOnboardNext = function () {
    step++;
    if (step >= STEPS.length) {
      krOnboardDone();
    } else {
      renderStep();
    }
  };

  window.krOnboardDone = function () {
    localStorage.setItem(LS_KEY, '1');
    overlay.style.animation = 'ob-fade-in .25s ease reverse forwards';
    setTimeout(() => overlay.remove(), 260);
  };

  renderStep();
  document.body.appendChild(overlay);
})();
