(function(){
  var CFG=window.CFG||{};
  var TIERS=CFG.tiers||[[18,30],[25,35],[30,40]];
  var VOLNAME=CFG.volName||'VIX';
  var YAHOO=(CFG.source==='yahoo');

  // ===== 화면 만들기 (CSS + 본문) =====
  document.title=CFG.title||'차트';
  var css=
  ':root{--bg:#10141b;--panel:#171d27;--line:#2a3342;--text:#d7dde8;--muted:#8793a6;--gold:#f2b84b;--green:#2fbf71;--red:#e5484d}'+
  '*{box-sizing:border-box}'+
  'html,body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;font-size:14px}'+
  '.page{max-width:1100px;margin:0 auto;padding:12px}'+
  'nav{display:flex;gap:14px;margin-bottom:6px}'+
  'nav a{color:var(--muted);text-decoration:none}'+
  'nav a.on{color:var(--text);font-weight:700}'+
  '.head{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;margin:6px 0 10px}'+
  'h1{font-size:18px;margin:0}'+
  '#live{font-size:12px;color:var(--muted)}#live.on{color:var(--green)}#live.off{color:var(--red)}'+
  '.stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}'+
  '.stat{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:6px 10px;min-width:96px}'+
  '.stat b{display:block;font-size:16px;margin-top:2px}'+
  '.stat span{color:var(--muted);font-size:12px}'+
  '.stat.sig b{color:var(--gold)}'+
  '.rules{display:grid;grid-template-columns:repeat(2,auto);justify-content:start;column-gap:28px;row-gap:6px;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin-bottom:10px;color:var(--muted)}'+
  '.rules input{width:56px;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:4px;padding:3px 5px;font-size:14px}'+
  '.rules .grp{display:flex;align-items:center;gap:5px;flex-wrap:wrap}'+
  '.rules .grp em{font-style:normal;font-weight:700;min-width:58px}'+
  '.rules .grp em.s1{color:#f2b84b}.rules .grp em.s2{color:#ff9f43}.rules .grp em.s3{color:#ff5d73}'+
  '.toolbar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;align-items:center}'+
  '.toolbar .sp{flex:1}.toolbar .bar{width:1px;height:22px;background:var(--line);margin:0 2px}'+
  'button,select{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:6px 11px;font-size:14px;cursor:pointer}'+
  'button:hover,select:hover{border-color:var(--muted)}'+
  'button.on{background:var(--gold);color:#1a1405;border-color:var(--gold);font-weight:700}'+
  '#info{min-height:20px;margin-bottom:6px;color:var(--muted);font-size:13px;white-space:nowrap;overflow-x:auto}'+
  '#info b{color:var(--text);font-weight:600}'+
  '#wrap{position:relative;height:62vh;min-height:360px;background:var(--panel);border:1px solid var(--line);border-radius:6px;overflow:hidden}'+
  'canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block}'+
  '#msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;color:var(--muted);pointer-events:none;white-space:pre-line;background:rgba(23,29,39,.85)}'+
  'table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}'+
  'th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:right}'+
  'th:first-child,td:first-child{text-align:left}'+
  'th{color:var(--muted);font-weight:500}'+
  'td.x1{color:#f2b84b;font-weight:700}td.x2{color:#ff9f43;font-weight:700}td.x3{color:#ff5d73;font-weight:700}'+
  '.note{color:var(--muted);font-size:12px;margin-top:12px;line-height:1.6}'+
  '#zin,#zout,#pin,#pout,#pauto{display:none}'+
  '@media(max-width:720px){.rules{grid-template-columns:1fr}}';
  var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);

  function tierHTML(n){
    var t=TIERS[n-1];
    return '<div class="grp"><em class="s'+n+'">x'+n+' BUY</em> 52주 고점 대비 -<input id="dd'+n+'" type="number" value="'+t[0]+'" step="1">% 이하 &amp; '+
      VOLNAME+' <input id="vx'+n+'" type="number" value="'+t[1]+'" step="1"> 이상</div>';
  }
  var manualHTML=CFG.manual?
    ('<div class="grp"><em style="color:var(--text)">'+VOLNAME+' 직접 입력</em><input id="manualVal" type="number" step="0.01" placeholder="예: 55.8" style="width:90px"> '+
     '<button id="manualBtn">오늘 값으로 적용</button><span style="font-size:12px">자동 수집이 안 될 때 쓰세요. 비우고 누르면 해제됩니다.</span></div>'):'';
  var nav=(CFG.nav||[]).map(function(n){
    return '<a'+(n.on?' class="on"':'')+' href="'+n.href+'">'+n.label+'</a>';
  }).join('');

  document.body.innerHTML=
  '<div class="page">'+
    '<nav>'+nav+'</nav>'+
    '<div class="head"><h1>'+CFG.h1+'</h1><span id="live">연결 중…</span></div>'+
    '<div class="stats">'+
      '<div class="stat"><span>'+CFG.priceLabel+'</span><b id="sClose">-</b></div>'+
      '<div class="stat"><span>52주 고점</span><b id="sHigh">-</b></div>'+
      '<div class="stat"><span>고점 대비</span><b id="sDD">-</b></div>'+
      '<div class="stat"><span>'+VOLNAME+'</span><b id="sVix">-</b></div>'+
    '<div class="stat sig"><span>&#49884;&#44536;&#45328;</span><b id="sSig">-</b></div>'+    '</div>'+
    '<div class="rules">'+tierHTML(1)+tierHTML(2)+tierHTML(3)+manualHTML+'</div>'+
    '<div class="toolbar">'+
      '<label>봉 <select id="tf">'+(YAHOO?'':'<option value="1h">1시간</option><option value="4h">4시간</option>')+'<option value="1d" selected>1일</option><option value="1w">1주</option></select></label>'+
      '<span class="bar"></span>'+
      '<button data-tool="none" class="on">이동</button><button data-tool="h">수평선</button><button data-tool="v">수직선</button><button data-tool="l">추세선</button><button data-tool="r">사각형</button><button data-tool="m">재기</button><button data-tool="f">피보나치</button><button data-tool="e">지우개</button>'+
      '<span class="bar"></span>'+
      '<button id="mP">가격</button><button id="mPct" class="on">%</button>'+
      '<span class="bar"></span>'+
      '<button id="undo">마지막 지우기</button><button id="clear">전체 지우기</button>'+
      '<span class="sp"></span>'+
      '<button id="zin">가로＋</button><button id="zout">가로－</button><button id="pin">가격＋</button><button id="pout">가격－</button><button id="pauto">가격 자동</button><button id="reload">새로고침</button>'+
    '</div>'+
    '<div id="info">차트 위에 마우스를 올리면 정보가 보입니다.</div>'+
    '<div id="wrap"><canvas id="cv"></canvas><div id="msg">불러오는 중…</div></div>'+
    '<table><thead><tr><th>날짜(한국시간)</th><th>종가</th><th>고점 대비</th><th>'+VOLNAME+'</th><th>신호</th></tr></thead><tbody id="sigRows"></tbody></table>'+
    '<div class="note">'+(CFG.note||'')+'</div>'+
  '</div>';

  // ===== 설정값 =====
  var UP_COLOR='#e5484d';      // 상승 캔들 (한국식: 빨강)
  var DOWN_COLOR='#3b82f6';    // 하락 캔들 (한국식: 파랑)
  var DRAW_COLOR='#f2b84b';    // 그리기 선 색
  var SIGCOL=['','#f2b84b','#ff9f43','#ff5d73'];
  var AX=70, AY=24;
  var COIN=CFG.coin;
  var VOLFORMAT=CFG.volFormat||'yahoo';
  var VOLFILE=CFG.volFile||'../xyz-data/vix.json';
  var REQUIRE_FULL=!!CFG.requireFull;
  var MANUAL=!!CFG.manual;
  var API='https://api.hyperliquid.xyz/info';
  var WSURL='wss://api.hyperliquid.xyz/ws';
  var START=Date.UTC(2025,8,1);
  var DAY=864e5;
  var STEP={'1h':36e5,'4h':144e5,'1d':DAY,'1w':7*DAY};
  var STORE_KEY=CFG.storeKey||'chart_drawings_v1';

  var cv=document.getElementById('cv'), ctx=cv.getContext('2d');
  var wrap=document.getElementById('wrap'), msg=document.getElementById('msg');
  var infoEl=document.getElementById('info'), tfSel=document.getElementById('tf');
  var liveEl=document.getElementById('live');

  var raw={'1h':null,'4h':null,'1d':null};
  var daily=[], bars=[], tf='1d', vm={}, volFailed=false;
  var W=0,H=0,pw=0,ph=0,dpr=1;
  var left=0, barW=7;
  var yMin=0,yMax=1, manual=false, mMin=0, mMax=1;
  var tool='none', drawings=[], draft=null, meas=null;
  var mouse=null, panning=null, axisDrag=null;
  var dirty=false, lastTick=0, wsState='off';

  // ===== 시간 도우미 =====
  function kstISO(t){return new Date(t+9*36e5).toISOString();}
  function dateUTC(t){return new Date(t).toISOString().slice(0,10);}
  function isIntra(){return tf==='1h'||tf==='4h';}
  function dstr(b){
    var s=kstISO(b.t);
    return isIntra()?s.slice(0,10)+' '+s.slice(11,16):s.slice(0,10);
  }
  function fmtP(p){return p>=1000?p.toFixed(1):p.toFixed(2);}
  var mode='pct';
  function base(){return bars.length?bars[bars.length-1].c:1;}
  function fmtPct(p){var b=base(),v=(p-b)/b*100;return (v>0?'+':'')+v.toFixed(2)+'%';}
  function fmtY(p){return mode==='pct'?fmtPct(p):fmtP(p);}
  function showMsg(t){msg.style.display='flex';msg.textContent=t;}
  function hideMsg(){msg.style.display='none';}

  // ===== Hyperliquid 가격 데이터 =====
  function post(body){
    var ctl=new AbortController();
    var tm=setTimeout(function(){ctl.abort();},12000);
    return fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:ctl.signal}).then(function(r){
      clearTimeout(tm);
      if(!r.ok) throw new Error('http '+r.status);
      return r.json();
    },function(e){clearTimeout(tm);throw e;});
  }
  function getCandles(interval){
    var start=(interval==='1h')?Date.now()-4900*36e5:START;
    return post({type:'candleSnapshot',req:{coin:COIN,interval:interval,startTime:start,endTime:Date.now()+36e5}})
      .then(function(a){
        if(!Array.isArray(a)||!a.length) throw new Error('empty');
        return a.map(function(x){return {t:+x.t,o:+x.o,h:+x.h,l:+x.l,c:+x.c};})
          .sort(function(p,q){return p.t-q.t;});
      });
  }

  // ===== 변동성 지수 데이터 (GitHub에 자동 저장된 파일) =====
  function getLocal(url){
    var ctl=new AbortController();
    var tm=setTimeout(function(){ctl.abort();},8000);
    return fetch(url,{signal:ctl.signal}).then(function(r){
      clearTimeout(tm);
      if(!r.ok) throw new Error('http '+r.status);
      return r.json();
    },function(e){clearTimeout(tm);throw e;});
  }
  function proxies(u){
    return [
      'https://corsproxy.io/?'+encodeURIComponent(u),
      'https://api.allorigins.win/raw?url='+encodeURIComponent(u),
      'https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(u)
    ];
  }
  function tryYahoo(url){
    return getLocal(url).then(function(j){
      if(!j||!j.chart||!j.chart.result) throw new Error('bad data');
      return j;
    });
  }
  function fetchProxy(url){
    var list=proxies(url);
    return new Promise(function(resolve,reject){
      var fails=0;
      list.forEach(function(u){
        tryYahoo(u).then(resolve,function(){
          fails++;
          if(fails===list.length) reject(new Error('all failed'));
        });
      });
    });
  }
  function parseYahoo(j){
    var r=j.chart.result[0], q=r.indicators.quote[0], off=r.meta.gmtoffset||0, m={};
    for(var k=0;k<r.timestamp.length;k++){
      if(q.close[k]==null) continue;
      m[new Date((r.timestamp[k]+off)*1000).toISOString().slice(0,10)]=q.close[k];
    }
    return m;
  }
  function parseMap(j){
    var src=(j&&j.data)?j.data:j, m={}, k;
    for(k in src){ if(/^\d{4}-\d{2}-\d{2}$/.test(k) && isFinite(+src[k])) m[k]=+src[k]; }
    if(!Object.keys(m).length) throw new Error('empty map');
    return m;
  }
  function parseYahooBars(j){
    var r=j.chart.result[0], q=r.indicators.quote[0], off=r.meta.gmtoffset||0, out=[], k, ds;
    for(k=0;k<r.timestamp.length;k++){
      if(q.close[k]==null||q.open[k]==null||q.high[k]==null||q.low[k]==null) continue;
      ds=new Date((r.timestamp[k]+off)*1000).toISOString().slice(0,10);
      out.push({t:Date.parse(ds+'T00:00:00Z'),o:q.open[k],h:q.high[k],l:q.low[k],c:q.close[k]});
    }
    if(!out.length) throw new Error('empty');
    return out;
  }
  function loadQuote(){
    var yUrl='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(CFG.yahooSymbol||'QQQ')+'?range=5y&interval=1d';
    return tryYahoo((CFG.localFile||'../xyz-data/qqq.json')+'?t='+Date.now())
      .catch(function(){return fetchProxy(yUrl);})
      .then(parseYahooBars);
  }
  function loadVol(){
    if(VOLFORMAT==='yahoo'){
      var yUrl='https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=5y&interval=1d';
      return tryYahoo(VOLFILE+'?t='+Date.now()).catch(function(){return fetchProxy(yUrl);})
        .then(function(j){vm=parseYahoo(j);});
    }
    return getLocal(VOLFILE+'?t='+Date.now()).then(function(j){vm=parseMap(j);});
  }

  // ===== 직접 입력 (자동 수집이 안 될 때) =====
  function applyManual(){
    if(!MANUAL||!daily.length) return;
    try{
      var m=JSON.parse(localStorage.getItem(STORE_KEY+'_manual')||'null');
      if(m && m.v>0 && m.d===dateUTC(daily[daily.length-1].t)) vm[m.d]=m.v;
    }catch(e){}
  }

  // ===== 전체 불러오기 =====
  function loadAll(){
    showMsg('불러오는 중…');
    volFailed=false;
    var pD=YAHOO?loadQuote():getCandles('1d');
    var pV=loadVol().catch(function(){volFailed=true;vm={};});
    Promise.all([pD,pV]).then(function(res){
      raw['1d']=res[0]; daily=raw['1d']; raw['1h']=null; raw['4h']=null;
      applyManual();
      return ensureTF(tf);
    }).then(function(){
      computeDaily(); buildBars();
      layout(); resetView(); updateStats(); fillTable(); hideMsg(); draw();
      if(volFailed) infoEl.textContent='⚠ '+VOLNAME+' 데이터를 받지 못해 BUY 신호가 표시되지 않습니다.'+(MANUAL?' 위의 직접 입력 칸에 오늘 값을 넣을 수 있습니다.':' 새로고침을 눌러 보세요.');
      if(YAHOO){ liveEl.className=''; liveEl.textContent='Yahoo Finance 일봉 (실시간 아님)'; } else connectWS();
    }).catch(function(){
      showMsg((YAHOO?'Yahoo':'Hyperliquid')+' 데이터를 불러오지 못했습니다.\n잠시 후 "새로고침" 버튼을 눌러 주세요.');
    });
  }
  function ensureTF(t){
    if(t==='1h'||t==='4h'){
      return getCandles(t).then(function(a){raw[t]=a;});
    }
    return Promise.resolve();
  }
  function resync(){
    var p=[getCandles('1d')];
    if(tf==='1h'||tf==='4h') p.push(getCandles(tf));
    Promise.all(p).then(function(r){
      raw['1d']=r[0]; daily=raw['1d'];
      if(r[1]) raw[tf]=r[1];
      dirty=true;
    }).catch(function(){});
  }

  // ===== 매수 신호 계산 (일봉 기준, x3 > x2 > x1 순서로 확인) =====
  function num(id){return parseFloat(document.getElementById(id).value);}
  function computeDaily(){
    if(!daily.length) return;
    var T=[
      {dd:num('dd3')/100,v:num('vx3'),s:3},
      {dd:num('dd2')/100,v:num('vx2'),s:2},
      {dd:num('dd1')/100,v:num('vx1'),s:1}
    ];
    var last=null, first=daily[0].t, j=0, i, k, q;
    for(i=0;i<daily.length;i++){
      var d=daily[i], ds=dateUTC(d.t);
      if(vm[ds]!=null) last=vm[ds];
      d.vix=last;
      var lo=d.t-364*DAY;
      while(j<i && daily[j].t<lo) j++;
      var hi=0;
      for(k=j;k<=i;k++) if(daily[k].h>hi) hi=daily[k].h;
      d.hi52=hi; d.dd=d.c/hi-1; d.full=(first<=lo);
      d.sig=0;
      if(d.vix!=null && (d.full||!REQUIRE_FULL)){
        for(q=0;q<T.length;q++){
          if(d.dd<=-T[q].dd && d.vix>=T[q].v){ d.sig=T[q].s; break; }
        }
      }
    }
  }
  function updateStats(){
    if(!daily.length) return;
    var b=daily[daily.length-1];
    document.getElementById('sClose').textContent=fmtP(b.c);
    document.getElementById('sHigh').textContent=fmtP(b.hi52);
    document.getElementById('sDD').textContent=(b.dd*100).toFixed(1)+'%';
    document.getElementById('sVix').textContent=b.vix!=null?b.vix.toFixed(2):'-';
    var s=document.getElementById('sSig'), ls=null, i;
    for(i=daily.length-1;i>=0;i--) if(daily[i].sig){ ls=daily[i]; break; }
    s.textContent=ls?('x'+ls.sig+' BUY · '+kstISO(ls.t).slice(0,10)):((REQUIRE_FULL&&!b.full)?'계산 불가':'없음');
    s.style.color=ls?SIGCOL[ls.sig]:'';
  }
  function fillTable(){
    var rows=[], i;
    for(i=daily.length-1;i>=0&&rows.length<15;i--) if(daily[i].sig) rows.push(daily[i]);
    var tb=document.getElementById('sigRows');
    if(!rows.length){
      tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:#8793a6">조건에 맞는 신호가 없습니다'+(REQUIRE_FULL?' (상장 1년 이후부터 계산)':'')+'</td></tr>';
      return;
    }
    tb.innerHTML=rows.map(function(b){
      return '<tr><td>'+kstISO(b.t).slice(0,10)+'</td><td>'+fmtP(b.c)+'</td><td>'+(b.dd*100).toFixed(1)+'%</td><td>'+b.vix.toFixed(1)+
        '</td><td class="x'+b.sig+'">x'+b.sig+' BUY</td></tr>';
    }).join('');
  }

  // ===== 봉 종류별 데이터 만들기 =====
  function buildBars(){
    var out=[], i;
    if(tf==='1d'){ bars=daily; return; }
    if(tf==='1w'){
      var cur=null, key=-1;
      daily.forEach(function(x){
        var ws=x.t-((new Date(x.t).getUTCDay()+6)%7)*DAY;
        if(ws!==key){
          key=ws;
          cur={t:ws,o:x.o,h:x.h,l:x.l,c:x.c,vix:x.vix,dd:x.dd,hi52:x.hi52,sig:x.sig};
          out.push(cur);
        }else{
          if(x.h>cur.h) cur.h=x.h;
          if(x.l<cur.l) cur.l=x.l;
          cur.c=x.c; cur.vix=x.vix; cur.dd=x.dd; cur.hi52=x.hi52;
          if(x.sig>cur.sig) cur.sig=x.sig;
        }
      });
      bars=out; return;
    }
    var dm={}, src=raw[tf]||[], lastD=daily[daily.length-1];
    daily.forEach(function(x){dm[x.t]=x;});
    for(i=0;i<src.length;i++){
      var x=src[i], ds=Math.floor(x.t/DAY)*DAY, d=dm[ds]||lastD;
      var hi=Math.max(d.hi52,x.h);
      var lastOfDay=(i===src.length-1)||(Math.floor(src[i+1].t/DAY)*DAY!==ds);
      out.push({t:x.t,o:x.o,h:x.h,l:x.l,c:x.c,vix:d.vix,hi52:hi,dd:x.c/hi-1,sig:lastOfDay?d.sig:0});
    }
    bars=out;
  }

  // ===== 실시간 (WebSocket) =====
  var ws=null, wsTimer=null, pingTimer=null, wsInterval='1d', wsEverOpen=false;
  function wsIntervalFor(t){return t==='1h'?'1h':(t==='4h'?'4h':'1d');}
  function sub(iv){ws.send(JSON.stringify({method:'subscribe',subscription:{type:'candle',coin:COIN,interval:iv}}));}
  function unsub(iv){ws.send(JSON.stringify({method:'unsubscribe',subscription:{type:'candle',coin:COIN,interval:iv}}));}
  function wsSwitch(){
    var nv=wsIntervalFor(tf);
    if(nv===wsInterval||!ws||ws.readyState!==1) return;
    unsub(wsInterval); sub(nv); wsInterval=nv;
  }
  function connectWS(){
    if(ws && (ws.readyState===0||ws.readyState===1)) return;
    try{ ws=new WebSocket(WSURL); }catch(e){ setLive('off'); return; }
    ws.onopen=function(){
      setLive('on');
      wsInterval=wsIntervalFor(tf);
      sub(wsInterval);
      if(wsEverOpen) resync();
      wsEverOpen=true;
      clearInterval(pingTimer);
      pingTimer=setInterval(function(){
        try{ws.send(JSON.stringify({method:'ping'}));}catch(e){}
      },30000);
    };
    ws.onmessage=function(ev){
      var m; try{m=JSON.parse(ev.data);}catch(e){return;}
      if(m.channel==='candle'&&m.data) onCandle(m.data);
    };
    ws.onclose=function(){
      setLive('off'); clearInterval(pingTimer); clearTimeout(wsTimer);
      wsTimer=setTimeout(connectWS,3000);
    };
    ws.onerror=function(){ try{ws.close();}catch(e){} };
  }
  function onCandle(d){
    var iv=d.i, t=+d.t, o=+d.o, h=+d.h, l=+d.l, c=+d.c;
    var arr=raw[iv];
    if(!arr||!arr.length) return;
    var last=arr[arr.length-1];
    if(last.t===t){ last.o=o; last.h=h; last.l=l; last.c=c; }
    else if(t>last.t){ arr.push({t:t,o:o,h:h,l:l,c:c}); }
    else return;
    if(iv!=='1d'){
      var dayT=Math.floor(Date.now()/DAY)*DAY, dl=daily[daily.length-1];
      if(dl.t<dayT){ daily.push({t:dayT,o:c,h:c,l:c,c:c}); dl=daily[daily.length-1]; }
      if(h>dl.h) dl.h=h;
      if(l<dl.l) dl.l=l;
      dl.c=c;
    }
    lastTick=Date.now(); dirty=true;
  }
  function setLive(s){wsState=s; updateLive();}
  function updateLive(){
    if(wsState==='on'){
      liveEl.className='on';
      liveEl.textContent='● 실시간 연결됨'+(lastTick?' · 마지막 갱신 '+kstISO(lastTick).slice(11,19):'');
    }else{
      liveEl.className='off';
      liveEl.textContent='● 연결 끊김 · 다시 연결 중…';
    }
  }
  setInterval(function(){
    if(!dirty||!daily.length) return;
    dirty=false;
    var prevLen=bars.length, edge=(left+pw/barW)>=prevLen-1;
    computeDaily(); buildBars();
    if(edge && bars.length>prevLen) left+=bars.length-prevLen;
    updateStats(); updateLive(); fillTable(); draw();
  },250);

  // ===== 시간 <-> 봉 번호 =====
  function tToI(t){
    var n=bars.length;
    if(!n) return 0;
    if(t>=bars[n-1].t) return n-1+(t-bars[n-1].t)/STEP[tf];
    if(t<=bars[0].t) return (t-bars[0].t)/STEP[tf];
    var lo=0, hi=n-1;
    while(hi-lo>1){ var mid=(lo+hi)>>1; if(bars[mid].t<=t) lo=mid; else hi=mid; }
    return lo+(t-bars[lo].t)/(bars[lo+1].t-bars[lo].t);
  }
  function iToT(i){
    var n=bars.length;
    if(!n) return 0;
    if(i<=0) return bars[0].t+i*STEP[tf];
    if(i>=n-1) return bars[n-1].t+(i-n+1)*STEP[tf];
    var lo=Math.floor(i), f=i-lo;
    return bars[lo].t+f*(bars[lo+1].t-bars[lo].t);
  }

  // ===== 그린 선 저장 =====
  function loadDraw(){
    try{
      var a=JSON.parse(localStorage.getItem(STORE_KEY)||'[]');
      return Array.isArray(a)?a:[];
    }catch(e){ return []; }
  }
  function save(){ try{localStorage.setItem(STORE_KEY,JSON.stringify(drawings));}catch(e){} }
  drawings=loadDraw();

  // ===== 좌표 변환 =====
  function xOf(i){return (i-left)*barW+barW/2;}
  function iOf(x){return (x-barW/2)/barW+left;}
  function yOf(p){return ph-(p-yMin)/(yMax-yMin)*ph;}
  function pOf(y){return yMin+(ph-y)/ph*(yMax-yMin);}
  function xT(t){return xOf(tToI(t));}

  function layout(){
    var r=wrap.getBoundingClientRect();
    dpr=window.devicePixelRatio||1;
    W=r.width; H=r.height;
    cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    pw=W-AX; ph=H-AY;
  }
  function resetView(){
    barW=tf==='1w'?8:(tf==='4h'?6:(tf==='1h'?5:(pw<500?5:7)));
    left=bars.length-pw/barW+6;
  }
  function clampLeft(){
    var vis=pw/barW;
    var maxL=bars.length-vis+12, minL=-5;
    if(left>maxL) left=maxL;
    if(left<minL) left=minL;
  }
  function niceStep(range,count){
    var raw0=range/count, p=Math.pow(10,Math.floor(Math.log10(raw0))), f=raw0/p;
    var n=f<1.5?1:(f<3?2:(f<7?5:10));
    return n*p;
  }

  // ===== 가격 줌 =====
  function ensureManual(){
    if(!manual){ manual=true; mMin=yMin; mMax=yMax; }
  }
  function zoomPrice(f,anchor){
    ensureManual();
    mMin=anchor-(anchor-mMin)*f;
    mMax=anchor+(mMax-anchor)*f;
    draw();
  }

  // ===== 그리기 =====
  function draw(){
    ctx.clearRect(0,0,W,H);
    if(!bars.length) return;
    clampLeft();

    var a=Math.max(0,Math.floor(left)), z=Math.min(bars.length-1,Math.ceil(left+pw/barW));
    var lo=Infinity, hi=-Infinity, i;
    for(i=a;i<=z;i++){ if(bars[i].l<lo) lo=bars[i].l; if(bars[i].h>hi) hi=bars[i].h; }
    if(!isFinite(lo)){ lo=0; hi=1; }
    var pad=(hi-lo)*0.08||1;
    if(manual){ yMin=mMin; yMax=mMax; }
    else{ yMin=lo-pad; yMax=hi+pad; }

    ctx.save();
    ctx.beginPath(); ctx.rect(0,0,pw,ph); ctx.clip();

    var ticks=makeTicks();
    ctx.strokeStyle='#222b39'; ctx.lineWidth=1;
    ticks.forEach(function(tk){
      var y=Math.round(yOf(tk.p))+0.5;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(pw,y); ctx.stroke();
    });
    var y0=Math.round(yOf(base()))+0.5;
    if(y0>0&&y0<ph){ ctx.setLineDash([5,4]); ctx.strokeStyle='#5b6b82'; ctx.beginPath(); ctx.moveTo(0,y0); ctx.lineTo(pw,y0); ctx.stroke(); ctx.setLineDash([]); }

    var bw=Math.max(1,Math.floor(barW*0.7));
    for(i=a;i<=z;i++){
      var b=bars[i], x=Math.round(xOf(i)), col=(b.c>=b.o)?UP_COLOR:DOWN_COLOR;
      ctx.strokeStyle=col; ctx.fillStyle=col;
      ctx.beginPath(); ctx.moveTo(x+0.5,yOf(b.h)); ctx.lineTo(x+0.5,yOf(b.l)); ctx.stroke();
      var y1=yOf(Math.max(b.o,b.c)), y2=yOf(Math.min(b.o,b.c));
      ctx.fillRect(x-Math.floor(bw/2),y1,bw,Math.max(1,y2-y1));
    }

    for(i=a;i<=z;i++){
      var s=bars[i];
      if(!s.sig) continue;
      var sx=xOf(i), sy=yOf(s.l)+8, sz=Math.max(5,barW*0.8);
      ctx.fillStyle=SIGCOL[s.sig];
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(sx-sz,sy+sz*1.6); ctx.lineTo(sx+sz,sy+sz*1.6); ctx.closePath(); ctx.fill();
      ctx.font='bold 11px sans-serif'; ctx.textAlign='center';
      ctx.fillText('x'+s.sig,sx,sy+sz*1.6+12);
    }
    ctx.textAlign='left';

    drawings.forEach(function(d){drawShape(d,false);});
    if(draft) drawShape(draft,true);
    drawMeasure();

    var inPlot=mouse && mouse.x<pw && mouse.y<ph && mouse.x>=0 && mouse.y>=0;
    if(inPlot){
      var ni=Math.max(0,Math.min(bars.length-1,Math.round(iOf(mouse.x)))), cx=xOf(ni);
      ctx.setLineDash([4,4]); ctx.strokeStyle='#7d8aa0'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(0,Math.round(mouse.y)+0.5); ctx.lineTo(pw,Math.round(mouse.y)+0.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(Math.round(cx)+0.5,0); ctx.lineTo(Math.round(cx)+0.5,ph); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();

    ctx.fillStyle='#171d27'; ctx.fillRect(pw,0,AX,H);
    ctx.strokeStyle='#2a3342'; ctx.beginPath(); ctx.moveTo(pw+0.5,0); ctx.lineTo(pw+0.5,ph); ctx.stroke();
    ctx.fillStyle='#8793a6'; ctx.font='11px sans-serif'; ctx.textAlign='left';
    ticks.forEach(function(tk){ ctx.fillText(tk.t,pw+6,yOf(tk.p)+4); });
    if(manual){ ctx.fillStyle=DRAW_COLOR; ctx.fillText('수동',pw+6,12); }
    var lastBar=bars[bars.length-1], ly=yOf(lastBar.c);
    if(ly>0&&ly<ph) tag(fmtP(lastBar.c),ly,(lastBar.c>=lastBar.o)?UP_COLOR:DOWN_COLOR,'#ffffff');
    drawings.forEach(function(d){
      if(d.k==='h'){ var yy=yOf(d.p); if(yy>0&&yy<ph) tag(fmtY(d.p),yy,DRAW_COLOR,'#1a1405'); }
    });

    ctx.fillStyle='#171d27'; ctx.fillRect(0,ph,W,AY);
    ctx.strokeStyle='#2a3342'; ctx.beginPath(); ctx.moveTo(0,ph+0.5); ctx.lineTo(pw,ph+0.5); ctx.stroke();
    ctx.fillStyle='#8793a6'; ctx.textAlign='center'; ctx.font='11px sans-serif';
    var intra=isIntra(), lastKey='', lastX=-999;
    for(i=a;i<=z;i++){
      var si=kstISO(bars[i].t), key=intra?si.slice(0,10):si.slice(0,7);
      if(key!==lastKey){
        lastKey=key;
        var xx=xOf(i);
        if(xx>20&&xx<pw-20&&xx-lastX>=52){
          ctx.fillText(intra?si.slice(5,10):si.slice(2,7),xx,ph+16);
          lastX=xx;
        }
      }
    }
    ctx.textAlign='left';

    if(inPlot){
      tag(fmtY(pOf(mouse.y)),mouse.y,'#e8edf5','#10141b');
      var ci=Math.max(0,Math.min(bars.length-1,Math.round(iOf(mouse.x)))), cxx=xOf(ci);
      var t=dstr(bars[ci]), tw=ctx.measureText(t).width+12;
      ctx.fillStyle='#e8edf5'; ctx.fillRect(Math.min(Math.max(0,cxx-tw/2),pw-tw),ph+2,tw,AY-4);
      ctx.fillStyle='#10141b'; ctx.textAlign='center';
      ctx.fillText(t,Math.min(Math.max(tw/2,cxx),pw-tw/2),ph+16); ctx.textAlign='left';
    }
  }
  function makeTicks(){
    var out=[], b=base(), k;
    if(mode==='pct'){
      var a=(yMin-b)/b*100, z=(yMax-b)/b*100, s=niceStep(z-a,7);
      var dec=(s>=1&&Math.abs(s%1)<1e-9)?0:(s>=0.1?1:2);
      for(k=Math.ceil(a/s-1e-9); k*s<z; k++){
        var q=k*s; out.push({p:b*(1+q/100), t:(q>0?'+':'')+q.toFixed(dec)+'%'});
      }
    }else{
      var st=niceStep(yMax-yMin,7);
      for(var v=Math.ceil(yMin/st)*st; v<yMax; v+=st) out.push({p:v,t:v.toFixed(st<1?2:0)});
    }
    return out;
  }
  function tag(text,y,bg,fg){
    ctx.font='11px sans-serif';
    ctx.fillStyle=bg; ctx.fillRect(pw,y-9,AX,18);
    ctx.fillStyle=fg; ctx.textAlign='left'; ctx.fillText(text,pw+6,y+4);
  }
  function fmtDur(ms){
    ms=Math.abs(ms);
    if(ms>=DAY){
      var d=Math.floor(ms/DAY), h=Math.round((ms%DAY)/36e5);
      if(h===24){ d++; h=0; }
      return d+'일'+(h?' '+h+'시간':'');
    }
    if(ms>=36e5) return Math.round(ms/36e5)+'시간';
    return Math.round(ms/6e4)+'분';
  }
  function drawMeasure(){
    if(!meas) return;
    var x1=xT(meas.t1), y1=yOf(meas.p1), x2=xT(meas.t2), y2=yOf(meas.p2);
    var diff=meas.p2-meas.p1, pct=meas.p1?diff/meas.p1*100:0, up=diff>=0;
    var col=up?UP_COLOR:DOWN_COLOR;
    var nb=Math.abs(Math.round(tToI(meas.t2)-tToI(meas.t1)));
    ctx.setLineDash([]);
    ctx.fillStyle=up?'rgba(229,72,77,0.14)':'rgba(59,130,246,0.14)';
    ctx.fillRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));
    ctx.strokeStyle=col; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    var ang=Math.atan2(y2-y1,x2-x1);
    ctx.beginPath();
    ctx.moveTo(x2,y2); ctx.lineTo(x2-9*Math.cos(ang-0.45),y2-9*Math.sin(ang-0.45));
    ctx.moveTo(x2,y2); ctx.lineTo(x2-9*Math.cos(ang+0.45),y2-9*Math.sin(ang+0.45));
    ctx.stroke();
    var sg=up?'+':'\u2212';
    var l1=sg+fmtP(Math.abs(diff))+' ('+sg+Math.abs(pct).toFixed(2)+'%)';
    var l2=nb+'봉 · '+fmtDur(meas.t2-meas.t1);
    ctx.font='bold 12px sans-serif'; ctx.textAlign='left';
    var bw2=Math.max(ctx.measureText(l1).width,ctx.measureText(l2).width)+16, bh=38;
    var bx=(x1+x2)/2-bw2/2, by=up?Math.min(y1,y2)-bh-6:Math.max(y1,y2)+6;
    bx=Math.max(2,Math.min(pw-bw2-2,bx)); by=Math.max(2,Math.min(ph-bh-2,by));
    ctx.fillStyle=col; ctx.fillRect(bx,by,bw2,bh);
    ctx.fillStyle='#ffffff';
    ctx.fillText(l1,bx+8,by+16); ctx.fillText(l2,bx+8,by+31);
    ctx.lineWidth=1;
  }
  var FIB=[0,0.236,0.382,0.5,0.618,0.786,1];
  function segD(p,ax,ay,bx,by){var dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy,t=l?((p.x-ax)*dx+(p.y-ay)*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p.x-(ax+t*dx),p.y-(ay+t*dy));}
  function hitD(d,p){
    if(d.k==='h') return Math.abs(yOf(d.p)-p.y);
    if(d.k==='v') return Math.abs(xT(d.t)-p.x);
    var x1=xT(d.t1),y1=yOf(d.p1),x2=xT(d.t2),y2=yOf(d.p2);
    if(d.k==='l') return segD(p,x1,y1,x2,y2);
    if(d.k==='r'){
      var l=Math.min(x1,x2),r=Math.max(x1,x2),t=Math.min(y1,y2),b=Math.max(y1,y2);
      if(p.x>=l&&p.x<=r&&p.y>=t&&p.y<=b) return 0;
      return Math.hypot(Math.max(l-p.x,0,p.x-r),Math.max(t-p.y,0,p.y-b));
    }
    if(d.k==='f'){
      var m=segD(p,x1,y1,x2,y2), xl=Math.min(x1,x2);
      if(p.x>=xl-6) FIB.forEach(function(q){ m=Math.min(m,Math.abs(yOf(d.p2+(d.p1-d.p2)*q)-p.y)); });
      return m;
    }
    return 1e9;
  }
  function eraseAt(p){
    var bi=-1,bd=12;
    drawings.forEach(function(d,i){ var v=hitD(d,p); if(v<=bd){bd=v;bi=i;} });
    if(bi>=0){ drawings.splice(bi,1); save(); }
    draw();
  }
  function drawShape(d,isDraft){
    ctx.strokeStyle=DRAW_COLOR; ctx.lineWidth=1.5; ctx.setLineDash(isDraft?[5,4]:[]);
    if(d.k==='h'){
      var y=Math.round(yOf(d.p))+0.5;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(pw,y); ctx.stroke();
    }else if(d.k==='v'){
      var x=Math.round(xT(d.t))+0.5;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,ph); ctx.stroke();
    }else if(d.k==='l'){
      ctx.beginPath(); ctx.moveTo(xT(d.t1),yOf(d.p1)); ctx.lineTo(xT(d.t2),yOf(d.p2)); ctx.stroke();
    }else if(d.k==='f'){
      var xa=xT(d.t1), xb=xT(d.t2), xl=Math.min(xa,xb);
      ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(xa,yOf(d.p1)); ctx.lineTo(xb,yOf(d.p2)); ctx.stroke(); ctx.setLineDash([]);
      FIB.forEach(function(r){
        var pr=d.p2+(d.p1-d.p2)*r, yy=Math.round(yOf(pr))+0.5;
        ctx.strokeStyle=r===0||r===1?DRAW_COLOR:'rgba(242,184,75,0.6)';
        ctx.beginPath(); ctx.moveTo(xl,yy); ctx.lineTo(pw,yy); ctx.stroke();
        ctx.fillStyle=DRAW_COLOR; ctx.font='11px sans-serif'; ctx.textAlign='left';
        ctx.fillText(r+' ('+fmtY(pr)+')',Math.max(2,xl+4),yy-3);
      });
      ctx.strokeStyle=DRAW_COLOR;
    }else if(d.k==='r'){
      var x1=xT(d.t1),y1=yOf(d.p1),x2=xT(d.t2),y2=yOf(d.p2);
      ctx.fillStyle='rgba(242,184,75,0.12)';
      ctx.fillRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));
      ctx.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));
    }
    ctx.setLineDash([]); ctx.lineWidth=1;
  }

  // ===== 마우스 / 터치 =====
  function pos(e){
    var r=cv.getBoundingClientRect();
    return {x:e.clientX-r.left,y:e.clientY-r.top};
  }
  cv.addEventListener('pointerdown',function(e){
    var p=pos(e);
    if(!bars.length) return;
    if(p.x>=pw && p.y<ph){
      cv.setPointerCapture(e.pointerId);
      ensureManual();
      axisDrag={y:p.y,min:mMin,max:mMax};
      return;
    }
    if(p.x>=pw||p.y>=ph) return;
    cv.setPointerCapture(e.pointerId);
    mouse=p;
    if(tool==='none'){
      panning={x:p.x,y:p.y,left:left,min:yMin,max:yMax};
    }else if(tool==='h'){
      drawings.push({k:'h',p:pOf(p.y)}); save(); draw();
    }else if(tool==='e'){
      eraseAt(p);
    }else if(tool==='v'){
      drawings.push({k:'v',t:iToT(Math.round(iOf(p.x)))}); save(); draw();
    }else if(tool==='m'){
      var tm=iToT(Math.round(iOf(p.x))), pm=pOf(p.y);
      meas={t1:tm,p1:pm,t2:tm,p2:pm,live:true};
    }else{
      var t0=iToT(iOf(p.x)), p0=pOf(p.y);
      draft={k:tool,t1:t0,p1:p0,t2:t0,p2:p0};
    }
  });
  cv.addEventListener('pointermove',function(e){
    var p=pos(e); mouse=p;
    if(axisDrag){
      var f=Math.exp((p.y-axisDrag.y)*0.006);
      var c=(axisDrag.min+axisDrag.max)/2;
      mMin=c-(c-axisDrag.min)*f;
      mMax=c+(axisDrag.max-c)*f;
      draw(); return;
    }
    if(!panning && !draft){
      cv.style.cursor=(p.x>=pw&&p.y<ph)?'ns-resize':(tool==='none'?'grab':'crosshair');
    }
    if(panning){
      left=panning.left-(p.x-panning.x)/barW;
      if(manual){
        var dp=(p.y-panning.y)/ph*(panning.max-panning.min);
        mMin=panning.min+dp; mMax=panning.max+dp;
      }
    }else if(draft){
      draft.t2=iToT(iOf(p.x)); draft.p2=pOf(p.y);
    }else if(meas && meas.live){
      meas.t2=iToT(Math.round(iOf(p.x))); meas.p2=pOf(p.y);
    }
    showInfo(); draw();
  });
  function endPointer(){
    if(axisDrag){ axisDrag=null; }
    if(panning){ panning=null; }
    if(meas && meas.live){
      meas.live=false;
      if(Math.abs(xT(meas.t2)-xT(meas.t1))+Math.abs(yOf(meas.p2)-yOf(meas.p1))<4) meas=null;
    }
    if(draft){
      var moved=Math.abs(xT(draft.t2)-xT(draft.t1))+Math.abs(yOf(draft.p2)-yOf(draft.p1));
      if(moved>4){ drawings.push(draft); save(); }
      draft=null;
    }
    draw();
  }
  cv.addEventListener('pointerup',endPointer);
  cv.addEventListener('pointercancel',endPointer);
  cv.addEventListener('pointerleave',function(e){
    if(e.pointerType==='mouse' && !panning && !draft && !axisDrag){
      mouse=null; infoEl.innerHTML='차트 위에 마우스를 올리면 정보가 보입니다.'; draw();
    }
  });
  cv.addEventListener('dblclick',function(e){
    var p=pos(e);
    if(p.x>=pw && p.y<ph){ manual=false; draw(); }
  });
  cv.addEventListener('wheel',function(e){
    e.preventDefault();
    var p=pos(e);
    if(!bars.length) return;
    if(p.x>=pw || e.shiftKey){
      var anchor=(p.y<ph)?pOf(p.y):(yMin+yMax)/2;
      zoomPrice(e.deltaY<0?0.88:1/0.88,anchor);
      return;
    }
    var idx=iOf(p.x);
    barW=Math.max(2,Math.min(40,barW*(e.deltaY<0?1.12:1/1.12)));
    left=idx-(p.x-barW/2)/barW;
    draw();
  },{passive:false});

  function zoom(f){
    var cx=pw/2, idx=iOf(cx);
    barW=Math.max(2,Math.min(40,barW*f));
    left=idx-(cx-barW/2)/barW;
    draw();
  }

  function showInfo(){
    if(!mouse||!bars.length||mouse.x>=pw||mouse.y>=ph) return;
    var i=Math.max(0,Math.min(bars.length-1,Math.round(iOf(mouse.x)))), b=bars[i];
    var col=b.c>=b.o?UP_COLOR:DOWN_COLOR;
    infoEl.innerHTML='<b>'+dstr(b)+'</b> &nbsp; 시 '+fmtP(b.o)+' 고 '+fmtP(b.h)+' 저 '+fmtP(b.l)+
      ' 종 <b style="color:'+col+'">'+fmtP(b.c)+'</b> ('+fmtPct(b.c)+') &nbsp; 커서 '+fmtP(pOf(mouse.y))+' ('+fmtPct(pOf(mouse.y))+') &nbsp; 고점대비 '+(b.dd*100).toFixed(1)+'% &nbsp; '+VOLNAME+' '+
      (b.vix!=null?b.vix.toFixed(1):'-')+(b.sig?' &nbsp; <b style="color:'+SIGCOL[b.sig]+'">x'+b.sig+' BUY</b>':'');
  }

  // ===== 봉 바꾸기 =====
  tfSel.addEventListener('change',function(){
    var want=tfSel.value;
    if(!daily.length){ tfSel.value=tf; return; }
    showMsg('불러오는 중…');
    ensureTF(want).then(function(){
      tf=want; wsSwitch();
      manual=false; draft=null;
      buildBars(); layout(); resetView(); hideMsg(); draw();
    }).catch(function(){
      hideMsg(); tfSel.value=tf;
      infoEl.textContent='⚠ 해당 봉 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    });
  });

  // ===== 버튼 =====
  document.querySelectorAll('[data-tool]').forEach(function(btn){
    btn.addEventListener('click',function(){
      tool=btn.getAttribute('data-tool');
      document.querySelectorAll('[data-tool]').forEach(function(b){b.classList.toggle('on',b===btn);});
      cv.style.cursor=tool==='none'?'grab':'crosshair';
      draft=null; meas=null;
    });
  });
  function setMode(m){ mode=m; document.getElementById('mP').classList.toggle('on',m==='price'); document.getElementById('mPct').classList.toggle('on',m==='pct'); draw(); }
  document.getElementById('mP').onclick=function(){setMode('price');};
  document.getElementById('mPct').onclick=function(){setMode('pct');};
  document.getElementById('undo').onclick=function(){drawings.pop();save();draw();};
  document.getElementById('clear').onclick=function(){
    if(drawings.length&&confirm('그린 선을 모두 지울까요?')){drawings=[];save();draw();}
  };
  document.getElementById('zin').onclick=function(){zoom(1.25);};
  document.getElementById('zout').onclick=function(){zoom(1/1.25);};
  document.getElementById('pin').onclick=function(){ zoomPrice(0.8,(yMin+yMax)/2); };
  document.getElementById('pout').onclick=function(){ zoomPrice(1.25,(yMin+yMax)/2); };
  document.getElementById('pauto').onclick=function(){ manual=false; draw(); };
  document.getElementById('reload').onclick=function(){ loadAll(); };
  ['dd1','vx1','dd2','vx2','dd3','vx3'].forEach(function(id){
    document.getElementById(id).addEventListener('input',function(){
      if(!daily.length) return;
      computeDaily(); buildBars(); updateStats(); fillTable(); draw();
    });
  });
  if(MANUAL){
    document.getElementById('manualBtn').onclick=function(){
      var v=parseFloat(document.getElementById('manualVal').value);
      if(!daily.length) return;
      if(!(v>0)){
        try{localStorage.removeItem(STORE_KEY+'_manual');}catch(e){}
        loadAll(); return;
      }
      var d=dateUTC(daily[daily.length-1].t);
      vm[d]=v;
      try{localStorage.setItem(STORE_KEY+'_manual',JSON.stringify({d:d,v:v}));}catch(e){}
      computeDaily(); buildBars(); updateStats(); fillTable(); draw();
    };
  }
  cv.style.cursor='grab';

  window.addEventListener('resize',function(){ if(!bars.length) return; layout(); draw(); });
  layout();
  loadAll();
})();
