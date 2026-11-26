import json
import os
import urllib.request

URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5EKS11?range=10y&interval=1d"
OUT = "xyz-data/kospi.json"

req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.loads(r.read().decode("utf-8"))

ok = False
try:
    res = data["chart"]["result"][0]
    ok = len(res["timestamp"]) > 0
except Exception:
    ok = False

if ok:
    os.makedirs("data", exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f)
    print("saved", OUT, len(res["timestamp"]), "rows")
else:
    print("empty response - keep existing file")
