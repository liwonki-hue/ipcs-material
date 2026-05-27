# NULL matcode BOM 행 수정 스크립트 (A182-F92 별도 자재 + 비표준 각도 엘보)
# 대상: A182-F92 관련 (CPF/EL4L/EL9L → AS92 코드) + 비표준 엘보 (30D/55D/72D)
import xlrd, json, sys, io, re, requests
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
H = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}',
     'Content-Type': 'application/json', 'Accept-Profile': 'material',
     'Content-Profile': 'material', 'Prefer': 'return=minimal'}

# matcode_master 로드
with open('scratch/matcode_master_dump.json', encoding='utf-8') as f:
    MATCODE_MASTER = {m['mat_code']: m for m in json.load(f)}

# ─── 매핑 테이블 (replace_bom.py와 동일, 수정 반영) ─────────────────────────
DN_TO_DCODE = {
    15: 'D005', 20: 'D008', 25: 'D010', 32: 'D012', 40: 'D015',
    50: 'D020', 65: 'D025', 80: 'D030', 100: 'D040', 125: 'D050',
    150: 'D060', 200: 'D080', 250: 'D100', 300: 'D120', 350: 'D140',
    400: 'D160', 450: 'D180', 500: 'D200', 550: 'D220', 600: 'D240',
}
NPS_TO_DN = {
    '0.5': 15, '1/2': 15, '0.75': 20, '3/4': 20,
    '1': 25, '1.0': 25, '1.25': 32, '1-1/4': 32,
    '1.5': 40, '1-1/2': 40, '2': 50, '2.0': 50,
    '2.5': 65, '3': 80, '3.0': 80, '4': 100, '4.0': 100,
    '5': 125, '5.0': 125, '6': 150, '6.0': 150,
    '8': 200, '8.0': 200, '10': 250, '10.0': 250,
    '12': 300, '12.0': 300, '14': 350, '14.0': 350,
    '16': 400, '16.0': 400, '18': 450, '18.0': 450,
    '20': 500, '20.0': 500, '22': 550, '22.0': 550,
    '24': 600, '24.0': 600,
}

MATL_MAP = {
    'A105': 'CS05', 'SA105': 'CS05',
    'A234-WPB': 'CS05', 'A234-WPBW': 'CS05',
    'A106-B': 'CS06', 'A106-C': 'CS06', 'SA106-B': 'CS06',
    'A53-B': 'A53B',
    'A672-B60-CL22': 'CSB6', 'A672-B60 CL22': 'CSB6',
    'A182-F22': 'AS22', 'A335-P22': 'AS22', 'A234-WP22': 'AS22',
    'A182-F91': 'AS91', 'SA182-F91': 'AS91',
    'A335-P91': 'AS91', 'SA335-P91': 'AS91', 'A234-WP91': 'AS91',
    'A182-F92': 'S04L',  # F92 → A182-F304L (S04L)
    'A182-F304': 'SS04', 'A312-TP304': 'SS04', 'A312-TP304W': 'SS04',
    'A403-WP304': 'SS04', 'A403-WP304W': 'SS04',
    'A312-TP304L': 'SS04', 'A312-TP304LW': 'SS04',
    'A403-WP304L': 'SS04', 'A403-WP304LW': 'SS04',
    'A182-F316': 'SS16', 'A312-TP316': 'SS16', 'A312-TP316H': 'SS16',
    'A182-F316H': 'SS16', 'A182-F316L': 'SS16', 'A312-TP316L': 'SS16',
    'A403-WP316': 'SS16', 'A403-WP316W': 'SS16',
    'A234-WPC': 'CSWC',
}

# 수정된 ITEM_MAP (비표준 각도 엘보 포함)
ITEM_MAP = {
    'PIPE SMLS': 'PIS', 'PIPE WELDED': 'PIW', 'PIPE NIPPLE': 'PIN',
    'ELBOW LR 90D': 'EL9L',
    'ELBOW LR 89.4D': 'EL9L', 'ELBOW LR 89.7D': 'EL9L',
    'ELBOW LR 90.3D': 'EL9L', 'ELBOW LR 90.6D': 'EL9L',
    'ELBOW SR 90D': 'EL9S',
    'ELBOW 45D': 'EL4L', 'ELBOW LR 45D': 'EL4L',
    'ELBOW 30D': 'EL4L',             # 30° ≤ 45°
    'ELBOW LR 55D': 'EL9L',          # 55° > 45° LR
    'ELBOW LR 72D': 'EL9L',          # 72° > 45° LR
    'ELBOW SR 55D': 'EL9S',          # 55° > 45° SR
    'TEE': 'TEE', 'TEE-RED': 'TER',
    'REDUCER-CON': 'RDC', 'REDUCER-ECC': 'RDE',
    'CAP': 'CAP', 'WELDOLET': 'WOL', 'LATROLET': 'LAT',
    'COUPLING-HALF': 'CPH', 'COUPLING-FULL': 'CPF',
    'SWAGE-CON': 'SWC', 'SWAGE-ECC': 'SWE',
    'FLANGE': 'FLN', 'FLANGE-BLIND': 'FLB',
}

