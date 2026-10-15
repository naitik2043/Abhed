/** The company website: a customer dashboard with an AI assistant, and Abhed governing it in plain sight. */
export function page(site, kavachUrl) {
  const t = site.theme;
  const cfg = JSON.stringify({ brand: site.brand, agents: site.agents, prompts: site.prompts, kavachUrl, kind: site.kind, id: site.brand.toLowerCase().replace(/[^a-z]/g, '') });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${site.brand} · ${site.kind}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%278%27 fill=%27%23ededed%27/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=${t.fontsQuery}&family=Geist:wght@300..800&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{color-scheme:dark;--bg:#0a0a0a;--panel:#111;--panel2:#171717;--panel3:#1f1f1f;--ink:#ededed;--ink2:#c8c8c8;--on:#0a0a0a;--brand:#ededed;--mut:#a1a1a1;--mut2:#6e6e6e;--line:rgba(255,255,255,.09);--line2:rgba(255,255,255,.055);--lineS:rgba(255,255,255,.2);--ok:#5cc98b;--ok-s:rgba(92,201,139,.1);--hold:#e5a84b;--hold-s:rgba(229,168,75,.1);--no:#ff6b6b;--no-s:rgba(255,107,107,.1);--ease:cubic-bezier(.22,1,.36,1)}
*{box-sizing:border-box;margin:0;padding:0}
body{color:var(--ink);font:14.5px/1.55 'Geist',${t.font};-webkit-font-smoothing:antialiased;min-height:100vh;background:radial-gradient(1100px 480px at 50% -160px,rgba(255,255,255,.07),transparent 70%),radial-gradient(rgba(255,255,255,.035) 1px,transparent 1px) 0 0/22px 22px,var(--bg);background-attachment:fixed}
::selection{background:var(--ink);color:var(--on)}
a{color:inherit;text-decoration:none}.mono{font-family:'Geist Mono','JetBrains Mono',monospace;font-size:.84em}.muted{color:var(--mut)}
header{background:rgba(10,10,10,.72);backdrop-filter:saturate(140%) blur(14px);-webkit-backdrop-filter:saturate(140%) blur(14px);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.hbar{max-width:1360px;margin:0 auto;display:flex;align-items:center;gap:28px;height:64px;padding:0 28px}
.brand{display:flex;align-items:center;gap:11px}.logo{width:32px;height:32px;border-radius:9px;background:var(--ink);display:grid;place-items:center;color:var(--on);font-weight:800;font-size:15px;font-family:${t.display}}
.brand b{font-family:${t.display};font-size:20px;font-weight:700;letter-spacing:-.02em}
.hnav{display:flex;gap:22px;color:var(--mut);font-weight:500;font-size:14px}.hnav span{transition:color .2s;cursor:default}.hnav span:hover{color:var(--ink)}.hnav span:first-child{color:var(--ink)}
.hright{margin-left:auto;display:flex;align-items:center;gap:10px}
.who{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mut);font-weight:500}
select,textarea,button{font:inherit;color:inherit}select{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-weight:500;color:var(--ink);color-scheme:dark}
.gov{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:500;border:1px solid var(--line);padding:7px 11px;border-radius:8px;background:var(--panel);transition:border-color .2s}.gov:hover{border-color:var(--lineS)}
.gov svg{width:14px;height:14px}
.top{max-width:1360px;margin:0 auto;padding:34px 28px 6px;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;align-items:stretch}
.hello h1{font-family:${t.display};font-weight:700;font-size:38px;letter-spacing:-.035em;line-height:1.08;background:linear-gradient(180deg,#fff 30%,#9a9a9a);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}.hello p{color:var(--mut);margin-top:8px;max-width:560px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;min-width:0;background-image:radial-gradient(420px circle at var(--mx,-500px) var(--my,-500px),rgba(255,255,255,.055),transparent 45%);transition:border-color .3s var(--ease)}.card:hover{border-color:rgba(255,255,255,.15)}
.card h3{font-family:'Geist Mono',monospace;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);font-weight:500;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.acct{margin-top:18px}
.kv{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line2);font-size:13.5px;gap:10px}.kv:last-child{border:0}.kv span{color:var(--mut)}
.big{font-family:${t.display};font-size:40px;font-weight:700;letter-spacing:-.04em;margin-bottom:6px}
.prot{border-color:rgba(255,255,255,.16);background-color:#0f0f0f}
.prot h3{color:var(--ink)}.prot h3::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--ok);margin-right:8px;animation:ring 1.8s var(--ease) infinite}.prot h3{justify-content:flex-start}.prot h3 .mono{margin-left:auto}
.pstats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}.pstats div{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:12px}.pstats b{display:block;font-size:28px;font-weight:600;letter-spacing:-.04em;font-variant-numeric:tabular-nums}.pstats span{font-size:12px;color:var(--mut)}
.pstats div:nth-child(1) b{color:var(--no)}.pstats div:nth-child(2) b{color:var(--hold)}
.caught{border-left:2px solid var(--line);padding:6px 0 6px 12px;margin-bottom:10px;animation:in .5s var(--ease) both}.caught.no{border-color:var(--no)}.caught.hold{border-color:var(--hold)}
.caught-h{display:flex;justify-content:space-between;gap:10px;font-size:13.5px}.caught-h span{font-size:12px;font-weight:600;white-space:nowrap}.caught.no .caught-h span{color:var(--no)}.caught.hold .caught-h span{color:var(--hold)}
.caught p{font-size:12.5px;color:var(--mut);margin-top:3px;line-height:1.5}
.pfoot{font-size:12px;color:var(--mut2);margin-top:12px;display:flex;justify-content:space-between;gap:10px}
main{max-width:1360px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;padding:16px 28px 40px}
.tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}.tab{border:1px solid var(--line);background:var(--panel2);border-radius:10px;padding:8px 12px;cursor:pointer;display:flex;gap:9px;align-items:center;font-weight:600;transition:border-color .2s,background .2s}.tab:hover{border-color:var(--lineS)}.tab small{font-weight:400;color:var(--mut)}.tab.on{border-color:var(--ink);background:var(--panel3)}
.av{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;background:var(--panel3);color:var(--ink);font-size:12px;font-weight:700}.tab.on .av{background:var(--ink);color:var(--on)}
.chat{min-height:320px;max-height:50vh;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:4px 2px 12px}
.msg{max-width:84%;padding:10px 14px;border-radius:14px;animation:in .45s var(--ease) both;line-height:1.5}.me{align-self:flex-end;background:var(--ink);color:var(--on);border-bottom-right-radius:4px}.bot{align-self:flex-start;background:var(--panel2);border:1px solid var(--line);border-bottom-left-radius:4px}
.sys{align-self:center;font-size:13px;color:var(--mut);text-align:center;max-width:92%}
.hold{align-self:stretch;border:1px solid rgba(229,168,75,.3);background:var(--hold-s);border-radius:12px;padding:12px 14px;font-size:13.5px}.hold b{color:var(--hold)}
.paused{align-self:stretch;border:1px solid rgba(255,107,107,.3);background:var(--no-s);border-radius:12px;padding:12px 14px;font-size:13.5px}
@keyframes in{from{opacity:0;transform:translateY(8px);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}
@keyframes ring{0%{box-shadow:0 0 0 0 rgba(92,201,139,.45)}100%{box-shadow:0 0 0 8px rgba(92,201,139,0)}}
.top>*,main>*{animation:in .8s var(--ease) both}.top>*:nth-child(2),main>*:nth-child(2){animation-delay:.08s}main>*{animation-delay:.14s}main>*:nth-child(2){animation-delay:.2s}
.compose{display:flex;gap:8px;margin-top:6px}textarea{flex:1;min-height:52px;resize:vertical;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;outline:none;color-scheme:dark;transition:border-color .2s}textarea:focus{border-color:var(--lineS);box-shadow:0 0 0 3px rgba(255,255,255,.05)}
.send{background:var(--ink);color:var(--on);border:0;border-radius:12px;padding:0 22px;font-weight:600;cursor:pointer;transition:background .2s,transform .15s}.send:hover{background:#fff}.send:active{transform:scale(.97)}.send:disabled{opacity:.4}
.tries{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}.try-h{grid-column:1/-1;font-family:'Geist Mono',monospace;font-size:11px;color:var(--mut2);letter-spacing:.08em;text-transform:uppercase;font-weight:500;margin-top:4px}.try{text-align:left;border:1px solid var(--line);background:var(--panel2);border-radius:10px;padding:11px 12px;cursor:pointer;font-size:13px;line-height:1.45;color:var(--ink2);transition:border-color .2s,background .2s,transform .2s var(--ease)}.try:hover{border-color:var(--lineS);background:var(--panel3);transform:translateY(-1px)}.try small{display:block;color:var(--mut);font-family:'Geist Mono',monospace;font-size:11px;margin-top:5px}
.trace{display:flex;flex-direction:column;gap:8px;max-height:68vh;overflow:auto}.st{border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13px;animation:in .45s var(--ease) both;background:var(--panel2)}.st .h{display:flex;justify-content:space-between;gap:8px;align-items:center}
.chip{font-size:11.5px;font-weight:600;border-radius:6px;padding:2px 8px;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}.chip::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.c-ok{color:var(--ok);background:var(--ok-s)}.c-hold{color:var(--hold);background:var(--hold-s)}.c-no{color:var(--no);background:var(--no-s)}.c-mut{color:var(--mut);background:var(--panel3);border:0}
.st .r{color:var(--mut);margin-top:4px;line-height:1.45}.st.think{border-style:dashed;color:var(--mut);font-style:italic;background:transparent}
.dot{display:inline-flex;gap:3px}.dot i{width:5px;height:5px;border-radius:50%;background:var(--ink);animation:b 1.1s infinite}.dot i:nth-child(2){animation-delay:.15s}.dot i:nth-child(3){animation-delay:.3s}@keyframes b{50%{opacity:.2}}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:8px 4px;border-bottom:1px solid var(--line2);text-align:left}th{color:var(--mut2);font-weight:500;font-size:12px}
.flash{animation:fl 1.8s}@keyframes fl{from{background:rgba(255,255,255,.08)}to{background:transparent}}
footer{max-width:1360px;margin:0 auto;padding:0 28px 40px;color:var(--mut2);font-size:13px}footer code{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:2px 6px;color:var(--ink2)}
#agents .kv b.chip{font-size:11px}
@media(max-width:1100px){main,.top{grid-template-columns:1fr}.hnav{display:none}.tries{grid-template-columns:1fr}.chat{min-height:180px}}@media(max-width:640px){.who-l{display:none}}
@media(max-width:640px){.hbar{gap:12px;padding:0 16px;height:auto;min-height:60px;flex-wrap:wrap;padding-top:10px;padding-bottom:10px}.top,main{padding-left:16px;padding-right:16px}.gov.abhed span{display:none}.hello h1{font-size:30px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}

.hello h1{font-weight:500;letter-spacing:-.03em;font-size:44px;background:none;-webkit-text-fill-color:currentColor;color:#fff}.hello p{font-size:16px;color:#9a9a9a}
.card{border-radius:18px;padding:22px;background-color:#0f0f0f;border-color:rgba(255,255,255,.075)}.card h3{font-family:inherit;letter-spacing:.16em;color:#7a7a7a}
.gov,select,.tab{border-radius:999px}.send{border-radius:999px;padding:0 26px}.try{border-radius:14px}textarea{border-radius:16px}
.big{font-weight:500}.pstats b{font-weight:400;font-size:32px}.pstats div{border-radius:14px}
@media(max-width:640px){.hello h1{font-size:32px}}
.offline{max-width:1360px;margin:22px auto 0;padding:0 28px}.offline-in{display:flex;gap:14px;align-items:flex-start;border:1px solid rgba(229,168,75,.35);background:rgba(229,168,75,.08);border-radius:16px;padding:16px 18px;font-size:14.5px;line-height:1.55;animation:in .6s var(--ease) both}.offline-in a{text-decoration:underline}.off-dot{width:9px;height:9px;border-radius:50%;background:var(--hold);margin-top:7px;flex:none;box-shadow:0 0 0 4px rgba(229,168,75,.15)}
.gov.abhed.off{color:var(--hold);border-color:rgba(229,168,75,.35)}
@media(max-width:640px){.offline{padding:0 16px}}
</style></head><body>
<header><div class="hbar">
<div class="brand"><div class="logo">${site.brand[0]}</div><b>${site.brand}</b></div>
<nav class="hnav">${(site.nav || []).map((n) => `<span>${n}</span>`).join('')}</nav>
<div class="hright"><label class="who"><span class="who-l">Signed in as</span> <select id="cust"></select></label>
<a class="gov" href="/admin">Staff &amp; admin</a>
<a class="gov abhed" href="${kavachUrl}/fleet" target="_blank" rel="noopener"><svg viewBox="0 0 31.5 48.5"><path d="M21.5 0L21.5 19.5L31.5 19.5L31.5 29L10 48.5L10 28.5L0.5 28.5L0.5 18.5Z" fill="#ededed"/><rect x="0.5" y="18.5" width="9" height="10" fill="#ffffff"/><rect x="22" y="19.5" width="9.5" height="9.5" fill="#ffffff"/></svg><span id="gov-t">Protected by Abhed</span></a></div>
</div></header>
<div id="offline" class="offline" hidden><div class="offline-in"><span class="off-dot"></span><div><b>Our AI assistants are switched off.</b> This website is not connected to Abhed yet, so no agent may act for a customer. <span class="muted">Staff: open <a href="/admin">Admin</a> and enter the pairing code from Abhed.</span></div></div></div>
<section class="top">
  <div>
    <div class="hello"><h1 id="hello">${site.tagline}</h1><p>${site.intro}</p></div>
    <div class="card acct"><h3>${site.accountTitle || 'Your account'}</h3><div id="mine"></div></div>
  </div>
  <div class="card prot"><h3>Why our AI agents need Abhed <span class="mono" style="text-transform:none;letter-spacing:0;color:var(--mut)">live</span></h3>
    <div class="pstats"><div><b id="p-stop">–</b><span>stopped before running</span></div><div><b id="p-ask">–</b><span>sent to a person</span></div><div><b id="p-act">–</b><span>actions checked</span></div></div>
    <div id="prot"><p class="muted">Loading…</p></div>
    <div class="pfoot"><span>Without Abhed, each of these would have run straight on our systems.</span><span id="p-chain"></span></div>
  </div>
</section>
<main>
  <div class="card"><h3>Ask our assistant</h3><div class="tabs" id="tabs"></div><div class="chat" id="chat"><div class="sys">Ask about your account, our policies, fees or timelines, or ask it to do something. It works on our live systems, under Abhed governance.</div></div>
    <div class="compose"><textarea id="text" placeholder="Type your request…"></textarea><button class="send" id="send">Send</button></div>
    <div class="tries" id="tries"></div></div>
  <div>
    <div class="card"><h3>Abhed governance · live <span id="sess" class="mono"></span></h3><div class="trace" id="trace"><div class="st c-mut">Every thought and tool call of our assistant appears here as Abhed decides on it.</div></div></div>
    <div class="card" style="margin-top:18px"><h3>Our AI agents</h3><div id="agents"></div></div>
  </div>
</main>
<footer>How ${site.brand} plugged in: each agent got an Abhed key, and every tool call goes through <code>abhed.call(session, tool, args)</code> (<a href="${kavachUrl}/integrate" target="_blank" style="text-decoration:underline">integration guide</a>). ${site.brand} is a fictional company.</footer>
<script>
const C=${cfg};let D={},agent=C.agents[0].id,cust=null,task=null,seen=0,busy=false,H={},lastQ='';const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));const inr=n=>'₹'+Math.round(Number(n)||0).toLocaleString('en-IN');
function tabs(){$('#tabs').innerHTML=C.agents.map(a=>'<button class="tab '+(a.id===agent?'on':'')+'" data-a="'+a.id+'"><span class="av">'+esc(a.avatar)+'</span>'+esc(a.name)+' <small>'+esc(a.job)+'</small></button>').join('');document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{agent=b.dataset.a;tabs();tries()})}
function tries(){$('#tries').innerHTML='<div class="try-h">Try one of these real customer requests</div>'+C.prompts.filter(p=>p.agent===agent).map((p,i)=>'<button class="try" data-i="'+C.prompts.indexOf(p)+'">'+esc(p.text.replace(/<!--[\\s\\S]*-->/,'⟨hidden instruction⟩'))+'<small>'+esc(p.note)+'</small></button>').join('');document.querySelectorAll('.try').forEach(b=>b.onclick=()=>{const p=C.prompts[+b.dataset.i];if(p.customer){$('#cust').value=p.customer;cust=p.customer;mine()}$('#text').value=p.text})}
function custList(){const cs=D.customers||[];const sel=$('#cust');if(sel.options.length!==cs.length+1){sel.innerHTML='<option value="">— nobody (staff) —</option>'+cs.map(c=>'<option value="'+c.id+'">'+esc(c.name)+' · '+c.id+'</option>').join('');if(!cust&&cs[0]){cust=cs[0].id}sel.value=cust||'';sel.onchange=()=>{cust=sel.value||null;mine()}}}
let mine=function(){const el=$('#mine');const c=(D.customers||[]).find(x=>x.id===cust);let h='';
 if(C.id==='novabank'&&c){const a=(D.accounts||[]).find(x=>x.id===c.id)||{};h='<div class="big">'+inr(a.balance)+'</div><div class="kv"><span>Card</span><b>'+esc(a.cardStatus||'active')+'</b></div><div class="kv"><span>Tier</span><b>'+esc(c.tier)+'</b></div><table><tr><th>Ref</th><th>Amount</th><th>Status</th></tr>'+(D.txns||[]).filter(t=>t.customer===c.id).map(t=>'<tr><td class="mono">'+esc(t.ref)+'</td><td>'+inr(t.amount)+'</td><td>'+esc(t.status)+'</td></tr>').join('')+'</table>'}
 else if(C.id==='sanjeevanihospital'&&c){const p=(D.patients||[]).find(x=>x.id===c.id)||{};h='<div class="kv"><span>Insurer</span><b>'+esc(p.insurer)+'</b></div><div class="kv"><span>Shares records with insurer</span><b>'+(p.consentInsurer?'yes':'no')+'</b></div><table><tr><th>Prescription</th><th>Refills left</th></tr>'+(p.prescriptions||[]).map(r=>'<tr><td>'+esc(r.drug)+'</td><td>'+esc(r.refillsLeft)+'</td></tr>').join('')+'</table><table style="margin-top:8px"><tr><th>Bill</th><th>Amount</th><th>Status</th></tr>'+(D.bills||[]).filter(b=>b.patient===c.id).map(b=>'<tr><td>'+esc(b.for)+'</td><td>'+inr(b.amount)+'</td><td>'+esc(b.status)+'</td></tr>').join('')+'</table>'}
 else if(C.id==='bazaarin'){h='<table><tr><th>Product</th><th>Price</th></tr>'+(D.products||[]).map(p=>'<tr><td>'+esc(p.name)+' <span class="mono" style="color:var(--mut)">'+esc(p.sku)+'</span></td><td><b>'+inr(p.price)+'</b></td></tr>').join('')+'</table>'+(c?'<table style="margin-top:10px"><tr><th>Your order</th><th>Total</th><th>Status</th></tr>'+(D.orders||[]).filter(o=>o.customer===c.id).map(o=>'<tr><td>'+esc(o.id)+' · '+esc(o.item)+'</td><td>'+inr(o.total)+'</td><td>'+esc(o.status)+'</td></tr>').join('')+'</table>':'')}
 if(el.dataset.h!==h){if(el.dataset.h)el.classList.remove('flash'),void el.offsetWidth,el.classList.add('flash');el.dataset.h=h;el.innerHTML=h}}
function agentsPanel(){$('#agents').innerHTML=C.agents.map(a=>{const s=(D.agents||{})[a.id];const st=s?s.status:(linked===false?'OFF':'…');const tone=st==='ACTIVE'?'c-ok':st==='PAUSED'?'c-no':st==='OFF'?'c-mut':'c-hold';return '<div class="kv"><span>'+esc(a.name)+' · '+esc(a.job)+'</span><b class="chip '+tone+'">'+esc(st)+'</b></div>'+(s&&s.status==='PAUSED'?'<div style="font-size:11.5px;color:var(--no);margin:-2px 0 6px">'+esc(s.statusReason||'')+'</div>':'')}).join('')}
async function load(){try{D=await (await fetch('/api/data')).json();custList();mine();agentsPanel()}catch(e){}}
function add(cls,html){const d=document.createElement('div');d.className=cls;d.innerHTML=html;$('#chat').appendChild(d);$('#chat').scrollTop=1e9;return d}
function tr(cls,html){const t=$('#trace');if(t.firstChild&&t.firstChild.classList.contains('c-mut'))t.innerHTML='';const d=document.createElement('div');d.className='st '+cls;d.innerHTML=html;t.prepend(d)}
const chip=d=>d==='ALLOWED'||d==='EXECUTED'?'<span class="chip c-ok">'+(d==='ALLOWED'?'allowed':'executed')+'</span>':d==='NEEDS_APPROVAL'?'<span class="chip c-hold">needs a person</span>':'<span class="chip c-no">'+esc(String(d).toLowerCase())+'</span>';
let typing=null;
async function poll(){if(!task)return;const t=await (await fetch('/api/task/'+task)).json();for(const e of t.events.slice(seen)){seen++;show(e)}if(t.status==='done'){busy=false;$('#send').disabled=false;typing&&typing.remove();typing=null;load();return}setTimeout(poll,700)}
function show(e){
 if(e.type==='session'){$('#sess').textContent=e.sessionId;tr('', '<div class="h"><b>Session '+esc(e.sessionId)+' opened</b>'+(e.tainted?'<span class="chip c-hold">tainted</span>':'<span class="chip c-ok">clean</span>')+'</div>'+(e.tainted?'<div class="r">Scanner flagged: '+esc((e.signals||[]).join(', '))+'. Nothing this task reads may leave the company.</div>':'<div class="r">Task scanned for prompt injection before the model saw it.</div>'))}
 if(e.type==='think'&&e.text)tr('think','💭 '+esc(e.text)+'<div class="r mono">'+esc(e.model||'')+' · '+(e.tokens||0)+' tokens · '+(e.ms||0)+' ms</div>');
 if(e.type==='tool'){tr('', '<div class="h"><b class="mono">'+esc(e.tool)+'</b>'+chip(e.decision)+'</div><div class="r mono">'+esc(JSON.stringify(e.args))+'</div><div class="r">'+esc(e.reason||'')+(e.rule?' · <span class="mono">'+esc(e.rule)+'</span>':'')+' · decided in '+(e.gatewayMs??'?')+' ms · ledger #'+esc(e.record)+'</div>');if(e.decision==='BLOCKED'&&!e.paused)add('sys','🛡 Abhed refused <b>'+esc(e.tool.replace(/_/g,' '))+'</b>: '+esc(e.reason))}
 if(e.type==='waiting'){add('hold','<b>Waiting for one of our people to approve</b> ('+esc(e.approvalId)+').<br>'+esc(e.reason)+'<br><span style="color:var(--mut)">They decide on their phone in the Abhed approver app. The agent pauses until then.</span>');tr('', '<div class="h"><b>Phone approval requested</b><span class="chip c-hold">'+esc(e.approvalId)+'</span></div><div class="r">Pushed to on-duty approvers · <a href="'+C.kavachUrl+'/approve/'+esc(e.approvalId)+'" target="_blank">open ↗</a></div>')}
 if(e.type==='approval'){const ok=e.status==='EXECUTED';add('sys',(ok?'✅ Approved by '+esc(e.by)+'. Done exactly as approved.':'⛔ '+esc(e.status.toLowerCase())+(e.by?' by '+esc(e.by):'')));tr('', '<div class="h"><b>'+esc(e.approvalId)+'</b>'+chip(ok?'EXECUTED':e.status)+'</div><div class="r">'+(e.by?'Decided by '+esc(e.by):'')+'</div>')}
 if(e.type==='paused'){add('paused','<b>This agent has been paused by Abhed.</b><br>'+esc(e.text)+'<br><span style="color:var(--mut)">A person from our team will handle your request.</span>');tr('', '<div class="h"><b>Agent paused</b><span class="chip c-no">critical breach</span></div><div class="r">'+esc(e.text)+'</div>')}
 if(e.type==='final'){typing&&typing.remove();typing=null;add('msg bot',esc(e.text).replace(/\\*\\*(.+?)\\*\\*/g,'<b>$1</b>').replace(/[\\[【]([A-Z]{2}-[A-Z]+-\\d+)[\\]】]/g,' <span class="mono" style="font-size:11px;border:1px solid var(--line);border-radius:5px;padding:0 5px;opacity:.8">$1</span>').replace(/\\n/g,'<br>'));const h=(H[agent+':'+(cust||'')]??=[]);h.push({role:'user',content:lastQ},{role:'assistant',content:e.text});if(h.length>12)h.splice(0,h.length-12)}
 if(e.type==='error'){add('sys','⚠ '+esc(e.text))}
 if(typing){$('#chat').appendChild(typing)}
}
$('#send').onclick=async()=>{const text=$('#text').value.trim();if(!text||busy)return;lastQ=text;busy=true;$('#send').disabled=true;add('msg me',esc(text).replace(/&lt;!--[\\s\\S]*--&gt;/,'<span style="opacity:.55">⟨hidden instruction⟩</span>'));$('#text').value='';typing=add('msg bot','<span class="dot"><i></i><i></i><i></i></span>');
 const c=(D.customers||[]).find(x=>x.id===cust);const r=await fetch('/api/task',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agent,text,customer:c||null,customerName:c?c.name:'Staff',history:H[agent+':'+(cust||'')]||[]})});const j=await r.json();if(!r.ok){add('sys','⚠ '+esc(j.error));busy=false;$('#send').disabled=false;typing.remove();typing=null;return}task=j.id;seen=0;poll()};
