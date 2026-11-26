/* #6683 공통 탭바 — 11개 페이지 어디서든 상단에서 이동 / 드래그로 순서 변경 (순서는 이 브라우저에 저장) */
(function () {
  if (window.__tabs6683) return;
  window.__tabs6683 = 1;
  var H = 42, KEY = '6683-tabs-order';
  var TABS = [
    ['/dashboard/', 'Dashboard'],
    ['/fractal-chart/', 'fractal-chart'],
    ['/overview/', 'overview'],
    ['/smc/', 'SMC'],
    ['/fishing/', 'Fishing'],
    ['/hub/', 'Trading View'],
    ['/divergence/', 'INDEX'],
    ['/xyz100/', 'NASDAQ LIVE'],
    ['/kospi/', 'KOSPI LIVE'],
    ['/nasdaq-alert/', 'NASDAQ ALERT'],
    ['/kospi-alert/', 'KOSPI ALERT']
  ];
  var path = location.pathname.replace(/\/index\.html$/, '/');
  var page = ''; // 페이지별 겹침 보정용 이름
  TABS.forEach(function (t) { if (path.indexOf(t[0]) === 0) page = t[0].replace(/\//g, ''); });

  // 저장된 순서 적용 (없는 항목은 뒤에 붙임)
  var order = [];
  try { order = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(order)) order = []; } catch (e) { order = []; }
  var list = [];
  order.forEach(function (h) { TABS.forEach(function (t) { if (t[0] === h && list.indexOf(t) < 0) list.push(t); }); });
  TABS.forEach(function (t) { if (list.indexOf(t) < 0) list.push(t); });

  var css =
    'html.t6683{box-sizing:border-box;padding-top:' + H + 'px}' +
    '#t6683{position:fixed;top:0;left:0;right:0;height:' + H + 'px;z-index:10000;display:flex;align-items:center;gap:8px;' +
    'padding:0 10px;background:#141a26;border-bottom:1px solid #232b3b;overflow-x:auto;overflow-y:hidden;white-space:nowrap;' +
    '-webkit-overflow-scrolling:touch;scrollbar-width:none;font-family:-apple-system,"Malgun Gothic","Noto Sans KR",sans-serif;' +
    '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}' +
    '#t6683::-webkit-scrollbar{display:none}' +
    '#t6683 a{flex:none;display:inline-block;box-sizing:border-box;height:28px;line-height:26px;padding:0 14px;border:1px solid #2b3446;' +
    'border-radius:6px;background:#1a2130;color:#e4e8f0;font-size:13px;text-decoration:none;cursor:pointer;touch-action:pan-x;' +
    '-webkit-user-drag:none}' +
    '#t6683 a:hover{border-color:#8da2c8}' +
    '#t6683 a.on{background:#f2b84b;border-color:#f2b84b;color:#111;font-weight:700}' +
    '#t6683 a.drag{position:relative;z-index:2;opacity:.9;box-shadow:0 4px 14px rgba(0,0,0,.55);cursor:grabbing;transition:none}' +
    '#t6683 a.home{color:#8b93a7;padding:0 11px}' +
    // 페이지별 겹침 보정 (고정 위치 요소를 탭바 아래로)
    'html[data-p6683="dashboard"] .row.max,html[data-p6683="dashboard"] .cell.max{top:' + H + 'px}' +
    'html[data-p6683="hub"] .tb{top:' + H + 'px!important}' +
    'html[data-p6683="hub"] #tick{top:' + H + 'px!important}' +
    'html[data-p6683="hub"] header{top:' + (H + 20) + 'px!important}';

  function build() {
    if (!document.body || document.getElementById('t6683')) return;
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    var root = document.documentElement;
    root.className += ' t6683';
    root.setAttribute('data-p6683', page);

    var bar = document.createElement('div');
    bar.id = 't6683';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', '#6683 탭');

    var home = document.createElement('a');
    home.href = '/';
    home.className = 'home';
    home.textContent = '#6683';
    home.draggable = false;
    bar.appendChild(home);

    list.forEach(function (t) {
      var a = document.createElement('a');
      a.href = t[0];
      a.textContent = t[1];
      a.setAttribute('data-h', t[0]);
      a.draggable = false;
      if (page && t[0] === '/' + page + '/') a.className = 'on';
      bar.appendChild(a);
    });
    document.body.appendChild(bar);

    var on = bar.querySelector('a.on');
    if (on) { try { bar.scrollLeft = Math.max(0, on.offsetLeft - 60); } catch (e) {} }
    drag(bar);
  }

  function save(bar) {
    try {
      var o = [].map.call(bar.querySelectorAll('a[data-h]'), function (a) { return a.getAttribute('data-h'); });
      localStorage.setItem(KEY, JSON.stringify(o));
    } catch (e) {}
  }

  // 드래그: 마우스는 5px 이상 움직이면, 터치는 0.35초 길게 누르면 순서 변경 모드
  function drag(bar) {
    var cur = null, sx = 0, grab = 0, mode = false, timer = 0, pid = null, touch = false, moved = false, lastX = 0, raf = 0;

    bar.addEventListener('dragstart', function (e) { e.preventDefault(); });
    bar.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);
    bar.addEventListener('contextmenu', function (e) { if (mode || touch) e.preventDefault(); });
    // 순서 변경 중에는 화면 스크롤 막기
    bar.addEventListener('touchmove', function (e) { if (mode && e.cancelable) e.preventDefault(); }, { passive: false });

    bar.addEventListener('pointerdown', function (e) {
      var a = e.target.closest ? e.target.closest('a[data-h]') : null;
      if (cur || !a || (e.pointerType === 'mouse' && e.button !== 0)) return;
      cur = a; pid = e.pointerId; sx = e.clientX; lastX = sx; mode = false; moved = false;
      touch = e.pointerType !== 'mouse';
      if (touch) {
        clearTimeout(timer);
        timer = setTimeout(function () { if (cur) start(); }, 350);
      }
    });

    function start() {
      mode = true; moved = true;
      cur.classList.add('drag');
      var r = cur.getBoundingClientRect();
      grab = lastX - r.left;
      try { cur.setPointerCapture(pid); } catch (e) {}
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
      place();
    }

    function place() {
      if (!cur || !mode) return;
      // 다른 탭 중앙선을 넘으면 자리 교체 (한 번에 여러 칸 이동도 처리)
      var x = lastX, again = true, guard = 0;
      while (again && guard++ < 20) {
        again = false;
        var tabs = [].slice.call(bar.querySelectorAll('a[data-h]'));
        var i = tabs.indexOf(cur);
        cur.style.transform = 'none';
        for (var k = 0; k < tabs.length; k++) {
          if (tabs[k] === cur) continue;
          var r = tabs[k].getBoundingClientRect(), c = r.left + r.width / 2;
          if (k < i && x < c) { bar.insertBefore(cur, tabs[k]); again = true; break; }
          if (k > i && x > c) { bar.insertBefore(cur, tabs[k].nextSibling); again = true; break; }
        }
      }
      // 손가락 위치로 따라오게
      cur.style.transform = 'none';
      var nr = cur.getBoundingClientRect();
      cur.style.transform = 'translateX(' + (lastX - grab - nr.left) + 'px)';
      // 가장자리 자동 스크롤
      var br = bar.getBoundingClientRect();
      if (lastX < br.left + 40) bar.scrollLeft -= 10;
      else if (lastX > br.right - 40) bar.scrollLeft += 10;
    }

    window.addEventListener('pointermove', function (e) {
      if (!cur || e.pointerId !== pid) return;
      lastX = e.clientX;
      if (!mode) {
        var d = Math.abs(lastX - sx);
        if (!touch && d > 5) start();
        else if (touch && d > 10) { clearTimeout(timer); cur = null; } // 길게 누르기 전에 움직이면 일반 스크롤
        return;
      }
      if (!raf) raf = requestAnimationFrame(function () { raf = 0; place(); });
    });

    function end(e) {
      if (!cur || (e && e.pointerId !== pid)) return;
      clearTimeout(timer);
      if (mode) {
        cur.classList.remove('drag');
        cur.style.transform = '';
        try { cur.releasePointerCapture(pid); } catch (er) {}
        save(bar);
        setTimeout(function () { moved = false; }, 0);
      }
      cur = null; mode = false;
    }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
