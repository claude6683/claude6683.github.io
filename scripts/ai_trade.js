/* AI 자동매매(모의) 엔진 — BTCUSDT 1H, 전략 3개를 같은 가격으로 동시에 돌려 비교
 *  A: 규칙(SMC+EMA200+RSI+ATR)        — Claude 호출 없음
 *  C: 규칙 A + 하루 1번 Claude 총평이 방향(stance)을 제한 — 키 없으면 A와 동일
 * 모의거래: 실제 주문 없음. 수수료 0.05%/편도 + 슬리피지 0.02% 가정.
 * 상태는 ai-data 브랜치의 ai.json 에 저장(워크플로가 읽고 다시 씀).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { computeSMC } = require('../smc/smc-engine.js');

const SYMBOL = 'BTCUSDT';
const TF_SEC = 3600;
const START_EQUITY = 100000;          // 시작 모의자금 (USDT)
const RISK_PCT = 0.01;                // 1회 위험 = 자산의 1%
const FEE = 0.0005, SLIP = 0.0002;
const MODEL = 'claude-sonnet-5-5';
const STATE_IN = process.argv[2] || 'ai_state.json';
const STATE_OUT = process.argv[3] || 'out/ai.json';
const OFFLINE_FILE = process.env.AI_OFFLINE_BARS || '';   // 테스트용: 봉 JSON 파일
const KEY = process.env.ANTHROPIC_API_KEY || '';

// ---------------- data ----------------
async function getJSON(url, opt) {
  const r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(30000) }, opt || {}));
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
async function fetchBars() {
  if (OFFLINE_FILE) return JSON.parse(fs.readFileSync(OFFLINE_FILE, 'utf8'));
  const urls = [
    `https://data-api.binance.vision/api/v3/klines?symbol=${SYMBOL}&interval=1h&limit=1000`,
    `https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=1h&limit=1000`,
  ];
  for (const u of urls) {
    try {
      const j = await getJSON(u);
      return j.map(x => ({ t: Math.floor(x[0] / 1000), o: +x[1], h: +x[2], l: +x[3], c: +x[4] }));
    } catch (e) { console.log('data source failed:', u.split('/')[2], e.message); }
  }
  throw new Error('all data sources failed');   // 가격 출처를 섞지 않는다: 이번 실행은 건너뛰고 다음에 따라잡음
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
  if (side === '롱' && !canLong) miss.push(`총평 방향(${stance})이 롱을 허용하지 않음`);
  if (side === '숏' && !canShort) miss.push(`총평 방향(${stance})이 숏을 허용하지 않음`);
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

// ---------------- Claude 호출 ----------------
async function askClaude(system, user, maxTokens) {
  const r = await fetch(process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(60000),
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens || 700, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error('claude http ' + r.status);
  const j = await r.json();
  const txt = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no json');
  return JSON.parse(m[0]);
}
function ctxText(bars, S, acct) {
  const rows = bars.slice(-30).map(b => `${kst(b.t)} O${f0(b.o)} H${f0(b.h)} L${f0(b.l)} C${f0(b.c)}`).join('\n');
  const p = acct.pos;
  const dayAgo = bars[bars.length - 25] ? bars[bars.length - 25].c : S.c, wkAgo = bars[bars.length - 169] ? bars[bars.length - 169].c : S.c;
  return `BTCUSDT 1시간봉 (시각=KST). 현재 종가 ${f1(S.c)}\n최근 30봉:\n${rows}\n\n` +
    `지표: EMA50 ${f0(S.e50)}, EMA200 ${f0(S.e200)}, RSI14 ${S.rsi.toFixed(1)}, ATR14 ${f0(S.atr)}\n` +
    `24시간 변화 ${pc((S.c / dayAgo - 1) * 100)}, 7일 변화 ${pc((S.c / wkAgo - 1) * 100)}\n` +
    `SMC: 스윙추세 ${S.swingBias === 1 ? '상승' : S.swingBias === -1 ? '하락' : '미정'}, 내부추세 ${S.internalBias === 1 ? '상승' : S.internalBias === -1 ? '하락' : '미정'}, ` +
    `최근 상승돌파 ${S.brkUp ? S.brkUp.tag + '@' + f0(S.brkUp.level) : '없음'}, 최근 하락돌파 ${S.brkDn ? S.brkDn.tag + '@' + f0(S.brkDn.level) : '없음'}\n` +
    `상승OB: ${S.obUp.slice(0, 3).map(o => f0(o.low) + '~' + f0(o.high)).join(', ') || '없음'} / 하락OB: ${S.obDn.slice(0, 3).map(o => f0(o.low) + '~' + f0(o.high)).join(', ') || '없음'}\n` +
    `계좌: 자산 ${f0(acct.equity)}$ (시작 ${f0(START_EQUITY)}$)\n` +
    (p ? `보유: ${p.side === 'L' ? '롱' : '숏'} 진입 ${f0(p.entry)}, 손절 ${f0(p.stop)}, 목표 ${f0(p.target)}, 수량 ${p.qty.toFixed(4)} BTC` : '보유: 없음');
}
const SYS_TRADE = '너는 BTC 모의매매 트레이더다(실제 거래 아님, 학습용 시뮬레이션). 주어진 시장 데이터만 보고 지표(EMA·RSI·ATR·SMC 구조·OB·가격 행동 등)는 네가 알아서 골라 판단한다. ' +
  '한국어로 근거를 설명한다. 반드시 JSON 한 개만 출력: {"action":"BUY|SELL|HOLD|CLOSE|ADJUST_STOP","stop":숫자,"target":숫자,"risk_pct":0.25~1.0,"reason":"3문장 이내 한국어 근거"}. ' +
  'BUY=롱 진입, SELL=숏 진입(보유 없을 때만), CLOSE=보유 청산, ADJUST_STOP=보유 중 손절선만 유리한 방향으로 이동(stop 필수), HOLD=관망. ' +
  'BUY/SELL은 stop·target 필수이며 stop 거리는 ATR의 0.5~4배, 손익비 1.5 이상이어야 한다. 수수료 0.05%/편도 가정. 확신이 없으면 HOLD가 정답이다.';

function validateClaude(S, d, acct) {
  const a = String(d.action || '').toUpperCase();
  const p = acct.pos;
  if (a === 'HOLD') return { action: 'HOLD', reason: String(d.reason || '관망').slice(0, 600) };
  if (a === 'CLOSE') return p ? { action: 'CLOSE', reason: String(d.reason || '').slice(0, 600) } : { action: 'HOLD', reason: '청산 요청이지만 보유 없음. ' + String(d.reason || '').slice(0, 300) };
  if (a === 'ADJUST_STOP') {
    const s = +d.stop; if (!p || !isFinite(s)) return { action: 'HOLD', reason: '손절 이동 요청이 유효하지 않아 무시.' };
    const better = p.side === 'L' ? s > p.stop && s < S.c : s < p.stop && s > S.c;
    return better ? { action: 'ADJUST_STOP', stop: s, reason: String(d.reason || '').slice(0, 600) } : { action: 'HOLD', reason: '손절 이동이 불리하거나 현재가 반대편이라 무시.' };
  }
  if ((a === 'BUY' || a === 'SELL') && !p) {
    const stop = +d.stop, target = +d.target, c = S.c, dist = Math.abs(c - stop);
    const sideOk = a === 'BUY' ? (stop < c && target > c) : (stop > c && target < c);
    const rr = Math.abs(target - c) / dist;
    if (!isFinite(stop) || !isFinite(target) || !sideOk || dist < 0.5 * S.atr || dist > 4 * S.atr || rr < 1.5)
      return { action: 'HOLD', reason: `${a} 제안이 위험관리 규칙(손절 거리 ATR 0.5~4배, 손익비 ≥1.5, 방향 일치)에 맞지 않아 거부됨. 원래 근거: ` + String(d.reason || '').slice(0, 300) };
    const rp = Math.min(1, Math.max(0.25, +d.risk_pct || RISK_PCT * 100)) / 100;
    return { action: a, stop, target, riskPct: rp, reason: String(d.reason || '').slice(0, 700) };
  }
  return { action: 'HOLD', reason: (p ? '보유 중이라 추가 진입은 하지 않고 유지. ' : '') + String(d.reason || '').slice(0, 400) };
}

// ---------------- main ----------------
(async () => {
  const bars0 = await fetchBars();
  const nowS = Math.floor(Date.now() / 1000);
  const bars = bars0.filter(b => b.t + TF_SEC <= (process.env.AI_NOW ? +process.env.AI_NOW : nowS)).sort((a, b) => a.t - b.t); // 마감된 봉만
  if (bars.length < 300) throw new Error('bars too few: ' + bars.length);
  const lastIdx = bars.length - 1;

  let st = null;
  if (fs.existsSync(STATE_IN)) st = JSON.parse(fs.readFileSync(STATE_IN, 'utf8'));   // 깨진 파일이면 예외 → 실행 중단(덮어쓰기 방지)
  if (!st || !st.accounts) {
    const s0 = bars[lastIdx - 1];   // 시작점 = 직전 봉 → 최신 봉부터 바로 판단 시작
    st = { version: 1, symbol: SYMBOL, tf: '1h', startEquity: START_EQUITY, startT: s0.t, startPrice: s0.c, lastT: s0.t, updated: 0,
      px: [[s0.t, s0.c]], accounts: {
        A: newAcct('A', 'A · 규칙 (SMC+EMA+RSI+ATR)', '사람이 정한 규칙을 코드가 기계적으로 실행. Claude 호출 없음.'),
        C: newAcct('C', 'C · 규칙 + 일일 Claude 총평', 'A와 같은 규칙이되, 하루 1번 Claude가 정한 방향(롱만/숏만/양방향/쉬기)만 허용.'),
      }, daily: { t: 0, day: -1, stance: 'BOTH', text: '총평 전' }, notes: [] };
    for (const k of Object.keys(st.accounts)) st.accounts[k].curve.push([s0.t, START_EQUITY]);
    console.log('first run: start at', kst(s0.t), s0.c);
  }
  delete st.accounts.B;   // B(Claude 직접 판단) 폐기: 유료 API라서 제거
  const A = st.accounts.A, C = st.accounts.C;
  const newIdx = [];
  for (let i = 0; i <= lastIdx; i++) if (bars[i].t > st.lastT) newIdx.push(i);

  for (const i of newIdx) {
    const b = bars[i];
    if (i < lastIdx - 200) { [A, C].forEach(a => { manage(a, b); a.curve.push([b.t, +markEq(a, b.c).toFixed(2)]); }); st.px.push([b.t, b.c]); st.lastT = b.t; continue; }  // 오래 멈췄던 구간: 손절·목표만 처리
    const S = snapshot(bars, i), isLast = i === lastIdx;
    // 1) 보유 포지션 손절·목표 처리
    [A, C].forEach(a => manage(a, b));
    // 2) 규칙 전략: 구조 전환(스윙 CHoCH) 시 청산
    [A, C].forEach(a => {
      if (a.pos && S.swingChoch && ((a.pos.side === 'L' && !S.swingChoch.bull) || (a.pos.side === 'S' && S.swingChoch.bull)))
        closePos(a, b.t, b.c, '구조전환', `${kst(b.t)} 스윙 CHoCH(추세 전환 신호)가 나와 보유 방향과 반대라 종가 ${f0(b.c)}에 청산.`);
    });
    // 3) C의 일일 총평 (UTC 날짜가 바뀐 첫 봉, 최신 봉에서만)
    const day = Math.floor(b.t / 86400);
    if (isLast && KEY && st.daily.day !== day) {
      try {
        const r = await askClaude('너는 BTC 모의매매 전략가다(학습용 시뮬레이션). 하루에 한 번 오늘의 허용 방향을 정한다. JSON 한 개만 출력: {"stance":"BOTH|LONG_ONLY|SHORT_ONLY|FLAT","reason":"3문장 이내 한국어 총평"}. FLAT은 오늘 신규 진입 금지.',
          ctxText(bars, S, C) + `\n\n최근 7일 일봉 종가: ${[1, 2, 3, 4, 5, 6, 7].map(k => { const x = bars[lastIdx - 24 * k + 0]; return x ? f0(x.c) : '-'; }).reverse().join(', ')}\nA계좌 성과 ${pc((A.equity / START_EQUITY - 1) * 100)}, C계좌 ${pc((C.equity / START_EQUITY - 1) * 100)}`, 500);
        const s = ['BOTH', 'LONG_ONLY', 'SHORT_ONLY', 'FLAT'].includes(String(r.stance).toUpperCase()) ? String(r.stance).toUpperCase() : 'BOTH';
        st.daily = { t: b.t, day, stance: s, text: String(r.reason || '').slice(0, 600) };
      } catch (e) { console.log('daily review failed:', e.message); st.daily.day = day; st.daily.text = '총평 실패(' + e.message + ') — 직전 방향 유지'; }
    }
    // 4) 규칙 전략 신규 진입 판단
    for (const a of [A, C]) {
      if (a.cool > 0) a.cool--;
      const stance = a === C ? (KEY ? st.daily.stance : 'BOTH') : 'BOTH';
      if (a.pos) {
        const p = a.pos, u = (b.c - p.entry) * p.qty * (p.side === 'L' ? 1 : -1);
        a.status = { t: b.t, action: 'HOLDING', text: `${p.side === 'L' ? '롱' : '숏'} 보유 중 — 진입 ${f0(p.entry)}, 현재 ${f0(b.c)}, 미실현 ${u >= 0 ? '+' : ''}${f0(u)}$. 손절 ${f0(p.stop)}${p.be ? '(본전 이동됨)' : ''} / 목표 ${f0(p.target)}. 구조 전환(스윙 CHoCH)이나 손절·목표에 닿을 때까지 유지.` };
        continue;
      }
      if (a.cool > 0) { a.status = { t: b.t, action: 'HOLD', text: `청산 직후 재진입 대기 중(${a.cool}봉 남음) — 같은 자리 연속 진입을 막는 쿨다운.` }; continue; }
      const d = ruleDecision(S, stance);
      a.status = { t: b.t, action: d.action, text: d.reason };
      if (d.action === 'BUY' || d.action === 'SELL') openPos(a, S, d, d.action === 'BUY' ? 'L' : 'S');
    }
    if (isLast && !KEY) C.status.text += '  [참고: Claude 키가 없어 총평 없이 A와 같은 규칙으로 동작 중]';
    // 6) 자산곡선(종가 기준 평가)
    [A, C].forEach(a => a.curve.push([b.t, +markEq(a, b.c).toFixed(2)]));
    st.px.push([b.t, b.c]);
    st.lastT = b.t;
  }
  // 오래된 곡선·이벤트 정리(파일 크기 관리)
  [A, C].forEach(a => { if (a.curve.length > 4000) a.curve = a.curve.slice(-4000); if (a.events.length > 600) a.events = a.events.slice(-600); if (a.trades.length > 600) a.trades = a.trades.slice(-600); });
  if (st.px.length > 4000) st.px = st.px.slice(-4000);
  st.updated = nowS; st.lastPrice = bars[lastIdx].c;
  fs.mkdirSync(path.dirname(STATE_OUT), { recursive: true });
  fs.writeFileSync(STATE_OUT, JSON.stringify(st));
  console.log('done. processed bars:', newIdx.length, 'last', kst(st.lastT), 'equity A/C:', [A, C].map(a => f0(markEq(a, bars[lastIdx].c))).join(' / '), 'events', [A, C].map(a => a.events.length).join('/'));
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
