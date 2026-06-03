# MOV Valve receiving 테이블 UPDATE SQL 생성
# - tag 있는 항목에만 mat_code, full_description(ITEM/TYPE/SIZE 포함) 할당
# 출력: update_mov_receiving.sql

import re, sys, io
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ── 코드 매핑 (gen_mov_bom.py 동일) ─────────────────────────────────────────
MATL_MAP = {
    'A105': 'CS05', 'SA105': 'CS05',
    'A216-WCB': 'CS05', 'SA216-WCB': 'CS05', 'A216 WCB': 'CS05',
    'A216-WCC': 'CS05', 'SA216-WCC': 'CS05', 'A216 WCC': 'CS05',
    'A351-CF8': 'SS04', 'SA351-CF8': 'SS04', 'A351 CF8': 'SS04',
    'A351-CF8M': 'SS16', 'CF8M': 'SS16',
    'A182-F91': 'AS91', 'SA182-F91': 'AS91',
    'A182-F304': 'SS04',
}
DN_TO_D = {
    15:'D005', 20:'D008', 25:'D010', 40:'D015',
    50:'D020', 65:'D025', 80:'D030', 100:'D040',
    125:'D050', 150:'D060', 200:'D080', 250:'D100',
    300:'D120', 350:'D140', 400:'D160', 500:'D200',
}

def parse_matl(s):
    first = str(s).strip().split(' or ')[0].strip()
    return MATL_MAP.get(first) or MATL_MAP.get(str(s).strip()) or 'CS05'

def parse_dn(val):
    try:
        dn = int(float(str(val)))
        return dn, DN_TO_D.get(dn)
    except (ValueError, TypeError):
        return None, None

def parse_class(s):
    m = re.search(r'(\d+)\s*(LB|#)', str(s), re.I)
    return f'C{m.group(1)}' if m else 'C150'

def parse_end(s):
    s = str(s).strip().upper()
    return s if s in ('SW', 'BW', 'RF', 'FF') else 'BW'

def nan_to_none(v):
    try:
        if v is None or pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    s = str(v).strip()
    return s if s else None

def esc(v):
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"

# ── Excel 파싱 ───────────────────────────────────────────────────────────────
xl = pd.ExcelFile('Raw File/BOM Data/MOV Valve BOM.xlsx')
tag_map = {}  # tag → {mat_code, full_desc}

# Sheet 1: Butterfly Valve
for _, r in xl.parse('Butterfly Valve', header=0).iterrows():
    tag = nan_to_none(r.get('Tag No.'))
    if not tag:
        continue
    dn_val, d_code = parse_dn(r.get('Size'))
    body    = nan_to_none(r.get('Body')) or ''
    rating  = nan_to_none(r.get('Rating')) or '150LB'
    end_t   = nan_to_none(r.get('END TYPE')) or 'RF'
    desc    = nan_to_none(r.get('Description')) or ''
    item    = nan_to_none(r.get('Item')) or 'MOV (Butterfly Valve)'

    matl_c  = parse_matl(body)
    cls_c   = parse_class(rating)
    end_c   = parse_end(end_t)
    mat_code = f'MOV-{matl_c}-{d_code}-{cls_c}-{end_c}' if d_code else None

    dn_str   = f'DN {dn_val}' if dn_val else ''
    full_desc = ', '.join(filter(None, [desc, item, dn_str, body, rating, end_t]))
    tag_map[tag] = {'mat_code': mat_code, 'full_desc': full_desc}

# Sheet 2: GATE GLOBE
for _, r in xl.parse('GATE GLOBE', header=0).iterrows():
    tag = nan_to_none(r.get('Tag No.'))
    if not tag:
        continue
    dn_val, d_code = parse_dn(r.get('Size'))
    body    = nan_to_none(r.get('Body Material')) or ''
    rating  = nan_to_none(r.get('Rating')) or '150#'
    end_t   = nan_to_none(r.get('END TYPE')) or 'BW'
    desc    = nan_to_none(r.get('Description')) or ''
    item    = nan_to_none(r.get('Item')) or 'MOV'

    matl_c  = parse_matl(body)
    cls_c   = parse_class(rating)
    end_c   = parse_end(end_t)
    mat_code = f'MOV-{matl_c}-{d_code}-{cls_c}-{end_c}' if d_code else None

    dn_str   = f'DN {dn_val}' if dn_val else ''
    full_desc = ', '.join(filter(None, [desc, item, dn_str, body, rating, end_t]))
    tag_map[tag] = {'mat_code': mat_code, 'full_desc': full_desc}

print(f'BOM 태그: {len(tag_map)}건')
null_mc = [t for t, v in tag_map.items() if not v['mat_code']]
if null_mc:
    print(f'[WARN] mat_code NULL: {null_mc}')

# ── SQL 생성 ─────────────────────────────────────────────────────────────────
out_path = 'scratch/update_mov_receiving.sql'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('-- MOV Valve receiving UPDATE (tag 있는 항목만)\n')
    f.write('-- mat_code + full_description(ITEM/TYPE/SIZE) 할당\n')
    f.write('SET search_path TO material, public;\n\n')

    for tag, v in sorted(tag_map.items()):
        mc_sql = esc(v['mat_code'])
        fd_sql = esc(v['full_desc'])
        f.write(
            f"UPDATE material.receiving\n"
            f"  SET mat_code = {mc_sql},\n"
            f"      full_description = {fd_sql}\n"
            f"  WHERE tag = {esc(tag)};\n\n"
        )

print(f'→ {out_path} 생성 ({len(tag_map)}건)')

# ── 미리보기 ─────────────────────────────────────────────────────────────────
print('\n[샘플 5건]')
for tag in sorted(tag_map)[:5]:
    v = tag_map[tag]
    print(f'  {tag:25s}  mc={v["mat_code"]}')
    print(f'    desc={v["full_desc"]}')
