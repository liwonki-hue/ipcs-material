# Valve BOM MatCode 자동 생성 스크립트
# matcode_master 규칙에 따라 Mat Code / Description 생성 후 엑셀에 기록

import json, openpyxl, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ── 1. matcode_master 로드 ─────────────────────────────────────────────────
with open('scratch/matcode_master_dump.json', encoding='utf-8') as f:
    master = json.load(f)

MASTER_SET = {m['mat_code'] for m in master}

# ── 2. 매핑 테이블 ────────────────────────────────────────────────────────
ITEM_PREFIX = {
    'GATE':       'GTV',
    'GLOBE':      'GLV',
    'CHECK':      'CHV',
    'BALL':       'BAV',
    'BUTTERFLY':  'BFV',
}

ITEM_DESC = {
    'GATE':       'VALVE GATE',
    'GLOBE':      'VALVE GLOBE',
    'CHECK':      'VALVE CHECK',
    'BALL':       'VALVE BALL',
    'BUTTERFLY':  'VALVE BUTTERFLY',
}

# Body Mat'l → matl code (matcode_master 기준)
MATL_CODE = {
    'A105':        'CS05',
    'SA105':       'CS05',
    'A216-WCB':    'CS05',
    'A216-WCC':    'CS05',
    'A182-F22':    'AS22',
    'A182-F91':    'AS91',
    'SA182-F91':   'AS91',
    'A217-C12A':   'AS91',
    'A351-CF8':    'SS04',
    'A182-F304':   'SS3F',   # 신규
    'A182-F316':   'SS16',
    'A182-F316L':  'SS16',
}

# matl code → 재질명 (Description용)
MATL_DESC_NAME = {
    'CS05': lambda m: m,    # 원본 그대로 (A105 / A216-WCB)
    'AS22': lambda m: 'A182-F22',
    'AS91': lambda m: m,    # 원본 그대로
    'SS04': lambda m: m,
    'SS16': lambda m: m,
    'SS3F': lambda m: m,
}

# Size (inch, 정수) → D-code
SIZE_D = {
    0.5: 'D005', 0.75: 'D008',
    1: 'D010', 1.5: 'D015',
    2: 'D020', 3: 'D030',
    4: 'D040', 6: 'D060',
    8: 'D080', 10: 'D100',
    12: 'D120', 14: 'D140',
    16: 'D160', 20: 'D200',
    24: 'D240',
}

# Size (inch) → DN mm
SIZE_DN = {
    0.5: 15, 0.75: 20,
    1: 25, 1.5: 40,
    2: 50, 3: 80,
    4: 100, 6: 150,
    8: 200, 10: 250,
    12: 300, 14: 350,
    16: 400, 20: 500,
    24: 600,
}

# Rating → code
RATING_CODE = {
    '150#':  'C150',
    '300#':  'C300',
    '600#':  'C600',
    '1500#': 'C1500',
}

# Rating → Description 표기
RATING_DESC = {
    '150#':  'CL150',
    '300#':  'CL300',
    '600#':  'CL600',
    '1500#': 'CL1500',
}

# End type → code
ET_CODE = {
    'SW':       'SW',
    'BW':       'BW',
    'FLGD-RF':  'RF',
    'FLGD-FF':  'FF',
}

# ── 3. MatCode / Description 생성 함수 ───────────────────────────────────
def build_matcode(item, matl, size_inch, rating, end_type):
    prefix = ITEM_PREFIX.get(str(item).strip().upper())
    mc     = MATL_CODE.get(str(matl).strip())
    dc     = SIZE_D.get(float(size_inch)) if size_inch is not None else None
    rc     = RATING_CODE.get(str(rating).strip())
    ec     = ET_CODE.get(str(end_type).strip())
    if not all([prefix, mc, dc, rc, ec]):
        missing = [k for k, v in zip(['item','matl','size','rating','end'],
                                      [prefix, mc, dc, rc, ec]) if not v]
        return None, f'MISSING: {missing}'
    return f'{prefix}-{mc}-{dc}-{rc}-{ec}', None

