import json
import sys
from pathlib import Path

import pandas as pd
import yfinance as yf

START = "2016-01-01"
OUTPUT_FILE = "divergence/index.html"

TICKERS = {
    "BTC": "BTC-USD",
    "GOLD": "GC=F",
    "NASDAQ": "^IXIC",
    "KOSPI": "^KS11",
}


def load_prices():
    raw = yf.download(
        list(TICKERS.values()),
        start=START,
        auto_adjust=True,
        progress=False,
    )
    close = raw["Close"]
    close = close.rename(columns={v: k for k, v in TICKERS.items()})

    missing = [k for k in TICKERS if k not in close.columns or close[k].dropna().empty]
    if missing:
        print("Download failed for:", missing)
        sys.exit(1)

    close = close[list(TICKERS.keys())]
    close.index = pd.to_datetime(close.index).tz_localize(None)
    close = close.sort_index().ffill()

    # Align everything to weekdays so that N rows is about N trading days
    weekdays = pd.bdate_range(close.index.min(), close.index.max())
    close = close.reindex(weekdays).ffill().dropna(how="any")
    return close


def main():
    close = load_prices()
    if len(close) < 300:
        print("Too little data:", len(close))
        sys.exit(1)

    payload = {"dates": [d.strftime("%Y-%m-%d") for d in close.index]}
    for name in TICKERS:
        payload[name] = [round(float(v), 4) for v in close[name].tolist()]

    html = TEMPLATE.replace("__DATA__", json.dumps(payload, separators=(",", ":")))
    html = html.replace("__UPDATED__", close.index[-1].strftime("%Y-%m-%d"))
    Path(OUTPUT_FILE).write_text(html, encoding="utf-8")
    print("Wrote", OUTPUT_FILE, "rows:", len(close), "last:", close.index[-1].date())


