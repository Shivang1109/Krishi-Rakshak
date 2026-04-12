'use strict';
/* Krishi Rakshak — app.js v2 */
/* Features: Voice (Hindi/EN) · Image quality pre-check · WA share · PDF · PWA */

const YIELD_IMPACT = {
  NONE: { cls: 'yi-low', icon: '🌱', label: 'Low risk', pct: '0–10%' },
  MEDIUM: { cls: 'yi-med', icon: '⚠️', label: 'Moderate risk', pct: '15–35%' },
  HIGH: { cls: 'yi-high', icon: '🔥', label: 'High risk', pct: '35–55%' },
  CRITICAL: { cls: 'yi-crit', icon: '⛔', label: 'Critical risk', pct: '55%+' },
  LOW: { cls: 'yi-low', icon: '🌱', label: 'Low risk', pct: '0–10%' },
};

const API = window.KRISHI_API_BASE || 'http://127.0.0.1:8000';

function checkImageQuality(file) {
  return new Promise((resolve) => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const w = Math.min(96, img.naturalWidth);
        const h = Math.min(96, img.naturalHeight);
        c.width = w;
        c.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) {
          sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        }
        const brightness = sum / (w * h);
        URL.revokeObjectURL(url);
        resolve({ ok: brightness >= 25 && brightness <= 235, brightness });
      } catch {
        URL.revokeObjectURL(url);
        resolve({ ok: true, brightness: 128 });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: true, brightness: 128 });
    };
    img.src = url;
  });
}

function speakResult(top) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const pct = top.confidence_pct || `${Math.round((top.confidence || 0) * 100)}%`;
  const text = `${top.display_name || 'Diagnosis'}. Confidence ${pct}. ${(top.description || '').slice(0, 400)}`;
  const u = new SpeechSynthesisUtterance(text);
  const apply = () => {
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang.startsWith('hi')) || voices.find((x) => x.lang.startsWith('en'));
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = 'en-IN';
    window.speechSynthesis.speak(u);
  };
  if (window.speechSynthesis.getVoices().length) apply();
  else window.speechSynthesis.addEventListener('voiceschanged', apply, { once: true });
}

function fetchJsonWithTimeout(url, opts = {}, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

// ── PWA Install Prompt ────────────────────────────────────────────────────────
let _installPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _installPrompt = e;
  const b = document.createElement('div');
  b.id = 'pwa-install-bar';
  b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:8888;background:rgba(10,26,14,.98);border-top:1px solid rgba(168,255,62,.3);padding:12px 20px;display:flex;align-items:center;gap:14px;font-family:"DM Sans",sans-serif';
  b.innerHTML = '<span style="font-size:1.4rem">🌿</span><div style="flex:1"><strong style="color:#f0fdf2;font-size:.86rem">Install Krishi Rakshak</strong><br><span style="color:rgba(240,253,242,.55);font-size:.72rem">Works offline · Add to home screen</span></div><button onclick="_doInstall()" style="padding:8px 18px;background:#22c55e;border:none;border-radius:8px;font-weight:700;font-size:.8rem;color:#0a1a0e;cursor:pointer">Install</button><button onclick="document.getElementById(\'pwa-install-bar\').remove()" style="background:none;border:none;color:rgba(240,253,242,.4);cursor:pointer;font-size:1.3rem;line-height:1">×</button>';
  document.body.appendChild(b);
});
function _doInstall(){ if(_installPrompt){ _installPrompt.prompt(); _installPrompt.userChoice.then(()=>{_installPrompt=null;document.getElementById('pwa-install-bar')?.remove();}); }}
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{})

const $=(s,p=document)=>p.querySelector(s);
const $$=(s,p=document)=>[...p.querySelectorAll(s)];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const lerp=(a,b,t)=>a+(b-a)*t;

