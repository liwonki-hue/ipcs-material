# ISO PDF의 벡터 글자 경로를 굵은 선으로 다시 그려 행/셀 단위로 인식하고 BOM 표 행으로 파싱하는 모듈
import re, fitz, numpy as np
from collections import Counter
from PIL import Image, ImageDraw


def small_paths(pg, region, maxdim=9.0):
    """region(보이는 방향 좌표) 안의 작은 벡터 경로를 보이는 방향 좌표로 변환해 반환한다."""
    mat = pg.rotation_matrix
    rotated = pg.rotation != 0
    out = []
    for d in pg.get_drawings():
        r = d["rect"]
        if rotated:
            r = fitz.Rect(r * mat).normalize()
        if r.x1 < region.x0 or r.x0 > region.x1 or r.y1 < region.y0 or r.y0 > region.y1:
            continue
        if (r.x1 - r.x0) > maxdim or (r.y1 - r.y0) > maxdim:
            continue
        segs, curve = [], False
        for it in d["items"]:
            k = it[0]
            if k == "l":
                pts = [it[1], it[2]]
            elif k == "c":
                p0, p1, p2, p3 = it[1:5]; curve = True
                if rotated:
                    p0, p1, p2, p3 = [p * mat for p in (p0, p1, p2, p3)]
                bez = []
                for t in np.linspace(0, 1, 9):
                    a = (1 - t) ** 3; b = 3 * t * (1 - t) ** 2; c = 3 * t * t * (1 - t); e = t ** 3
                    bez.append((a * p0.x + b * p1.x + c * p2.x + e * p3.x, a * p0.y + b * p1.y + c * p2.y + e * p3.y))
                for u, v in zip(bez, bez[1:]):
                    segs.append(("l", [u, v]))
                continue
            elif k == "re":
                q = it[1].quad; pts = [q.ul, q.ur, q.lr, q.ll]; k = "poly"
            elif k == "qu":
                q = it[1]; pts = [q.ul, q.ur, q.lr, q.ll]; k = "poly"
            else:
                continue
            if rotated:
                pts = [p * mat for p in pts]
            segs.append((k, [(p.x, p.y) for p in pts]))
        out.append({"r": (r.x0, r.y0, r.x1, r.y1), "segs": segs, "curve": curve})
    return out


def is_lone_one(cell, ch):
    """글자 하나짜리 좁은 셀(줄기+작은 갈고리)이면 '1' 로 본다."""
    if len(cell) != 1:
        return False
    r = cell[0]["r"]
    return (r[2] - r[0]) <= 0.5 * ch and (r[3] - r[1]) >= 0.9 * ch


def _draw_std_one(dr, X, Y, cell, ch):
    r = cell[0]["r"]
    xs = r[2]
    dr.line([(X(xs), Y(r[1])), (X(xs), Y(r[3]))], fill=0, width=3)
    dr.line([(X(xs), Y(r[1])), (X(xs - 0.32 * ch), Y(r[1] + 0.28 * ch))], fill=0, width=3)


def cap_height(paths):
    hs = Counter(round(d["r"][3] - d["r"][1], 1) for d in paths if 2.0 < d["r"][3] - d["r"][1] < 8)
    return hs.most_common(1)[0][0] if hs else 3.5


def group_rows(paths, ch):
    """기준선(y1)이 같은 글자들을 한 행으로 묶고, 작은 글리프(점·쉼표·따옴표)는 같은 x 근처에 글자가 있는 행에 붙인다."""
    H = lambda d: d["r"][3] - d["r"][1]
    main = sorted([d for d in paths if H(d) >= 0.72 * ch], key=lambda d: d["r"][3])
    groups = []
    for d in main:
        if groups and d["r"][3] - groups[-1][-1]["r"][3] <= 0.45 * ch:
            groups[-1].append(d)
        else:
            groups.append([d])
    rows = []
    for g in groups:
        b = Counter(round(d["r"][3], 2) for d in g).most_common(1)[0][0]
        rows.append({"b": b, "ps": list(g), "yc": b - ch / 2})
    for d in paths:
        if H(d) >= 0.72 * ch or not rows:
            continue
        yc = (d["r"][1] + d["r"][3]) / 2
        xc = (d["r"][0] + d["r"][2]) / 2
        best, bd = None, 1e9
        for r in rows:
            dy = abs(r["yc"] - yc)
            if dy > 0.95 * ch or dy >= bd:
                continue
            if any(abs((m["r"][0] + m["r"][2]) / 2 - xc) <= 2.2 * ch for m in r["ps"]):
                best, bd = r, dy
        if best is None:                      # 근처에 큰 글자가 없는 열(예: 쪼개진 숫자) → 세로로 가장 가까운 행
            cand = [(abs(r["yc"] - yc), r) for r in rows if abs(r["yc"] - yc) <= 0.75 * ch]
            if cand:
                best = min(cand, key=lambda z: z[0])[1]
        if best is not None:
            best["ps"].append(d)
    return sorted(rows, key=lambda r: r["b"])


