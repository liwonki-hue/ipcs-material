# MOV Valve BOM → matcode_master + bom INSERT SQL 생성
# Raw File/BOM Data/MOV Valve BOM.xlsx (Butterfly Valve + GATE GLOBE)
# 출력: insert_mov_matcodes.sql, insert_mov_bom.sql

import re, sys, io
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ── 코드 매핑 ────────────────────────────────────────────────────────────────
MATL_MAP = {
    'A105': 'CS05', 'SA105': 'CS05',
    'A216-WCB': 'CS05', 'SA216-WCB': 'CS05',
    'A216 WCB': 'CS05',
    'A216-WCC': 'CS05', 'SA216-WCC': 'CS05',
    'A216 WCC': 'CS05',
    'A351-CF8': 'SS04', 'SA351-CF8': 'SS04',
    'A351 CF8': 'SS04',
    'A351-CF8M': 'SS16', 'CF8M': 'SS16',
    'A182-F91': 'AS91', 'SA182-F91': 'AS91',
    'A182-F304': 'SS04',
}
MATL_DESC_MAP = {
    'CS05': 'A105 / A216-WCB (Carbon Steel)',
    'SS04': 'A351-CF8 (Stainless Steel 304)',
    'SS16': 'A351-CF8M (Stainless Steel 316)',
    'AS91': 'A182-F91 (Alloy Steel Cr-Mo)',
}
DN_TO_D = {
    15:'D005', 20:'D008', 25:'D010', 40:'D015',
    50:'D020', 65:'D025', 80:'D030', 100:'D040',
    125:'D050', 150:'D060', 200:'D080', 250:'D100',
    300:'D120', 350:'D140', 400:'D160', 500:'D200',
    550:'D220', 600:'D240',
}
D_TO_NPS = {
    'D005':'1/2"', 'D008':'3/4"', 'D010':'1"', 'D015':'1-1/2"',
    'D020':'2"', 'D025':'2-1/2"', 'D030':'3"', 'D040':'4"',
    'D050':'5"', 'D060':'6"', 'D080':'8"', 'D100':'10"',
    'D120':'12"', 'D140':'14"', 'D160':'16"', 'D200':'20"',
    'D220':'22"', 'D240':'24"',
}

def parse_matl(s):
    s = str(s).strip()
    # 'A182-F91 or A217-C12A' 같은 복합 문자열 처리 → 첫 번째 재료 기준
    first = s.split(' or ')[0].strip()
    return MATL_MAP.get(first) or MATL_MAP.get(s) or 'CS05'

def parse_dn(val):
    """Size 컬럼 값(정수 DN) → D-code"""
    try:
        dn = int(float(str(val)))
        return DN_TO_D.get(dn)
    except (ValueError, TypeError):
        return None

def parse_class(s):
    """'150LB', '1500#', '600#' → 'C150', 'C1500', 'C600'"""
    m = re.search(r'(\d+)\s*(LB|#)', str(s), re.I)
    return f'C{m.group(1)}' if m else 'C150'

def parse_end(s):
    s = str(s).strip().upper()
    if s in ('SW', 'BW', 'RF', 'FF'):
        return s
    return 'BW'

def esc(v):
    if v is None or (isinstance(v, float) and v != v):
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"

def nan_to_none(v):
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    s = str(v).strip()
    return s if s else None

# ── 데이터 파싱 ──────────────────────────────────────────────────────────────
xl = pd.ExcelFile('Raw File/BOM Data/MOV Valve BOM.xlsx')
all_rows = []

# Sheet 1: Butterfly Valve
df_bfv = xl.parse('Butterfly Valve', header=0)
for _, row in df_bfv.iterrows():
    tag  = nan_to_none(row.get("Tag No."))
    if not tag:
        continue
    system  = nan_to_none(row.get('System'))
    iso     = nan_to_none(row.get('ISO Drawing'))
    line_no = nan_to_none(row.get('Line no'))
    desc    = nan_to_none(row.get('Description'))
    item    = nan_to_none(row.get('Item'))           # 'MOV (Butterfly Valve)'
    size    = row.get('Size')
    body    = nan_to_none(row.get('Body'))
    rating  = nan_to_none(row.get('Rating'))
    end_t   = nan_to_none(row.get('END TYPE'))
    qty     = row.get("Q'ty", 1)

    d_code    = parse_dn(size)
    matl_code = parse_matl(body or '')
    cls_code  = parse_class(rating or '150LB')
    end_code  = parse_end(end_t or 'RF')
    mat_code  = f'MOV-{matl_code}-{d_code}-{cls_code}-{end_code}' if d_code else None

    dn_str = f'DN {int(float(str(size)))}' if size else ''
    full_desc = ', '.join(filter(None, [desc, item, dn_str, body, rating, end_t]))

    all_rows.append({
        'mat_code': mat_code,
        'category': 'Valve',
        'tag': tag,
        'system': system,
        'iso_dwg_no': iso,
        'line_no': line_no,
        'full_description': full_desc or None,
        'uom': 'EA',
        'qty': float(qty) if qty is not None else 1.0,
        '_matl_code': matl_code,
        '_d_code': d_code,
        '_cls_code': cls_code,
        '_end_code': end_code,
        '_item_desc': 'MOV (BUTTERFLY VALVE)',
    })

print(f'Butterfly Valve: {len([r for r in all_rows])}행')