$('#text').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('#send').click()}});
const ICON={BLOCKED:'Stopped',NEEDS_APPROVAL:'Sent to a person'};
async function protect(){try{const p=await (await fetch('/api/protection')).json();if(!p.available){$('#prot').innerHTML='<p class="muted">Live protection numbers appear when this site is connected to Abhed.</p>';return}
$('#p-stop').textContent=p.stopped;$('#p-ask').textContent=p.asked;$('#p-act').textContent=p.actions;
$('#prot').innerHTML=p.caught.length?p.caught.map(x=>'<div class="caught '+(x.decision==='BLOCKED'?'no':'hold')+'"><div class="caught-h"><b>'+esc(x.actor)+' tried to '+esc(x.action.replace(/_/g,' '))+'</b><span>'+(ICON[x.decision]||x.decision)+'</span></div><p>'+esc(x.reason)+(x.rule?' <span class="mono">'+esc(x.rule)+'</span>':'')+'</p></div>').join(''):'<p class="muted">Nothing risky yet today. Try one of the suggested requests and watch this list.</p>';
$('#p-chain').textContent=p.chain&&p.chain.valid?'Ledger verified: '+p.chain.records+' records, none edited':'';}catch(e){}}
function greet(){const c=(D.customers||[]).find(x=>x.id===cust);const h=new Date().getHours();$('#hello').textContent=(h<12?'Good morning':h<17?'Good afternoon':'Good evening')+(c?', '+c.name.replace(/^(Mr|Mrs|Ms|Dr)\\.\\s*/,'').split(' ')[0]:'')+'.'}
const _mine=mine;mine=function(){_mine();greet()};
document.addEventListener('pointermove',e=>{const c=e.target.closest&&e.target.closest('.card');if(!c)return;const r=c.getBoundingClientRect();c.style.setProperty('--mx',(e.clientX-r.left)+'px');c.style.setProperty('--my',(e.clientY-r.top)+'px')},{passive:true});
let linked=null;
async function linkState(){try{const c=await (await fetch('/api/connection')).json();const was=linked;linked=!!c.connected;
 $('#offline').hidden=linked;$('#send').disabled=!linked||busy;$('#text').placeholder=linked?'Type your request…':'Assistant offline until this website is connected to Abhed';
 $('#gov-t').textContent=linked?'Protected by Abhed':'Not connected to Abhed';document.querySelector('.gov.abhed').classList.toggle('off',!linked);if(!linked){D.agents={};agentsPanel()}
 if(!linked&&!(D.customers||[]).length)$('#mine').innerHTML='<p class="muted">Your account loads once our assistants are connected to Abhed.</p>';
 if(was===false&&linked){load();protect();add('sys','Connected to Abhed just now. Our assistants are online and every action they take is governed.')}}catch(e){}}
linkState();setInterval(linkState,3000);
tabs();tries();load();setInterval(load,4000);protect();setInterval(protect,8000);
</script></body></html>`;
}