TEMPLATE = r'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>BTC Divergence</title>
<style>
  *{box-sizing:border-box}
  html,body{height:100%;margin:0;background:#0f1218;color:#d7dce5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px}
  .page{height:100%;display:flex;flex-direction:column;padding:8px 10px;max-width:1500px;margin:0 auto}
  h1{font-size:16px;margin:2px 0 8px}
  h1 span{font-size:12px;color:#7d8798;font-weight:400;margin-left:8px}
  .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:6px}
  .box{background:#171c26;border:1px solid #262d3b;border-radius:8px;padding:5px 8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .box label{color:#9aa4b5}
  input[type=number]{width:80px;background:#0f1218;color:#d7dce5;border:1px solid #333c4e;border-radius:4px;padding:4px 6px;font-size:13px}
  input[type=range]{width:160px}
  button{background:#0f1218;color:#d7dce5;border:1px solid #333c4e;border-radius:4px;padding:5px 9px;cursor:pointer;font-size:13px}
  button:hover{border-color:#7d8798}
  button.on{background:#f2b84b;border-color:#f2b84b;color:#1a1405;font-weight:700}
  .toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}
  .toolbar .sp{flex:1}
  .toolbar .bar{width:1px;height:22px;background:#2a3342;margin:0 2px}
  .toolbar button{background:#171d27;border:1px solid #2a3342;border-radius:6px;padding:6px 11px;font-size:14px}
  .toolbar button:hover{border-color:#8793a6}
  .toolbar button.on{background:#f2b84b;border-color:#f2b84b;color:#1a1405;font-weight:700}
  #startInfo{color:#9aa4b5;font-size:12px}
  #info{min-height:20px;margin:2px 0 6px;color:#9aa4b5;white-space:nowrap;overflow-x:auto}
  #info b{color:#d7dce5}
  #wrap{position:relative;flex:1;min-height:320px;background:#171c26;border:1px solid #262d3b;border-radius:6px;overflow:hidden}
  canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}
  .note{font-size:11px;color:#7d8798;margin-top:6px;line-height:1.5}
</style>
</head>
<body>
<div class="page">
  <h1>BTC vs Assets - Return Divergence<span>data until __UPDATED__</span></h1>

  <div class="row">
    <div class="box">
      <label>Start (days back)</label>
      <input type="number" id="start" min="20" max="3000" step="1" value="300">
      <input type="range" id="startr" min="20" max="3000" step="1" value="300">
      <span id="startInfo"></span>
    </div>
    <div class="box" id="assetBox"><label>Assets</label></div>
  </div>

  <div class="toolbar">
    <button data-tool="none" class="on">&#51060;&#46041;</button>
    <button data-tool="h">&#49688;&#54217;&#49440;</button>
    <button data-tool="v">&#49688;&#51649;&#49440;</button>
    <button data-tool="l">&#52628;&#49464;&#49440;</button>
    <button data-tool="r">&#49324;&#44033;&#54805;</button>
    <button data-tool="m">&#51116;&#44592;</button>
    <span class="bar"></span>
    <button id="undo">&#47560;&#51648;&#47561; &#51648;&#50864;&#44592;</button>
    <button id="clear">&#51204;&#52404; &#51648;&#50864;&#44592;</button>
    <span class="sp"></span>
    <button id="reload">&#49352;&#47196;&#44256;&#52840;</button>
  </div>

  <div id="info"></div>
  <div id="wrap"><canvas id="cv"></canvas></div>
  <div class="note">
    Lines show return since the start date (start = 0%). Gap = highest return minus lowest return (percentage points).
    Idea: sell the highest, buy the lowest when the gap is wide. Wheel = zoom, drag = move, drag the line between panels = resize, double-click (Move tool) = fit all.
    Drawings are saved in this browser (price positions are in % from the start date). Experiment only, not investment advice.
  </div>
</div>

<script>
const D = __DATA__;
const NAMES = ["BTC","GOLD","NASDAQ","KOSPI"];
const COL = {"BTC":"#f7931a","GOLD":"#f5c542","NASDAQ":"#4da3ff","KOSPI":"#c77dff"};
const DAY = 864e5, AX = 92, AY = 24, GOLD = "#f2b84b", KEY = "div_draw_v1";
const UP = "#e5484d", DOWN = "#3b82f6";
const T = D.dates.map(function(s){ return Date.parse(s + "T00:00:00Z"); });
const n = T.length;
const $ = function(i){ return document.getElementById(i); };
const cv = $("cv"), ctx = cv.getContext("2d"), wrap = $("wrap");

let W = 0, H = 0, pw = 0, dpr = 1, plotH = 0, H1 = 0, H2 = 0, fr = 0.68;
let left = 0, barW = 2, yMin = 0, yMax = 1, g2Max = 1, manual = false, mMin = 0, mMax = 1;
let mouse = null, pan = null, axisDrag = null, divDrag = null, tool = "none", draft = null, meas = null, drawings = [];
let s0 = 0, ret = {}, gap = [], hiN = [], loN = [];
const vis = {GOLD: true, NASDAQ: true, KOSPI: true};

function active(){ return NAMES.filter(function(k){ return k === "BTC" || vis[k]; }); }
function fp(v){ return (v >= 0 ? "+" : "") + v.toFixed(1) + "%"; }

function compute(){
  const act = active();
  NAMES.forEach(function(k){
    const base = D[k][s0];
    ret[k] = D[k].map(function(v, i){ return i < s0 ? null : (v / base - 1) * 100; });
  });
  gap = new Array(n).fill(null); hiN = new Array(n).fill(""); loN = new Array(n).fill("");
  for(let i = s0; i < n; i++){
    let mx = -1e18, mn = 1e18, hn = "", ln = "";
    act.forEach(function(k){
      const v = ret[k][i];
      if(v > mx){ mx = v; hn = k; }
      if(v < mn){ mn = v; ln = k; }
    });
    gap[i] = mx - mn; hiN[i] = hn; loN[i] = ln;
  }
}

// ===== coordinates =====
function xOf(i){ return (i - left) * barW + barW / 2; }
function iOf(x){ return (x - barW / 2) / barW + left; }
function yOf(p){ return H1 - (p - yMin) / (yMax - yMin) * H1; }
function pOf(y){ return yMin + (H1 - y) / H1 * (yMax - yMin); }
function y2Of(v){ return H1 + H2 - 4 - (v / g2Max) * (H2 - 18); }
function v2Of(y){ return (H1 + H2 - 4 - y) / (H2 - 18) * g2Max; }
function tToI(t){
  if(t >= T[n-1]) return n - 1 + (t - T[n-1]) / DAY;
  if(t <= T[0]) return (t - T[0]) / DAY;
  let lo = 0, hi = n - 1;
  while(hi - lo > 1){ const m = (lo + hi) >> 1; if(T[m] <= t) lo = m; else hi = m; }
  return lo + (t - T[lo]) / (T[lo+1] - T[lo]);
}
function iToT(i){
  if(i <= 0) return T[0] + i * DAY;
  if(i >= n - 1) return T[n-1] + (i - n + 1) * DAY;
  const lo = Math.floor(i), f = i - lo;
  return T[lo] + f * (T[lo+1] - T[lo]);
}
function px(t){ return xOf(tToI(t)); }
function nice(range, cnt){
  const r0 = range / cnt, p = Math.pow(10, Math.floor(Math.log10(r0))), f = r0 / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}
function layout(){
  const r = wrap.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  W = r.width; H = r.height;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pw = W - AX; geo();
}
function geo(){ plotH = H - AY; H1 = Math.round(plotH * fr); H2 = plotH - H1; }
function clampView(){
  const v = pw / barW;
  left = Math.max(s0 - 3, Math.min(left, n - v + 10));
}
function fit(){
  manual = false;
  barW = Math.max(0.2, pw / (n - s0 + 6));
  left = s0 - 1;
}
function ensureManual(){ if(!manual){ manual = true; mMin = yMin; mMax = yMax; } }

// ===== drawing helpers =====
function tag(text, y, bg, fg){
  ctx.font = "11px sans-serif"; ctx.fillStyle = bg; ctx.fillRect(pw, y - 9, AX, 18);
  ctx.fillStyle = fg; ctx.textAlign = "left"; ctx.fillText(text, pw + 5, y + 4);
}
function plotSeries(arr, col, w, yf, a, z){
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
  let st = false;
  for(let i = a; i <= z; i++){
    const v = arr[i];
    if(v == null){ st = false; continue; }
    const x = xOf(i), y = yf(v);
    if(st) ctx.lineTo(x, y); else { ctx.moveTo(x, y); st = true; }
  }
  ctx.stroke();
}
function drawShape(d, isDraft){
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.setLineDash(isDraft ? [5,4] : []);
  if(d.k === "h"){
    const y = Math.round(yOf(d.p)) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke();
  } else if(d.k === "v"){
    const x = Math.round(px(d.t)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H1); ctx.stroke();
  } else if(d.k === "l"){
    ctx.beginPath(); ctx.moveTo(px(d.t1), yOf(d.p1)); ctx.lineTo(px(d.t2), yOf(d.p2)); ctx.stroke();
  } else if(d.k === "r"){
    const x1 = px(d.t1), y1 = yOf(d.p1), x2 = px(d.t2), y2 = yOf(d.p2);
    ctx.fillStyle = "rgba(242,184,75,0.12)";
    ctx.fillRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
    ctx.strokeRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
  }
  ctx.setLineDash([]); ctx.lineWidth = 1;
}
function drawMeasure(){
  if(!meas) return;
  const x1 = px(meas.t1), y1 = yOf(meas.p1), x2 = px(meas.t2), y2 = yOf(meas.p2);
  const diff = meas.p2 - meas.p1, up = diff >= 0, col = up ? UP : DOWN;
  const nb = Math.abs(Math.round(tToI(meas.t2) - tToI(meas.t1)));
  const days = Math.round(Math.abs(meas.t2 - meas.t1) / DAY);
  ctx.setLineDash([]);
  ctx.fillStyle = up ? "rgba(229,72,77,0.14)" : "rgba(59,130,246,0.14)";
  ctx.fillRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1), Math.abs(y2-y1));
  ctx.strokeStyle = col; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2); ctx.lineTo(x2 - 9 * Math.cos(ang - 0.45), y2 - 9 * Math.sin(ang - 0.45));
  ctx.moveTo(x2, y2); ctx.lineTo(x2 - 9 * Math.cos(ang + 0.45), y2 - 9 * Math.sin(ang + 0.45));
  ctx.stroke();
  const sg = up ? "+" : "\u2212";
  const l1 = sg + Math.abs(diff).toFixed(1) + "pp", l2 = nb + " bars / " + days + " days";
  ctx.font = "bold 12px sans-serif"; ctx.textAlign = "left";
  const bw2 = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 16, bh = 38;
  let bx = (x1 + x2) / 2 - bw2 / 2, by = up ? Math.min(y1, y2) - bh - 6 : Math.max(y1, y2) + 6;
  bx = Math.max(2, Math.min(pw - bw2 - 2, bx)); by = Math.max(2, Math.min(H1 - bh - 2, by));
  ctx.fillStyle = col; ctx.fillRect(bx, by, bw2, bh);
  ctx.fillStyle = "#ffffff"; ctx.fillText(l1, bx + 8, by + 16); ctx.fillText(l2, bx + 8, by + 31);
  ctx.lineWidth = 1;
}

function draw(){
  ctx.clearRect(0, 0, W, H);
  if(!W || !H) return;
  clampView(); geo();
  const act = active();
  const a = Math.max(s0, Math.floor(left)), z = Math.min(n - 1, Math.ceil(left + pw / barW));
  const a2 = Math.max(s0, a - 1), z2 = Math.min(n - 1, z + 1);
  let lo = 0, hi = 0, gm = 0;
  for(let i = a; i <= z; i++){
    act.forEach(function(k){ const v = ret[k][i]; if(v < lo) lo = v; if(v > hi) hi = v; });
    if(gap[i] > gm) gm = gap[i];
  }
  const pad = (hi - lo) * 0.08 || 1;
  if(manual){ yMin = mMin; yMax = mMax; } else { yMin = lo - pad; yMax = hi + pad; }
  g2Max = gm > 0 ? gm * 1.1 : 1;

  // ---- top panel ----
  const step = nice(yMax - yMin, 7), dec = step >= 1 ? 0 : (step >= 0.1 ? 1 : 2);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, pw, H1); ctx.clip();
  ctx.lineWidth = 1; ctx.strokeStyle = "#222b39";
  for(let p = Math.ceil(yMin / step) * step; p < yMax; p += step){
    const y = Math.round(yOf(p)) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke();
  }
  const zy = Math.round(yOf(0)) + 0.5;
  ctx.setLineDash([5,4]); ctx.strokeStyle = "#6b768a";
  ctx.beginPath(); ctx.moveTo(0, zy); ctx.lineTo(pw, zy); ctx.stroke(); ctx.setLineDash([]);
  act.filter(function(k){ return k !== "BTC"; }).forEach(function(k){ plotSeries(ret[k], COL[k], 1.6, yOf, a2, z2); });
  plotSeries(ret.BTC, COL.BTC, 2.8, yOf, a2, z2);
  drawings.forEach(function(d){ drawShape(d, false); });
  if(draft) drawShape(draft, true);
  drawMeasure();
  ctx.restore();

  ctx.fillStyle = "#8793a6"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
  for(let p = Math.ceil(yMin / step) * step; p < yMax; p += step){ ctx.fillText(p.toFixed(dec) + "%", pw + 6, yOf(p) + 4); }
  // legend
  let lx = 8;
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#8793a6"; ctx.fillText("Return since " + D.dates[s0] + " :", lx, 16); lx += 150;
  act.forEach(function(k){
    ctx.fillStyle = COL[k]; ctx.fillRect(lx, 7, 10, 10);
    ctx.fillText(k, lx + 14, 16); lx += ctx.measureText(k).width + 30;
  });
  if(manual){ ctx.fillStyle = GOLD; ctx.fillText("manual", pw + 6, 12); }
  // end tags (right side)
  const tags = act.map(function(k){ return {k: k, y: yOf(ret[k][n-1]), v: ret[k][n-1]}; })
    .filter(function(t){ return t.y > 8 && t.y < H1 - 8; })
    .sort(function(p, q){ return p.y - q.y; });
  for(let i = 1; i < tags.length; i++){ if(tags[i].y - tags[i-1].y < 17) tags[i].y = tags[i-1].y + 17; }
  tags.forEach(function(t){ tag(t.k + " " + fp(t.v), t.y, COL[t.k], "#10141b"); });
  drawings.forEach(function(d){
    if(d.k === "h"){ const hy = yOf(d.p); if(hy > 0 && hy < H1) tag(d.p.toFixed(1) + "%", hy, GOLD, "#1a1405"); }
  });

  // ---- bottom panel (gap) ----
  ctx.save(); ctx.beginPath(); ctx.rect(0, H1 + 1, pw, H2 - 1); ctx.clip();
  const step2 = nice(g2Max, 3);
  ctx.strokeStyle = "#222b39"; ctx.lineWidth = 1;
  for(let v = 0; v < g2Max; v += step2){
    const y = Math.round(y2Of(v)) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke();
  }
  if(z2 >= a2){
    ctx.beginPath(); ctx.moveTo(xOf(a2), y2Of(0));
    for(let i = a2; i <= z2; i++) ctx.lineTo(xOf(i), y2Of(gap[i]));
    ctx.lineTo(xOf(z2), y2Of(0)); ctx.closePath();
    ctx.fillStyle = "rgba(242,184,75,0.12)"; ctx.fill();
    plotSeries(gap, GOLD, 1.4, y2Of, a2, z2);
  }
  ctx.restore();
  ctx.fillStyle = "#8793a6"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
  for(let v = 0; v < g2Max; v += step2){ ctx.fillText(v.toFixed(step2 >= 1 ? 0 : 1) + "pp", pw + 6, y2Of(v) + 4); }
  ctx.fillText("Gap = highest - lowest return (pp)", 8, H1 + 16);
  const gy = y2Of(gap[n-1]);
  if(gy > H1 + 8 && gy < H1 + H2 - 4) tag(gap[n-1].toFixed(1) + "pp", gy, GOLD, "#1a1405");

  // ---- divider + axis lines ----
  ctx.strokeStyle = "#3a4558"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H1 + 0.5); ctx.lineTo(W, H1 + 0.5); ctx.stroke();
  ctx.fillStyle = "#55627a"; ctx.fillRect(pw / 2 - 16, H1 - 1, 32, 3);
  ctx.strokeStyle = "#2a3342";
  ctx.beginPath(); ctx.moveTo(pw + 0.5, 0); ctx.lineTo(pw + 0.5, plotH); ctx.stroke();

  // ---- date axis ----
  ctx.fillStyle = "#171c26"; ctx.fillRect(0, plotH, W, AY);
  ctx.strokeStyle = "#2a3342"; ctx.beginPath(); ctx.moveTo(0, plotH + 0.5); ctx.lineTo(pw, plotH + 0.5); ctx.stroke();
  ctx.fillStyle = "#8793a6"; ctx.textAlign = "center"; ctx.font = "11px sans-serif";
  let lk = "", lastX = -999;
  for(let i = a; i <= z; i++){
    const k2 = D.dates[i].slice(0, 7), xx = xOf(i);
    if(k2 !== lk){
      lk = k2;
      if(xx > 20 && xx < pw - 20 && xx - lastX >= 56){ ctx.fillText(k2.slice(2), xx, plotH + 16); lastX = xx; }
    }
  }
  ctx.textAlign = "left";

  // ---- crosshair ----
  let ci = n - 1;
  const inPlot = mouse && mouse.x >= 0 && mouse.x < pw && mouse.y >= 0 && mouse.y < plotH;
  if(inPlot){
    ci = Math.max(s0, Math.min(n - 1, Math.round(iOf(mouse.x))));
    const cx = Math.round(xOf(ci)) + 0.5, my = Math.round(mouse.y) + 0.5;
    ctx.setLineDash([4,4]); ctx.strokeStyle = "#7d8aa0"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, my); ctx.lineTo(pw, my); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, plotH); ctx.stroke();
    ctx.setLineDash([]);
    tag(mouse.y < H1 ? fp(pOf(mouse.y)) : Math.max(0, v2Of(mouse.y)).toFixed(1) + "pp", mouse.y, "#e8edf5", "#10141b");
    ctx.font = "11px sans-serif";
    const t = D.dates[ci], tw = ctx.measureText(t).width + 12;
    ctx.fillStyle = "#e8edf5"; ctx.fillRect(Math.min(Math.max(0, cx - tw / 2), pw - tw), plotH + 2, tw, AY - 4);
    ctx.fillStyle = "#10141b"; ctx.textAlign = "center";
    ctx.fillText(t, Math.min(Math.max(tw / 2, cx), pw - tw / 2), plotH + 16); ctx.textAlign = "left";
  }
  updateInfo(ci);
}

function updateInfo(i){
  const act = active();
  let h = "<b>" + D.dates[i] + "</b>";
  act.forEach(function(k){ h += " &nbsp; <span style='color:" + COL[k] + "'>" + k + " " + fp(ret[k][i]) + "</span>"; });
  h += " &nbsp; Gap <b>" + gap[i].toFixed(1) + "pp</b>";
  h += " &nbsp; <b style='color:#ff4d4f'>SELL " + hiN[i] + "</b> / <b style='color:#2ecc71'>BUY " + loN[i] + "</b>";
  $("info").innerHTML = h;
}

// ===== mouse / touch =====
function pos(e){ const r = cv.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; }
function nearDiv(p){ return Math.abs(p.y - H1) <= 5 && p.x < W; }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(drawings)); }catch(e){} }
try{ const a0 = JSON.parse(localStorage.getItem(KEY) || "[]"); if(Array.isArray(a0)) drawings = a0; }catch(e){}

