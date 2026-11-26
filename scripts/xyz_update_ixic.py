import json, sys, urllib.request

URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?range=10y&interval=1d"
OUT = "xyz-data/ixic.json"

req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.load(r)

res = (data.get("chart") or {}).get("result")
if not res or not res[0].get("timestamp"):
    sys.exit("Empty response from Yahoo. Keeping the old file.")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(data, f, separators=(",", ":"))
print("saved", OUT, len(res[0]["timestamp"]), "bars")
