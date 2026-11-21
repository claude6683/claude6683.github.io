/* google.script.run 대체: Apps Script 의 JSON API(읽기 전용 허용 목록)를 fetch 로 호출.
   직전 결과는 브라우저에 저장해 두었다가 먼저 보여주고(빠름), 새 결과가 다르면 한 번 더 호출. */
(function () {
  var BASE = 'https://script.google.com/macros/s/AKfycbxadwf6a-UyfC5wyIQ800rlRFw-yrVzVwUFNqML4mYmGILQ_LEI7EAfcx2qeKm8oTNZVg/exec';
  var PFX = 'dash1_';
  function call(fn, args, ok, fail) {
    var k = PFX + fn + '|' + args.join('|'), cs = null, hit = false;
    try { cs = localStorage.getItem(k); } catch (e) {}
    if (cs) { try { var c = JSON.parse(cs); hit = true; if (ok) ok(c); } catch (e) { console.error(e); } }
    var q = 'api=' + encodeURIComponent(fn);
    if (args[0] != null) q += '&a=' + encodeURIComponent(args[0]);
    if (args[1] != null) q += '&b=' + encodeURIComponent(args[1]);
    fetch(BASE + '?' + q).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (tx) {
      var d = JSON.parse(tx);
      if (d && d.error && Object.keys(d).length === 1) throw new Error(d.error);
      if (tx === cs) return;
      try { localStorage.setItem(k, tx); } catch (e) {}
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
