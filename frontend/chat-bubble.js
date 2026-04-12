/* Krishi Rakshak — Floating Chat Bubble Widget
   Loaded only after farmer login via nav.js */
(function(){
'use strict';
if(document.getElementById('kr-bubble-root'))return;
const API=window.KRISHI_API_BASE||'http://127.0.0.1:8000';
const LS_HIST='kr_chat_history',LS_LANG='kr_chat_lang';
let open=false,curLang='English',curCode='en-IN';
try{const s=JSON.parse(localStorage.getItem(LS_LANG));if(s){curLang=s.lang;curCode=s.code;}}catch{}

// Inject styles
const style=document.createElement('style');
style.textContent=`
#kr-bubble-btn{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:9000;width:40px;height:80px;border-radius:12px 0 0 12px;background:#22c55e;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;box-shadow:-4px 0 20px rgba(34,197,94,.3);transition:width .2s,box-shadow .2s;}
#kr-bubble-btn:hover{width:46px;box-shadow:-6px 0 28px rgba(34,197,94,.45);}
#kr-bubble-btn-icon{font-size:1.2rem;line-height:1;}
#kr-bubble-btn-label{font-size:.5rem;font-family:'DM Sans',sans-serif;font-weight:700;color:#0a1a0e;writing-mode:vertical-rl;text-orientation:mixed;letter-spacing:.08em;text-transform:uppercase;}
#kr-bubble-badge{position:absolute;top:6px;left:6px;width:14px;height:14px;background:#ef4444;border-radius:50%;font-size:.55rem;color:#fff;display:none;align-items:center;justify-content:center;font-weight:700;}
#kr-bubble-panel{position:fixed;right:46px;top:50%;transform:translateY(-50%) translateX(20px) scale(.96);z-index:9001;width:340px;height:500px;background:rgba(10,20,12,.97);border:1px solid rgba(74,222,128,.15);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.6);display:flex;flex-direction:column;opacity:0;pointer-events:none;transition:all .25s cubic-bezier(.34,1.56,.64,1);}
#kr-bubble-panel.open{transform:translateY(-50%) translateX(0) scale(1);opacity:1;pointer-events:all;}
@media(max-width:600px){#kr-bubble-panel{right:0;top:auto;bottom:0;transform:translateY(20px) scale(.96);border-radius:18px 18px 0 0;width:100%;height:70vh;}#kr-bubble-panel.open{transform:translateY(0) scale(1);}#kr-bubble-btn{top:auto;bottom:80px;transform:none;}}
.kb-header{padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.kb-title{font-family:'DM Sans',sans-serif;font-size:.85rem;font-weight:600;color:#f0fdf4;display:flex;align-items:center;gap:7px;}
.kb-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 5px rgba(34,197,94,.6);}
.kb-actions{display:flex;gap:6px;align-items:center;}
.kb-full-link{font-size:.68rem;color:rgba(134,239,172,.5);text-decoration:none;padding:3px 8px;border:1px solid rgba(255,255,255,.07);border-radius:6px;transition:all .2s;}
.kb-full-link:hover{color:#4ade80;border-color:rgba(74,222,128,.2);}
.kb-close{background:none;border:none;color:rgba(134,239,172,.4);cursor:pointer;font-size:1.1rem;line-height:1;padding:2px 4px;transition:color .2s;}
.kb-close:hover{color:#f0fdf4;}
.kb-langs{display:flex;gap:4px;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.05);overflow-x:auto;scrollbar-width:none;flex-shrink:0;}
.kb-langs::-webkit-scrollbar{display:none;}
.kb-lang{padding:3px 10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:99px;font-size:.68rem;cursor:pointer;color:rgba(134,239,172,.5);white-space:nowrap;transition:all .2s;}
.kb-lang.active{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.3);color:#4ade80;}
.kb-messages{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;scrollbar-color:rgba(34,197,94,.15) transparent;}
.kb-msg{display:flex;gap:7px;max-width:90%;}
.kb-msg.user{align-self:flex-end;flex-direction:row-reverse;}
.kb-msg.bot{align-self:flex-start;}
.kb-av{width:24px;height:24px;border-radius:50%;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.2);display:flex;align-items:center;justify-content:center;font-size:.7rem;flex-shrink:0;margin-top:2px;}
.kb-bubble{padding:8px 11px;border-radius:11px;font-size:.78rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;font-family:'DM Sans',sans-serif;}
.kb-msg.bot .kb-bubble{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);border-radius:3px 11px 11px 11px;color:#f0fdf4;}
.kb-msg.user .kb-bubble{background:rgba(34,197,94,.18);border:1px solid rgba(34,197,94,.25);border-radius:11px 3px 11px 11px;color:#f0fdf4;}
.kb-typing{display:flex;gap:3px;padding:8px 11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);border-radius:3px 11px 11px 11px;width:fit-content;}
.kb-typing span{width:5px;height:5px;border-radius:50%;background:rgba(134,239,172,.4);animation:kbbounce .9s infinite;}
.kb-typing span:nth-child(2){animation-delay:.15s;}
.kb-typing span:nth-child(3){animation-delay:.3s;}
@keyframes kbbounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}
.kb-chips{display:flex;gap:5px;padding:6px 8px;overflow-x:auto;scrollbar-width:none;flex-shrink:0;border-top:1px solid rgba(255,255,255,.05);}
.kb-chips::-webkit-scrollbar{display:none;}
.kb-chip{padding:4px 10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:99px;font-size:.68rem;cursor:pointer;white-space:nowrap;color:rgba(134,239,172,.5);transition:all .2s;}
.kb-chip:hover{border-color:rgba(74,222,128,.2);color:#4ade80;}
.kb-input-row{display:flex;gap:6px;padding:8px 10px;border-top:1px solid rgba(255,255,255,.07);flex-shrink:0;}
.kb-input{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px 11px;color:#f0fdf4;font-family:'DM Sans',sans-serif;font-size:.8rem;outline:none;transition:border .2s;}
.kb-input:focus{border-color:rgba(34,197,94,.35);}
.kb-input::placeholder{color:rgba(134,239,172,.25);}
.kb-send{width:34px;height:34px;border-radius:50%;background:#22c55e;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .2s;}
.kb-send:hover{opacity:.85;}
.kb-send:disabled{opacity:.3;cursor:not-allowed;}
`;
document.head.appendChild(style);

// Build DOM
const root=document.createElement('div');root.id='kr-bubble-root';
root.innerHTML=`
<button id="kr-bubble-btn" title="Chat with Krishi Mitra" onclick="krBubbleToggle()">
  <span id="kr-bubble-btn-icon">🌿</span>
  <span id="kr-bubble-btn-label">AI Chat</span>
  <div id="kr-bubble-badge"></div>
</button>
<div id="kr-bubble-panel">
  <div class="kb-header">
    <div class="kb-title"><div class="kb-dot"></div>Krishi Mitra</div>
    <div class="kb-actions"><a class="kb-full-link" href="chat.html">Open full chat →</a><button class="kb-close" onclick="krBubbleClose()">×</button></div>
  </div>
  <div class="kb-langs" id="kb-langs">
    <div class="kb-lang" data-lang="Hindi" data-code="hi-IN" onclick="krSetLang(this)">हिंदी</div>
    <div class="kb-lang active" data-lang="English" data-code="en-IN" onclick="krSetLang(this)">English</div>
    <div class="kb-lang" data-lang="Telugu" data-code="te-IN" onclick="krSetLang(this)">తెలుగు</div>
    <div class="kb-lang" data-lang="Tamil" data-code="ta-IN" onclick="krSetLang(this)">தமிழ்</div>
    <div class="kb-lang" data-lang="Marathi" data-code="mr-IN" onclick="krSetLang(this)">मराठी</div>
    <div class="kb-lang" data-lang="Bengali" data-code="bn-IN" onclick="krSetLang(this)">বাংলা</div>
  </div>
  <div class="kb-messages" id="kb-messages"></div>
  <div class="kb-chips">
    <div class="kb-chip" onclick="krChip('My crop is diseased')">🌿 Diseased crop</div>
    <div class="kb-chip" onclick="krChip('What fertiliser should I apply?')">💊 Fertiliser</div>
    <div class="kb-chip" onclick="krChip('Tell me about government schemes for farmers')">🏛️ Schemes</div>
    <div class="kb-chip" onclick="krChip('Irrigation advice for my crop')">💧 Irrigation</div>
  </div>
  <div class="kb-input-row">
    <input class="kb-input" id="kb-input" placeholder="Ask anything…" onkeydown="if(event.key==='Enter')krSend()"/>
    <button class="kb-send" id="kb-send" onclick="krSend()" disabled>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
    </button>
  </div>
</div>`;
document.body.appendChild(root);

// Init lang buttons
document.querySelectorAll('.kb-lang').forEach(b=>{if(b.dataset.lang===curLang){b.classList.add('active');}else b.classList.remove('active');});

document.getElementById('kb-input').addEventListener('input',function(){document.getElementById('kb-send').disabled=!this.value.trim();});

function krBubbleClose(){open=false;document.getElementById('kr-bubble-panel').classList.remove('open');}
window.krBubbleClose=krBubbleClose;

window.krBubbleToggle=function(){
  open=!open;
  document.getElementById('kr-bubble-panel').classList.toggle('open',open);
  if(open){krRenderMessages();document.getElementById('kb-input').focus();}
};

document.getElementById('kr-bubble-btn').addEventListener('click',window.krBubbleToggle);

window.krSetLang=function(btn){
  document.querySelectorAll('.kb-lang').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');curLang=btn.dataset.lang;curCode=btn.dataset.code;
  localStorage.setItem(LS_LANG,JSON.stringify({lang:curLang,code:curCode}));
};

function krGetHistory(){try{return JSON.parse(localStorage.getItem(LS_HIST))||[];}catch{return[];}}
function krSaveHistory(h){localStorage.setItem(LS_HIST,JSON.stringify(h.slice(-20)));}
function krGetCtx(){try{const d=JSON.parse(localStorage.getItem('kr_last_diagnosis'));if(d)return`Farmer detected ${d.disease} with ${Math.round(d.confidence*100)}% confidence`;const s=JSON.parse(localStorage.getItem('kr_session'));if(s?.crop)return`Farmer grows ${s.crop}`;}catch{}return'Not specified';}
function krEsc(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');}
function krScroll(){const el=document.getElementById('kb-messages');if(el)el.scrollTop=el.scrollHeight;}

function krRenderMessages(){
  const el=document.getElementById('kb-messages');if(!el)return;
  const hist=krGetHistory();el.innerHTML='';
  if(!hist.length){krAddBot("Namaste! 🌱 I'm Krishi Mitra. Ask me anything about your farm!",false);}
  else{hist.slice(-12).forEach(m=>{if(m.role==='user')krAddUser(m.content,false);else krAddBot(m.content,false);});}
  krScroll();
}

function krAddUser(text,save=true){
  const el=document.getElementById('kb-messages');if(!el)return;
  const d=document.createElement('div');d.className='kb-msg user';
  d.innerHTML=`<div class="kb-bubble">${krEsc(text)}</div>`;
  el.appendChild(d);krScroll();
  if(save){const h=krGetHistory();h.push({role:'user',content:text});krSaveHistory(h);}
}
function krAddBot(text,save=true){
  const el=document.getElementById('kb-messages');if(!el)return;
  const d=document.createElement('div');d.className='kb-msg bot';
  d.innerHTML=`<div class="kb-av">🌿</div><div class="kb-bubble">${krEsc(text)}</div>`;
  el.appendChild(d);krScroll();
  if(save){const h=krGetHistory();h.push({role:'assistant',content:text});krSaveHistory(h);}
}
function krShowTyping(){const el=document.getElementById('kb-messages');if(!el)return;const d=document.createElement('div');d.className='kb-msg bot';d.id='kb-typing';d.innerHTML=`<div class="kb-av">🌿</div><div class="kb-typing"><span></span><span></span><span></span></div>`;el.appendChild(d);krScroll();}
function krHideTyping(){document.getElementById('kb-typing')?.remove();}

window.krSend=async function(){
  const inp=document.getElementById('kb-input');
  const text=inp.value.trim();if(!text)return;
  inp.value='';document.getElementById('kb-send').disabled=true;
  krAddUser(text);krShowTyping();

  // Save user message to history
  const hist=krGetHistory();
  hist.push({role:'user',content:text});
  krSaveHistory(hist);

  try{
    const res=await fetch(`${API}/chat/stream`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:text,language:curLang,crop_context:krGetCtx(),history:krGetHistory().slice(-16)})
    });
    krHideTyping();
    if(!res.ok){krAddBot('Sorry, could not connect. Please try again.');document.getElementById('kb-send').disabled=false;return;}

    // Create streaming bot bubble
    const el=document.getElementById('kb-messages');
    const d=document.createElement('div');d.className='kb-msg bot';
    const bubble=document.createElement('div');bubble.className='kb-bubble';
    d.innerHTML='<div class="kb-av">🌿</div>';
    d.appendChild(bubble);
    el.appendChild(d);

    const reader=res.body.getReader();
    const decoder=new TextDecoder();
    let fullText='';
    let buffer='';

    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      buffer+=decoder.decode(value,{stream:true});
      const lines=buffer.split('\n');
      buffer=lines.pop(); // keep incomplete line
      for(const line of lines){
        if(!line.startsWith('data: '))continue;
        const chunk=line.slice(6);
        if(chunk==='[DONE]')break;
        if(chunk.startsWith('[ERROR]')){bubble.textContent='Sorry, AI error. Please try again.';break;}
        // Unescape newlines
        const text=chunk.replace(/\\n/g,'\n');
        fullText+=text;
        bubble.textContent=fullText;
        krScroll();
      }
    }

    // Save full response to history
    if(fullText){
      const h=krGetHistory();
      h.push({role:'assistant',content:fullText});
      krSaveHistory(h);
    }
  }catch(ex){
    krHideTyping();
    // Fallback to non-streaming
    try{
      const res=await fetch(`${API}/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,language:curLang,crop_context:krGetCtx(),history:krGetHistory().slice(-16)})});
      if(res.ok){const d=await res.json();krAddBot(d.reply);}
      else krAddBot('Connection error. Make sure the backend is running.');
    }catch{krAddBot('Connection error. Make sure the backend is running.');}
  }
  document.getElementById('kb-send').disabled=false;
};

window.krChip=function(text){const inp=document.getElementById('kb-input');inp.value=text;document.getElementById('kb-send').disabled=false;krSend();};
})();