def split_cells(row, ch, gap_ratio=1.7):
    ps = sorted(row["ps"], key=lambda d: d["r"][0])
    cells, cur, xr = [], [], None
    for d in ps:
        if cur and d["r"][0] - xr > gap_ratio * ch:
            cells.append(cur); cur = []; xr = None
        cur.append(d); xr = d["r"][2] if xr is None else max(xr, d["r"][2])
    if cur:
        cells.append(cur)
    return cells


def render_cell(cell, yc, ch):
    px = 42.0 / ch; lw = 3
    x0 = min(d["r"][0] for d in cell); x1 = max(d["r"][2] for d in cell)
    top, bot = yc - 0.95 * ch, yc + 0.95 * ch
    pad = 0.6 * ch
    w = int((x1 - x0 + 2 * pad) * px) + 1; h = int((bot - top) * px) + 1
    im = Image.new("L", (w, h), 255); dr = ImageDraw.Draw(im)
    X = lambda x: (x - x0 + pad) * px
    Y = lambda y: (y - top) * px
    for d in cell:
        for k, pts in d["segs"]:
            if k == "l":
                dr.line([(X(pts[0][0]), Y(pts[0][1])), (X(pts[1][0]), Y(pts[1][1]))], fill=0, width=lw)
            elif k == "poly":
                dr.polygon([(X(x), Y(y)) for x, y in pts], fill=0)
    return np.array(im.convert("RGB")), x0, x1


def read_rows(pg, ocr, region):
    """region 내 모든 텍스트 행을 인식해 [{'y','cells':[(x0,x1,text,conf)]}] 로 반환 (y 오름차순)"""
    paths = small_paths(pg, region)
    if not paths:
        return []
    ch = cap_height(paths)
    paths = [d for d in paths if not d["curve"] and (d["r"][2] - d["r"][0]) <= 1.6 * ch and (d["r"][3] - d["r"][1]) <= 1.7 * ch and not 1.12 * ch < (d["r"][3] - d["r"][1]) < 1.35 * ch
             and not ((d["r"][3] - d["r"][1]) > 1.12 * ch and len(d["segs"]) > 1)]
    rows = group_rows(paths, ch)
    jobs = []
    for ri, row in enumerate(rows):
        for cell in split_cells(row, ch):
            arr, x0, x1 = render_cell(cell, row["yc"], ch)
            jobs.append((ri, x0, x1, arr))
    out = [{"y": r["yc"], "ch": ch, "cells": []} for r in rows]
    if jobs:
        res = ocr.text_recognizer([j[3] for j in jobs])[0]
        for (ri, x0, x1, _), (t, c) in zip(jobs, res):
            out[ri]["cells"].append((round(x0, 1), round(x1, 1), t.strip(), float(c)))
    for r in out:
        r["cells"].sort()
    return [r for r in out if r["cells"]]


# ---------------------------------------------------------------------------
# 짧은 셀(번호·사이즈·수량) 투표 인식 + BOM 표 구조 파서
# ---------------------------------------------------------------------------
VARIANTS = [(42.0, 3), (36.0, 2), (48.0, 4)]


def _render_variant(cell, yc, ch, px_cap, lw):
    px = px_cap / ch
    x0 = min(d["r"][0] for d in cell); x1 = max(d["r"][2] for d in cell)
    top, bot = yc - 0.95 * ch, yc + 0.95 * ch
    pad = 0.6 * ch
    w = int((x1 - x0 + 2 * pad) * px) + 1; h = int((bot - top) * px) + 1
    im = Image.new("L", (w, h), 255); dr = ImageDraw.Draw(im)
    X = lambda x: (x - x0 + pad) * px
    Y = lambda y: (y - top) * px
    if is_lone_one(cell, ch):
        _draw_std_one(dr, X, Y, cell, ch)
        return np.array(im.convert("RGB"))
    for d in cell:
        for k, pts in d["segs"]:
            if k == "l":
                dr.line([(X(pts[0][0]), Y(pts[0][1])), (X(pts[1][0]), Y(pts[1][1]))], fill=0, width=lw)
            elif k == "poly":
                dr.polygon([(X(x), Y(y)) for x, y in pts], fill=0)
    return np.array(im.convert("RGB"))