ITEM_CATEGORY = {
    'PIS': 'Pipe', 'PIW': 'Pipe', 'PIN': 'Fitting',
    'EL9L': 'Fitting', 'EL9S': 'Fitting', 'EL4L': 'Fitting',
    'TEE': 'Fitting', 'TER': 'Fitting',
    'RDC': 'Fitting', 'RDE': 'Fitting',
    'CAP': 'Fitting', 'WOL': 'Fitting', 'LAT': 'Fitting',
    'CPH': 'Fitting', 'CPF': 'Fitting',
    'SWC': 'Fitting', 'SWE': 'Fitting',
    'FLN': 'Fitting', 'FLB': 'Fitting',
    'GSKT': 'Others', 'STB': 'Others',
}


def parse_dn(size_str):
    s = str(size_str).strip()
    dns = [int(m.group(1)) for m in re.finditer(r'DN\s*(\d+)', s, re.I)]
    if len(dns) == 1: return dns[0], None
    if len(dns) >= 2: return dns[0], dns[1]
    return None, None


def dn_to_dcode(dn):
    return DN_TO_DCODE.get(dn, f'D{dn:03d}') if dn else None


def sch_to_code(thick_str, item_code=None):
    s = str(thick_str).strip()
    if item_code in ('FLN', 'FLB', 'FLS', 'FLA'):
        m = re.match(r'CL(\d+)', s, re.I)
        if m:
            cl = int(m.group(1))
            return {150:'C150',300:'C300',600:'C600',900:'C900',1500:'C1500'}.get(cl, f'C{cl}')
        return s
    replacements = [
        ('S-10S','S10S'),('S-40S','S40S'),('S-20','S20'),('S-30','S30'),
        ('S-40','S40'),('S-80','S80'),('S-120','S120'),
        ('CL3000','C3K'),('CL6000','C6K'),
        ('CL1500','C1500'),('CL600','C600'),('CL300','C300'),('CL150','C150'),
        ('STD','STD'),
    ]
    first = s.split('x')[0].strip() if 'x' in s.lower() else s
    for src, dst in replacements:
        if src.upper() in first.upper(): return dst
    return first.replace('-', '').replace(' ', '')


def et_to_code(et_str, item_code=None, dn=None):
    s = str(et_str).strip().upper()
    if item_code in ('FLN', 'FLB', 'FLA', 'FLS'):
        if 'FF' in s: return 'FF'
        if 'RTJ' in s: return 'RTJ'
        return 'RF'
    if item_code in ('WOL', 'LAT'): return 'BW'
    if item_code in ('PIS', 'PIW', 'PIN'):
        return 'PE' if (dn and dn <= 50) else 'BW'
    if s in ('BLE X PSE', 'PLE X TSE', 'PBE'): return 'BW'
    if s == 'PE X TE': return 'PE'
    if s == 'BE': return 'BW'
    if s in ('PE', 'BW', 'SW'): return s
    if s in ('TH', 'THRD'): return 'TH'
    return s


def build_matcode(item_code, matl_code, main_dcode, sub_dcode, sch_code, et_code):
    if not all([item_code, matl_code, main_dcode, sch_code, et_code]): return None
    size_part = f'{main_dcode}{sub_dcode}' if sub_dcode else main_dcode
    return f'{item_code}-{matl_code}-{size_part}-{sch_code}-{et_code}'


def sql_val(v):
    if v is None: return 'NULL'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"


# ─── 대상 아이템 식별 ──────────────────────────────────────────────────────────
# A182-F92 관련: 해당 matl일 때만 NULL이었음 (다른 matl은 이미 matcode 있음)
F92_ITEMS = {'ELBOW LR 90D', 'COUPLING-FULL', 'ELBOW 45D'}
# 비표준 엘보: ITEM_MAP에 없어서 모든 행이 NULL이었음
NONSTD_ELBOW_ITEMS = {'ELBOW 30D', 'ELBOW LR 55D', 'ELBOW LR 72D', 'ELBOW SR 55D'}

wb = xlrd.open_workbook('Raw File/TOTAL BOM_260420.xls')
ws = wb.sheet_by_name('Piping&Fitting')

print('=== NULL matcode 수정 대상 파싱 ===\n')

fixes = {}   # (system, iso, line_no, full_desc) → new_mat_code
new_mcs = {} # 신규 matcode_master 후보

