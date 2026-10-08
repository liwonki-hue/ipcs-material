# 최신 Revision ISO PDF 전체를 병렬 다운로드하고 텍스트 유무를 집계하는 스크립트
import json, urllib.request, fitz, os, sys
from concurrent.futures import ThreadPoolExecutor
sys.stdout.reconfigure(encoding="utf-8")
data = json.load(open("iso_latest.json", encoding="utf-8"))
def job(r):
    p = f"iso_pdf/{r['drawing_no']}_{r['revision']}.pdf"
    try:
        if not os.path.exists(p) or os.path.getsize(p) < 1000:
            open(p, "wb").write(urllib.request.urlopen(r["file_link"], timeout=90).read())
        d = fitz.open(p); t = "".join(pg.get_text() for pg in d)
        return (r["drawing_no"], len(d), len(t), "ERECTION WEIGHT" in t or "COMPONENT" in t, None)
    except Exception as e:
        return (r["drawing_no"], 0, 0, False, str(e)[:100])
with ThreadPoolExecutor(8) as ex:
    res = list(ex.map(job, [r for r in data if r["file_link"]]))
json.dump(res, open("iso_dl_stat.json", "w"))
print("total", len(res), "err", sum(1 for x in res if x[4]), "no-text", sum(1 for x in res if x[2] < 500), "multi-page", sum(1 for x in res if x[1] > 1))