def read_rows_vote(pg, ocr, region):
    """read_rows 와 같지만 짧은 셀은 3가지 굵기/크기로 렌더링해 다수결로 확정한다."""
    paths = small_paths(pg, region)
    if not paths:
        return []
    ch = cap_height(paths)
    paths = [d for d in paths if not d["curve"] and (d["r"][2] - d["r"][0]) <= 1.6 * ch and (d["r"][3] - d["r"][1]) <= 1.7 * ch and not 1.12 * ch < (d["r"][3] - d["r"][1]) < 1.35 * ch
             and not ((d["r"][3] - d["r"][1]) > 1.12 * ch and len(d["segs"]) > 1)]
    rows = group_rows(paths, ch)
    jobs, meta, cellmap = [], [], {}
    for ri, row in enumerate(rows):
        for cell in split_cells(row, ch):
            cellmap[id(cell)] = cell
            x0 = min(d["r"][0] for d in cell); x1 = max(d["r"][2] for d in cell)
            short = (x1 - x0) < 14 * ch
            for v, (pc, lw) in enumerate(VARIANTS[:1]):
                jobs.append(_render_variant(cell, row["yc"], ch, pc, lw))
                meta.append((ri, x0, x1, id(cell), v))
    res = ocr.text_recognizer(jobs)[0] if jobs else []
    cellres = {}
    for (ri, x0, x1, cid, v), (t, c) in zip(meta, res):
        cellres.setdefault((ri, x0, x1, cid), []).append((t.strip(), float(c)))
    out = [{"y": r["yc"], "ch": ch, "cells": [], "ps": r["ps"]} for r in rows]
    for (ri, x0, x1, cid), lst in cellres.items():
        votes = Counter(t for t, c in lst)
        top_t, n = votes.most_common(1)[0]
        if n == 1 and len(lst) > 1:                      # 전부 다르면 신뢰도 최고값
            top_t = max(lst, key=lambda z: z[1])[0]
        conf = max(c for t, c in lst if t == top_t)
        if is_lone_one(cellmap[cid], ch) and top_t in ("", "4", "7", "l", "I", "|", "1"):
            top_t, conf = "1", max(conf, 0.5)
        out[ri]["cells"].append((round(x0, 1), round(x1, 1), top_t, conf, n if len(lst) > 1 else 0, cellmap[cid]))
    for r in out:
        r["cells"].sort()
    return [r for r in out if r["cells"]]


_LETTERS = re.compile(r"[A-Za-z]")
_STOP = ("INCH", "LENGTH", "PIECE", "REMARKS", "NPD", "<MM>", "(MM)", "FABRICATION", "ERECTION", "MATERIAL", "WEIGHT", "TOTAL", "COMPONENT", "DESCRIPTION")


def _is_desc(t):
    u = t.upper()
    if len(_LETTERS.findall(t)) < 4 or any(k in u for k in _STOP):
        return False
    from difflib import SequenceMatcher as _SM
    return _SM(None, u, "COMPONENT DESCRIPTION").ratio() < 0.62 and _SM(None, u, "FABRICATION MATERIALS").ratio() < 0.62


def _is_numeric(t):
    return bool(re.search(r"\d", t)) and re.fullmatch(r"[\d\s./X×x\"″”′'“:–\-M()]*", t) is not None


