/* Krishi Rakshak — Shared Three.js Background
   Injected by nav.js on every page */
(function initKrishiBg() {
  'use strict';
  if (document.getElementById('kr-three-bg')) return;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'kr-three-bg';
  canvas.style.cssText = 'position:fixed;inset:0;z-index:0;width:100%;height:100%;pointer-events:none;';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);

  // Load Three.js if not already loaded
  function initScene() {
    if (typeof THREE === 'undefined') return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0, 0);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050c07, 0.018);

    let W = innerWidth, H = innerHeight;
    renderer.setSize(W, H);
    const cam = new THREE.PerspectiveCamera(65, W / H, 0.1, 2000);
    cam.position.set(0, 0, 80);

    // Lights
    scene.add(new THREE.AmbientLight(0x22c55e, 0.4));
    const p1 = new THREE.PointLight(0x22c55e, 3, 200); p1.position.set(40, 40, 40); scene.add(p1);
    const p2 = new THREE.PointLight(0x14b8a6, 2, 200); p2.position.set(-40, -30, 20); scene.add(p2);

    // Particles
    const PC = 5000;
    const pos = new Float32Array(PC * 3);
    const col = new Float32Array(PC * 3);
    for (let i = 0; i < PC; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 300;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 300;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 200 - 20;
      const t = Math.random();
      col[i * 3] = 0.1 + t * 0.15;
      col[i * 3 + 1] = 0.65 + t * 0.35;
      col[i * 3 + 2] = 0.15 + t * 0.2;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.85, vertexColors: true, transparent: true, opacity: 0.65, sizeAttenuation: true }));
    scene.add(pts);

    // Floating wireframe shapes
    const shapes = [
      () => new THREE.IcosahedronGeometry(1, 0),
      () => new THREE.OctahedronGeometry(1),
      () => new THREE.TetrahedronGeometry(1.3),
      () => new THREE.TorusGeometry(1, 0.3, 6, 14),
      () => new THREE.DodecahedronGeometry(1, 0),
    ];
    const floaters = [];
    for (let i = 0; i < 20; i++) {
      const eg = new THREE.EdgesGeometry(shapes[Math.floor(Math.random() * shapes.length)]());
      const m = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({
        color: Math.random() > 0.45 ? 0x4ade80 : 0x22c55e,
        transparent: true,
        opacity: Math.random() * 0.28 + 0.08,
      }));
      m.position.set((Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 80 - 10);
      m.scale.setScalar(Math.random() * 3 + 1);
      m.userData = { rx: (Math.random() - 0.5) * 0.004, ry: (Math.random() - 0.5) * 0.004, fy: Math.random() * 0.0006 + 0.0002, fo: Math.random() * Math.PI * 2, by: m.position.y };
      scene.add(m);
      floaters.push(m);
    }

    // Central torus knot
    const tk = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.TorusKnotGeometry(18, 2.8, 200, 24, 3, 5)),
      new THREE.LineBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.12 })
    );
    scene.add(tk);

    let txc = 0, tyc = 0;
    document.addEventListener('mousemove', e => { txc = (e.clientX / W - 0.5) * 12; tyc = -(e.clientY / H - 0.5) * 8; }, { passive: true });
    window.addEventListener('resize', () => { W = innerWidth; H = innerHeight; renderer.setSize(W, H); cam.aspect = W / H; cam.updateProjectionMatrix(); });

    let t = 0;
    function animate() {
      requestAnimationFrame(animate);
      t += 0.008;
      pts.rotation.y += 0.0003;
      pts.rotation.x += 0.0001;
      tk.rotation.x += 0.0008;
      tk.rotation.y += 0.0012;
      floaters.forEach(m => {
        m.rotation.x += m.userData.rx;
        m.rotation.y += m.userData.ry;
        m.position.y = m.userData.by + Math.sin(t * m.userData.fy * 100 + m.userData.fo) * 8;
      });
      cam.position.x += (txc - cam.position.x) * 0.04;
      cam.position.y += (tyc - cam.position.y) * 0.04;
      cam.lookAt(scene.position);
      renderer.render(scene, cam);
    }
    animate();
  }

  // Load Three.js CDN if not present
  if (typeof THREE !== 'undefined') {
    initScene();
  } else {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js';
    script.onload = initScene;
    document.head.appendChild(script);
  }
})();
