"""QQQM, VOO, SCHD 시세를 가져와 data.json 으로 저장 (GitHub Actions가 5분마다 실행)."""
import json
import time

import pandas as pd
import yfinance as yf

SYMS = ["QQQM", "VOO", "SCHD"]
RANGES = {
    "1H": ("1d", "1m"),
    "2D": ("5d", "5m"),
    "7D": ("1mo", "30m"),
    "1M": ("1mo", "60m"),
    "1Y": ("1y", "1d"),
    "5Y": ("5y", "1wk"),
    "10Y": ("10y", "1wk"),
    "20Y": ("max", "1wk"),
}

out = {"updated": int(time.time()), "data": {}}
for tf, (period, interval) in RANGES.items():
    out["data"][tf] = {}
    for s in SYMS:
        pts = []
        try:
            df = yf.download(s, period=period, interval=interval,
                             prepost=interval in ("1m", "5m", "30m"),
                             auto_adjust=False, progress=False)
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            close = df["Close"].dropna()
            pts = [[int(t.timestamp()), round(float(v), 4)] for t, v in close.items()]
        except Exception as e:  # 한 종목 실패해도 나머지는 저장
            print("fail", tf, s, e)
        out["data"][tf][s] = pts

with open("data.json", "w") as f:
    json.dump(out, f, separators=(",", ":"))
print({tf: {s: len(v) for s, v in d.items()} for tf, d in out["data"].items()})