def parse_bom(rows):
    """행 목록에서 BOM 표 항목을 추출: [{'desc','cells'(숫자 셀),'y','ps','ch','colx'}]"""
    rows = sorted(rows, key=lambda r: r["y"])
    # 컷 파이프 표부터는 BOM이 아님
    cut_y = next((r["y"] for r in rows if "CUT" in " ".join(c[2] for c in r["cells"]).upper() and "PIPE" in " ".join(c[2] for c in r["cells"]).upper()), None)
    if cut_y is not None:
        rows = [r for r in rows if r["y"] < cut_y]
    # 머리글에서 열 위치 확보
    hdr = {}
    for r in rows:
        for c in r["cells"]:
            u = c[2].upper().replace(" ", "")
            if u.startswith("SIZE"): hdr.setdefault("size", c[0])
            elif u.startswith("QTY") or u.startswith("Q'TY") or u.startswith("QTY"): hdr.setdefault("qty", c[0])
            elif u.startswith("WEIGHT"): hdr.setdefault("weight", c[0])
    # 항목 시작 후보: 설명 셀 바로 왼쪽에 (읽힌 값이 무엇이든) NO 셀이 있는 행
    cands = []
    for r in rows:
        c = r["cells"]
        for i in range(1, len(c)):
            if _is_desc(c[i][2]) and 6 <= c[i][0] - c[i - 1][0] <= 40 and not _is_desc(c[i - 1][2]) and c[i - 1][2] != "" or \
               (i >= 1 and _is_desc(c[i][2]) and 6 <= c[i][0] - c[i - 1][0] <= 40 and c[i - 1][2] == ""):
                cands.append((c[i - 1][0], c[i][0], r)); break
    if not cands:
        return []
    no_x = Counter(round(a) for a, _, _ in cands).most_common(1)[0][0]
    cands = [x for x in cands if abs(x[0] - no_x) <= 4]
    desc_x = Counter(round(b) for _, b, _ in cands).most_common(1)[0][0]
    start_y = min(x[2]["y"] for x in cands)
    ch = rows[0]["ch"]
    ys = sorted(x[2]["y"] for x in cands)
    gaps = [b - a for a, b in zip(ys, ys[1:]) if 0 < b - a < 40]
    pitch = float(np.median(gaps)) if gaps else 2.6 * ch
    # 항목 행 수집
    items, cur, last_y = [], None, None
    for r in rows:
        if r["y"] < start_y - 1:
            continue
        cells = r["cells"]
        txt = " ".join(c[2] for c in cells).upper()
        if "TOTAL" in txt:
            cur = None; continue
        nocell = next((c for c in cells if abs(c[0] - no_x) <= 4 and not _is_desc(c[2])), None)
        desc_cells = [c for c in cells if _is_desc(c[2]) or (c[0] >= desc_x - 4 and not _is_numeric(c[2]) and c[2] and c[0] < desc_x + 200 and cur is not None and nocell is None)]
        num_cells = [c for c in cells if (c[2] == "" or _is_numeric(c[2])) and c[0] > desc_x + 30 and c not in desc_cells]
        first_desc = next((c for c in desc_cells if abs(c[0] - desc_x) <= 4), None)
        if first_desc is None and desc_cells is not None:
            short = next((c for c in cells if abs(c[0] - desc_x) <= 4 and not _is_numeric(c[2]) and len(_LETTERS.findall(c[2])) >= 2 and not any(k in c[2].upper() for k in _STOP)), None)
            if short is not None and len(_LETTERS.findall(" ".join(c[2] for c in cells if c[0] >= desc_x - 4 and not _is_numeric(c[2])))) >= 4:
                first_desc = short; desc_cells = [c for c in cells if c[0] >= desc_x - 4 and not _is_numeric(c[2]) and c[2] and c[0] < desc_x + 200]
        if (nocell is not None or num_cells) and first_desc is not None:
            cur = {"desc": " ".join(c[2] for c in desc_cells), "cells": list(num_cells), "y": r["y"], "ps": r["ps"], "ch": r["ch"], "hdr": hdr,
                   "desc_cells": list(desc_cells), "desc_extra": []}
            items.append(cur); last_y = r["y"]
        elif cur is not None and desc_cells and nocell is None and r["y"] - last_y <= 1.9 * pitch:
            cur["desc"] += " " + " ".join(c[2] for c in desc_cells)
            cur["desc_extra"].append(" ".join(c[2] for c in desc_cells))
            cur["cells"] += num_cells; last_y = r["y"]
        elif cur is not None and r["y"] - last_y > 1.9 * pitch:
            cur = None
    # 열 위치: 머리글 우선, 없으면 숫자 셀 군집
    allx = sorted(c[0] for it in items for c in it["cells"])
    cols = []
    for x in allx:
        if cols and x - cols[-1][-1] <= 8: cols[-1].append(x)
        else: cols.append([x])
    need = max(2, int(0.3 * len(items)))
    clusters = [float(np.median(c)) for c in cols if len(c) >= need]
    if not clusters:
        clusters = [float(np.median(c)) for c in cols]
    if "size" in hdr and "qty" in hdr and "weight" in hdr:
        colx = [hdr["size"], hdr["qty"], hdr["weight"]]
    else:
        colx = clusters[:3]
    for it in items:
        size = qty = wt = None
        it["kinds"] = []
        for c in sorted(it["cells"], key=lambda c: c[0]):
            if not colx:
                break
            k = min(range(len(colx)), key=lambda i: abs(colx[i] - c[0]))
            kind = ("size", "qty", "weight")[k]
            if kind not in it["kinds"]:
                it["kinds"].append(kind)
                it.setdefault("gcount", {})[kind] = glyph_count(c[5], it["ch"])
            if kind == "size" and size is None: size = c
            elif kind == "qty" and qty is None: qty = c
            elif kind == "weight" and wt is None: wt = c
        it["size"], it["size_conf"] = (size[2], size[3]) if size else (None, 0)
        it["qty"], it["qty_conf"] = (qty[2], qty[3]) if qty else (None, 0)
        it["weight"] = wt[2] if wt else None
        it["colx"] = colx
    return items


