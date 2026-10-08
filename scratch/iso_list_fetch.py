# ipcs-drawing DB에서 VOID 제외 최신 Revision ISO 목록과 PDF 링크를 조회해 JSON으로 저장하는 읽기 전용 스크립트
import os, json, sys, urllib.request, urllib.parse
sys.stdout.reconfigure(encoding="utf-8")
ENV = r"C:\Users\PCLOVE\Downloads\ipcs-drawing\.env"
env = {}
for l in open(ENV, encoding="utf-8"):
    l = l.strip()
    if l and not l.startswith("#") and "=" in l:
        k, v = l.split("=", 1); env[k.strip()] = v.strip().strip('"').strip("'")
URL, KEY = env["SUPABASE_URL"].rstrip("/"), env["SUPABASE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept-Profile": "drawing"}
rows, off = [], 0
while True:
    qs = urllib.parse.urlencode({"select": "*", "order": "id.asc", "limit": "1000", "offset": str(off)})
    ch = json.loads(urllib.request.urlopen(urllib.request.Request(f"{URL}/rest/v1/dwg_iso?{qs}", headers=H), timeout=60).read())
    rows += ch
    if len(ch) < 1000: break
    off += 1000
latest = {}
for r in rows:
    d = r["drawing_no"]
    if d not in latest or r["revision"] > latest[d]["revision"]:
        latest[d] = r
out = [r for r in latest.values() if r["revision"] != "VOID"]
json.dump(out, open("iso_latest.json", "w", encoding="utf-8"), ensure_ascii=False)
print(len(rows), len(latest), len(out)); print(list(out[0].keys())); print(out[0])
