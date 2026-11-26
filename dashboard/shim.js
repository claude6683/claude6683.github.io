/* google.script.run 대체: Apps Script 없이 dash.json(GitHub Actions 가 생성)에서 시세·시세표·뉴스를 읽어
   기존 Apps Script 응답 모양(web_monitorData · web_getData · news_getData)으로 바꿔 준다.
   직전 결과는 브라우저에 저장해 먼저 보여주고(빠름), 새 결과가 다르면 한 번 더 그린다. */
(function () {
  var URL0 = 'https://raw.githubusercontent.com/claude6683/claude6683.github.io/dash/dash.json';
  var CK = 'dash2_json';
  var pend = null, pat = 0;
  var COLS = [110, 125, 105, 105, 105, 105, 105, 150, 135, 170].map(function (w) { return { w: w, hidden: false }; });
  var HEAD = ['종목', '현재가격', '1일 가격변화', '1시간 가격변화', '1주가격변화', '1달가격변화', '전고점 가격변화', '1달 추이', '시세코드', '상태'];

  function fetchText() {
    var now = Date.now();
    if (pend && now - pat < 30000) return pend;
    pat = now;
    pend = fetch(URL0 + '?t=' + Math.floor(now / 60000)).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
    pend.catch(function () { pend = null; });
    return pend;
  }

  function sheet(t) {
    var blank = function () { var a = []; for (var i = 0; i < 10; i++) a.push({ t: '' }); return a; };
    var r0 = blank(); r0[0] = { t: 'Trading View' };
    var rows = [r0, blank(), HEAD.map(function (h) { return { t: h }; })];
    (t.rows || []).forEach(function (x) {
      rows.push([
        { t: String(x.n) }, { t: String(x.p) }, { t: String(x.d) }, { t: String(x.h) }, { t: String(x.w) }, { t: String(x.m) }, { t: String(x.a) },
        (x.s && x.s.length > 1) ? { t: '', s: x.s, sc: x.sc, sh: 34 } : { t: '' },
        { t: String(x.code) }, { t: String(x.st) }
      ]);
    });
    return { tabs: [{ label: 'Trading View', cols: COLS, rows: rows, hiddenRows: [], merges: [] }], at: t.at };
  }

  function build(fn, j) {
    if (fn === 'web_monitorData') {
      var m = j && j.monitor, n = 0;
      ((m && m.items) || []).forEach(function (x) { if (typeof x.p === 'number') n++; });
      if (n < 3) throw new Error('bad data');
      return m;
    }
    if (fn === 'web_getData') {
      if (!(j && j.tbl && j.tbl.rows && j.tbl.rows.length)) throw new Error('bad data');
      return sheet(j.tbl);
    }
    if (fn === 'news_getData') {
      if (!(j && j.flash && j.flash.list)) throw new Error('bad data');
      return j.flash;
    }
    throw new Error('unsupported ' + fn);
  }

  function call(fn, args, ok, fail) {
    var cs = null, hit = false;
    try { cs = localStorage.getItem(CK); } catch (e) {}
    if (cs) { try { var c = build(fn, JSON.parse(cs)); hit = true; if (ok) ok(c); } catch (e) { cs = null; } }
    fetchText().then(function (tx) {
      if (tx === cs) return;
      var d = build(fn, JSON.parse(tx));
      try { localStorage.setItem(CK, tx); } catch (e) {}
      if (ok) ok(d);
    }).catch(function (e) { if (!hit && fail) fail(e); });
  }

  function make(ok, fail) {
    return new Proxy({}, {
      get: function (_, name) {
        if (name === 'withSuccessHandler') return function (f) { return make(f, fail); };
        if (name === 'withFailureHandler') return function (f) { return make(ok, f); };
        return function () { call(String(name), Array.prototype.slice.call(arguments), ok, fail); };
      }
    });
  }
  window.google = { script: { run: make(null, null) } };
})();