def _render_composite(cells, yc, ch, px_cap, lw, gap=1.5):
    """셀 목록(각각 경로 리스트)을 간격을 글자 한 칸 정도로 줄여 한 줄 이미지로 렌더링한다."""
    px = px_cap / ch
    top, bot = yc - 0.95 * ch, yc + 0.95 * ch
    pad = 0.6 * ch
    spans = [(min(d["r"][0] for d in c), max(d["r"][2] for d in c)) for c in cells]
    total = sum(x1 - x0 for x0, x1 in spans) + gap * ch * (len(cells) - 1)
    w = int((total + 2 * pad) * px) + 1; h = int((bot - top) * px) + 1
    im = Image.new("L", (w, h), 255); dr = ImageDraw.Draw(im)
    cursor = pad
    for c, (x0, x1) in zip(cells, spans):
        off = cursor - x0
        X = lambda x, off=off: (x + off) * px
        Y = lambda y: (y - top) * px
        if is_lone_one(c, ch):
            _draw_std_one(dr, X, Y, c, ch)
            cursor += (x1 - x0) + gap * ch
            continue
        for d in c:
            for k, pts in d["segs"]:
                if k == "l":
                    dr.line([(X(pts[0][0]), Y(pts[0][1])), (X(pts[1][0]), Y(pts[1][1]))], fill=0, width=lw)
                elif k == "poly":
                    dr.polygon([(X(x), Y(y)) for x, y in pts], fill=0)
        cursor += (x1 - x0) + gap * ch
    return np.array(im.convert("RGB"))


def refine_right(items, ocr):
    """항목 행의 숫자 셀(사이즈·수량·중량)을 좁은 간격으로 이어 붙여 한 줄 문맥으로 다시 인식한다."""
    jobs, idx = [], []
    for k, it in enumerate(items):
        cells = [c[5] for c in sorted(it["cells"], key=lambda c: c[0])]
        if not cells:
            continue
        for v, (pc, lw) in enumerate(VARIANTS):
            jobs.append(_render_composite(cells, it["y"], it["ch"], pc, lw)); idx.append((k, v))
    res = ocr.text_recognizer(jobs)[0] if jobs else []
    per = {}
    for (k, v), (t, c) in zip(idx, res):
        per.setdefault(k, []).append((t.strip(), float(c)))
    for k, lst in per.items():
        votes = Counter(t for t, c in lst)
        t, n = votes.most_common(1)[0]
        if n == 1:
            t = max(lst, key=lambda z: z[1])[0]
        items[k]["right_text"] = t
        items[k]["right_conf"] = max(c for tt, c in lst if tt == t)
        items[k]["right_votes"] = n
    return items


# ---------------------------------------------------------------------------
# 오른쪽 셀 문법 분할 (사이즈 / 수량 / 중량)
# ---------------------------------------------------------------------------
from difflib import SequenceMatcher

_FULL = str.maketrans({"１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "６": "6", "７": "7", "８": "8", "９": "9", "０": "0",
                       "Ｘ": "X", "×": "X", "x": "X", "．": ".", "／": "/", "ｍ": "M", "m": "M"})
_SZ = re.compile(r"\d{1,3}(?:\.\d/\d{1,2}|/\d{1,2}|\.\d{1,2})?(?:X\d{1,3}(?:/\d{1,2}|\.\d{1,2})?)?")
_QTY_M = re.compile(r"\d{1,3}(?:\.\d{1,2})?M")
_QTY_EA = re.compile(r"\d{1,4}")
_WT = re.compile(r"\d{1,5}\.?\d")


