# BOM 표기 vs PO 표기 차이 기반으로 bom 테이블 mat_code 수정 SQL 생성
# 실제 입고된 사양(PO표기)으로 BOM mat_code를 일괄 수정
import sys, re, requests, openpyxl
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
HDR = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Accept-Profile': 'material'}
BASE    = 'c:/Users/PCLOVE/Downloads/ipcs-material/Raw File/'
IN_FILE = BASE + 'PO_List_Final_v22.xlsx'
OUT_SQL = 'c:/Users/PCLOVE/Downloads/ipcs-material/scratch/bom_revision_by_po.sql'

# ── 변환 테이블 ───────────────────────────────────────────────────────────────
ITEM_TO_PREFIX = {
    'PIPE SEAMLESS': 'PIS', 'PIPE WELDED': 'PIW',
    'PIPE WELDED/SEAMLESS': 'PIW', 'PIPE': 'PIW',
    'NIPPLE': 'PIN',
    'ELBOW LR 90D': 'EL9L', 'ELBOW SR 90D': 'EL9S', 'ELBOW 45D': 'EL4L',
    'ELBOW': 'EL9L',
    'TEE': 'TEE', 'TEE-RED': 'TER',
    'REDUCER-CON': 'RDC', 'REDUCER-ECC': 'RDE',
    'CAP': 'CAP',
    'FLANGE': 'FLN', 'FLANGE-BLIND': 'FLB', 'FLANGE-SOCKET': 'FLS',
    'FLANGE-SLIP': 'FLA', 'FLANGE-WELD': 'FLW',
    'WELDOLET': 'WOL', 'SOCKOLET': 'SOL', 'THREADOLET': 'TOL',
    'COUPLING-FULL': 'CPF', 'COUPLING-HALF': 'CPH', 'COUPLING': 'CPF',
    'SWAGE-CON': 'SCN', 'SWAGE-ECC': 'SCE', 'SWAGE': 'SCN',
    'UNION': 'UNI',
}
MATL_TO_CODE = {
    'A105': 'CS05', 'A234-WPB': 'CS05',
    'A182-F304': 'SS04', 'A403-WP304': 'SS04', 'A403-WP304W': 'SS04',
    'A312-TP304': 'SS04', 'A312-TP304W': 'SS04',
    'A182-F316': 'SS16', 'A403-WP316': 'SS16', 'A403-WP316W': 'SS16',
    'A312-TP316': 'SS16', 'A312-TP316W': 'SS16',
    'A182-F91': 'AS91', 'A234-WP91': 'AS91', 'A420-WPL6': 'LT06',
    'A106-B': 'CS06', 'A106-GRB': 'CS06',
}
DN_TO_DCODE = {
    15:'D005',20:'D008',25:'D010',32:'D013',40:'D015',50:'D020',
    65:'D025',80:'D030',100:'D040',125:'D050',150:'D060',200:'D080',
    250:'D100',300:'D120',350:'D140',400:'D160',450:'D180',500:'D200',
    550:'D220',600:'D240',650:'D260',700:'D280',750:'D300',800:'D320',
}
FLANGE_PREFIXES = {'FLN','FLB','FLS','FLA','FLW'}
SW_PREFIXES     = {'CPF','CPH','SCN','SCE','EL9L','EL9S','EL4L','TEE','TER','CAP','SOL','TOL'}
SMALL_BORE_DCODES = {'D005','D008','D010','D013','D015','D020'}

def normalize_class(raw):
    """S-10S, CL150, C300 등 정규화"""
    s = re.sub(r'\s', '', str(raw)).upper()
    s = re.sub(r'^S-', 'S', s)     # S-10S → S10S
    s = re.sub(r'^CL', 'C', s)     # CL150 → C150
    return s

