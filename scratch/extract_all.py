# 최신 Revision ISO PDF 전체에서 BOM 표(PT NO/설명/사이즈/수량)를 벡터 글자 재렌더링 인식으로 추출해 JSON 캐시에 저장하는 스크립트
import fitz, sys, json, os, time, random
from multiprocessing import Pool
sys.path.insert(0, ".")
from vecread import *
sys.stdout.reconfigure(encoding="utf-8")

def init():
    global ocr
    from rapidocr_onnxruntime import RapidOCR
    ocr = RapidOCR(intra_op_num_threads=1, inter_op_num_threads=1)

def job(args):
    name, outdir = args
    out = f"{outdir}/{name}.json"
    if os.path.exists(out):
        return 0
    try:
        pg = fitz.open(f"iso_pdf/{name}.pdf")[0]
        W, H = pg.rect.width, pg.rect.height
        rows = read_rows_vote(pg, ocr, fitz.Rect(W * .66, 0, W, H * .55))
        items = refine_desc(refine_right(parse_bom(rows), ocr), ocr)
        res = []
        for it in items:
            r = resolve_right(it)
            res.append({"no": None, "desc": it["desc"], "size": r["size"], "qty": r["qty"], "uom": r["uom"], "resolved": r["resolved"],
                        "score": r.get("score"), "mode": r.get("mode"), "right_text": it.get("right_text"), "qty_conf": it.get("qty_conf"),
                        "right_conf": it.get("right_conf"), "cell_size": it["size"], "cell_qty": it["qty"]})
        json.dump({"rows": len(rows), "items": res}, open(out, "w", encoding="utf-8"), ensure_ascii=False)
        return 1
    except Exception as e:
        open(f"{outdir}/_errors.log", "a", encoding="utf-8").write(f"{name}\t{type(e).__name__}: {e}\n")
        return -1

if __name__ == "__main__":
    outdir = sys.argv[1]; limit = int(sys.argv[2]) if len(sys.argv) > 2 else 0; procs = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    os.makedirs(outdir, exist_ok=True)
    names = sorted(f[:-4] for f in os.listdir("iso_pdf") if f.endswith(".pdf") and f.startswith("CCP"))
    if limit:
        random.seed(11); names = random.sample(names, limit)
    t0 = time.time(); n = 0
    with Pool(procs, initializer=init) as p:
        for i, r in enumerate(p.imap_unordered(job, [(x, outdir) for x in names], chunksize=2)):
            n += (r == 1)
            if i % 50 == 0: print(i, len(names), "%.0fs" % (time.time() - t0), flush=True)
    print("finished", n, "%.0fs" % (time.time() - t0))
