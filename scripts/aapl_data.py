"""AAPL 52주 고점 대비 하락률을 aapl.json 으로 저장 (GitHub Actions). 실패 시 파일을 만들지 않음."""
import json
import sys
import time
import urllib.request

req = urllib.request.Request(
    "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1y&interval=1d",
    headers={"user-agent": "Mozilla/5.0"},
)
try:
    r = json.load(urllib.request.urlopen(req, timeout=30))["chart"]["result"][0]
    price = float(r["meta"]["regularMarketPrice"])
    highs = [h for h in r["indicators"]["quote"][0]["high"] if h]
    hi = max(max(highs), price)
except Exception as e:
    print("aapl fetch failed:", e)
    sys.exit(1)

out = {"updated": int(time.time()), "price": round(price, 2), "high52": round(hi, 2), "dd": round((price / hi - 1) * 100, 2)}
json.dump(out, open("aapl.json", "w"))
print(out)