def parse_desc(desc):
    """
    'REDUCER-ECC, A403-WP304W, DN 200 X DN 100, S-10S X S-10S, BW'
    → (item_prefix, matl_code, [d080,d040], class_desc, et_desc)
    """
    parts = [p.strip() for p in desc.split(',')]
    if len(parts) < 2:
        return None

    # ITEM
    item_raw = parts[0].upper()
    item_prefix = None
    for key in sorted(ITEM_TO_PREFIX, key=len, reverse=True):
        if item_raw.startswith(key):
            item_prefix = ITEM_TO_PREFIX[key]
            break
    if not item_prefix:
        return None

    # MATERIAL
    matl_raw = parts[1].strip().upper()
    matl_code = MATL_TO_CODE.get(matl_raw)
    if not matl_code:
        # 부분 매칭 시도
        for k, v in MATL_TO_CODE.items():
            if k.upper() in matl_raw or matl_raw in k.upper():
                matl_code = v
                break
    if not matl_code:
        matl_code = matl_raw  # 그대로 사용

    # DN → D-code
    dns_raw = ','.join(parts[2:])
    dns = re.findall(r'DN\s*(\d+)', dns_raw.upper())
    dcodes = []
    for dn in dns:
        dc = DN_TO_DCODE.get(int(dn))
        if dc:
            dcodes.append(dc)
    if not dcodes:
        return None

    # CLASS / SCHEDULE (parts[3] 또는 그 이후 첫 번째 S/C 패턴)
    class_raw = ''
    et_raw    = ''
    for p in parts[3:]:
        p = p.strip().upper()
        # ET code 추출 (BW, RF, SW, PE, BE, TH)
        if re.match(r'^(BW|RF|FF|SW|PE|BE|TH)$', p):
            et_raw = p
            continue
        # 첫 번째 schedule/class 토큰만 사용 (S-10S X S-10S → S-10S)
        tok = p.split('X')[0].strip() if 'X' in p else p
        if not class_raw and tok:
            class_raw = normalize_class(tok)

    # ET 기본값 결정
    if not et_raw:
        if item_prefix in FLANGE_PREFIXES:
            et_raw = 'RF'
        elif item_prefix in SW_PREFIXES and dcodes and dcodes[0] in SMALL_BORE_DCODES:
            et_raw = 'SW'
        else:
            et_raw = 'BW'

    return item_prefix, matl_code, dcodes, class_raw, et_raw

def build_matcode(item_prefix, matl_code, dcodes, class_desc, et_desc):
    size_part = dcodes[0] if len(dcodes) == 1 else ''.join(dcodes[:2])
    return f'{item_prefix}-{matl_code}-{size_part}-{class_desc}-{et_desc}'

# ── Supabase 조회 ─────────────────────────────────────────────────────────────
def fetch_all(table, select):
    rows, offset, limit = [], 0, 1000
    while True:
        params = {'select': select, 'offset': str(offset), 'limit': str(limit)}
        res = requests.get(f'{URL}/rest/v1/{table}', headers=HDR, params=params)
        data = res.json()
        if not isinstance(data, list) or not data:
            break
        rows.extend(data)
        if len(data) < limit:
            break
        offset += limit
    return rows

print('Supabase bom 조회...')
bom_rows = fetch_all('bom', 'mat_code,full_description,system,category')
bom_matcodes = {(r['mat_code'] or '').strip().upper() for r in bom_rows if r.get('mat_code')}
# bom의 category 조회용
bom_cat = {}
for r in bom_rows:
    mc = (r.get('mat_code') or '').strip().upper()
    if mc and mc not in bom_cat:
        bom_cat[mc] = r.get('category') or ''

print('matcode_master 조회...')
master_rows = fetch_all('matcode_master', 'mat_code,category,item_desc,matl_desc')
master_codes = {(r['mat_code'] or '').strip().upper() for r in master_rows}

# ── 미매칭 분석 로드 ──────────────────────────────────────────────────────────
print(f'미매칭 분석 로드: {IN_FILE}')
wb = openpyxl.load_workbook(IN_FILE, data_only=True)
ws = wb['미매칭 분석']

mismatches = []
for r in range(4, ws.max_row + 1):
    no       = ws.cell(r,1).value
    tag      = ws.cell(r,2).value
    po_no    = ws.cell(r,3).value
    bom_desc = ws.cell(r,4).value
    po_desc  = ws.cell(r,5).value
    reason   = ws.cell(r,6).value
    if not no or not tag:
        continue
    mismatches.append({
        'no': no, 'tag': str(tag).strip(),
        'po_no': str(po_no).strip() if po_no else '',
        'bom_desc': str(bom_desc).strip() if bom_desc else '',
        'po_desc':  str(po_desc).strip()  if po_desc  else '',
        'reason':   str(reason).strip()   if reason   else '',
    })
print(f'  → {len(mismatches)}건')

# ── 파싱 & 매핑 ──────────────────────────────────────────────────────────────
updates  = {}   # old_mc → new_mc
skipped  = []
same_mc  = []