def _norm_right(t):
    import unicodedata
    t = unicodedata.normalize("NFKC", t or "").translate(_FULL)
    t = re.sub(r"[\"'”″“’′‘`~～\s\-–—_*()（）,，。、:;!?|<>]", "", t)
    return t


def _sim(a, b):
    return SequenceMatcher(None, a or "", b or "").ratio()


def resolve_right(it):
    """합성 인식 문자열을 (size, qty, uom, weight)로 분할. 열 구성(kinds)이 알려져 있으면 그 개수로만 분할하고,
    셀 단위 1차 인식값과 가장 가까운 분할을 고른다."""
    S = _norm_right(it.get("right_text"))
    cs, cq, cw = _norm_right(it.get("size")), _norm_right(it.get("qty")), _norm_right(it.get("weight"))
    kinds = tuple(it.get("kinds") or ())

    def valid(kind, tok):
        if kind == "size": return bool(_SZ.fullmatch(tok))
        if kind == "qty": return bool(_QTY_M.fullmatch(tok) or _QTY_EA.fullmatch(tok))
        return bool(_WT.fullmatch(tok))

    def seg(parts_kinds, text):
        if len(parts_kinds) == 1:
            if valid(parts_kinds[0], text): yield [text]
            return
        for i in range(1, len(text)):
            if valid(parts_kinds[0], text[:i]):
                for rest in seg(parts_kinds[1:], text[i:]):
                    yield [text[:i]] + rest

    tries = [kinds] if kinds else []
    tries += [("size", "qty", "weight"), ("size", "qty"), ("qty", "weight"), ("qty",)]
    ref = {"size": cs, "qty": cq, "weight": cw}
    for pk in dict.fromkeys(tries):
        best = None
        for parts in seg(list(pk), S) if S else []:
            sc = 0.0
            for k, tok in zip(pk, parts):
                sc += (1.2 if k == "qty" else 1.0 if k == "size" else 0.6) * _sim(tok, ref[k])

                if k == "qty" and _QTY_M.fullmatch(tok): sc += 0.05
                if k == "qty": sc -= 0.02 * len(tok)
            if best is None or sc > best[0]:
                best = (sc, dict(zip(pk, parts)))
        if best is not None:
            d = best[1]; q = d.get("qty"); isM = bool(q and _QTY_M.fullmatch(q))
            return {"size": d.get("size"), "qty": q.rstrip("M") if q else None, "uom": ("M" if isM else "EA") if q else None,
                    "weight": d.get("weight"), "resolved": True, "score": round(best[0], 2), "mode": "+".join(pk)}
    return {"size": it.get("size"), "qty": it.get("qty"), "uom": None, "weight": it.get("weight"), "resolved": False}



def refine_desc(items, ocr):
    """첫 줄 설명이 여러 조각으로 쪼개진 항목은 원래 간격 그대로 한 줄로 합쳐 다시 인식한다."""
    jobs, idx = [], []
    for k, it in enumerate(items):
        dc = it.get("desc_cells") or []
        if len(dc) <= 1:
            continue
        paths = [p for c in dc for p in c[5]]
        for v, (pc, lw) in enumerate(VARIANTS):
            jobs.append(_render_variant(paths, it["y"], it["ch"], pc, lw)); idx.append((k, v))
    res = ocr.text_recognizer(jobs)[0] if jobs else []
    per = {}
    for (k, v), (t, c) in zip(idx, res):
        per.setdefault(k, []).append((t.strip(), float(c)))
    for k, lst in per.items():
        votes = Counter(t for t, c in lst)
        t, n = votes.most_common(1)[0]
        if n == 1:
            t = max(lst, key=lambda z: z[1])[0]
        extra = " ".join(items[k].get("desc_extra") or [])
        items[k]["desc_joined"] = items[k]["desc"]
        items[k]["desc"] = (t + (" " + extra if extra else "")).strip()
    return items


def glyph_count(cell, ch):
    """셀의 글자 수 추정: 따옴표(상단 작은 획)는 제외하고 같은 bbox의 중복 획(X 등)은 하나로 센다."""
    boxes = set()
    base = max(d["r"][3] for d in cell)
    for d in cell:
        r = d["r"]
        if r[3] < base - 0.55 * ch and (r[3] - r[1]) < 0.6 * ch:
            continue                           # 따옴표 획
        boxes.add((round(r[0], 1), round(r[1], 1), round(r[2], 1), round(r[3], 1)))
    return len(boxes)
