import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.request

OUT = "xyz-data/vkospi.json"
KST = datetime.timezone(datetime.timedelta(hours=9))
TODAY = datetime.datetime.now(KST).strftime("%Y-%m-%d")
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}


def http(url, data=None, headers=None, timeout=25):
    h = dict(UA)
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def num(x):
    return float(str(x).replace(",", ""))


def sane(v):
    return 3 < v < 300


# ---------- 소스 1: 한국투자증권 Open API (키가 있을 때만, 과거 일별 시세까지) ----------
def kis_history():
    key, secret = os.environ.get("KIS_APP_KEY", ""), os.environ.get("KIS_APP_SECRET", "")
    if not key or not secret:
        raise RuntimeError("KIS 키 없음 (건너뜀)")
    base = "https://openapi.koreainvestment.com:9443"
    tok = json.loads(http(base + "/oauth2/tokenP",
                          data=json.dumps({"grant_type": "client_credentials", "appkey": key, "appsecret": secret}).encode(),
                          headers={"Content-Type": "application/json"}))["access_token"]
    out = {}
    end = datetime.datetime.now(KST)
    for _ in range(8):  # 한 번에 약 100일씩, 최대 8번
        q = ("?FID_PERIOD_DIV_CODE=D&FID_COND_MRKT_DIV_CODE=U&FID_INPUT_ISCD=0503&FID_INPUT_DATE_1=" + end.strftime("%Y%m%d"))
        j = json.loads(http(base + "/uapi/domestic-stock/v1/quotations/inquire-index-daily-price" + q, headers={
            "authorization": "Bearer " + tok, "appkey": key, "appsecret": secret,
            "tr_id": "FHPUP02120000", "custtype": "P", "Content-Type": "application/json; charset=utf-8"}))
        rows = j.get("output2") or []
        if not rows:
            break
        oldest = None
        for r in rows:
            d, c = r.get("stck_bsop_date"), r.get("bstp_nmix_prpr")
            if d and c:
                ds = d[:4] + "-" + d[4:6] + "-" + d[6:8]
                out[ds] = num(c)
                oldest = ds
        if not oldest or oldest < "2025-09-01":
            break
        end = datetime.datetime.strptime(oldest, "%Y-%m-%d").replace(tzinfo=KST) - datetime.timedelta(days=1)
    return out


# ---------- 소스 2: TradingView 스캐너 (현재값만) ----------
def tradingview():
    for market in ("korea", "global"):
        body = json.dumps({"symbols": {"tickers": ["KRX:VKOSPI"], "query": {"types": []}}, "columns": ["close"]}).encode()
        j = json.loads(http("https://scanner.tradingview.com/%s/scan" % market, data=body,
                            headers={"Content-Type": "application/json", "Origin": "https://www.tradingview.com"}))
        rows = j.get("data") or []
        if rows and rows[0]["d"] and rows[0]["d"][0] is not None:
            return {TODAY: float(rows[0]["d"][0])}
    raise RuntimeError("TradingView에 값 없음")


# ---------- 소스 3: 구글 파이낸스 페이지 (현재값만) ----------
def google():
    for sym in ("VKOSPI:KRX", "VKOSPI:INDEXKRX"):
        html = http("https://www.google.com/finance/quote/" + sym).decode("utf-8", "ignore")
        m = re.search(r'data-last-price="([\d.,]+)"', html)
        if m:
            return {TODAY: num(m.group(1))}
    raise RuntimeError("구글 파이낸스에 값 없음")


# ---------- 소스 4: 네이버 (코드가 다를 수 있어 여러 가지 시도) ----------
def naver():
    last = None
    for u in ("https://polling.finance.naver.com/api/realtime/domestic/index/VKOSPI",
              "https://m.stock.naver.com/api/index/VKOSPI/basic"):
        try:
            j = json.loads(http(u, headers={"Referer": "https://m.stock.naver.com/"}).decode("utf-8"))
            if isinstance(j, dict) and "datas" in j and j["datas"]:
                j = j["datas"][0]
            v = j.get("closePrice") if isinstance(j, dict) else None
            if v:
                return {TODAY: num(v)}
        except Exception as e:  # noqa
            last = e
    raise RuntimeError("네이버 실패: %r" % (last,))


def diagnose_naver():
    """네이버가 GitHub 서버를 막는지 확인용: KOSPI는 되는지 본다."""
    try:
        j = json.loads(http("https://m.stock.naver.com/api/index/KOSPI/basic", headers={"Referer": "https://m.stock.naver.com/"}))
        print("[진단] 네이버 KOSPI 응답 OK:", str(j.get("closePrice")))
    except Exception as e:
        print("[진단] 네이버 KOSPI 응답 실패:", describe(e))


def describe(e):
    if isinstance(e, urllib.error.HTTPError):
        try:
            body = e.read()[:300].decode("utf-8", "ignore")
        except Exception:
            body = ""
        return "HTTP %s %s" % (e.code, body)
    return repr(e)


def main():
    os.makedirs("data", exist_ok=True)
    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT)).get("data", {})
        except Exception:
            old = {}
    diagnose_naver()
    got, used = {}, []
    for name, fn in (("KIS", kis_history), ("TradingView", tradingview), ("Google", google), ("Naver", naver)):
        try:
            d = {k: v for k, v in fn().items() if sane(v)}
            print("[%s] 성공: %d개, 최신 %s = %s" % (name, len(d), max(d), d[max(d)]))
            if d:
                got.update(d)
                used.append(name)
                if len(d) > 20:  # 과거 데이터까지 받았으면 충분
                    break
                if name in ("TradingView", "Google", "Naver"):
                    break
        except Exception as e:
            print("[%s] 실패: %s" % (name, describe(e)))
    if not got:
        print("ALL VKOSPI SOURCES FAILED")
        sys.exit(1)
    old.update(got)
    with open(OUT, "w") as f:
        json.dump({"source": ",".join(used), "updated": datetime.datetime.utcnow().isoformat() + "Z", "data": old}, f)
    print("OK 저장:", ",".join(used), "총", len(old), "일치, 최신", max(old), old[max(old)])


main()
