# ISO PDF에서 추출한 BOM 항목을 bom 사전으로 MatCode/Mat1/Mat2에 매핑하고 기존 bom과 대조해 Excel로 저장하는 스크립트
import os, re, sys, json, unicodedata, datetime, collections
from difflib import SequenceMatcher
import psycopg2
import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

sys.stdout.reconfigure(encoding="utf-8")
SRC = sys.argv[1] if len(sys.argv) > 1 else "bomx_all"
OUT = sys.argv[2] if len(sys.argv) > 2 else f"../ISO_PDF_BOM_Extract_{datetime.date.today():%y%m%d}.xlsx"

# ---------------------------------------------------------------- 사전/DB
env = {}
for l in open("../.env", encoding="utf-8"):
    if "=" in l and not l.startswith("#"):
        k, v = l.strip().split("=", 1); env[k] = v.strip('"').strip("'")
cur = psycopg2.connect(env["SUPABASE_DB_URL"]).cursor()
cur.execute("select full_description, mat_code, mat1, mat2, uom, category from bom group by 1,2,3,4,5,6")
BOMD = cur.fetchall()
cur.execute("select iso_dwg_no, mat_code, category, uom, sum(qty) from bom group by 1,2,3,4")
BOMSUM = collections.defaultdict(dict)                 # iso -> {(mat_code, desc_key): qty}
ISO_BOM_TOT = collections.defaultdict(lambda: collections.Counter())
for iso, mc, cat, uom, q in cur.fetchall():
    if mc:
        BOMSUM[iso][mc] = BOMSUM[iso].get(mc, 0) + float(q)
    if cat in ("Pipe", "Fitting", "Others"):
        ISO_BOM_TOT[iso][uom] += float(q)
cur.execute("select iso_dwg_no, line_no, count(*) from bom group by 1,2")
BOM_LINE = {}
for iso, ln, n in sorted(cur.fetchall(), key=lambda r: r[2]):
    BOM_LINE[iso] = ln
ISO = {r["drawing_no"]: r for r in json.load(open("iso_latest.json", encoding="utf-8"))}

DN = {0.5: 15, 0.75: 20, 1: 25, 1.25: 32, 1.5: 40, 2: 50, 2.5: 65, 3: 80, 3.5: 90, 4: 100, 5: 125, 6: 150, 8: 200, 10: 250, 12: 300,
      14: 350, 16: 400, 18: 450, 20: 500, 22: 550, 24: 600, 26: 650, 28: 700, 30: 750, 32: 800, 34: 850, 36: 900, 40: 1000, 42: 1050, 48: 1200}


def parse_size(sz):
    """'6X1' / '1/2' / '1.3/8' → [인치 float,...] (실패 시 None)"""
    if not sz:
        return None
    out = []
    for part in re.split(r"[Xx×]", sz):
        part = part.strip()
        m = re.fullmatch(r"(\d+)\.(\d)/(\d+)", part)           # 1.3/8 = 1 3/8
        if m:
            out.append(int(m.group(1)) + int(m.group(2)) / int(m.group(3))); continue
        m = re.fullmatch(r"(\d+)/(\d+)", part)
        if m:
            out.append(int(m.group(1)) / int(m.group(2))); continue
        try:
            out.append(float(part))
        except ValueError:
            return None
    return out


def size_label(inch):
    def f(v):
        for a, b in ((0.5, "1/2"), (0.75, "3/4"), (1.25, "1-1/4"), (1.5, "1-1/2"), (2.5, "2-1/2"), (3.5, "3-1/2"), (1.375, "1-3/8"), (0.625, "5/8"), (0.875, "7/8"), (1.125, "1-1/8")):
            if abs(v - a) < 1e-6: return b
        return str(int(v)) if abs(v - round(v)) < 1e-6 else str(v)
    return "X".join(f(v) for v in inch) + '"'


# ---------------------------------------------------------------- 설명 정규화
ALIAS = [("PIPE NIPPLE", "NIPPLE"), ("COUPLING FULL", "COUPLING-FULL"), ("COUPLING HALF", "COUPLING-HALF")]


def norm_desc(d):
    u = unicodedata.normalize("NFKC", d or "").upper()
    u = u.replace("×", "X")
    u = re.sub(r"(?<=\d)O|O(?=\d)", "0", u)                  # 숫자 옆의 O → 0
    u = re.sub(r"(?<=[A-Z])0(?=[A-Z])", "O", u)              # 글자 사이의 0 → O
    u = re.sub(r"\s*,\s*", ",", u)
    toks = [re.sub(r"\s+", " ", t).strip() for t in u.split(",") if t.strip()]
    out = []
    for t in toks:
        t = re.sub(r"^S-?(\d+S?)$", r"S-\1", t)
        t = re.sub(r"\bS(\d+S?)\b", r"S-\1", t)
        t = re.sub(r"\s*X\s*", " X ", t) if re.search(r"CL\d+|S-\d", t) else t
        for a, b in ALIAS:
            if t == a: t = b
        out.append(t)
    return out


