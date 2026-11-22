"""SCHG, VOO, QQQM, SCHD 의 OHLC 봉을 가져와 smc.json 으로 저장 (GitHub Actions가 15분마다 실행)."""
import json
import time

import pandas as pd
import yfinance as yf

SYMS = ["SCHG", "VOO", "QQQM", "SCHD", "^KS11"]
ALIAS = {"^KS11": "KOSPI"}  # 야후 심볼 -> 차트 키
JOBS = {            # 키: (기간, 봉간격, 최대 봉수)
    "1h": ("730d", "1h", 5000),
    "1d": ("max", "1d", 3000),
    "1w": ("max", "1wk", 1500),
}


def to_ts(t):
    t = pd.Timestamp(t)
    if t.tzinfo is None:
        t = t.tz_localize("UTC")
    return int(t.timestamp())


out = {"updated": int(time.time()), "data": {}}
for s in SYMS:
    out["data"][ALIAS.get(s, s)] = {}
    for key, (period, interval, cap) in JOBS.items():
        rows = []
        try:
            df = yf.download(s, period=period, interval=interval, auto_adjust=False, progress=False)
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            df = df[["Open", "High", "Low", "Close"]].dropna()
            rows = [[to_ts(t), round(float(r.Open), 3), round(float(r.High), 3),
                     round(float(r.Low), 3), round(float(r.Close), 3)] for t, r in df.iterrows()]
            rows = rows[-cap:]
        except Exception as e:  # 한 종목 실패해도 나머지는 저장
            print("fail", s, key, e)
        out["data"][ALIAS.get(s, s)][key] = rows

with open("smc.json", "w") as f:
    json.dump(out, f, separators=(",", ":"))
print({s: {k: len(v) for k, v in d.items()} for s, d in out["data"].items()})
