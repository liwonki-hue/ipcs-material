# matcode_master 누락 항목 INSERT SQL 생성
# bom+receiving에 있는데 matcode_master에 없는 mat_code를 찾아 INSERT SQL 생성
import sys, re, requests
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
HDR = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Accept-Profile': 'material'}
OUT = 'c:/Users/PCLOVE/Downloads/ipcs-material/scratch/update_matcode_master_missing.sql'

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

print('Supabase 조회 중...')
master_rows = fetch_all('matcode_master', 'mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc')
bom_rows    = fetch_all('bom', 'mat_code,full_description')
recv_rows   = fetch_all('receiving', 'mat_code,full_description')

master_codes = {(r['mat_code'] or '').strip().upper() for r in master_rows if r.get('mat_code')}
bom_codes    = {(r['mat_code'] or '').strip().upper() for r in bom_rows    if r.get('mat_code')}
recv_codes   = {(r['mat_code'] or '').strip().upper() for r in recv_rows   if r.get('mat_code')}

all_used = bom_codes | recv_codes
missing  = sorted(all_used - master_codes)
print(f'matcode_master: {len(master_codes)}건 / bom+recv: {len(all_used)}건 / 누락: {len(missing)}건')

# ── 파싱 헬퍼 ──────────────────────────────────────────────────────────────────
# matcode_master에서 (item_prefix, matl_code) 조합별 item_desc/matl_desc 조회
master_lookup = {}  # (item_prefix, matl_code) → {item_desc, matl_desc, category}
for r in master_rows:
    mc = (r.get('mat_code') or '').upper()
    parts = mc.split('-')
    if len(parts) >= 2:
        key = (parts[0], parts[1])
        if key not in master_lookup:
            master_lookup[key] = {
                'item_desc':  r.get('item_desc') or '',
                'matl_desc':  r.get('matl_desc') or '',
                'category':   r.get('category')  or '',
            }

DCODE_TO_INCH = {
    'D005': '1/2"', 'D008': '3/4"', 'D010': '1"',   'D013': '1-1/4"',
    'D015': '1-1/2"', 'D020': '2"', 'D025': '2-1/2"', 'D030': '3"',
    'D040': '4"',  'D050': '5"',  'D060': '6"',   'D080': '8"',
    'D100': '10"', 'D120': '12"', 'D140': '14"', 'D160': '16"',
    'D180': '18"', 'D200': '20"', 'D220': '22"', 'D240': '24"',
    'D260': '26"', 'D280': '28"', 'D300': '30"', 'D320': '32"',
}
DCODE_TO_DN = {
    'D005': 'DN 15',  'D008': 'DN 20',  'D010': 'DN 25',  'D013': 'DN 32',
    'D015': 'DN 40',  'D020': 'DN 50',  'D025': 'DN 65',  'D030': 'DN 80',
    'D040': 'DN 100', 'D050': 'DN 125', 'D060': 'DN 150', 'D080': 'DN 200',
    'D100': 'DN 250', 'D120': 'DN 300', 'D140': 'DN 350', 'D160': 'DN 400',
    'D180': 'DN 450', 'D200': 'DN 500', 'D220': 'DN 550', 'D240': 'DN 600',
    'D260': 'DN 650', 'D280': 'DN 700', 'D300': 'DN 750', 'D320': 'DN 800',
}
ITEM_CAT = {
    'PIS': ('PIPE', 'Pipe'),
    'PIW': ('PIPE', 'Pipe'),
    'PIN': ('PIPE', 'Pipe'),
    'EL9L': ('ELBOW LR 90D', 'Fitting'),
    'EL9S': ('ELBOW SR 90D', 'Fitting'),
    'EL4L': ('ELBOW 45D', 'Fitting'),
    'TEE': ('TEE', 'Fitting'),
    'TER': ('TEE-RED', 'Fitting'),
    'RDC': ('REDUCER-CON', 'Fitting'),
    'RDE': ('REDUCER-ECC', 'Fitting'),
    'CAP': ('CAP', 'Fitting'),
    'FLN': ('FLANGE', 'Fitting'),
    'FLA': ('FLANGE-SLIP', 'Fitting'),
    'FLB': ('FLANGE-BLIND', 'Fitting'),
    'FLS': ('FLANGE-SOCKET', 'Fitting'),
    'WOL': ('WELDOLET', 'Fitting'),
    'SOL': ('SOCKOLET', 'Fitting'),
    'CPF': ('COUPLING-FULL', 'Fitting'),
    'CPH': ('COUPLING-HALF', 'Fitting'),
    'SCN': ('SWAGE-CON', 'Fitting'),
    'SCE': ('SWAGE-ECC', 'Fitting'),
    'GTV': ('GATE VALVE', 'Valve'),
    'GLV': ('GLOBE VALVE', 'Valve'),
    'CHV': ('CHECK VALVE', 'Valve'),
    'BFV': ('BUTTERFLY VALVE', 'Valve'),
    'PLV': ('PLUG VALVE', 'Valve'),
    'BAV': ('BALL VALVE', 'Valve'),
    'PSV': ('PRESSURE SAFETY VALVE', 'Valve'),
    'GSKT': ('GASKET', 'Others'),
    'STB': ('STUD BOLT', 'Others'),
    'NUT': ('NUT', 'Others'),
}