def bom_tokens(desc):
    toks = [t.strip().upper() for t in desc.split(",")]
    dn = [int(x) for t in toks if t.startswith("DN ") for x in re.findall(r"\d+", t)]
    rest = [t for t in toks if not t.startswith("DN ")]
    return rest, tuple(dn)


BOMIDX = collections.defaultdict(list)
for d, mc, m1, m2, uom, cat in BOMD:
    if cat in ("Pipe", "Fitting"):
        rest, dn = bom_tokens(d)
        BOMIDX[dn].append((rest, d, mc, m1, m2, uom, cat))
BOMD_BY_DESC = {d: (mc, m1, m2, uom, cat) for d, mc, m1, m2, uom, cat in BOMD}


def tok_eq(a, b):
    return a == b or SequenceMatcher(None, a, b).ratio() >= 0.86


def match_std(desc, size):
    inch = parse_size(size)
    if not inch:
        return None, "NONE"
    try:
        dn = tuple(DN[round(v * 8) / 8] if round(v * 8) / 8 in DN else DN[v] for v in inch)
    except KeyError:
        return None, "NONE"
    toks = norm_desc(desc)
    best = (0, None)
    for rest, d, mc, m1, m2, uom, cat in BOMIDX.get(dn, []):
        common = sum(1 for t in toks if any(tok_eq(t, r) for r in rest))
        sc = common / max(len(toks), len(rest))
        if sc > best[0]:
            best = (sc, (d, mc, m1, m2, uom, cat))
    if best[0] >= 0.99: return best[1], "EXACT"
    if best[0] >= 0.74: return best[1], "FUZZY"
    return None, "NONE"


def flange_class(items, dn_filter=None):
    cls = collections.Counter()
    for it in items:
        if "FLANGE" in it["desc"].upper():
            m = re.search(r"CL\s?(\d+)", it["desc"].upper())
            if m: cls[m.group(1)] += 1
    return cls


def derive_others(it, items, size):
    """스파이럴 가스켓/스터드 볼트: bom 이 쓰는 규칙으로 설명·MatCode를 도출"""
    u = unicodedata.normalize("NFKC", it["desc"]).upper()
    inch = parse_size(size)
    if not inch:
        return None, "NONE"
    lab = size_label(inch).replace("X", "x")
    if "SPIRAL" in u and ("WOUND" in u or "W0UND" in u):
        mat = "316" if "316" in u else "304"
        cls = flange_class(items)
        if not cls:
            return None, "NONE"
        c = sorted(cls.items(), key=lambda kv: (-kv[1], int(kv[0])))[0][0]
        d = f'GASKET (SPIRAL WOUND) / S/S ({mat}) / {lab} / CL {c}'
        mc = f'GSKT-SW{mat}-{lab}-CL{c}'
        return (d, mc, f"S/S ({mat})", None, "EA", "Others"), ("EXACT" if d in BOMD_BY_DESC else "DERIVED")
    if "STUD" in u and "BOLT" in u:
        mlen = re.search(r"(\d+)\s*MM", u)
        if not mlen:
            return None, "NONE"
        L = mlen.group(1)
        g = re.search(r"A193\s*GR\.?\s*(B\w+)", u)
        grade = g.group(1) if g else "B7"
        if "HOT DIP" in u or grade == "B7":
            m1, short = "HDG", "HDG"
        elif grade == "B8M": m1, short = "S/S (316)", "SS316"
        elif grade == "B8": m1, short = "S/S (304)", "SS304"
        else: m1, short = "ALLOY", "ALLOY"
        slab = lab.replace("x", "").replace('"', "")
        d = f'STUD BOLT/NUT / {m1} / A193-{grade} / {slab}" x {L}mm'
        mc = f'STB-A193-{grade}-{short}-{slab}"x{L}'
        return (d, mc, m1, f"A193-{grade}", "EA", "Others"), ("EXACT" if d in BOMD_BY_DESC else "DERIVED")
    return None, "NONE"


def rating_of(desc):
    for t in [x.strip() for x in desc.split(",")]:
        m = re.match(r"^(S-\w+|CL\d+|STD|XS|XXS|SCH ?\w+|\d+#)", t.upper())
        if m: return m.group(1)
    return None