/* ── Loading ── */
(()=>{
  const ls=$('#ls'),fill=$('#ls-fill');if(!ls)return;
  let p=0;const iv=setInterval(()=>{p+=Math.random()*18+6;fill.style.width=Math.min(p,90)+'%';if(p>=90)clearInterval(iv);},140);
  window.addEventListener('load',()=>{setTimeout(()=>{fill.style.width='100%';setTimeout(()=>ls.classList.add('done'),450);},400);});
})();

/* ── Cursor — disabled, using system default ── */

/* ── Spore Particles ── */
(()=>{
  const wrap=$('#spores');if(!wrap)return;
  for(let i=0;i<40;i++){
    const d=document.createElement('div');d.className='spore';
    const size=Math.random()*2+2;
    d.style.cssText=`left:${Math.random()*100}%;top:${Math.random()*100+10}%;width:${size}px;height:${size}px;opacity:${Math.random()*.3+.07};animation-duration:${Math.random()*12+8}s;animation-delay:${Math.random()*-16}s;`;
    wrap.appendChild(d);
  }
})();

/* ── Three.js 3D Background ── */
(()=>{
  if(typeof THREE==='undefined')return;
  const canvas=$('#three-bg');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);
  const scene=new THREE.Scene();
  scene.fog=new THREE.FogExp2(0x050c07,.018);
  let W=innerWidth,H=innerHeight;
  renderer.setSize(W,H);
  const cam=new THREE.PerspectiveCamera(65,W/H,.1,2000);cam.position.set(0,0,80);

  // Lights
  scene.add(new THREE.AmbientLight(0x22c55e,.4));
  const p1=new THREE.PointLight(0x22c55e,3,200);p1.position.set(40,40,40);scene.add(p1);
  const p2=new THREE.PointLight(0x14b8a6,2,200);p2.position.set(-40,-30,20);scene.add(p2);

  // Particles
  const PC=7000,pos=new Float32Array(PC*3),col=new Float32Array(PC*3);
  for(let i=0;i<PC;i++){
    pos[i*3]=(Math.random()-.5)*600;pos[i*3+1]=(Math.random()-.5)*600;pos[i*3+2]=(Math.random()-.5)*300;
    const t=Math.random();col[i*3]=.06+t*.07;col[i*3+1]=.42+t*.36;col[i*3+2]=.1+t*.2;
  }
  const pg=new THREE.BufferGeometry();
  pg.setAttribute('position',new THREE.BufferAttribute(pos,3));
  pg.setAttribute('color',new THREE.BufferAttribute(col,3));
  const pts=new THREE.Points(pg,new THREE.PointsMaterial({size:.85,vertexColors:true,transparent:true,opacity:.52,sizeAttenuation:true}));
  scene.add(pts);

  // Floating wireframes
  const shapes=[()=>new THREE.IcosahedronGeometry(1,0),()=>new THREE.OctahedronGeometry(1),()=>new THREE.TetrahedronGeometry(1.3),()=>new THREE.TorusGeometry(1,.3,6,14),()=>new THREE.DodecahedronGeometry(1,0)];
  const floaters=[];
  for(let i=0;i<26;i++){
    const eg=new THREE.EdgesGeometry(shapes[Math.floor(Math.random()*shapes.length)]());
    const m=new THREE.LineSegments(eg,new THREE.LineBasicMaterial({color:Math.random()>.45?0x22c55e:0x14b8a6,transparent:true,opacity:Math.random()*.2+.05}));
    m.position.set((Math.random()-.5)*160,(Math.random()-.5)*160,(Math.random()-.5)*80-10);
    m.scale.setScalar(Math.random()*3+1);
    m.userData={rx:(Math.random()-.5)*.004,ry:(Math.random()-.5)*.004,fy:Math.random()*.0006+.0002,fo:Math.random()*Math.PI*2,by:m.position.y};
    scene.add(m);floaters.push(m);
  }

  // Centerpiece TorusKnot
  const tk=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.TorusKnotGeometry(18,2.8,260,28,3,5)),new THREE.LineBasicMaterial({color:0x22c55e,transparent:true,opacity:.1}));
  tk.position.set(55,0,-30);scene.add(tk);
  const tk2=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.TorusKnotGeometry(10,1.6,180,20,2,3)),new THREE.LineBasicMaterial({color:0x14b8a6,transparent:true,opacity:.08}));
  tk2.position.set(-55,10,-40);scene.add(tk2);

  // Mouse parallax
  let txc=0,tyc=0;
  document.addEventListener('mousemove',e=>{txc=(e.clientX/W-.5)*16;tyc=-(e.clientY/H-.5)*10;});

  window.addEventListener('resize',()=>{W=innerWidth;H=innerHeight;renderer.setSize(W,H);cam.aspect=W/H;cam.updateProjectionMatrix();});

  const clk=new THREE.Clock();
  (function loop(){
    requestAnimationFrame(loop);
    const t=clk.getElapsedTime();
    pts.rotation.y=t*.018;pts.rotation.x=t*.009;
    floaters.forEach(f=>{const d=f.userData;f.rotation.x+=d.rx;f.rotation.y+=d.ry;f.position.y=d.by+Math.sin(t*d.fy*120+d.fo)*5;});
    tk.rotation.x=t*.07;tk.rotation.y=t*.11;
    tk2.rotation.x=-t*.05;tk2.rotation.y=t*.09;
    cam.position.x+=( txc-cam.position.x)*.025;cam.position.y+=(tyc-cam.position.y)*.025;
    cam.lookAt(0,0,0);renderer.render(scene,cam);
  })();
})();

