(function(){
if(window.__topbar)return;window.__topbar=1;
var css=".tb{position:fixed;top:0;left:0;right:0;height:30px;z-index:9999;display:flex;align-items:center;background:#0f1424;font-family:inherit}"
+".tb .snd-box{display:inline-flex;align-items:center;gap:10px;margin:0 10px;font-size:12px;color:#9aa3b2;flex:none}"
+".snd-btn{font-family:inherit;font-size:12px;font-weight:600;line-height:1.2;border:1px solid #cfd3dc;background:#fff;color:#4b5260;border-radius:999px;padding:3px 10px;cursor:pointer;white-space:nowrap}"
+".snd-btn.on{background:#1b1f2d;color:#fff;border-color:#fff}"
+".snd-last{font-variant-numeric:tabular-nums;white-space:nowrap;padding:2px 4px;border-radius:4px}"
+".snd-last.flash{animation:sndf .7s ease-out}@keyframes sndf{from{background:#fff1a8;color:#000}to{background:transparent}}"
+".bj{flex:none;margin:0 10px;font-size:12px;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}"
+"#tick{flex:1;min-width:0;overflow:hidden;height:30px;line-height:30px;font-size:12px;font-weight:700;color:#FF4D4F;white-space:nowrap}"
+"#tick i{font-style:normal;display:inline-block;padding-left:100%;animation:tickMarq var(--mqd,40s) linear infinite}"
+"@keyframes tickMarq{from{transform:translateX(0)}to{transform:translateX(-100%)}}"
+"body{padding-top:30px!important}@media(max-width:640px){.snd-last{display:none}}";
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
var bar=document.createElement('div');bar.className='tb';
bar.innerHTML='<span class="snd-box"><button id="sndBtn" class="snd-btn" onclick="sndToggle()"></button><span id="sndLast" class="snd-last"></span></span><span id="bjBox" class="bj"></span><div id="tick"><i id="tickIn"></i></div>';
document.body.insertBefore(bar,document.body.firstChild);
// ===== 큰 체결 소리 (BTC 무기한선물 100만 달러 이상 체결 시 종소리) =====
// 바이낸스·바이비트·OKX 공개 체결 스트림을 직접 받아, 한 건이 기준 금액 이상이면 소리를 냄.
// 매수(시장가 매수)는 코인 획득 소리, 매도는 하강 아르페지오. 금액이 크면 여러 번 울림.
const SND = { on: false, min: 1000000, ctx: null, bus: null, verb: null, cur: 0, ends: [], ws: [], last: null, timers: [] };
try { SND.on = localStorage.getItem('tvSound') === 'on'; } catch (e) {}
const UP_NOTES = [659.26, 830.61, 987.77, 1318.51], DN_NOTES = [493.88, 369.99, 293.66, 246.94];

function sndAudio() {
  if (!SND.ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return false;
    const ctx = SND.ctx = new C();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    SND.bus = ctx.createGain(); SND.bus.gain.value = 1.4; SND.bus.connect(comp);
    // 짧은 잔향(노이즈를 점점 줄여 만든 울림)
    const n = Math.floor(ctx.sampleRate * 1.0), ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.5); }
    const cv = ctx.createConvolver(); cv.buffer = ir;
    SND.verb = ctx.createGain(); SND.verb.gain.value = 0.18; SND.verb.connect(cv); cv.connect(comp);
  }
  if (SND.ctx.state === 'suspended') SND.ctx.resume();
  return true;
}

// 종소리 한 음: 기본음 + 2배·3배 배음이 빠르게 줄어듦
function sndBell(freq, vol, len, delay) {
  const ctx = SND.ctx, now = ctx.currentTime;
  SND.ends = SND.ends.filter(t => t > now);
  const busy = SND.ends.length;
  if (busy > 200) return;
  if (SND.cur < now) SND.cur = now + 0.02;
  const t0 = delay == null ? SND.cur : SND.cur + delay;
  if (delay == null) SND.cur += busy <= 10 ? 0.08 : busy <= 20 ? 0.04 : 0.02;
  SND.ends.push(t0 + len);
  [[1, 1], [2, 0.35], [3, 0.12]].forEach(([mul, amp], k) => {
    if (busy > 20 && k) return; // 소리가 많이 겹치면 배음은 생략
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq * mul, t0);
    const d = len / (1 + k * 0.8), v = Math.max(0.0011, vol * amp);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(SND.bus); if (busy <= 20) g.connect(SND.verb);
    o.start(t0); o.stop(t0 + d + 0.03);
  });
}

