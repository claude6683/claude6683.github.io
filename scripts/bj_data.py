"""웨돔의 비트코인 BTC 포지션을 theddari에서 가져와 bj.json 으로 저장 (GitHub Actions)."""
import json
import sys
import time
import urllib.request

HANDLE = "wedombtc"
Q = {"query": "query BjLiveBoard{bjLiveBoard{result data}}", "operationName": "BjLiveBoard"}

req = urllib.request.Request(
    "https://api.theddari.com/graphql",
    data=json.dumps(Q).encode(),
    headers={"content-type": "application/json", "user-agent": "Mozilla/5.0"},
)
try:
    board = json.load(urllib.request.urlopen(req, timeout=30))["data"]["bjLiveBoard"]["data"]
except Exception as e:
    print("fetch failed:", e)
    sys.exit(1)  # 실패 시 이전 bj.json 유지 (게시 단계가 실행되지 않음)

ch = next((c for c in board["channels"] if c.get("handle") == HANDLE), None)
pos = None
if ch:
    for p in ch.get("positions") or []:
        if p.get("symbol") == "BTC":
            pos = p
            break

out = {"updated": int(time.time()), "live": bool(ch and ch.get("live")), "pos": None}
if pos:
    out["pos"] = {
        "side": pos["side"],            # LONG / SHORT
        "size": pos["size"],            # 152.0
        "pnl": pos["pnlUsd"],           # +44520.8
        "entry": pos["entryPrice"],     # 59006.1
    }
json.dump(out, open("bj.json", "w"), ensure_ascii=False)
print(out)