/* ── Magnetic ── */
function initMag(){
  $$('[data-mag]').forEach(el=>{
    el.addEventListener('mousemove',e=>{const r=el.getBoundingClientRect();el.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.36}px,${(e.clientY-r.top-r.height/2)*.36}px)`;});
    el.addEventListener('mouseleave',()=>{el.style.transform='';el.style.transition='transform .5s cubic-bezier(.34,1.56,.64,1)';setTimeout(()=>el.style.transition='',500);});
  });
}
initMag();

/* ── 3D Tilt on feat & crop cards ── */
(()=>{
  $$('[data-tilt]').forEach(el=>{
    el.addEventListener('mousemove',e=>{const r=el.getBoundingClientRect();const nx=(e.clientX-r.left)/r.width-.5,ny=(e.clientY-r.top)/r.height-.5;el.style.transform=`perspective(600px) rotateX(${(-ny*12).toFixed(2)}deg) rotateY(${(nx*12).toFixed(2)}deg) translateZ(4px)`;});
    el.addEventListener('mouseleave',()=>{el.style.transform='';el.style.transition='transform .5s var(--spring)';setTimeout(()=>el.style.transition='',500);});
    el.addEventListener('mouseenter',()=>el.style.transition='transform .15s');
  });
})();

/* ── Scroll Reveal (Intersection Observer) ── */
(()=>{
  const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('vis');io.unobserve(e.target);}}),{threshold:.1});
  $$('.rev').forEach(el=>io.observe(el));
})();

/* ── Counter animation ── */
(()=>{
  const io=new IntersectionObserver(entries=>entries.forEach(e=>{
    if(!e.isIntersecting)return;
    const el=e.target,end=+el.dataset.count;if(isNaN(end))return;
    io.unobserve(el);
    const dur=1800,s=performance.now();
    (function tick(now){const p=Math.min((now-s)/dur,1),ease=1-Math.pow(1-p,3);el.textContent=Math.round(end*ease);if(p<1)requestAnimationFrame(tick);})(s);
  }),{threshold:.5});
  $$('[data-count]').forEach(el=>io.observe(el));
})();

/* ── Header scroll ── */
window.addEventListener('scroll',()=>$('#nav').classList.toggle('scrolled',scrollY>60),{passive:true});

/* ── Active nav section ── */
(()=>{
  const sections=['hero','trust','crops','features'];
  const io=new IntersectionObserver(entries=>entries.forEach(e=>{
    if(e.isIntersecting){
      $$('.nl').forEach(l=>l.classList.toggle('active',l.dataset.section===e.target.id));
    }
  }),{threshold:.35});
  sections.forEach(id=>{const el=$('#'+id);if(el)io.observe(el);});
})();

/* ── API Health ── */
async function checkApi(){
  const pill=$('#api-pill'),lbl=$('#api-lbl');
  if(!pill||!lbl)return;
  try{
    const r=await fetchJsonWithTimeout(`${API}/health`,{},5000);
    if(r.ok){pill.className='api-pill online';lbl.textContent='API Online';}else throw 0;
  }catch{pill.className='api-pill';lbl.textContent='API Offline';}
}
checkApi();setInterval(checkApi,30000);

(()=>{
  document.querySelectorAll('a[data-api]').forEach((a)=>{
    const p=a.getAttribute('data-api');
    if(p)a.href=API+p;
  });
})();

/* ── SVG Marching Border (resize-aware) ── */
(()=>{
  const dz=$('#drop-zone'),rect=$('#dz-march');if(!dz||!rect)return;
  function updateRect(){const w=dz.offsetWidth,h=dz.offsetHeight;rect.setAttribute('width',w-4);rect.setAttribute('height',h-4);}
  updateRect();new ResizeObserver(updateRect).observe(dz);
})();

/* ── File upload ── */
let selFile=null;
const dropZone=$('#drop-zone'),fileInp=$('#file-input'),dzInner=$('#dz-inner'),dzPrev=$('#dz-prev'),prevImg=$('#prev-img'),rmBtn=$('#rm-btn'),browBtn=$('#brow-btn'),gallBtn=$('#gallery-btn'),camBtn=$('#cam-btn'),anaBtn=$('#analyze-btn'),anaTxt=$('#analyze-txt'),fiBlock=$('#fi-block'),fiName=$('#fi-name'),fiSize=$('#fi-size'),dragOv=$('#drag-ov'),dzFill=$('#dz-march');

browBtn?.addEventListener('click',()=>fileInp.click());
gallBtn?.addEventListener('click',()=>{fileInp.removeAttribute('capture');fileInp.click();});
camBtn?.addEventListener('click',()=>{fileInp.setAttribute('capture','environment');fileInp.click();});
fileInp?.addEventListener('change',e=>{if(e.target.files[0])handleFile(e.target.files[0]);});
rmBtn?.addEventListener('click',resetUpload);
dropZone?.addEventListener('dragenter',e=>{e.preventDefault();dragOv?.classList.add('show');dropZone.classList.add('drag-over');});
dropZone?.addEventListener('dragover',e=>e.preventDefault());
dropZone?.addEventListener('dragleave',e=>{if(!dropZone.contains(e.relatedTarget)){dragOv?.classList.remove('show');dropZone.classList.remove('drag-over');}});
dropZone?.addEventListener('drop',e=>{e.preventDefault();dragOv?.classList.remove('show');dropZone.classList.remove('drag-over');if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0]);});
dropZone?.addEventListener('click',e=>{if(!e.target.closest('button,img')&&dzPrev.style.display==='none')fileInp.click();});

function fmtSize(b){return b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB';}
async function handleFile(f){
  if(!['image/jpeg','image/png','image/jpg','image/webp'].includes(f.type)){toast('Please upload a JPEG or PNG image','error');return;}
  if(f.size>10*1024*1024){toast('File too large — max 10 MB','error');return;}
  selFile=f;prevImg.src=URL.createObjectURL(f);
  dzInner.style.display='none';dzPrev.style.display='block';
  fiName.textContent=f.name.length>28?f.name.slice(0,25)+'…':f.name;
  fiSize.textContent=fmtSize(f.size);
  fiBlock.style.display='block';anaBtn.disabled=false;anaTxt.textContent='Analyze Disease Now';
  // Image quality pre-check
  const qw=$('#quality-warn');
  if(qw){
    const q = await checkImageQuality(f);
    if(!q.ok){
      qw.textContent='⚠️ Image may be too '+( q.brightness<25?'dark':'bright')+' (brightness '+Math.round(q.brightness)+'/255). For best results, photograph in natural daylight.';
      qw.classList.add('show');
    } else { qw.classList.remove('show'); }
  }
  initMag();
}
function resetUpload(){
  selFile=null;fileInp.value='';prevImg.src='';
  dzInner.style.display='flex';dzPrev.style.display='none';
  fiBlock.style.display='none';anaBtn.disabled=true;anaTxt.textContent='Select an image first';
  $('#results-section').style.display='none';$('#prog-wrap').style.display='none';
  const yi=$('#yield-impact');if(yi){yi.style.display='none';yi.innerHTML='';}
  const qw=$('#quality-warn');if(qw){qw.classList.remove('show');qw.textContent='';}
}

/* ── Analyze ── */
anaBtn?.addEventListener('click',analyze);
async function analyze(){
  if(!selFile)return;
  anaBtn.disabled=true;anaTxt.textContent='Analyzing…';
  $('#results-section').style.display='none';
  const pw=$('#prog-wrap'),pf=$('#prog-fill');pw.style.display='block';
  pw.scrollIntoView({behavior:'smooth',block:'nearest'});
  const step=(i,p)=>{['#ps1','#ps2','#ps3'].forEach((s,j)=>{const el=$(s);el.className=j<i?'ps done':j===i?'ps active':'ps';});pf.style.width=p+'%';};
  step(0,18);await delay(350);step(1,52);
  const fd=new FormData();fd.append('file',selFile);
  try{
    const res=await fetch(`${API}/predict`,{method:'POST',body:fd});
    step(2,88);await delay(280);
    if(!res.ok){const e=await res.json().catch(()=>({detail:'Server error'}));throw new Error(e.detail||`HTTP ${res.status}`);}
    const data=await res.json();
    pf.style.width='100%';await delay(350);pw.style.display='none';pf.style.width='0%';step(-1,0);
    renderResult(data);
  }catch(err){pw.style.display='none';pf.style.width='0%';step(-1,0);toast('❌ '+err.message.replace('Exception:','').trim(),'error');}
  finally{anaBtn.disabled=false;anaTxt.textContent='Analyze Disease Now';initMag();}
}

/* ── Render Results ── */
let lastData=null;
function renderResult(data){
  lastData=data;const top=data.top_prediction;
  $('#res-img').src=prevImg.src;
  const sevEl=$('#rr-sev');
  const sevMap={none:'HEALTHY',medium:'MODERATE',high:'SERIOUS',critical:'CRITICAL',unknown:'UNKNOWN',
    healthy:'HEALTHY',early:'EARLY',moderate:'MODERATE',severe:'SEVERE'};
  const sevKey=top.confidence_severity||top.graded_severity||top.severity;
  sevEl.textContent=sevMap[sevKey]||sevMap[top.severity]||String(sevKey||'').toUpperCase();
  sevEl.style.cssText=`background:${top.severity_color}20;color:${top.severity_color};border:1px solid ${top.severity_color}40;box-shadow:0 0 18px ${top.severity_color}25;`;
  const circ=2*Math.PI*46;
  setTimeout(()=>$('#rr-fg').style.strokeDashoffset=circ*(1-top.confidence),100);
  animCount($('#rr-pct'),0,Math.round(top.confidence*100),1500,'%');
  $('#rr-name').textContent=top.display_name;
  $('#rr-desc').textContent=top.description;
  $('#res-alts').innerHTML=data.top_k.slice(1).map((a,i)=>`<div class="alt-row" style="animation-delay:${i*80}ms"><span class="alt-rank">#${a.rank}</span><span class="alt-name">${a.display_name}</span><div class="alt-bw"><div class="alt-bg"><div class="alt-bf" style="width:${Math.round(a.confidence*100)}%"></div></div></div><span class="alt-pct">${a.confidence_pct}</span></div>`).join('');
  switchTab('symptoms');
  // Show yield impact
  const yi=$('#yield-impact');
  if(yi){
    const cs=(top.confidence_severity||top.graded_severity||'moderate').toUpperCase();
    const ym={HEALTHY:'NONE',EARLY:'LOW',MODERATE:'MEDIUM',SEVERE:'HIGH'};
    const yi_data=YIELD_IMPACT[ym[cs]||top.severity?.toUpperCase()]||YIELD_IMPACT.LOW;
    yi.className='yield-impact-box '+yi_data.cls; yi.innerHTML=`<span class="yield-icon">${yi_data.icon}</span><div><strong>${yi_data.label}</strong><br><small>Potential yield loss: ${yi_data.pct} if untreated.</small></div>`; yi.style.display='flex';
  }
  // Show share row
  const sr=$('#share-row-res');
  if(sr) sr.style.display='flex';
  const sec=$('#results-section');sec.style.display='block';sec.scrollIntoView({behavior:'smooth',block:'start'});
  initMag();
  // Auto voice readout
  if(localStorage.getItem('kr_voice')==='1') speakResult(top);
}
function switchTab(tab){
  $$('.rrt').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  const top=lastData.top_prediction,panel=$('#rr-panel');panel.innerHTML='';
  if(tab==='symptoms'){
    const items=top.symptoms.length?top.symptoms:['No symptoms detected — crop appears healthy.'];
    panel.innerHTML=items.map((s,i)=>`<div class="tab-item" style="animation-delay:${i*55}ms">⚠️ ${s}</div>`).join('');
  }else if(tab==='treatment'){
    const steps=Array.isArray(top.treatment)?top.treatment:[String(top.treatment||'')];
    panel.innerHTML=steps.map((t,i)=>`<div class="tab-item" style="animation-delay:${i*55}ms">✅ ${t}</div>`).join('');
  }else if(tab==='prevention'){
    panel.innerHTML=`<div class="prev-box"><strong>🛡️ Prevention</strong><p>${top.prevention}</p></div>`;
  }else if(tab==='alts'){
    const alts=lastData.top_k.slice(1);
    panel.innerHTML=alts.map((a,i)=>`<div class="tab-item" style="animation-delay:${i*60}ms;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between"><span>${a.display_name}</span><span style="font-family:var(--fm);color:var(--green-bright);font-size:.73rem">${a.confidence_pct}</span></div><div style="height:4px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden"><div style="height:4px;width:${Math.round(a.confidence*100)}%;background:linear-gradient(90deg,var(--green),var(--lime));border-radius:4px"></div></div></div>`).join('');
  }
}
$$('.rrt').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
$('#again-btn')?.addEventListener('click',()=>{resetUpload();$('#detect').scrollIntoView({behavior:'smooth'});});

/* ── Smooth anchors ── */
$$('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const t=$(a.getAttribute('href'));if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth'});}}));