def dcode_to_size(dc):
    """단일 D-code → (size1_inch, size2_DN)"""
    return DCODE_TO_INCH.get(dc, dc), DCODE_TO_DN.get(dc, dc)

def parse_matcode(mc):
    """mat_code → dict(category, item_desc, matl_desc, size1, size2, class_desc, et_desc)"""
    parts = mc.split('-')
    if len(parts) < 3:
        return None
    item_prefix = parts[0]
    matl_code   = parts[1] if len(parts) > 1 else ''
    # size parts: 'D030D025' or 'D060' etc (may be in part[2] or combined)
    size_raw    = parts[2] if len(parts) > 2 else ''
    class_raw   = parts[3] if len(parts) > 3 else ''
    et_raw      = parts[4] if len(parts) > 4 else ''

    # item_desc / category 결정
    info = ITEM_CAT.get(item_prefix)
    if info:
        item_desc, category = info
    else:
        # master_lookup에서 찾기
        lu = master_lookup.get((item_prefix, matl_code))
        item_desc = lu['item_desc'] if lu else item_prefix
        category  = lu['category']  if lu else 'Fitting'

    # matl_desc: master_lookup 우선, 없으면 matl_code 그대로
    lu = master_lookup.get((item_prefix, matl_code))
    matl_desc = lu['matl_desc'] if lu else matl_code

    # size1, size2 파싱
    # size_raw 예: 'D060', 'D120D100', 'D280D180'
    dcodes = re.findall(r'D\d{3}', size_raw)
    if len(dcodes) == 2:
        s1i, s1d = dcode_to_size(dcodes[0])
        s2i, s2d = dcode_to_size(dcodes[1])
        size1 = f'{s1i} x {s2i}'
        size2 = f'{s1d} x {s2d}'
    elif len(dcodes) == 1:
        size1, size2 = dcode_to_size(dcodes[0])
    else:
        size1 = size_raw
        size2 = size_raw

    # STB 특수 처리: suffix 없음 (L150은 이미 포함되어 있을 수도)
    if item_prefix == 'STB':
        # STB-B700-D060-L150-NA 형식이면 class_desc='L150', et_desc='NA'
        class_desc = class_raw or 'L150'
        et_desc    = et_raw    or 'NA'
    else:
        class_desc = class_raw
        et_desc    = et_raw

    return {
        'category':   category,
        'item_desc':  item_desc,
        'matl_desc':  matl_desc,
        'size1':      size1,
        'size2':      size2,
        'class_desc': class_desc,
        'et_desc':    et_desc,
    }

def q(s):
    return "'" + str(s).replace("'", "''") + "'"

# ── SQL 생성 ──────────────────────────────────────────────────────────────────
lines = [
    '-- update_matcode_master_missing.sql',
    '-- bom/receiving에 존재하나 matcode_master에 없는 mat_code INSERT',
    '-- Supabase SQL Editor에서 실행',
    '',
]

ok_count = 0
skip_count = 0
for mc in missing:
    parsed = parse_matcode(mc)
    if not parsed:
        lines.append(f'-- SKIP (파싱 불가): {mc}')
        skip_count += 1
        continue
    cols = 'mat_code,category,item_desc,matl_desc,size1,size2,class_desc,et_desc'
    vals = ','.join([
        q(mc),
        q(parsed['category']),
        q(parsed['item_desc']),
        q(parsed['matl_desc']),
        q(parsed['size1']),
        q(parsed['size2']),
        q(parsed['class_desc']),
        q(parsed['et_desc']),
    ])
    lines.append(f"INSERT INTO material.matcode_master ({cols}) VALUES ({vals})")
    lines.append(f"ON CONFLICT (mat_code) DO NOTHING;")
    ok_count += 1

lines += [
    '',
    '-- ── 결과 확인 ──────────────────────────────────────────────────────',
    "SELECT COUNT(*) AS total FROM material.matcode_master;",
]

sql_text = '\n'.join(lines)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(sql_text)

print(f'SQL 생성 완료: {OUT}')
print(f'  INSERT: {ok_count}건 / 파싱불가: {skip_count}건')
print()
print('-- 처음 20줄 미리보기 --')
for line in lines[:30]:
    print(line)
