"""충남 선상 빈자리(선상24)를 수집해 fishing.json 으로 저장 (GitHub Actions가 1시간마다 실행).
Apps Script fishing.gs 의 fishing_collectAll 을 그대로 옮긴 것."""
import json
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

NDAYS = 7
API_AREA = "-403,501,497,499,496,502,500,498"
FISH_ANY = re.compile("주꾸미|쭈꾸미|갑오징어|문어|참돔|우럭")
PIN = [{"no": 515, "name": "라이즈호"}, {"no": 1080, "name": "뉴시아호"}]
MAX_PAGES = 15
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.sunsang24.com/",
}
KST = timezone(timedelta(hours=9))


def api_url(date, page, search=""):
    p = {
        "area": API_AREA, "area_text": "당진", "area_type": "area", "fish": "",
        "fishing_method_travelout": "", "is_coupon": "", "is_possible": "" if search else "Y",
        "keyword": "", "location": "", "marker_load": "", "page": str(page), "pay": "",
        "sdate": date, "search": search, "type": "general", "use_time": "", "walkthrough": "",
    }
    return "https://api.sunsang24.com/ship/list?" + "&".join(
        k + "=" + urllib.parse.quote(v, safe="") for k, v in p.items())


def fetch_one(q):
    """실패하면 3번까지 재시도. 끝내 실패하면 None."""
    for wait in (0, 3, 10, 20):
        if wait:
            time.sleep(wait)
        try:
            req = urllib.request.Request(api_url(q["date"], q["page"], q.get("search", "")), headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                if r.status == 200:
                    return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            last = e
    print("fetch failed", q, last)
    return None


def row(x):
    return [
        x.get("schedule_no"), x["ship"]["no"], x["ship"]["name"], x["ship"].get("area_sub"),
        (x.get("port_name") or "").strip(), x.get("fish_type") or "",
        (x.get("stime") or "")[:5], (x.get("etime") or "")[:5],
        x.get("remain_embarkation_num") or 0, x.get("embarkation_num"),
        x.get("price") or 0, x.get("fishing_method") or "",
    ]


def main():
    today = datetime.now(KST).date()
    dates = [(today + timedelta(days=i)).isoformat() for i in range(NDAYS)]
    st = {d: {"rows": [], "pins": [], "failed": False} for d in dates}

    reqs = []
    for d in dates:
        reqs.append({"date": d, "page": 1, "kind": "list"})
        for p in PIN:
            reqs.append({"date": d, "page": 1, "search": p["name"], "kind": "pin", "pin": p})

    with ThreadPoolExecutor(max_workers=8) as ex:
        while reqs:
            results = list(ex.map(fetch_one, reqs))
            more = []
            for q, r in zip(reqs, results):
                s = st[q["date"]]
                if r is None:
                    s["failed"] = True
                    continue
                if q["kind"] == "pin":
                    for x in r.get("list") or []:
                        if x.get("type") != "schedule" or x["ship"]["no"] != q["pin"]["no"]:
                            continue
                        s["pins"].append(row(x) + [x.get("schedule_status_code"), x.get("schedule_status_name")])
                    continue
                lst = r.get("list") or []
                any_open = False
                for x in lst:
                    if x.get("type") != "schedule" or x.get("schedule_status_code") != "ING" \
                            or not ((x.get("remain_embarkation_num") or 0) > 0):
                        continue
                    any_open = True
                    if FISH_ANY.search(x.get("fish_type") or ""):
                        s["rows"].append(row(x))
                if any_open and len(lst) >= 30 and q["page"] < MAX_PAGES:
                    more.append({"date": q["date"], "page": q["page"] + 1, "kind": "list"})
            reqs = [q for q in more if not st[q["date"]]["failed"]]

    # 실패한 날짜는 이전 값 유지 (이전 fishing.json 을 데이터 브랜치에서 받아 둠)
    old = {}
    try:
        with open("old_fishing.json", encoding="utf-8") as f:
            old = json.load(f)
    except Exception:  # noqa: BLE001
        pass

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    out = {"days": {}, "pinned": {}, "error": ""}
    errs = []
    for d in dates:
        s = st[d]
        if s["failed"]:
            errs.append(d)
            if d in old.get("days", {}):
                out["days"][d] = old["days"][d]
                out["pinned"][d] = old.get("pinned", {}).get(d, {"date": d, "updatedAt": "", "rows": []})
            continue
        out["days"][d] = {"date": d, "updatedAt": now, "rows": s["rows"]}
        out["pinned"][d] = {"date": d, "updatedAt": now, "rows": s["pins"]}
    if errs:
        out["error"] = "일부 날짜 수집 실패: " + ", ".join(errs)

    # 전부 실패했으면 비정상 → 워크플로 실패 처리 (이전 데이터 보존)
    if len(errs) == len(dates):
        raise SystemExit("모든 날짜 수집 실패 (선상24 접속 차단 가능성)")

    with open("fishing.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("saved", {d: len(out["days"][d]["rows"]) for d in out["days"]}, "errors:", errs or "none")


if __name__ == "__main__":
    main()