for mm in mismatches:
    bom_parsed = parse_desc(mm['bom_desc'])
    po_parsed  = parse_desc(mm['po_desc'])

    if not bom_parsed or not po_parsed:
        skipped.append({'no': mm['no'], 'tag': mm['tag'],
                        'bom': mm['bom_desc'], 'po': mm['po_desc'],
                        'reason': '파싱 실패'})
        continue

    old_mc = build_matcode(*bom_parsed)
    new_mc = build_matcode(*po_parsed)

    if old_mc == new_mc:
        same_mc.append({'no': mm['no'], 'old': old_mc,
                        'bom': mm['bom_desc'], 'po': mm['po_desc']})
        continue

    # BOM에 old_mc가 존재하는지 확인
    if old_mc not in bom_matcodes:
        skipped.append({'no': mm['no'], 'tag': mm['tag'],
                        'bom': mm['bom_desc'], 'po': mm['po_desc'],
                        'reason': f'BOM에 {old_mc} 없음'})
        continue

    key = (old_mc, new_mc)
    if key not in updates:
        updates[key] = {'count': 0, 'tags': [], 'reason': mm['reason']}
    updates[key]['count'] += 1
    updates[key]['tags'].append(mm['tag'])

# ── 결과 출력 ─────────────────────────────────────────────────────────────────
print()
print('=' * 70)
print(f'분석 결과: 총 {len(mismatches)}건')
print(f'  동일 mat_code (설명만 다름): {len(same_mc)}건 → BOM 수정 불필요')
print(f'  mat_code 변경 필요:          {len(updates)}쌍 ({sum(v["count"] for v in updates.values())}건)')
print(f'  파싱 실패 / BOM 미존재:      {len(skipped)}건')
print('=' * 70)

print()
print('▶ mat_code 변경 목록:')
for (old_mc, new_mc), info in sorted(updates.items()):
    in_master = '✅' if new_mc in master_codes else '⚠️ master 없음'
    bom_cnt = sum(1 for r in bom_rows if (r.get('mat_code') or '').upper() == old_mc)
    print(f'  {old_mc}')
    print(f'    → {new_mc}  {in_master}  (영향 BOM행={bom_cnt}건, 미매칭={info["count"]}건)')

print()
print('▶ 파싱 실패 / BOM 미존재:')
for s in skipped:
    print(f'  [{s["no"]}] {s["tag"]}')
    print(f'       BOM: {s["bom"]}')
    print(f'        PO: {s["po"]}')
    print(f'    이유: {s["reason"]}')

print()
print('▶ 동일 mat_code (BOM 수정 불필요):')
for s in same_mc[:5]:
    print(f'  [{s["no"]}] {s["old"]}')
if len(same_mc) > 5:
    print(f'  ... 외 {len(same_mc)-5}건')

# ── SQL 생성 ──────────────────────────────────────────────────────────────────
lines = [
    '-- bom_revision_by_po.sql',
    '-- 미매칭 분析 기반 BOM mat_code 수정 (실제 입고 사양 반영)',
    '-- Supabase SQL Editor에서 실행',
    '',
    '-- ⚠️  실행 전 반드시 영향 범위 확인 후 진행',
    '',
]

# PART 1: matcode_master에 없는 new_mc 추가
new_mcs_missing = {new: old for (old, new) in updates if new not in master_codes}
if new_mcs_missing:
    lines += ['-- ── PART 1: matcode_master 신규 등록 (PO사양 신규 코드) ──────────────', '']
    def q(s): return "'" + str(s or '').replace("'","''") + "'"
    for new_mc, old_mc in sorted(new_mcs_missing.items()):
        lines.append(
            f"INSERT INTO material.matcode_master "
            f"(mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc) "
            f"SELECT {q(new_mc)},category,item_desc,matl_desc,size1,size2,"
            f"{q(new_mc.split('-')[3] if len(new_mc.split('-'))>3 else '')},"
            f"{q(new_mc.split('-')[4] if len(new_mc.split('-'))>4 else '')} "
            f"FROM material.matcode_master WHERE mat_code={q(old_mc)} LIMIT 1 "
            f"ON CONFLICT (mat_code) DO NOTHING;"
        )
    lines.append('')

# PART 2: bom UPDATE
lines += ['-- ── PART 2: bom mat_code UPDATE ────────────────────────────────────', '']
for (old_mc, new_mc), info in sorted(updates.items()):
    bom_cnt = sum(1 for r in bom_rows if (r.get('mat_code') or '').upper() == old_mc)
    lines.append(f'-- {old_mc} → {new_mc}  (BOM {bom_cnt}행 영향)')
    lines.append(f"UPDATE material.bom SET mat_code = '{new_mc}' WHERE mat_code = '{old_mc}';")
    lines.append('')

# PART 3: 확인
lines += [
    '-- ── 결과 확인 ──────────────────────────────────────────────────────────',
    "SELECT mat_code, COUNT(*) AS cnt FROM material.bom GROUP BY mat_code ORDER BY cnt DESC LIMIT 30;",
]

with open(OUT_SQL, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print()
print(f'SQL 저장: {OUT_SQL}')