// 한 음: 모양(type)·높이·시작 시각·길이·크기. 네모파는 저역 필터로 부드럽게
function sndNote(freq, type, t0, dur, vol, decay) {
  const ctx = SND.ctx, o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  lp.type = 'lowpass'; lp.frequency.value = type === 'square' ? 3000 : 8000;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0011, vol), t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(lp); lp.connect(g); g.connect(SND.bus);
  o.start(t0); o.stop(t0 + dur + 0.03);
}
// 상승(매수) = 코인 획득 "띵-딩!", 하락(매도) = 하강 아르페지오 "미-도-라-파-레"
function sndUp(t0, vol) {
  sndNote(987.77, 'square', t0, 0.12, vol * 0.5, 0.2);
  sndNote(1318.51, 'square', t0 + 0.08, 0.5, vol * 0.5, 0.15);
  return 0.6;
}
function sndDown(t0, vol) {
  [659.26, 523.25, 440, 349.23, 293.66].forEach((f, i) => sndNote(f, 'triangle', t0 + i * 0.09, 0.5, vol, 0.2));
  return 0.9;
}
function sndPlay(buy, vol, times) {
  const ctx = SND.ctx, now = ctx.currentTime;
  if (SND.cur < now) SND.cur = now + 0.02;
  if (SND.cur - now > 6) return; // 너무 많이 밀리면 건너뜀
  for (let k = 0; k < times; k++) SND.cur += (buy ? sndUp : sndDown)(SND.cur, vol) * (k < times - 1 ? 0.75 : 0.35);
}

function sndTrade(usd, buy, price, ex) {
  SND.last = { usd, buy, price, ex, t: Date.now() };
  sndLabel();
  if (!SND.on || !SND.ctx) return;
  const m = SND.min;
  // 100만 달러 이상 1번, 1,000만 달러 이상 2번, 1억 달러 이상 3번 울림. 금액이 클수록 조금 더 크게
  const times = usd >= m * 100 ? 3 : usd >= m * 10 ? 2 : 1;
  const vol = Math.min(0.5, 0.22 + Math.log10(usd / m) * 0.1);
  sndPlay(buy, vol, times);
}

// ---- 거래소 체결 스트림 ----
function sndConnect() {
  sndDisconnect();
  const open = (url, onopen, onmsg, name) => {
    let ws;
    try { ws = new WebSocket(url); } catch (e) { return; }
    ws.onopen = () => { ws._ok = true; sndLabel(); if (onopen) onopen(ws); };
    ws.onmessage = ev => { try { onmsg(JSON.parse(ev.data)); } catch (e) {} };
    ws.onclose = () => { if (SND.on && SND.ws.indexOf(ws) >= 0) SND.timers.push(setTimeout(() => { if (SND.on) sndConnect(); }, 5000)); };
    ws._name = name; SND.ws.push(ws);
  };
  // 바이낸스 USDT 무기한 (m=true 이면 매도 주도)
  open('wss://fstream.binance.com/market/ws/btcusdt@aggTrade', null, d => {
    if (d.e !== 'aggTrade') return;
    const p = +d.p, usd = p * +d.q;
    if (usd >= SND.min) sndTrade(usd, !d.m, p, 'Binance');
  }, 'binance');
  // 바이비트 USDT 무기한
  open('wss://stream.bybit.com/v5/public/linear', ws => {
    ws.send(JSON.stringify({ op: 'subscribe', args: ['publicTrade.BTCUSDT'] }));
    SND.timers.push(setInterval(() => { try { ws.send('{"op":"ping"}'); } catch (e) {} }, 20000));
  }, d => {
    if (!d.topic || !d.data) return;
    d.data.forEach(t => { const p = +t.p, usd = p * +t.v; if (usd >= SND.min) sndTrade(usd, t.S === 'Buy', p, 'Bybit'); });
  }, 'bybit');
  // OKX USDT 무기한 (계약 1개 = 0.01 BTC)
  open('wss://ws.okx.com/ws/v5/public', ws => {
    ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'trades', instId: 'BTC-USDT-SWAP' }] }));
    SND.timers.push(setInterval(() => { try { ws.send('ping'); } catch (e) {} }, 20000));
  }, d => {
    if (!d.data || !d.arg || d.arg.channel !== 'trades') return;
    d.data.forEach(t => { const p = +t.px, usd = p * +t.sz * 0.01; if (usd >= SND.min) sndTrade(usd, t.side === 'buy', p, 'OKX'); });
  }, 'okx');
}
function sndDisconnect() {
  const old = SND.ws; SND.ws = [];
  old.forEach(ws => { try { ws.close(); } catch (e) {} });
  SND.timers.forEach(t => { clearTimeout(t); clearInterval(t); }); SND.timers = [];
}

