"""Dashboard 용 데이터: 12종목 52주 최저가(종가 기준) + 뉴스(미증시 4·한국증시 2·코인 2)를 dash.json 으로 저장 (GitHub Actions)."""
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
    ("미증시", "뉴욕증시 OR 나스닥 OR 미국증시", 4),
    ("한국증시", "코스피 OR 코스닥", 2),
    ("코인", "비트코인 OR 가상자산", 2),
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


out = {"updated": int(time.time()), "lows": lows(), "news": news()}
if not out["lows"] and not out["news"]:
    raise SystemExit("no data")
json.dump(out, open("dash.json", "w"), ensure_ascii=False, separators=(",", ":"))
print({"lows": len(out["lows"]), "news": len(out["news"])})