for i in range(1, ws.nrows):
    row = [ws.cell_value(i, j) for j in range(ws.ncols)]
    system  = str(row[0]).strip()
    iso     = str(row[1]).strip()
    line_no = str(row[2]).strip()
    item    = str(row[3]).strip()
    matl    = str(row[4]).strip()
    size    = str(row[5]).strip()
    thick   = str(row[6]).strip()
    et      = str(row[7]).strip()

    # F92 관련: matl이 A182-F92인 경우만
    if item in F92_ITEMS:
        if matl != 'A182-F92':
            continue
    # 비표준 엘보: 모든 행
    elif item in NONSTD_ELBOW_ITEMS:
        pass  # 전부 처리
    else:
        continue

    item_code = ITEM_MAP.get(item)
    matl_code = MATL_MAP.get(matl)

    if not item_code or not matl_code:
        continue  # 여전히 매핑 불가 (empty matl 등)

    dn1, dn2 = parse_dn(size)
    if item_code == 'CPH':
        main_dn, sub_dn = (dn2 if dn2 else dn1), None
    elif item_code in ('RDC', 'RDE', 'TER', 'WOL', 'LAT', 'SWC', 'SWE'):
        main_dn, sub_dn = dn1, dn2
    else:
        main_dn, sub_dn = dn1, None

    main_dcode = dn_to_dcode(main_dn)
    sub_dcode  = dn_to_dcode(sub_dn) if sub_dn else None
    sch        = sch_to_code(thick, item_code)
    et_c       = et_to_code(et, item_code, main_dn)

    mc = build_matcode(item_code, matl_code, main_dcode, sub_dcode, sch, et_c)
    if not mc:
        continue

    # full_description 재구성 (DB와 동일 포맷)
    full_desc = ', '.join(p for p in [item, matl, size, thick, et] if p)

    key = (system, iso, line_no, full_desc)
    fixes[key] = mc

    if mc not in MATCODE_MASTER and mc not in new_mcs:
        cat = ITEM_CATEGORY.get(item_code, 'Fitting')
        new_mcs[mc] = {
            'mat_code': mc, 'category': cat,
            'item_desc': item, 'matl_desc': matl,
            'size1': size, 'size2': size,
            'class_desc': thick, 'et_desc': et,
        }

print(f'수정 대상: {len(fixes)}건')
print(f'신규 matcode 필요: {len(new_mcs)}개')
if new_mcs:
    for mc in sorted(new_mcs):
        print(f'  + {mc}')

# ─── SQL 생성 ─────────────────────────────────────────────────────────────────
with open('scratch/fix_null_matcodes_bom.sql', 'w', encoding='utf-8') as f:
    f.write('-- NULL matcode BOM 행 수정 SQL (A182-F92 별도 자재 → AS92 + 비표준 각도 엘보)\n')
    f.write('-- Supabase SQL Editor에서 실행\n\n')

    if new_mcs:
        f.write('-- Step 1: 신규 matcode_master 등록\n')
        f.write('INSERT INTO material.matcode_master\n')
        f.write('  (mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc)\n')
        f.write('VALUES\n')
        rows = []
        for mc, info in sorted(new_mcs.items()):
            rows.append(
                f"  ({sql_val(info['mat_code'])}, {sql_val(info['category'])}, "
                f"{sql_val(info['item_desc'])}, {sql_val(info['matl_desc'])}, "
                f"{sql_val(info['size1'])}, {sql_val(info['size2'])}, "
                f"{sql_val(info['class_desc'])}, {sql_val(info['et_desc'])})"
            )
        f.write(',\n'.join(rows) + '\n')
        f.write('ON CONFLICT (mat_code) DO NOTHING;\n\n')

    f.write('-- Step 2: bom 행 UPDATE\n')
    # matcode 별로 그룹핑해서 OR 조건으로 묶기
    by_mc = defaultdict(list)
    for (system, iso, line_no, full_desc), mc in fixes.items():
        by_mc[mc].append((system, iso, line_no, full_desc))

    for mc, rows in sorted(by_mc.items()):
        f.write(f'-- {mc} ({len(rows)}건)\n')
        f.write(f'UPDATE material.bom\n')
        f.write(f'SET mat_code = {sql_val(mc)}\n')
        f.write('WHERE mat_code IS NULL\n')
        conds = []
        for (system, iso, line_no, full_desc) in rows:
            conds.append(
                f"  (system = {sql_val(system)} AND iso_dwg_no = {sql_val(iso)}"
                f" AND line_no = {sql_val(line_no)} AND full_description = {sql_val(full_desc)})"
            )
        f.write('  AND (\n' + '\n  OR '.join(conds) + '\n  );\n\n')

print(f'\nSQL → scratch/fix_null_matcodes_bom.sql')

# 매핑 결과 요약
by_item = defaultdict(set)
for (system, iso, line_no, full_desc), mc in fixes.items():
    item_name = full_desc.split(',')[0]
    by_item[item_name].add(mc)

print('\n=== 아이템별 수정 결과 ===')
for item_name in sorted(by_item):
    print(f'  {item_name}: → {sorted(by_item[item_name])}')
