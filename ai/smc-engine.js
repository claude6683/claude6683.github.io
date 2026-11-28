/* Smart Money Concepts — JS port of "Smart Money Concepts [LuxAlgo]" (Pine v5)
   Original © LuxAlgo, CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/)
   This port is non-commercial and shared under the same license. */
(function(root){
'use strict';
const BULL = 1, BEAR = -1;

function computeSMC(bars, opt){
  const o = Object.assign({swingLen:50, internalLen:5, eqLen:3, eqThr:0.1, obFilter:'Atr', obMit:'HighLow',
    fvgAuto:true, fvgExt:1, confluence:false, tfSec:86400}, opt||{});
  const n = bars.length;
  const T=new Array(n), O=new Array(n), H=new Array(n), L=new Array(n), C=new Array(n);
  for(let i=0;i<n;i++){ T[i]=bars[i].t; O[i]=bars[i].o; H[i]=bars[i].h; L[i]=bars[i].l; C[i]=bars[i].c; }

  // ATR(200) = RMA(TR,200)
  const atr = new Array(n).fill(NaN), pHs = new Array(n), pLs = new Array(n);
  let rma = NaN, sum = 0, cumTR = 0;
  for(let i=0;i<n;i++){
    const tr = i===0 ? H[i]-L[i] : Math.max(H[i]-L[i], Math.abs(H[i]-C[i-1]), Math.abs(L[i]-C[i-1]));
    if(i<200){ sum += tr; if(i===199){ rma = sum/200; atr[i] = rma; } }
    else { rma = (rma*199 + tr)/200; atr[i] = rma; }
    cumTR += tr;
    const vol = o.obFilter==='Atr' ? atr[i] : (i>0 ? cumTR/i : NaN);
    const hv = (H[i]-L[i]) >= 2*vol;
    pHs[i] = hv ? L[i] : H[i];
    pLs[i] = hv ? H[i] : L[i];
  }

  const mkPivot = ()=>({cur:NaN, last:NaN, crossed:false, idx:0});
  const swingHigh=mkPivot(), swingLow=mkPivot(), internalHigh=mkPivot(), internalLow=mkPivot(), equalHigh=mkPivot(), equalLow=mkPivot();
  const swingTrend={bias:0}, internalTrend={bias:0};
  const trailing = {top:NaN, bottom:NaN, idx:NaN, lastTopIdx:NaN, lastBottomIdx:NaN};
  const structs=[], swingPts=[], eqs=[];
  let swingOBs=[], internalOBs=[], fvgs=[];
  const trendBias = new Array(n).fill(0);

  // ---- leg / pivots ----
  function mkLeg(size){
    let leg=0, prev=null;
    return function(i){
      let nh=false, nl=false;
      if(i>=size){
        let mx=-Infinity, mn=Infinity;
        for(let j=i-size+1;j<=i;j++){ if(H[j]>mx) mx=H[j]; if(L[j]<mn) mn=L[j]; }
        nh = H[i-size] > mx; nl = L[i-size] < mn;
      }
      if(nh) leg=0; else if(nl) leg=1;
      const ch = prev===null ? 0 : leg-prev; prev = leg; return ch;
    };
  }
  function mkStruct(size, kind){
    const leg = mkLeg(size);
    return function(i){
      const ch = leg(i); if(ch===0) return;
      const k = i-size;
      if(ch===1){
        const p = kind==='equal' ? equalLow : kind==='internal' ? internalLow : swingLow;
        if(kind==='equal' && Math.abs(p.cur - L[k]) < o.eqThr*atr[i])
          eqs.push({i1:p.idx, l1:p.cur, i2:k, l2:L[k], high:false, mid:Math.round(0.5*(p.idx+k))});
        p.last=p.cur; p.cur=L[k]; p.crossed=false; p.idx=k;
        if(kind==='swing'){ trailing.bottom=p.cur; trailing.idx=p.idx; trailing.lastBottomIdx=p.idx;
          swingPts.push({idx:k, price:p.cur, text:p.cur<p.last?'LL':'HL', low:true}); }
      } else {
        const p = kind==='equal' ? equalHigh : kind==='internal' ? internalHigh : swingHigh;
        if(kind==='equal' && Math.abs(p.cur - H[k]) < o.eqThr*atr[i])
          eqs.push({i1:p.idx, l1:p.cur, i2:k, l2:H[k], high:true, mid:Math.round(0.5*(p.idx+k))});
        p.last=p.cur; p.cur=H[k]; p.crossed=false; p.idx=k;
        if(kind==='swing'){ trailing.top=p.cur; trailing.idx=p.idx; trailing.lastTopIdx=p.idx;
          swingPts.push({idx:k, price:p.cur, text:p.cur>p.last?'HH':'LH', low:false}); }
      }
    };
  }

  function storeOB(p, internal, bias, i){
    const arr = bias===BEAR ? pHs : pLs;
    let best=p.idx, bv=arr[p.idx];
    for(let j=p.idx+1;j<i;j++){ if(bias===BEAR ? arr[j]>bv : arr[j]<bv){ bv=arr[j]; best=j; } }
    const ob = {high:pHs[best], low:pLs[best], idx:best, bias};
    const list = internal ? internalOBs : swingOBs;
    if(list.length>=100) list.pop();
    list.unshift(ob);
  }
  function deleteOBs(i){
    const bearSrc = o.obMit==='Close' ? C[i] : H[i], bullSrc = o.obMit==='Close' ? C[i] : L[i];
    const keep = ob => !((ob.bias===BEAR && bearSrc>ob.high) || (ob.bias===BULL && bullSrc<ob.low));
    internalOBs = internalOBs.filter(keep); swingOBs = swingOBs.filter(keep);
  }

  const bothFinite = (a,b)=> isFinite(a) && isFinite(b) && a!==b;
  function mkDisplay(internal){
    let bullishBar=true, bearishBar=true, prevHi=NaN, prevLo=NaN;
    const pHi = internal ? internalHigh : swingHigh, pLo = internal ? internalLow : swingLow;
    const tr = internal ? internalTrend : swingTrend;
    return function(i){
      if(o.confluence){
        const up = H[i]-Math.max(C[i],O[i]), dn = Math.min(C[i], O[i]-L[i]);
        bullishBar = up>dn; bearishBar = up<dn;
      }
      let extra = internal ? (bothFinite(internalHigh.cur, swingHigh.cur) && bullishBar) : true;
      if(i>0 && C[i]>pHi.cur && C[i-1]<=prevHi && !pHi.crossed && extra){
        const tag = tr.bias===BEAR ? 'CHoCH' : 'BOS';
        pHi.crossed=true; tr.bias=BULL;
        structs.push({internal, bull:true, tag, level:pHi.cur, i1:pHi.idx, i2:i, mid:Math.round(0.5*(pHi.idx+i))});
        storeOB(pHi, internal, BULL, i);
      }
      extra = internal ? (bothFinite(internalLow.cur, swingLow.cur) && bearishBar) : true;
      if(i>0 && C[i]<pLo.cur && C[i-1]>=prevLo && !pLo.crossed && extra){
        const tag = tr.bias===BULL ? 'CHoCH' : 'BOS';
        pLo.crossed=true; tr.bias=BEAR;
        structs.push({internal, bull:false, tag, level:pLo.cur, i1:pLo.idx, i2:i, mid:Math.round(0.5*(pLo.idx+i))});
        storeOB(pLo, internal, BEAR, i);
      }
      prevHi = pHi.cur; prevLo = pLo.cur;
    };
  }

  const swingS=mkStruct(o.swingLen,'swing'), internalS=mkStruct(o.internalLen,'internal'), equalS=mkStruct(o.eqLen,'equal');
  const dispInternal=mkDisplay(true), dispSwing=mkDisplay(false);
  let fvgCum = 0;

  for(let i=0;i<n;i++){
    // trailing extremes
    trailing.top = Math.max(H[i], trailing.top);
    if(trailing.top===H[i]) trailing.lastTopIdx = i;
    trailing.bottom = Math.min(L[i], trailing.bottom);
    if(trailing.bottom===L[i]) trailing.lastBottomIdx = i;
    // delete mitigated FVGs
    fvgs = fvgs.filter(f => !((L[i]<f.bottom && f.bias===BULL) || (H[i]>f.top && f.bias===BEAR)));

    swingS(i); internalS(i); equalS(i);
    dispInternal(i); dispSwing(i);
    deleteOBs(i);

    // FVG
    if(i>=1){
      const delta = (C[i-1]-O[i-1])/(O[i-1]*100);
      fvgCum += Math.abs(delta);
      if(i>=2){
        const thr = o.fvgAuto ? fvgCum/i*2 : 0;
        const l2h=H[i-2], l2l=L[i-2];
        if(L[i]>l2h && C[i-1]>l2h && delta>thr)
          fvgs.unshift({top:L[i], bottom:l2h, bias:BULL, i1:i-1, i2:i+o.fvgExt});
        if(H[i]<l2l && C[i-1]<l2l && -delta>thr)
          fvgs.unshift({top:H[i], bottom:l2l, bias:BEAR, i1:i-1, i2:i+o.fvgExt});
      }
    }
    trendBias[i] = internalTrend.bias;
  }

  // ---- previous Day/Week/Month high-low (MTF levels) ----
  const mtf = {};
  if(n>1){
    const defs = {D:[86400, t=>Math.floor(t/86400)], W:[604800, t=>Math.floor((t/86400+3)/7)],
                  M:[2592000, t=>{const d=new Date(t*1000); return d.getUTCFullYear()*12+d.getUTCMonth();}]};
    Object.keys(defs).forEach(k=>{
      const [psec, keyf] = defs[k];
      if(o.tfSec>psec) return;                       // chart TF higher than level TF → not shown
      if(o.tfSec===psec){ mtf[k] = {topIdx:n-1, top:H[n-1], botIdx:n-1, bot:L[n-1]}; return; }
      const lastKey = keyf(T[n-1]); let j=n-1;
      while(j>=0 && keyf(T[j])===lastKey) j--;
      if(j<0) return;
      const pk = keyf(T[j]); let top=-Infinity, bot=Infinity, ti=j, bi=j;
      for(;j>=0 && keyf(T[j])===pk;j--){ if(H[j]>top){top=H[j];ti=j;} if(L[j]<bot){bot=L[j];bi=j;} }
      mtf[k] = {topIdx:ti, top, botIdx:bi, bot};
    });
  }

  return {n, structs, swingPts, eqs, internalOBs, swingOBs, fvgs, trailing,
          swingBias:swingTrend.bias, internalBias:internalTrend.bias, trendBias, mtf};
}

root.computeSMC = computeSMC;
if(typeof module!=='undefined') module.exports = {computeSMC};
})(typeof window!=='undefined' ? window : globalThis);
