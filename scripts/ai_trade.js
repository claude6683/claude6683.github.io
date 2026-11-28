/* AI 자동매매(모의) 엔진 — SMC 탭 10종목, 종목마다 계좌 1개, 규칙 전략 하나(Claude API 없음)
 * 규칙: SMC 구조 돌파 + 오더블록 되돌림 + EMA200 추세 + RSI 필터 + ATR 손절, 손익비 1:2.5, 1R에서 본전스탑
 * 모의거래: 실제 주문 없음. 수수료 0.05%/편도 + 슬리피지 0.02% 가정, 레버리지 1배 한도.
 * 상태는 ai-data 브랜치의 ai.json 에 저장(워크플로가 읽고 다시 씀). 주식·ETF·KOSPI는 롱 전용.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { computeSMC } = require('../smc/smc-engine.js');

const TF_SEC = 3600;
const START_EQUITY = 100000;          // 종목당 시작 모의자금
const RISK_PCT = 0.01;                // 1회 위험 = 자산의 1%
const FEE = 0.0005, SLIP = 0.0002;
const MIN_BARS = 230;
const STATE_IN = process.argv[2] || 'ai_state.json';
const STATE_OUT = process.argv[3] || 'out/ai.json';
const OFFLINE_DIR = process.env.AI_OFFLINE_DIR || '';   // 테스트용: <키>.json 봉 파일 폴더
const SMC_DATA = 'https://raw.githubusercontent.com/claude6683/claude6683.github.io/smc-data/smc.json';
const SYMS = [
  { k: 'BTC', src: 'bn', sym: 'BTCUSDT', desc: '바이낸스 BTC/USDT 현물' },
  { k: 'GOLD', src: 'bn', sym: 'PAXGUSDT', desc: '바이낸스 PAXG(금 연동 토큰)' },
  { k: 'XYZ100', src: 'hl', sym: 'xyz:XYZ100', desc: 'Hyperliquid XYZ100 선물' },
  { k: 'SPCX', src: 'hl', sym: 'xyz:SPCX', desc: 'Hyperliquid SPCX 선물' },
  { k: 'SAMSUNG', src: 'hl', sym: 'xyz:SMSN', desc: 'Hyperliquid 삼성 선물' },
  { k: 'SCHG', src: 'st', longOnly: true, desc: '미국 ETF (롱 전용, 장중에만 봉 생성)' },
  { k: 'VOO', src: 'st', longOnly: true, desc: '미국 ETF (롱 전용, 장중에만 봉 생성)' },
  { k: 'QQQM', src: 'st', longOnly: true, desc: '미국 ETF (롱 전용, 장중에만 봉 생성)' },
  { k: 'SCHD', src: 'st', longOnly: true, desc: '미국 ETF (롱 전용, 장중에만 봉 생성)' },
  { k: 'KOSPI', src: 'st', longOnly: true, desc: '코스피 지수 (롱 전용, 장중에만 봉 생성)' },
];

// ---------------- data ----------------
async function getJSON(url, opt) {
  const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(30000) }, opt || {}));
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
let smcCache = null;
async function fetchBars(c) {
  if (OFFLINE_DIR) return JSON.parse(fs.readFileSync(path.join(OFFLINE_DIR, c.k + '.json'), 'utf8'));
  if (c.src === 'bn') {
    for (const host of ['data-api.binance.vision', 'api.binance.com']) {
      try {
        const j = await getJSON(`https://${host}/api/v3/klines?symbol=${c.sym}&interval=1h&limit=1000`);
        return j.map(x => ({ t: Math.floor(x[0] / 1000), o: +x[1], h: +x[2], l: +x[3], c: +x[4] }));
      } catch (e) { console.log(c.k, 'source failed:', host, e.message); }
    }
    throw new Error('all sources failed');
  }
  if (c.src === 'hl') {
    const now = Date.now();
    const j = await getJSON('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'candleSnapshot', req: { coin: c.sym, interval: '1h', startTime: now - 1000 * TF_SEC * 1000, endTime: now } }) });
    return j.map(x => ({ t: Math.floor(x.t / 1000), o: +x.o, h: +x.h, l: +x.l, c: +x.c }));
  }
  if (!smcCache) smcCache = await getJSON(SMC_DATA + '?t=' + Date.now());
  const a = smcCache.data && smcCache.data[c.k] && smcCache.data[c.k]['1h'];
  if (!a || !a.length) throw new Error('no stock data');
  return a.slice(-1000).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4] }));
}

// ---------------- indicators ----------------
function ema(arr, n) { const k = 2 / (n + 1), o = new Array(arr.length).fill(NaN); let p = NaN; for (let i = 0; i < arr.length; i++) { p = i === 0 ? arr[i] : arr[i] * k + p * (1 - k); o[i] = i >= n - 1 ? p : NaN; } return o; }
function rsi(C, n) { const o = new Array(C.length).fill(NaN); let g = 0, l = 0; for (let i = 1; i < C.length; i++) { const d = C[i] - C[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } } return o; }
function atr(bars, n) { const o = new Array(bars.length).fill(NaN); let r = NaN, s = 0; for (let i = 0; i < bars.length; i++) { const b = bars[i], tr = i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c)); if (i < n) { s += tr; if (i === n - 1) { r = s / n; o[i] = r; } } else { r = (r * (n - 1) + tr) / n; o[i] = r; } } return o; }

const f0 = v => Math.round(v).toLocaleString('en-US');
const f1 = v => (Math.round(v * 10) / 10).toLocaleString('en-US');
const pc = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
const kst = t => new Date((t + 32400) * 1000).toISOString().slice(5, 16).replace('T', ' ');

// 한 시점(i)의 지표·SMC 스냅샷 (미래 데이터 사용 없음: bars[0..i]만 사용)
function snapshot(bars, i) {
  const sub = bars.slice(0, i + 1);
  const C = sub.map(b => b.c);
  const e50 = ema(C, 50), e200 = ema(C, 200), r = rsi(C, 14), a = atr(sub, 14);
  const smc = computeSMC(sub, { swingLen: 20, tfSec: TF_SEC });
  const b = sub[i];
  const brk = (bull) => { // 최근 24봉 안의 구조 돌파(내부/스윙)
    let best = null;
    smc.structs.forEach(s => { if (s.bull === bull && s.i2 >= i - 24 && (!best || s.i2 > best.i2)) best = s; });
    return best;
  };
  const obs = (bull) => [].concat(smc.internalOBs.map(o => Object.assign({ kind: '내부' }, o)), smc.swingOBs.map(o => Object.assign({ kind: '스윙' }, o)))
    .filter(o => o.bias === (bull ? 1 : -1) && o.idx >= i - 150);
  const last = smc.structs.length ? smc.structs[smc.structs.length - 1] : null;
  const lastSwingCh = (() => { let x = null; smc.structs.forEach(s => { if (!s.internal && s.tag === 'CHoCH' && s.i2 === i) x = s; }); return x; })();
  return { i, t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, e50: e50[i], e200: e200[i], rsi: r[i], atr: a[i], smc, brkUp: brk(true), brkDn: brk(false), obUp: obs(true), obDn: obs(false), swingBias: smc.swingBias, internalBias: smc.internalBias, lastStruct: last, swingChoch: lastSwingCh };
}

// ---------------- 규칙 전략 (A, C) ----------------
function ruleDecision(S, stance) {
  const notes = [];
  const ok = isFinite(S.e200) && isFinite(S.atr) && isFinite(S.rsi);
  if (!ok) return { action: 'HOLD', reason: '지표 계산용 봉이 아직 부족해서 관망.' };
  const inZone = o => S.l <= o.high && S.c >= o.low && S.c <= o.high + 0.5 * S.atr;
  const inZoneDn = o => S.h >= o.low && S.c <= o.high && S.c >= o.low - 0.5 * S.atr;
  const canLong = stance !== 'SHORT_ONLY' && stance !== 'FLAT';
  const canShort = stance !== 'LONG_ONLY' && stance !== 'FLAT';

  // 롱 조건
  const L = {
    trend: S.c > S.e200, brk: !!S.brkUp, zone: S.obUp.find(inZone) || null, rsi: S.rsi < 60, candle: S.c > S.o,
  };
  const Sh = {
    trend: S.c < S.e200, brk: !!S.brkDn, zone: S.obDn.find(inZoneDn) || null, rsi: S.rsi > 40, candle: S.c < S.o,
  };
  if (canLong && L.trend && L.brk && L.zone && L.rsi && L.candle) {
    const z = L.zone;
    let stop = z.low - 0.2 * S.atr;
    let d = S.c - stop;
    if (d < 0.6 * S.atr) { stop = S.c - 0.6 * S.atr; d = 0.6 * S.atr; }
    if (d > 3.5 * S.atr) return { action: 'HOLD', reason: `롱 조건은 맞지만 손절폭(${f0(d)}$)이 ATR의 3.5배를 넘어 위험 대비 효율이 낮아 건너뜀.` };
    const target = S.c + 2.5 * d;
    return { action: 'BUY', stop, target, reason:
      `롱(BUY): ① 종가 ${f0(S.c)}가 EMA200(${f0(S.e200)}) 위 = 상승 추세. ② 최근 24봉 안에 상승 구조 돌파(${S.brkUp.internal ? '내부' : '스윙'} ${S.brkUp.tag}, ${f0(S.brkUp.level)}) 발생. ` +
      `③ 되돌림이 상승 ${z.kind}OB(${f0(z.low)}~${f0(z.high)}) 구간에 닿았고 양봉으로 지지 확인. ④ RSI ${S.rsi.toFixed(0)}로 과열 아님(<60). ` +
      `손절 ${f0(stop)}(${pc((stop / S.c - 1) * 100)}) = OB 하단 아래, 목표 ${f0(target)}(${pc((target / S.c - 1) * 100)}) = 손익비 1:2.5, +1R 도달 시 손절을 본전으로 이동.` };
  }
  if (canShort && Sh.trend && Sh.brk && Sh.zone && Sh.rsi && Sh.candle) {
    const z = Sh.zone;
    let stop = z.high + 0.2 * S.atr;
    let d = stop - S.c;
    if (d < 0.6 * S.atr) { stop = S.c + 0.6 * S.atr; d = 0.6 * S.atr; }
    if (d > 3.5 * S.atr) return { action: 'HOLD', reason: `숏 조건은 맞지만 손절폭(${f0(d)}$)이 ATR의 3.5배를 넘어 건너뜀.` };
    const target = S.c - 2.5 * d;
    return { action: 'SELL', stop, target, reason:
      `숏(SELL): ① 종가 ${f0(S.c)}가 EMA200(${f0(S.e200)}) 아래 = 하락 추세. ② 최근 24봉 안에 하락 구조 돌파(${S.brkDn.internal ? '내부' : '스윙'} ${S.brkDn.tag}, ${f0(S.brkDn.level)}) 발생. ` +
      `③ 반등이 하락 ${z.kind}OB(${f0(z.low)}~${f0(z.high)}) 구간에 닿았고 음봉으로 저항 확인. ④ RSI ${S.rsi.toFixed(0)}로 과매도 아님(>40). ` +
      `손절 ${f0(stop)}(${pc((stop / S.c - 1) * 100)}) = OB 상단 위, 목표 ${f0(target)}(${pc((target / S.c - 1) * 100)}) = 손익비 1:2.5, +1R 도달 시 손절을 본전으로 이동.` };
  }
  // 관망 사유: 가장 가까운 쪽(추세 방향) 기준으로 부족한 조건을 설명
  const side = S.c >= S.e200 ? '롱' : '숏';
  const T = side === '롱' ? L : Sh;
  const miss = [];
  if (!T.brk) miss.push(`최근 24봉 내 ${side === '롱' ? '상승' : '하락'} 구조 돌파 없음`);
  if (!T.zone) miss.push(`가격이 ${side === '롱' ? '상승' : '하락'} OB 구간에 아직 닿지 않음`);
  if (!T.rsi) miss.push(`RSI ${S.rsi.toFixed(0)}가 ${side === '롱' ? '과열(≥60)' : '과매도(≤40)'}`);
  if (T.brk && T.zone && T.rsi && !T.candle) miss.push('OB 구간이지만 반전 캔들 확인 전');
  if (side === '롱' && !canLong) miss.push('이 계좌는 롱을 허용하지 않음');
  if (side === '숏' && !canShort) miss.push('이 종목은 롱 전용이라 숏 진입은 하지 않음');
  return { action: 'HOLD', reason: `관망(HOLD): 종가 ${f0(S.c)}는 EMA200(${f0(S.e200)}) ${S.c >= S.e200 ? '위(상승 우위)' : '아래(하락 우위)'}. ${side} 진입 조건 미충족 — ${miss.join(', ') || '조건 대기'}. RSI ${S.rsi.toFixed(0)}, ATR ${f0(S.atr)}.` };
}

// ---------------- 계좌 ----------------
function newAcct(id, name, desc) { return { id, name, desc, equity: START_EQUITY, pos: null, trades: [], events: [], curve: [], status: { t: 0, text: '첫 실행 대기', action: 'HOLD' }, cool: 0, errors: 0 }; }
function markEq(a, price) {
  if (!a.pos) return a.equity;
  const p = a.pos, u = (price - p.entry) * p.qty * (p.side === 'L' ? 1 : -1);
  return a.equity + u;
}
function openPos(a, S, dec, side, extra) {
  const entry = side === 'L' ? S.c * (1 + SLIP) : S.c * (1 - SLIP);
  const risk$ = a.equity * (extra && extra.riskPct ? extra.riskPct : RISK_PCT);
  const dist = Math.abs(entry - dec.stop);
  let qty = risk$ / dist;
  const maxQty = a.equity / entry;              // 레버리지 1배 한도
  if (qty > maxQty) qty = maxQty;
  const fee = qty * entry * FEE;
  a.equity -= fee;
  a.pos = { side, qty, entry, stop: dec.stop, target: dec.target, r0: dist, t: S.t, be: false, fee };
  a.events.push({ t: S.t, type: side === 'L' ? 'BUY' : 'SELL', price: entry, stop: dec.stop, target: dec.target, qty, reason: dec.reason });
}
function closePos(a, t, price, why, detail) {
  const p = a.pos; if (!p) return;
  const px = p.side === 'L' ? price * (1 - SLIP) : price * (1 + SLIP);
  const gross = (px - p.entry) * p.qty * (p.side === 'L' ? 1 : -1);
  const fee = p.qty * px * FEE;
  const pnl = gross - fee - p.fee;               // 진입 수수료는 진입 시 이미 차감됨 → 아래서 보정
  a.equity += gross - fee;
  const tr = { t0: p.t, t1: t, side: p.side, entry: p.entry, exit: px, qty: p.qty, pnl, pnlPct: pnl / (p.entry * p.qty) * 100, why };
  a.trades.push(tr);
  a.events.push({ t, type: 'CLOSE', price: px, side: p.side, pnl, why, reason: detail || why });
  a.pos = null; a.cool = 3;
}
// 봉 하나에 대한 손절/목표/본전스탑 처리 (진입 봉 다음 봉부터)
function manage(a, b) {
  const p = a.pos; if (!p || b.t <= p.t) return;
  if (p.side === 'L') {
    if (b.l <= p.stop) return closePos(a, b.t, Math.min(p.stop, b.o), p.be ? '본전스탑' : '손절', `${kst(b.t)} 가격이 손절선 ${f0(p.stop)}에 닿아 청산${p.be ? '(본전 이동 후)' : ''}.`);
    if (b.h >= p.target) return closePos(a, b.t, p.target, '목표달성', `${kst(b.t)} 가격이 목표 ${f0(p.target)}에 도달해 익절.`);
    if (!p.be && b.h >= p.entry + p.r0) { p.be = true; p.stop = Math.max(p.stop, p.entry); }
  } else {
    if (b.h >= p.stop) return closePos(a, b.t, Math.max(p.stop, b.o), p.be ? '본전스탑' : '손절', `${kst(b.t)} 가격이 손절선 ${f0(p.stop)}에 닿아 청산${p.be ? '(본전 이동 후)' : ''}.`);
    if (b.l <= p.target) return closePos(a, b.t, p.target, '목표달성', `${kst(b.t)} 가격이 목표 ${f0(p.target)}에 도달해 익절.`);
    if (!p.be && b.l <= p.entry - p.r0) { p.be = true; p.stop = Math.min(p.stop, p.entry); }
  }
}


// ---------------- main ----------------
function migrate(st) {
  if (st.version === 2) return st;
  const n = { version: 2, startEquity: START_EQUITY, updated: 0, syms: {}, accounts: {} };
  if (st.accounts && st.accounts.A) {            // 구버전(BTC 단일, A·B·C) → BTC 계좌로 이전
    const a = st.accounts.A; a.id = 'BTC'; a.name = 'BTC'; a.desc = '바이낸스 BTC/USDT 현물';
    n.accounts.BTC = a; n.syms.BTC = { startT: st.startT, startPrice: st.startPrice, lastT: st.lastT, px: st.px || [] };
  }
  return n;
}
async function runSymbol(st, c, nowS) {
  const bars = (await fetchBars(c)).filter(b => b.t + TF_SEC <= nowS).sort((a, b) => a.t - b.t);
  if (bars.length < MIN_BARS) { console.log(c.k, 'skip: bars', bars.length); return; }
  const lastIdx = bars.length - 1;
  if (!st.accounts[c.k]) {
    const s0 = bars[lastIdx - 1];
    st.accounts[c.k] = newAcct(c.k, c.k, c.desc); st.accounts[c.k].curve.push([s0.t, START_EQUITY]);
    st.syms[c.k] = { startT: s0.t, startPrice: s0.c, lastT: s0.t, px: [[s0.t, s0.c]] };
    console.log(c.k, 'start at', kst(s0.t), s0.c);
  }
  const a = st.accounts[c.k], m = st.syms[c.k];
  a.desc = c.desc; a.longOnly = !!c.longOnly;
  const stance = c.longOnly ? 'LONG_ONLY' : 'BOTH';
  let n = 0;
  for (let i = 0; i <= lastIdx; i++) {
    const b = bars[i]; if (b.t <= m.lastT) continue; n++;
    if (i < lastIdx - 200) { manage(a, b); a.curve.push([b.t, +markEq(a, b.c).toFixed(2)]); m.px.push([b.t, b.c]); m.lastT = b.t; continue; }
    const S = snapshot(bars, i);
    manage(a, b);
    if (a.pos && S.swingChoch && ((a.pos.side === 'L' && !S.swingChoch.bull) || (a.pos.side === 'S' && S.swingChoch.bull)))
      closePos(a, b.t, b.c, '구조전환', `${kst(b.t)} 스윙 CHoCH(추세 전환 신호)가 나와 보유 방향과 반대라 종가 ${f0(b.c)}에 청산.`);
    if (a.cool > 0) a.cool--;
    if (a.pos) {
      const p = a.pos, u = (b.c - p.entry) * p.qty * (p.side === 'L' ? 1 : -1);
      a.status = { t: b.t, action: 'HOLDING', text: `${p.side === 'L' ? '롱' : '숏'} 보유 중 — 진입 ${f0(p.entry)}, 현재 ${f0(b.c)}, 미실현 ${u >= 0 ? '+' : ''}${f0(u)}. 손절 ${f0(p.stop)}${p.be ? '(본전 이동됨)' : ''} / 목표 ${f0(p.target)}. 구조 전환(스윙 CHoCH)이나 손절·목표에 닿을 때까지 유지.` };
    } else if (a.cool > 0) {
      a.status = { t: b.t, action: 'HOLD', text: `청산 직후 재진입 대기 중(${a.cool}봉 남음) — 같은 자리 연속 진입을 막는 쿨다운.` };
    } else {
      const d = ruleDecision(S, stance);
      a.status = { t: b.t, action: d.action, text: d.reason };
      if (d.action === 'BUY' || d.action === 'SELL') openPos(a, S, d, d.action === 'BUY' ? 'L' : 'S');
    }
    a.curve.push([b.t, +markEq(a, b.c).toFixed(2)]); m.px.push([b.t, b.c]); m.lastT = b.t;
  }
  if (a.curve.length > 4000) a.curve = a.curve.slice(-4000); if (a.events.length > 600) a.events = a.events.slice(-600);
  if (a.trades.length > 600) a.trades = a.trades.slice(-600); if (m.px.length > 4000) m.px = m.px.slice(-4000);
  m.lastPrice = bars[lastIdx].c;
  console.log(c.k, 'bars processed', n, 'last', kst(m.lastT), 'equity', f0(markEq(a, bars[lastIdx].c)), 'events', a.events.length);
}
(async () => {
  const nowS = process.env.AI_NOW ? +process.env.AI_NOW : Math.floor(Date.now() / 1000);
  let st = null;
  if (fs.existsSync(STATE_IN)) st = JSON.parse(fs.readFileSync(STATE_IN, 'utf8'));   // 깨진 파일이면 예외 → 실행 중단(덮어쓰기 방지)
  st = st ? migrate(st) : { version: 2, startEquity: START_EQUITY, updated: 0, syms: {}, accounts: {} };
  let ok = 0;
  for (const c of SYMS) {
    try { await runSymbol(st, c, nowS); ok++; } catch (e) { console.log(c.k, 'FAILED:', e.message); }
  }
  if (!ok) throw new Error('no symbol processed');
  st.updated = nowS;
  fs.mkdirSync(path.dirname(STATE_OUT), { recursive: true });
  fs.writeFileSync(STATE_OUT, JSON.stringify(st));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