# ---------------------------------------------------------------- 본 처리
rows, iso_rows, unread = [], [], []
files = sorted(f for f in os.listdir(SRC) if f.endswith(".json") and f.startswith("CCP"))
for f in files:
    stem = f[:-5]; iso, rev = stem.rsplit("_", 1)
    x = json.load(open(f"{SRC}/{f}", encoding="utf-8"))
    meta = ISO.get(iso, {})
    items = x["items"]
    if not items:
        unread.append((iso, rev, meta.get("system"), meta.get("bore"), "BOM 표 항목 없음(표 위치/형식 확인 필요)")); 
    line = BOM_LINE.get(iso) or meta.get("line_no")
    pdf_m = pdf_ea = 0.0
    for it in items:
        qty_ok = bool(it["qty"]) and re.fullmatch(r"\d+(?:\.\d+)?", it["qty"] or "") is not None
        qty = float(it["qty"]) if qty_ok else None
        size = it["size"]; inch = parse_size(size)
        res, status = match_std(it["desc"], size)
        if res is None:
            res, status = derive_others(it, items, size)
        d_, mc, m1, m2, uom_b, cat = res if res else (None,) * 6
        uom = it["uom"] or uom_b
        if qty is not None and uom == "M": pdf_m += qty
        elif qty is not None and uom == "EA": pdf_ea += qty
        note = []
        if not qty_ok: note.append("수량 판독 실패")
        if not inch: note.append("사이즈 판독 실패")
        if status in ("NONE",): note.append("설명 매핑 실패")
        if status == "FUZZY": note.append("설명 유사매칭")
        if status == "DERIVED": note.append("bom 미등록 규격(규칙 도출)")
        chk = ""
        if mc and qty is not None and cat in ("Pipe", "Fitting", "Others"):
            bq = BOMSUM.get(iso, {}).get(mc)
            if bq is None: chk = "bom에 없음"
            elif abs(bq - qty) <= (0.15 + 0.03 * qty if uom == "M" else 0.01): chk = "일치"
            else: chk = f"차이(bom {bq:.2f})"
        rows.append([mc, meta.get("system"), iso, line, (d_ or it["desc"]).split(",")[0].strip() if d_ else norm_desc(it["desc"])[0] if norm_desc(it["desc"]) else it["desc"],
                     m1, m2, size_label(inch) if inch else size, rating_of(d_) if d_ else None,
                     d_ or ", ".join(norm_desc(it["desc"])), uom, qty, rev, status, chk, "; ".join(note), it["desc"]])
    db = ISO_BOM_TOT.get(iso, {})
    ok_m = abs(pdf_m - db.get("M", 0)) <= max(0.15, 0.03 * db.get("M", 0))
    ok_e = abs(pdf_ea - db.get("EA", 0)) < 0.5
    iso_rows.append([iso, rev, meta.get("system"), meta.get("bore"), len(items), round(pdf_m, 2), round(db.get("M", 0), 2), round(pdf_ea, 1),
                     round(db.get("EA", 0), 1), "일치" if (ok_m and ok_e) else ("bom에 Pipe/Fitting 없음" if not db else "차이")])

# ---------------------------------------------------------------- Excel
wb = openpyxl.Workbook()
HEAD = PatternFill("solid", fgColor="1F3864"); WH = Font(bold=True, color="FFFFFF")


def sheet(ws, header, data, widths):
    ws.append(header)
    for c in ws[1]:
        c.font, c.fill, c.alignment = WH, HEAD, Alignment(horizontal="center", vertical="center", wrap_text=True)
    for r in data: ws.append(r)
    for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"; ws.auto_filter.ref = ws.dimensions


ws = wb.active; ws.title = "BOM"
sheet(ws, ["MAT CODE", "SYSTEM", "ISO DRAWING", "LINE NO.", "ITEM", "MAT 1", "MAT 2", "SIZE", "RATING", "DESCRIPTION", "UNIT", "DESIGN QTY",
           "REV", "MATCH", "CHECK vs bom", "NOTE", "PDF DESCRIPTION (raw)"], rows,
      [26, 10, 34, 30, 16, 10, 12, 8, 9, 46, 6, 11, 7, 9, 18, 28, 50])
fills = {"일치": "E2F0D9", "bom에 없음": "FCE4D6"}
for r in ws.iter_rows(min_row=2):
    v = r[14].value or ""
    if v.startswith("차이"): r[14].fill = PatternFill("solid", fgColor="FFF2CC")
    elif v in fills: r[14].fill = PatternFill("solid", fgColor=fills[v])
    if r[15].value: r[15].fill = PatternFill("solid", fgColor="FFF2CC")
sheet(wb.create_sheet("ISO Check"), ["ISO DRAWING", "REV", "SYSTEM", "BORE", "PDF items", "PDF Pipe (M)", "bom Pipe (M)", "PDF EA", "bom EA", "RESULT"], iso_rows,
      [34, 7, 10, 8, 10, 13, 13, 9, 9, 24])
sheet(wb.create_sheet("Unread"), ["ISO DRAWING", "REV", "SYSTEM", "BORE", "REASON"], unread, [34, 7, 10, 8, 50])
wb.save(OUT)
cnt = collections.Counter(r[13] for r in rows); chk = collections.Counter(r[14] for r in rows)
print("saved", OUT, "| rows", len(rows), "| isos", len(iso_rows), "| unread", len(unread))
print("MATCH", dict(cnt)); print("CHECK", {k if not k.startswith("차이") else "차이": v for k, v in chk.items()} if False else dict(collections.Counter(("차이" if (k or "").startswith("차이") else k) for k in chk.elements())))
print("ISO", dict(collections.Counter(r[9] for r in iso_rows)))