def build_description(item, matl, size_inch, rating, end_type):
    idesc = ITEM_DESC.get(str(item).strip().upper(), str(item).strip())
    dn    = SIZE_DN.get(float(size_inch)) if size_inch is not None else '?'
    rdesc = RATING_DESC.get(str(rating).strip(), str(rating).strip())
    etdesc = ET_CODE.get(str(end_type).strip(), str(end_type).strip())
    return f'{idesc}, {matl}, DN {dn}, {rdesc}, {etdesc}'

# ── 4. 엑셀 처리 ─────────────────────────────────────────────────────────
VALVE_PATH = 'Raw File/BOM Data/Valve BOM.xlsx'
wb = openpyxl.load_workbook(VALVE_PATH)
ws = wb.active

# 헤더 확인 (1행): Mat Code=1, Description=6, Item=8, SIZE=9, BODY MAT'L=10, BODY RATING=11, END_TYPE=12
COL_MATCODE = 1
COL_DESC    = 6
COL_ITEM    = 8
COL_SIZE    = 9
COL_MATL    = 10
COL_RATING  = 11
COL_END     = 12

new_codes = []   # matcode_master에 없는 신규 코드
stats = {'ok': 0, 'existing': 0, 'new': 0, 'skip': 0}

for r in range(2, ws.max_row + 1):
    item   = ws.cell(r, COL_ITEM).value
    size   = ws.cell(r, COL_SIZE).value
    matl   = ws.cell(r, COL_MATL).value
    rating = ws.cell(r, COL_RATING).value
    end    = ws.cell(r, COL_END).value

    if not any([item, size, matl, rating, end]):
        continue   # 빈 행

    mc, err = build_matcode(item, matl, size, rating, end)
    if err:
        print(f'Row {r}: SKIP — {err} | item={item} matl={matl} size={size} rating={rating} end={end}')
        stats['skip'] += 1
        continue

    desc = build_description(item, matl, size, rating, end)
    ws.cell(r, COL_MATCODE).value = mc
    ws.cell(r, COL_DESC).value    = desc

    if mc in MASTER_SET:
        stats['existing'] += 1
    else:
        stats['new'] += 1
        new_codes.append({
            'mat_code':  mc,
            'category':  'Valve',
            'item_desc': ITEM_DESC.get(str(item).strip().upper(), item),
            'matl_desc': str(matl).strip(),
            'size1':     f'{int(size)}"' if float(size) == int(float(size)) else f'{size}"',
            'class_desc': str(rating).strip(),
            'et_desc':   ET_CODE.get(str(end).strip(), end),
        })

    stats['ok'] += 1

wb.save(VALVE_PATH)
print(f'\n완료: 처리={stats["ok"]} (기존={stats["existing"]}, 신규={stats["new"]}), 스킵={stats["skip"]}')

# ── 5. 신규 matcode 목록 출력 ─────────────────────────────────────────────
if new_codes:
    # 중복 제거
    seen = set()
    uniq = []
    for c in new_codes:
        if c['mat_code'] not in seen:
            seen.add(c['mat_code'])
            uniq.append(c)

    print(f'\n신규 MatCode {len(uniq)}건 (matcode_master에 없음):')
    for c in sorted(uniq, key=lambda x: x['mat_code']):
        print(f"  {c['mat_code']} | {c['item_desc']} | {c['matl_desc']} | {c['size1']} | {c['class_desc']} | {c['et_desc']}")

    # SQL 생성
    sql_path = 'scratch/insert_valve_matcodes.sql'
    with open(sql_path, 'w', encoding='utf-8') as f:
        f.write('-- 신규 Valve MatCode INSERT (matcode_master)\n')
        f.write('-- Supabase SQL Editor에서 실행\n\n')
        for c in sorted(uniq, key=lambda x: x['mat_code']):
            size_raw = c['size1'].replace('"', '')
            f.write(
                f"INSERT INTO material.matcode_master "
                f"(mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc) VALUES "
                f"('{c['mat_code']}', 'Valve', '{c['item_desc']}', '{c['matl_desc']}', "
                f"'{c['size1']}', '-', '{c['class_desc']}', '{c['et_desc']}') "
                f"ON CONFLICT (mat_code) DO NOTHING;\n"
            )
    print(f'\n→ SQL 저장: {sql_path}')