cv.addEventListener("pointerdown", function(e){
  const p = pos(e);
  cv.setPointerCapture(e.pointerId);
  if(nearDiv(p)){ divDrag = {y: p.y, f: fr}; return; }
  if(p.x >= pw && p.y < H1){ ensureManual(); axisDrag = {y: p.y, min: mMin, max: mMax}; return; }
  if(p.y >= plotH) return;
  mouse = p;
  const inTop = p.y < H1 && p.x < pw;
  if(tool === "none" || !inTop){ pan = {x: p.x, y: p.y, left: left, min: mMin, max: mMax, top: p.y < H1}; return; }
  if(tool === "h"){ drawings.push({k: "h", p: pOf(p.y)}); save(); draw(); }
  else if(tool === "v"){ drawings.push({k: "v", t: iToT(Math.round(iOf(p.x)))}); save(); draw(); }
  else if(tool === "m"){ const tm = iToT(Math.round(iOf(p.x))), pm = pOf(p.y); meas = {t1: tm, p1: pm, t2: tm, p2: pm, live: true}; }
  else { const t0 = iToT(iOf(p.x)), p0 = pOf(p.y); draft = {k: tool, t1: t0, p1: p0, t2: t0, p2: p0}; }
});
cv.addEventListener("pointermove", function(e){
  const p = pos(e); mouse = p;
  if(divDrag){ fr = Math.max(0.2, Math.min(0.85, divDrag.f + (p.y - divDrag.y) / plotH)); draw(); return; }
  if(axisDrag){
    const f = Math.exp((p.y - axisDrag.y) * 0.006), c = (axisDrag.min + axisDrag.max) / 2;
    mMin = c - (c - axisDrag.min) * f; mMax = c + (axisDrag.max - c) * f; draw(); return;
  }
  if(!pan && !draft && !meas){ cv.style.cursor = (nearDiv(p) || (p.x >= pw && p.y < H1)) ? "ns-resize" : (tool === "none" ? "grab" : "crosshair"); }
  if(pan){
    left = pan.left - (p.x - pan.x) / barW;
    if(manual && pan.top){ const dp = (p.y - pan.y) / H1 * (pan.max - pan.min); mMin = pan.min + dp; mMax = pan.max + dp; }
  } else if(draft){ draft.t2 = iToT(iOf(p.x)); draft.p2 = pOf(p.y); }
  else if(meas && meas.live){ meas.t2 = iToT(Math.round(iOf(p.x))); meas.p2 = pOf(p.y); }
  draw();
});
function endPointer(){
  divDrag = null; axisDrag = null; pan = null;
  if(meas && meas.live){
    meas.live = false;
    if(Math.abs(px(meas.t2) - px(meas.t1)) + Math.abs(yOf(meas.p2) - yOf(meas.p1)) < 4) meas = null;
  }
  if(draft){
    const d = draft; draft = null;
    if(Math.abs(px(d.t2) - px(d.t1)) + Math.abs(yOf(d.p2) - yOf(d.p1)) > 4){ drawings.push(d); save(); }
  }
  draw();
}
cv.addEventListener("pointerup", endPointer);
cv.addEventListener("pointercancel", endPointer);
cv.addEventListener("pointerleave", function(e){
  if(e.pointerType === "mouse" && !pan && !draft && !meas && !axisDrag && !divDrag){ mouse = null; draw(); }
});
cv.addEventListener("dblclick", function(e){
  const p = pos(e);
  if(p.x >= pw && p.y < H1){ manual = false; draw(); }
  else if(tool === "none" && p.x < pw && p.y < plotH && !nearDiv(p)){ fit(); draw(); }
});
cv.addEventListener("wheel", function(e){
  e.preventDefault();
  const p = pos(e);
  if((p.x >= pw && p.y < H1) || e.shiftKey){
    ensureManual();
    const f = e.deltaY < 0 ? 0.88 : 1 / 0.88, an = p.y < H1 ? pOf(p.y) : (yMin + yMax) / 2;
    mMin = an - (an - mMin) * f; mMax = an + (mMax - an) * f; draw(); return;
  }
  const idx = iOf(p.x);
  barW = Math.max(0.2, Math.min(60, barW * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  left = idx - (p.x - barW / 2) / barW;
  draw();
}, {passive: false});

// ===== buttons =====
document.querySelectorAll("[data-tool]").forEach(function(btn){
  btn.addEventListener("click", function(){
    tool = btn.getAttribute("data-tool");
    document.querySelectorAll("[data-tool]").forEach(function(b){ b.classList.toggle("on", b === btn); });
    cv.style.cursor = tool === "none" ? "grab" : "crosshair"; draft = null; meas = null; draw();
  });
});
$("undo").onclick = function(){ drawings.pop(); save(); draw(); };
$("clear").onclick = function(){ if(drawings.length && confirm("Delete all drawings?")){ drawings = []; save(); draw(); } };
$("reload").onclick = function(){ location.reload(); };

(function(){
  const m = Math.floor((T[n-1] - T[0]) / DAY) - 1;
  $("start").max = m; $("startr").max = m;
})();
function applyStart(){
  let d = Math.round(parseFloat($("start").value));
  if(isNaN(d)) return;
  const maxD = Math.floor((T[n-1] - T[0]) / DAY) - 1;
  d = Math.max(20, Math.min(maxD, d));
  $("start").value = d; $("startr").value = d;
  const target = T[n-1] - d * DAY;
  let i = 0;
  while(i < n - 1 && T[i] < target) i++;
  s0 = Math.min(i, n - 2);
  meas = null;
  const si = $("startInfo");
  si.style.color = "#9aa4b5";
  si.textContent = "from " + D.dates[s0] + " (" + (n - 1 - s0) + " rows)";
  compute(); fit(); draw();
}
$("startr").addEventListener("input", function(){ $("start").value = $("startr").value; applyStart(); });
$("start").addEventListener("change", applyStart);

["GOLD","NASDAQ","KOSPI"].forEach(function(k){
  const b = document.createElement("button");
  b.textContent = k; b.className = "on";
  b.addEventListener("click", function(){
    const cnt = ["GOLD","NASDAQ","KOSPI"].filter(function(x){ return vis[x]; }).length;
    if(vis[k] && cnt <= 1) return;
    vis[k] = !vis[k]; b.className = vis[k] ? "on" : "";
    compute(); draw();
  });
  $("assetBox").appendChild(b);
});

window.addEventListener("resize", function(){ layout(); draw(); });
if(window.ResizeObserver){ new ResizeObserver(function(){ layout(); draw(); }).observe(wrap); }
layout();
applyStart();
</script>
</body>
</html>
'''

if __name__ == "__main__":
    main()
