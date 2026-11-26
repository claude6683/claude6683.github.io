import json
import os
import sys
import urllib.request

HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
PATH = "/v8/finance/chart/%5EKS11?range=700d&interval=60m"
OUT = "xyz-data/kospi60.json"


def fetch(host):
    req = urllib.request.Request(
        "https://" + host + PATH,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def ok(j):
    try:
        res = j["chart"]["result"][0]
        return len(res["timestamp"]) > 100
    except Exception:
        return False


for h in HOSTS:
    try:
        j = fetch(h)
        if ok(j):
            os.makedirs("xyz-data", exist_ok=True)
            with open(OUT, "w") as f:
                json.dump(j, f)
            print("saved from", h)
            sys.exit(0)
        print("empty response from", h)
    except Exception as e:
        print("failed", h, e)

print("all hosts failed; keeping existing file")
sys.exit(1)
