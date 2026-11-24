"""Dashboard 용 데이터: 12종목 52주 최저가(종가 기준) + 뉴스(미증시 5·한국증시 5·코인 3)를 dash.json 으로 저장 (GitHub Actions)."""
import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

import pandas as pd
import yfinance as yf

# 시세코드(시트의 '시세코드' 열) -> 야후 티커
YF = {
    "CURRENCY:BTCUSD": "BTC-USD", "FUT:NQ=F": "NQ=F", "FUT:ES=F": "ES=F", "FUT:GC=F": "GC=F",
    "FUT:CL=F": "CL=F", "KRX:KOSPI": "^KS11", "KRX:005930": "005930.KS", "KRX:035420": "035420.KS",
    "CURRENCY:USDKRW": "KRW=X", "NYSEARCA:SCHD": "SCHD", "NYSEARCA:SCHG": "SCHG",
}
UA = {"user-agent": "Mozilla/5.0"}


def lows():
    out = {}
    for code, tk in YF.items():
        try:
            df = yf.download(tk, period="1y", interval="1d", auto_adjust=False, progress=False)
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            c = df["Close"].dropna()
            if len(c):
                out[code] = round(float(c.min()), 4)
        except Exception as e:
            print("low fail", code, e)
    try:  # Backpack(BP) = 코인게코
        u = "https://api.coingecko.com/api/v3/coins/backpack/market_chart?vs_currency=usd&days=365&interval=daily"
        j = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30))
        out["COINGECKO:backpack"] = round(min(p[1] for p in j["prices"]), 6)
    except Exception as e:
        print("low fail backpack", e)
    return out


NEWS = [  # (분류, 검색어, 개수)
    ("미증시", "(뉴욕증시 OR 나스닥 OR 미국증시) -비트코인 -코인 -이더리움 -가상자산", 5),
    ("한국증시", "코스피 OR 코스닥", 5),
    ("코인", "비트코인 OR 가상자산", 3),
]


def news():
    items = []
    for cat, q, n in NEWS:
        u = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
            {"q": q + " when:1d", "hl": "ko", "gl": "KR", "ceid": "KR:ko"})
        try:
            root = ET.fromstring(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read())
        except Exception as e:
            print("news fail", cat, e)
            continue
        rows, seen = [], set()
        for it in root.iter("item"):
            title = (it.findtext("title") or "").strip()
            src = (it.findtext("source") or "").strip()
            if src and title.endswith(" - " + src):
                title = title[: -len(" - " + src)]
            key = title[:18]
            if not title or key in seen:
                continue
            seen.add(key)
            try:
                at = parsedate_to_datetime(it.findtext("pubDate")).timestamp()
            except Exception:
                at = 0
            rows.append({"cat": cat, "at": int(at), "t": title, "src": src, "l": it.findtext("link") or ""})
        rows.sort(key=lambda r: -r["at"])
        items += rows[:n]
    return items


MON = {"NASDAQ": "NQ=F", "S&P": "ES=F", "KOSPI": "^KS11", "US10Y": "^TNX", "BTC": "BTC-USD",
       "USDKRW": "KRW=X", "GOLD": "GC=F", "WTI": "CL=F"}


def mon():
    """시트(Apps Script) 시세가 비었을 때 쓰는 예비 시세: 현재가 + 전일 대비 비율."""
    res = []
    for name, tk in MON.items():
        try:
            df = yf.download(tk, period="5d", interval="1d", auto_adjust=False, progress=False)
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            c = df["Close"].dropna()
            if len(c) >= 2:
                res.append({"t": name, "p": round(float(c.iloc[-1]), 4), "c": float(c.iloc[-1] / c.iloc[-2] - 1)})
        except Exception as e:
            print("mon fail", name, e)
    return res


def ko(text):
    """영어 제목을 한글로 번역 (한글이 이미 있으면 그대로, 실패하면 원문)."""
    if not text or any("\uac00" <= ch <= "\ud7a3" for ch in text):
        return text
    try:
        u = "https://translate.googleapis.com/translate_a/single?" + urllib.parse.urlencode(
            {"client": "gtx", "sl": "auto", "tl": "ko", "dt": "t", "q": text})
        j = json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20))
        out = "".join(seg[0] for seg in j[0] if seg and seg[0])
        return out.strip() or text
    except Exception as e:
        print("translate fail", e)
        return text


def spcx_news():
    """SPCX(SpaceX) 관련 뉴스만: 핫이슈 10(관련도순) + 속보 20(최신순)."""
    rows, seen = [], set()
    for q, hl, gl, ceid in [("SPCX OR SpaceX 상장 OR 스페이스X when:2d", "ko", "KR", "KR:ko"), ("SPCX OR SpaceX IPO when:2d", "en-US", "US", "US:en")]:
        u = "https://news.google.com/rss/search?" + urllib.parse.urlencode({"q": q, "hl": hl, "gl": gl, "ceid": ceid})
        try:
            root = ET.fromstring(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read())
        except Exception as e:
            print("spcx news fail", e)
            continue
        for rank, it in enumerate(root.iter("item")):
            title = (it.findtext("title") or "").strip()
            src = (it.findtext("source") or "").strip()
            if src and title.endswith(" - " + src):
                title = title[: -len(" - " + src)]
            key = title[:18].lower()
            if not title or key in seen:
                continue
            seen.add(key)
            try:
                at = int(parsedate_to_datetime(it.findtext("pubDate")).timestamp())
            except Exception:
                at = 0
            rows.append({"at": at, "t": title, "src": src, "l": it.findtext("link") or "", "rank": rank})
    issues = sorted(rows, key=lambda r: r["rank"])[:10]
    latest = sorted(rows, key=lambda r: -r["at"])[:20]
    cache = {}
    for r in issues + latest:   # 같은 기사는 한 번만 번역
        if r["t"] not in cache:
            cache[r["t"]] = ko(r["t"])
        r["o"] = r["t"]
        r["t"] = cache[r["t"]]
    return {"at": int(time.time()), "issues": issues, "list": latest}


out = {"updated": int(time.time()), "lows": lows(), "news": news(), "mon": mon(), "spcx": spcx_news()}
if not out["lows"] and not out["news"]:
    raise SystemExit("no data")
json.dump(out, open("dash.json", "w"), ensure_ascii=False, separators=(",", ":"))
print({"lows": len(out["lows"]), "news": len(out["news"])})