// ---- 버튼 ----
function sndFmt(usd) { return usd >= 1e6 ? '\u0024' + (usd / 1e6).toFixed(2) + 'M' : '\u0024' + Math.round(usd / 1e3) + 'K'; }
function sndLabel() {
  const b = document.getElementById('sndBtn'), l = document.getElementById('sndLast');
  if (b) { b.textContent = SND.on ? '🔊 Sound ON' : '🔇 Sound OFF'; b.className = 'snd-btn' + (SND.on ? ' on' : ''); }
  if (l) {
    const x = SND.last;
    if (!SND.on) l.textContent = 'BTC ≥ \u00241M 체결음';
    else if (!SND.ctx) l.textContent = '화면을 한 번 누르면 소리가 나요';
    else if (!x) l.textContent = '체결 기다리는 중… (거래소 연결 ' + SND.ws.filter(w => w._ok && w.readyState === 1).length + '/3)';
    else {
      l.innerHTML = '<b style="color:' + (x.buy ? '#16a34a' : '#dc2626') + '">' + (x.buy ? '▲ 매수 ' : '▼ 매도 ') + sndFmt(x.usd) + '</b> @' +
        Math.floor(x.price).toLocaleString('en-US') + ' · ' + x.ex;
      l.classList.remove('flash'); void l.offsetWidth; l.classList.add('flash');
    }
  }
}
function sndToggle() {
  SND.on = !SND.on;
  try { localStorage.setItem('tvSound', SND.on ? 'on' : 'off'); } catch (e) {}
  if (SND.on) { sndAudio(); sndConnect(); sndPlay(true, 0.3, 1); } else sndDisconnect();
  sndLabel();
}
// 예전에 켜 두었으면: 브라우저는 화면을 한 번 눌러야 소리를 허용하므로 첫 터치 때 다시 켬
if (SND.on) {
  sndConnect();
  const wake = () => { sndAudio(); sndLabel(); window.removeEventListener('pointerdown', wake, true); };
  window.addEventListener('pointerdown', wake, true);
}


sndLabel();
function monPrice(t,p){if(typeof p!=='number')return '—';var d={'BTC':0,'NASDAQ':0,'S&P':0,'KOSPI':0,'KOSPI 야간':0,'USDKRW':0,'KIMP':0,'US10Y':3,'GOLD':1}[t];var n=d==null?2:d;var s=(n===0?Math.floor(p):p).toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n});return t==='US10Y'?s+'%':s;}
function tickFit(){try{var el=document.getElementById('tickIn');el.style.setProperty('--mqd',Math.max(20,el.offsetWidth/50).toFixed(1)+'s');}catch(e){}}
function tickDraw(d){try{var ORDER=['BTC','NASDAQ','S&P','USDKRW','KIMP','GOLD','US10Y','WTI','KOSPI'];var key=function(t){return t==='KOSPI 야간'?'KOSPI':t};
var items=((d&&d.items)||[]).slice().sort(function(p,q){var i=ORDER.indexOf(key(p.t)),j=ORDER.indexOf(key(q.t));return(i<0?99:i)-(j<0?99:j)});
var parts=items.map(function(x){var c=x.c,has=typeof c==='number'&&isFinite(c);var a=has?Math.abs(c*100).toFixed(1):'';var pct=!has?'—':(a==='0.0'?'':(c>0?'+':'-'))+a+'%';var col=!has||a==='0.0'?'#9aa3b2':(c>0?'#FF4D4F':'#3B82F6');return '<span style="color:'+col+'">'+(monPrice(x.t,x.p)+' '+pct+' '+key(x.t).slice(0,3).toUpperCase()).replace(/&/g,'&amp;')+'</span>'});
if(!parts.length)return;document.getElementById('tickIn').innerHTML=parts.join(' <span style="color:#6b7280">/</span> ');tickFit();}catch(e){}}
function tickLoad(){try{google.script.run.withSuccessHandler(tickDraw).withFailureHandler(function(){}).web_monitorData();}catch(e){}}
tickLoad();setInterval(tickLoad,300000);window.addEventListener('resize',tickFit);
function bjLoad(){try{fetch('https://raw.githubusercontent.com/claude6683/claude6683.github.io/bj/bj.json?t='+Date.now()).then(function(r){return r.json()}).then(function(d){var el=document.getElementById('bjBox');if(!el)return;var p=d&&d.pos;if(!p){el.textContent='';return;}var up=p.pnl>=0,lg=p.side==='LONG';var f=function(n,k){return Math.abs(n).toLocaleString('en-US',{maximumFractionDigits:k})};el.innerHTML='<span style="color:#9aa3b2">웨돔</span> <span style="color:'+(lg?'#FF4D4F':'#3B82F6')+'">BTC '+(lg?'롱':'숏')+' '+f(p.size,0)+'</span> <span style="color:'+(up?'#FF4D4F':'#3B82F6')+'">'+(up?'+':'-')+f(p.pnl,0)+'</span>';}).catch(function(){});}catch(e){}}
bjLoad();setInterval(bjLoad,60000);
window.sndToggle=sndToggle;
})();