# Sheet 2: GATE GLOBE
df_gg = xl.parse('GATE GLOBE', header=0)
for _, row in df_gg.iterrows():
    tag  = nan_to_none(row.get("Tag No."))
    if not tag:
        continue
    system  = nan_to_none(row.get('System'))
    iso     = nan_to_none(row.get('ISO Drawing'))
    line_no = nan_to_none(row.get('Line No'))
    desc    = nan_to_none(row.get('Description'))
    item    = nan_to_none(row.get('Item'))           # 'MOV (GATE)' or 'MOV (GLOBE)'
    size    = row.get('Size')
    body    = nan_to_none(row.get('Body Material'))
    rating  = nan_to_none(row.get('Rating'))
    end_t   = nan_to_none(row.get('END TYPE'))
    qty     = row.get("Q'ty", 1)

    d_code    = parse_dn(size)
    matl_code = parse_matl(body or '')
    cls_code  = parse_class(rating or '150#')
    end_code  = parse_end(end_t or 'BW')
    mat_code  = f'MOV-{matl_code}-{d_code}-{cls_code}-{end_code}' if d_code else None

    dn_str = f'DN {int(float(str(size)))}' if size else ''
    full_desc = ', '.join(filter(None, [desc, item, dn_str, body, rating, end_t]))

    item_key = 'MOV (GATE)' if 'GATE' in str(item).upper() else 'MOV (GLOBE)'
    all_rows.append({
        'mat_code': mat_code,
        'category': 'Valve',
        'tag': tag,
        'system': system,
        'iso_dwg_no': iso,
        'line_no': line_no,
        'full_description': full_desc or None,
        'uom': 'EA',
        'qty': float(qty) if qty is not None else 1.0,
        '_matl_code': matl_code,
        '_d_code': d_code,
        '_cls_code': cls_code,
        '_end_code': end_code,
        '_item_desc': item_key.upper(),
    })

bfv_count = len([r for r in all_rows if r['_item_desc'] == 'MOV (BUTTERFLY VALVE)'])
gg_count  = len(all_rows) - bfv_count
print(f'GATE/GLOBE:      {gg_count}행')
print(f'합계:            {len(all_rows)}행')

# NULL matcode 확인
null_mc = [r for r in all_rows if r['mat_code'] is None]
if null_mc:
    print(f'\n[WARN] mat_code NULL {len(null_mc)}건:')
    for r in null_mc:
        print(f'  tag={r["tag"]}, size=?, d_code={r["_d_code"]}')

# ── 유니크 matcode → matcode_master ─────────────────────────────────────────
seen_mc = {}
for row in all_rows:
    mc = row['mat_code']
    if not mc or mc in seen_mc:
        continue
    matl_desc = MATL_DESC_MAP.get(row['_matl_code'], row['_matl_code'])
    size1     = D_TO_NPS.get(row['_d_code'], '')
    cls_desc  = row['_cls_code'].replace('C', 'CL')
    seen_mc[mc] = {
        'mat_code':   mc,
        'category':   'Valve',
        'item_desc':  row['_item_desc'],
        'matl_desc':  matl_desc,
        'size1':      size1,
        'size2':      '',
        'class_desc': cls_desc,
        'et_desc':    row['_end_code'],
    }

print(f'\n신규 matcode: {len(seen_mc)}종')
for mc in sorted(seen_mc):
    d = seen_mc[mc]
    print(f'  {mc:40s} {d["item_desc"]:25s} {d["size1"]:8s} {d["class_desc"]:8s} {d["et_desc"]}')

# ── SQL 생성 ─────────────────────────────────────────────────────────────────
# 1. matcode_master INSERT
with open('scratch/insert_mov_matcodes.sql', 'w', encoding='utf-8') as f:
    f.write('-- MOV Valve matcode_master 등록\n')
    f.write('-- Supabase SQL Editor에서 실행\n\n')
    for mc, d in sorted(seen_mc.items()):
        f.write(
            f"INSERT INTO material.matcode_master "
            f"(mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc) VALUES "
            f"({esc(d['mat_code'])}, 'Valve', {esc(d['item_desc'])}, {esc(d['matl_desc'])}, "
            f"{esc(d['size1'])}, '', {esc(d['class_desc'])}, {esc(d['et_desc'])})"
            f" ON CONFLICT (mat_code) DO NOTHING;\n"
        )
print('\n→ scratch/insert_mov_matcodes.sql 생성')

# 2. bom INSERT (기존 MOV 태그 삭제 후 재삽입)
with open('scratch/insert_mov_bom.sql', 'w', encoding='utf-8') as f:
    f.write('-- MOV Valve BOM INSERT\n')
    f.write('-- 실행 순서: insert_mov_matcodes.sql 먼저 실행\n\n')
    f.write('-- 기존 MOV bom 행 삭제 (중복 방지)\n')
    f.write("DELETE FROM material.bom\n")
    f.write("  WHERE category = 'Valve' AND tag ~ '^B[012]-MOV-';\n\n")
    f.write(f'-- MOV Valve BOM ({len(all_rows)}행)\n')
    for row in all_rows:
        mc_sql = esc(row['mat_code'])
        f.write(
            f"INSERT INTO material.bom "
            f"(mat_code, category, tag, system, iso_dwg_no, line_no, full_description, uom, qty) VALUES "
            f"({mc_sql}, 'Valve', {esc(row['tag'])}, {esc(row['system'])}, "
            f"{esc(row['iso_dwg_no'])}, {esc(row['line_no'])}, "
            f"{esc(row['full_description'])}, 'EA', {row['qty']});\n"
        )
print(f'→ scratch/insert_mov_bom.sql 생성 ({len(all_rows)}행)')
print('\n실행 순서:')
print('  1. insert_mov_matcodes.sql  (matcode_master 신규 등록)')
print('  2. insert_mov_bom.sql       (bom 기존 MOV 삭제 후 재삽입)')
