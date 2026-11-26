"""Dashboard 용 추가 데이터 (Apps Script 대체): monitor(시세 전광판) · tbl(시세표) · flash(코인니스 속보).
dash_data.py 가 build() 결과를 dash.json 에 합쳐 저장한다. 키·토큰 없이 공개 API 만 쓴다."""
import datetime
import json
import time
import urllib.parse
import urllib.request

UA = {"user-agent": "Mozilla/5.0"}
KST = datetime.timezone(datetime.timedelta(hours=9))


def get(url, timeout=25, retries=2):
    last = None
    for k in range(retries + 1):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.2 * (k + 1))
    raise last


def ychart(sym, rng, itv):
    q = urllib.parse.quote(sym, safe="")
    for host in ("query1", "query2"):
        try:
            j = get("https://%s.finance.yahoo.com/v8/finance/chart/%s?range=%s&interval=%s" % (host, q, rng, itv), retries=1)
            r = j["chart"]["result"][0]
            if r.get("timestamp"):
                return r
        except Exception:  # noqa: BLE001
            pass
    return None


def series(r):
    ts = r["timestamp"]
    cl = r["indicators"]["quote"][0]["close"]
    return [(t * 1000, c) for t, c in zip(ts, cl) if isinstance(c, (int, float))]


def from_daily(p, d1, h1, daily):
    """일봉 종가([ms, 종가], 오래된 순)로 1주·1달 변화, 1년 최고 대비, 1달 추이를 계산."""
    now = datetime.datetime.now(datetime.timezone.utc)
    today0 = int(time.time() // 86400) * 86400000

    def close_on(days):
        t = today0 - days * 86400000
        v = None
        for ts, c in daily:
            if ts <= t:
                v = c
        return v

    y, mo = now.year, now.month - 1
    if mo == 0:
        y, mo = y - 1, 12
    try:
        ago = now.replace(year=y, month=mo)
    except ValueError:
        ago = now.replace(year=y, month=mo, day=28)
    mdays = round((now - ago).total_seconds() / 86400)
    yr = [c for ts, c in daily if ts >= time.time() * 1000 - 365 * 86400000]
    hi = max([p] + yr)

    def pct(b):
        return (p / b - 1) if b else None

    spark = [c for ts, c in daily if today0 - 31 * 86400000 <= ts < today0] + [p]
    return {"p": p, "d1": d1, "h1": h1, "w1": pct(close_on(7)), "m1": pct(close_on(mdays)), "ath": p / hi - 1, "spark": spark}


def yquote(sym):
    d = ychart(sym, "1y", "1d")
    it = ychart(sym, "2d", "5m")
    if not d or not it:
        return None
    daily = series(d)
    bars = series(it)
    p = it["meta"].get("regularMarketPrice") or (bars[-1][1] if bars else None)
    if not p:
        return None
    b1 = None
    for ts, c in bars:
        if ts <= time.time() * 1000 - 3600 * 1000:
            b1 = c
    prev = it["meta"].get("previousClose") or (daily[-2][1] if len(daily) > 1 else None)
    return from_daily(p, (p / prev - 1) if prev else None, (p / b1 - 1) if b1 else None, daily)


def backpack_quote(sym="BP_USDC"):
    base = "https://api.backpack.exchange/api/v1/"
    t = get(base + "ticker?symbol=" + sym)
    p = float(t["lastPrice"])
    now = int(time.time())
    m1 = get(base + "klines?symbol=%s&interval=1m&startTime=%d&endTime=%d" % (sym, now - 3660, now))
    h1 = (p / float(m1[0]["close"]) - 1) if m1 else None
    dd = get(base + "klines?symbol=%s&interval=1d&startTime=%d&endTime=%d" % (sym, now - 400 * 86400, now))
    daily = []
    for k in dd:
        st = str(k["start"])
        if st.isdigit():
            ms = int(st) if len(st) > 11 else int(st) * 1000
        else:
            ms = int(datetime.datetime.fromisoformat(st.replace(" ", "T")).replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
        daily.append((ms, float(k["close"])))
    return from_daily(p, float(t["priceChangePercent"]), h1, daily)


def coingecko_quote(cid="backpack"):
    j = get("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=%s&price_change_percentage=1h,24h,7d,30d" % cid)[0]
    f = lambda v: (v / 100) if isinstance(v, (int, float)) else None  # noqa: E731
    p = j["current_price"]
    h = get("https://api.coingecko.com/api/v3/coins/%s/market_chart?vs_currency=usd&days=365&interval=daily" % cid)
    pr = [x[1] for x in h["prices"]]
    return {"p": p, "d1": f(j.get("price_change_percentage_24h_in_currency")), "h1": f(j.get("price_change_percentage_1h_in_currency")),
            "w1": f(j.get("price_change_percentage_7d_in_currency")), "m1": f(j.get("price_change_percentage_30d_in_currency")),
            "ath": p / max([p] + pr) - 1, "spark": [x for x in pr[-31:]] + [p]}


def fp(p):
    return "{:,.0f}".format(p) if p >= 1000 else ("{:,.2f}".format(p) if p >= 1 else "{:.4f}".format(p))


def pc(v):
    if not isinstance(v, (int, float)):
        return "-"
    s = "%.2f" % (abs(v) * 100)
    return "0.00%" if s == "0.00" else ("+" if v > 0 else "-") + s + "%"


# (표시 이름, 야후 티커 또는 None(백팩), 시세코드)
TABLE = [
    ("BTC", "BTC-USD", "CURRENCY:BTCUSD"), ("나스닥 선물", "NQ=F", "FUT:NQ=F"), ("S&P500 선물", "ES=F", "FUT:ES=F"),
    ("금 선물", "GC=F", "FUT:GC=F"), ("원유 선물", "CL=F", "FUT:CL=F"), ("KOSPI", "^KS11", "KRX:KOSPI"),
    ("Samsung", "005930.KS", "KRX:005930"), ("Naver", "035420.KS", "KRX:035420"), ("Backpack", None, "COINGECKO:backpack"),
    ("환율", "KRW=X", "CURRENCY:USDKRW"), ("SCHD", "SCHD", "NYSEARCA:SCHD"), ("SCHG", "SCHG", "NYSEARCA:SCHG"),
]


def tbl():
    rows = []
    for name, tk, code in TABLE:
        q = None
        try:
            if tk:
                q = yquote(tk)
            else:
                try:
                    q = backpack_quote()
                except Exception as e:  # noqa: BLE001
                    print("backpack fail", e)
                    q = coingecko_quote("backpack")
        except Exception as e:  # noqa: BLE001
            print("tbl fail", name, e)
        if not q:
            rows.append({"n": name, "p": "-", "d": "-", "h": "-", "w": "-", "m": "-", "a": "-", "s": [], "sc": "#8b93a7", "code": code, "st": "확인필요"})
            continue
        rows.append({"n": name, "p": fp(q["p"]), "d": pc(q["d1"]), "h": pc(q["h1"]), "w": pc(q["w1"]), "m": pc(q["m1"]), "a": pc(q["ath"]),
                     "s": [round(v, 6) for v in q["spark"]], "sc": "#2F6BDB" if isinstance(q["m1"], (int, float)) and q["m1"] < 0 else "#E8323C",
                     "code": code, "st": "정상"})
    return {"at": datetime.datetime.now(KST).isoformat(timespec="seconds"), "rows": rows}


def ymon(sym):
    r = ychart(sym, "1d", "5m")
    m = r["meta"]
    p = m.get("regularMarketPrice")
    pcl = m.get("chartPreviousClose") or m.get("previousClose")
    return p, ((p / pcl - 1) if p and pcl else None)


def naver_idx(code):
    d = get("https://polling.finance.naver.com/api/realtime/domestic/index/" + code)["datas"][0]
    num = lambda v: float(str(v).replace(",", "").replace("+", "").replace("%", "").strip())  # noqa: E731
    c = num(d["fluctuationsRatio"]) / 100
    cmp_ = d.get("compareToPreviousPrice") or {}
    if c > 0 and any(w in str(cmp_.get("name") or cmp_.get("text") or "").upper() for w in ("FALL", "하락")):
        c = -c
    return num(d["closePrice"]), c


def monitor():
    now = datetime.datetime.now(KST)
    kr_day = now.weekday() < 5 and 900 <= now.hour * 100 + now.minute < 1530
    L = [("NASDAQ", "y", "NQ=F"), ("S&P", "y", "ES=F"), ("KOSPI" if kr_day else "KOSPI 야간", "n", "KOSPI" if kr_day else "FUT"),
         ("US10Y", "y", "^TNX"), ("BTC", "y", "BTC-USD"), ("USDKRW", "y", "KRW=X"), ("GOLD", "y", "GC=F"), ("WTI", "y", "CL=F"), ("KIMP", "k", "")]
    items, usdkrw = [], None
    for name, src, code in L:
        p = c = None
        try:
            if src == "y":
                p, c = ymon(code)
                if name == "USDKRW":
                    usdkrw = p
            elif src == "n":
                try:
                    p, c = naver_idx(code)
                except Exception as e:  # noqa: BLE001
                    print("naver fail", code, e)
                    if code == "KOSPI":
                        p, c = ymon("^KS11")
            else:  # 테더 김프: 업비트 USDT(KRW) / 달러원 - 1
                up = float(get("https://api.upbit.com/v1/ticker?markets=KRW-USDT")[0]["trade_price"])
                fx = usdkrw or ymon("KRW=X")[0]
                p, c = up, (up / fx - 1) if fx else None
        except Exception as e:  # noqa: BLE001
            print("mon fail", name, e)
        ok = lambda v: round(float(v), 8) if isinstance(v, (int, float)) else None  # noqa: E731
        items.append({"t": name, "p": ok(p), "c": ok(c)})
    return {"at": now.strftime("%m-%d %H:%M:%S"), "items": items}


def flash():
    base = "https://api.coinness.com"
    lst = get(base + "/feed/v3/breaking-news?languageCode=ko&limit=30")
    out = {"at": int(time.time() * 1000), "issues": [], "list": [
        {"id": x.get("id"), "t": x.get("title"), "c": x.get("content") or "", "sym": x.get("quickOrderCode") or "", "imp": bool(x.get("isImportant")),
         "at": x.get("publishAt"), "bull": x.get("bullCount") or 0, "bear": x.get("bearCount") or 0} for x in lst]}
    try:
        out["issues"] = [{"t": x.get("title"), "id": x.get("targetId")} for x in get(base + "/feed/v1/issue?limit=5&languageCode=ko")]
    except Exception as e:  # noqa: BLE001
        print("issue fail", e)
    return out


def build():
    out = {}
    for key, fn in (("monitor", monitor), ("tbl", tbl), ("flash", flash)):
        try:
            out[key] = fn()
        except Exception as e:  # noqa: BLE001
            print("extra fail", key, e)
    return out


if __name__ == "__main__":
    r = build()
    print({k: (len(v.get("rows") or v.get("items") or v.get("list") or []) if isinstance(v, dict) else 0) for k, v in r.items()})