/* ── Toast ── */
function toast(msg,type='info'){
  $('.kr-toast')?.remove();
  const t=document.createElement('div');t.className='kr-toast';t.textContent=msg;
  const bg={error:'rgba(239,68,68,.88)',success:'rgba(34,197,94,.88)',info:'rgba(20,184,166,.88)'};
  t.style.background=bg[type]||bg.info;t.style.color='white';
  document.body.appendChild(t);requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),350);},3200);
}

/* ── Counter utility ── */
function animCount(el,from,to,dur,suf=''){
  const s=performance.now();
  (function t(now){const p=Math.min((now-s)/dur,1),e=1-Math.pow(1-p,3);el.textContent=Math.round(from+(to-from)*e)+suf;if(p<1)requestAnimationFrame(t);})(s);
}


/* ── Weather Alerts / Notification Bell ─────────────────────────────────────── */
(function initNotifBell() {
  const bell = document.getElementById('notif-bell');
  const countEl = document.getElementById('notif-count');
  const dropdown = document.getElementById('notif-dropdown');
  const list = document.getElementById('notif-list');
  if (!bell) return;

  let session = null;
  try { const u = JSON.parse(localStorage.getItem('kr_session')); session = u?.phone || null; } catch {}
  if (!session) return;

  bell.style.display = 'flex';

  const ALERT_COLORS = {
    hail: { bg: 'rgba(147,197,253,.08)', border: 'rgba(147,197,253,.2)', icon: '⛈️' },
    heavy_rain: { bg: 'rgba(96,165,250,.08)', border: 'rgba(96,165,250,.2)', icon: '🌧️' },
    thunderstorm: { bg: 'rgba(251,191,36,.08)', border: 'rgba(251,191,36,.2)', icon: '⚡' },
    frost: { bg: 'rgba(186,230,253,.08)', border: 'rgba(186,230,253,.2)', icon: '🧊' },
    heatwave: { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.2)', icon: '🔥' },
  };

  function timeAgo(ts) {
    const diff = (Date.now() - new Date(ts + 'Z').getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' hours ago';
    return Math.floor(diff / 86400) + ' days ago';
  }

  async function fetchAlerts() {
    try {
      const res = await fetch(`${API}/alerts/${encodeURIComponent(session)}`);
      if (!res.ok) return;
      const data = await res.json();
      const unread = data.unread_count || 0;
      if (unread > 0) {
        countEl.textContent = unread > 9 ? '9+' : unread;
        countEl.style.display = 'flex';
      } else {
        countEl.style.display = 'none';
      }
      if (list) {
        if (!data.alerts || !data.alerts.length) {
          list.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(240,253,242,.3);font-size:.82rem">No alerts yet</div>';
          return;
        }
        list.innerHTML = data.alerts.map(a => {
          const style = ALERT_COLORS[a.alert_type] || { bg: 'rgba(255,255,255,.04)', border: 'rgba(255,255,255,.08)', icon: '⚠️' };
          return `<div style="background:${style.bg};border:1px solid ${style.border};border-radius:10px;padding:12px;margin-bottom:8px;position:relative">
            <div style="display:flex;align-items:flex-start;gap:10px">
              <span style="font-size:1.2rem;flex-shrink:0">${style.icon}</span>
              <div style="flex:1">
                <div style="font-size:.82rem;color:rgba(240,253,242,.9);line-height:1.4;margin-bottom:4px">${a.message}</div>
                ${a.crop_advice ? `<div style="font-size:.75rem;color:rgba(240,253,242,.5);line-height:1.4;margin-bottom:6px">💡 ${a.crop_advice}</div>` : ''}
                <div style="display:flex;align-items:center;justify-content:space-between">
                  <span style="font-size:.7rem;color:rgba(240,253,242,.3)">${timeAgo(a.timestamp)}</span>
                  ${!a.is_read ? `<button onclick="markRead(${a.id},this)" style="background:none;border:none;color:rgba(240,253,242,.3);cursor:pointer;font-size:.75rem;padding:2px 6px;border-radius:4px;transition:color .2s" onmouseover="this.style.color='rgba(240,253,242,.7)'" onmouseout="this.style.color='rgba(240,253,242,.3)'">✕ Mark read</button>` : ''}
                </div>
              </div>
            </div>
          </div>`;
        }).join('');
      }
    } catch {}
  }

  window.markRead = async function(id, btn) {
    try {
      await fetch(`${API}/alerts/${id}/read`, { method: 'POST' });
      btn.closest('div[style]').style.opacity = '0.5';
      btn.remove();
      fetchAlerts();
    } catch {}
  };

  window.toggleNotifDropdown = function() {
    if (!dropdown) return;
    const open = dropdown.style.display !== 'none';
    dropdown.style.display = open ? 'none' : 'block';
    if (!open) fetchAlerts();
  };

  document.addEventListener('click', e => {
    if (dropdown && !bell.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  // Also trigger weather check for this session
  async function triggerCheck() {
    try { await fetch(`${API}/alerts/check-now/${encodeURIComponent(session)}`, { method: 'POST' }); } catch {}
  }

  fetchAlerts();
  triggerCheck();
  setInterval(fetchAlerts, 60000);
})();
