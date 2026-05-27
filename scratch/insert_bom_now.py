# BOM INSERT 실행 스크립트 (TRUNCATE 완료 후 실행)
import json, requests, sys, io, time, re, xlrd
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
H = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}',
     'Content-Type': 'application/json', 'Accept-Profile': 'material',
     'Content-Profile': 'material', 'Prefer': 'return=minimal'}

# ─── 매핑 테이블 ──────────────────────────────────────────────────────────────
DN_TO_DCODE = {15:'D005',20:'D008',25:'D010',32:'D012',40:'D015',50:'D020',
               65:'D025',80:'D030',100:'D040',125:'D050',150:'D060',200:'D080',
               250:'D100',300:'D120',350:'D140',400:'D160',450:'D180',500:'D200',
               550:'D220',600:'D240',650:'D260',700:'D280',750:'D300',800:'D320',900:'D360'}
NPS_TO_DN = {'0.5':15,'1/2':15,'0.75':20,'3/4':20,'1':25,'1.0':25,'1.25':32,
             '1.5':40,'1-1/2':40,'2':50,'2.0':50,'2.5':65,'3':80,'3.0':80,
             '4':100,'4.0':100,'5':125,'5.0':125,'6':150,'6.0':150,'8':200,'8.0':200,
             '10':250,'10.0':250,'12':300,'12.0':300,'14':350,'14.0':350,'16':400,'16.0':400,
             '18':450,'18.0':450,'20':500,'20.0':500,'22':550,'22.0':550,'24':600,'24.0':600,
             '26':650,'26.0':650,'28':700,'28.0':700,'30':750,'30.0':750,'32':800,'32.0':800,'36':900,'36.0':900}
MATL_MAP = {
    'A105':'CS05','SA105':'CS05','A234-WPB':'CS05','A234-WPBW':'CS05',
    'A106-B':'CS06','A106-C':'CS06','SA106-B':'CS06',
    'A53-B':'A53B','A672-B60-CL22':'CSB6','A672-B60 CL22':'CSB6',
    'A182-F22':'AS22','A335-P22':'AS22','A234-WP22':'AS22',
    'A182-F91':'AS91','SA182-F91':'AS91','A335-P91':'AS91','SA335-P91':'AS91','A234-WP91':'AS91',
    'A182-F92':'S04L',  # F92 → A182-F304L (S04L)
    'A182-F304':'SS04','A312-TP304':'SS04','A312-TP304W':'SS04','A403-WP304':'SS04','A403-WP304W':'SS04',
    'A312-TP304L':'SS04','A312-TP304LW':'SS04','A403-WP304L':'SS04','A403-WP304LW':'SS04',
    'A182-F316':'SS16','A312-TP316':'SS16','A312-TP316H':'SS16',
    'A182-F316H':'SS16','A182-F316L':'SS16','A312-TP316L':'SS16',
    'A403-WP316':'SS16','A403-WP316W':'SS16','A234-WPC':'CSWC',
}
ITEM_MAP = {
    'PIPE SMLS':'PIS','PIPE WELDED':'PIW','PIPE NIPPLE':'PIN',
    'ELBOW LR 90D':'EL9L','ELBOW LR 89.4D':'EL9L','ELBOW LR 89.7D':'EL9L',
    'ELBOW LR 90.3D':'EL9L','ELBOW LR 90.6D':'EL9L',
    'ELBOW SR 90D':'EL9S','ELBOW 45D':'EL4L','ELBOW LR 45D':'EL4L',
    'ELBOW 30D':'EL4L',             # 30° ≤ 45°
    'ELBOW LR 55D':'EL9L',          # 55° > 45° LR
    'ELBOW LR 72D':'EL9L',          # 72° > 45° LR
    'ELBOW SR 55D':'EL9S',          # 55° > 45° SR
    'TEE':'TEE','TEE-RED':'TER','REDUCER-CON':'RDC','REDUCER-ECC':'RDE',
    'CAP':'CAP','WELDOLET':'WOL','LATROLET':'LAT',
    'COUPLING-HALF':'CPH','COUPLING-FULL':'CPF','SWAGE-CON':'SWC','SWAGE-ECC':'SWE',
    'FLANGE':'FLN','FLANGE-BLIND':'FLB',
}
ITEM_CATEGORY = {
    'PIS':'Pipe','PIW':'Pipe','PIN':'Fitting',
    'EL9L':'Fitting','EL9S':'Fitting','EL4L':'Fitting',
    'TEE':'Fitting','TER':'Fitting','RDC':'Fitting','RDE':'Fitting',
    'CAP':'Fitting','WOL':'Fitting','LAT':'Fitting',
    'CPH':'Fitting','CPF':'Fitting','SWC':'Fitting','SWE':'Fitting',
    'FLN':'Fitting','FLB':'Fitting','GSKT':'Others','STB':'Others',
}


def parse_dn(size_str):
    s = str(size_str).strip()
    dns = [int(m.group(1)) for m in re.finditer(r'DN\s*(\d+)', s, re.I)]
    if len(dns) == 1: return dns[0], None
    if len(dns) >= 2: return dns[0], dns[1]
    return None, None


def dn2d(dn): return DN_TO_DCODE.get(dn, f'D{dn:03d}') if dn else None


def sch_code(s, ic=None):
    s = str(s).strip()
    if ic in ('FLN', 'FLB', 'FLS', 'FLA'):
        m = re.match(r'CL(\d+)', s, re.I)
        if m:
            return {150:'C150',300:'C300',600:'C600',900:'C900',1500:'C1500'}.get(int(m.group(1)), f'C{m.group(1)}')
        return s
    reps = [('S-10S','S10S'),('S-40S','S40S'),('S-20','S20'),('S-30','S30'),
            ('S-40','S40'),('S-80','S80'),('S-120','S120'),
            ('CL3000','C3K'),('CL6000','C6K'),('CL1500','C1500'),
            ('CL600','C600'),('CL300','C300'),('CL150','C150'),('STD','STD')]
    first = s.split('x')[0].strip() if 'x' in s.lower() else s
    for src, dst in reps:
        if src.upper() in first.upper(): return dst
    return first.replace('-', '').replace(' ', '')


def et_code(s, ic=None, dn=None):
    s = str(s).strip().upper()
    if ic in ('FLN', 'FLB', 'FLA', 'FLS'):
        if 'FF' in s: return 'FF'
        if 'RTJ' in s: return 'RTJ'
        return 'RF'
    if ic in ('WOL', 'LAT'): return 'BW'
    if ic in ('PIS', 'PIW', 'PIN'):
        return 'PE' if (dn and dn <= 50) else 'BW'
    if s in ('BLE X PSE', 'PLE X TSE', 'PBE'): return 'BW'
    if s == 'PE X TE': return 'PE'
    if s == 'BE': return 'BW'
    if s in ('PE', 'BW', 'SW'): return s
    if s in ('TH', 'THRD'): return 'TH'
    return s


def sys_from_ln(ln):
    parts = str(ln).strip().split('-')
    return parts[1].strip() if len(parts) >= 2 else ''


def nps_from_ln(ln):
    m = re.match(r'(\d+(?:\.\d+)?)', str(ln).strip())
    return NPS_TO_DN.get(m.group(1)) if m else None


def gskt_type(desc):
    s = desc.upper()
    if '316' in s: return 'SW316'
    if '321' in s: return 'SW321'
    return 'SW304'


def stb_grade(desc):
    s = desc.upper()
    if 'B8M' in s: return 'B8M0'
    if 'B8' in s: return 'B800'
    if 'B16' in s: return 'B160'
    if 'B7' in s or 'GALVANIZED' in s: return 'B700'
    return None


# ─── 파싱 ─────────────────────────────────────────────────────────────────────
wb = xlrd.open_workbook('Raw File/TOTAL BOM_260420.xls')
records = []

print('Piping&Fitting 파싱 중...')
ws = wb.sheet_by_name('Piping&Fitting')
for i in range(1, ws.nrows):
    row = [ws.cell_value(i, j) for j in range(ws.ncols)]
    system = str(row[0]).strip()
    iso = str(row[1]).strip()
    ln = str(row[2]).strip()
    item = str(row[3]).strip()
    matl = str(row[4]).strip()
    size = str(row[5]).strip()
    thick = str(row[6]).strip()
    et = str(row[7]).strip()
    uom = str(row[8]).strip()
    try: qty = float(row[9])
    except: qty = 0.0
    if uom.upper() == 'MM':
        qty = round(qty / 1000, 4)
        uom = 'M'
    desc = ', '.join(p for p in [item, matl, size, thick, et] if p)
    ic = ITEM_MAP.get(item)
    mc_str = MATL_MAP.get(matl)
    mat_code = None
    cat = ITEM_CATEGORY.get(ic, 'Fitting') if ic else ('Pipe' if item.startswith('PIPE') else 'Fitting')
    if ic and mc_str:
        dn1, dn2 = parse_dn(size)
        main_dn = (dn2 if dn2 else dn1) if ic == 'CPH' else dn1
        sub_dn = None if ic == 'CPH' else (dn2 if ic in ('RDC', 'RDE', 'TER', 'WOL', 'LAT', 'SWC', 'SWE') else None)
        md = dn2d(main_dn); sd = dn2d(sub_dn)
        sc = sch_code(thick, ic); ec = et_code(et, ic, main_dn)
        if all([md, sc, ec]):
            sp = f'{md}{sd}' if sd else md
            mat_code = f'{ic}-{mc_str}-{sp}-{sc}-{ec}'
    records.append({'mat_code': mat_code, 'category': cat, 'tag': None,
                    'system': system, 'iso_dwg_no': iso, 'line_no': ln,
                    'full_description': desc, 'uom': uom, 'qty': qty})

print(f'  → {len(records)}건')

print('Bolt&Gasket 파싱 중...')
ws2 = wb.sheet_by_name('Bolt&Gasket')
agg = {}
for i in range(1, ws2.nrows):
    row = [ws2.cell_value(i, j) for j in range(ws2.ncols)]
    iso = str(row[2]).strip(); ln = str(row[3]).strip()
    item = str(row[4]).strip(); b_sz = str(row[5]).strip()
    try: qty = float(row[7])
    except: qty = 0.0
    if not iso or not item: continue
    sys_ = sys_from_ln(ln); dn = nps_from_ln(ln); dc = dn2d(dn)
    item_up = item.upper()
    if 'INSULATION' in item_up:
        key = (iso, ln, 'IGSKT', ''); mc = None; cat = 'Others'
        desc = f'INSULATION GASKET KIT, {ln[:50]}'
    elif 'SPIRAL' in item_up or 'GASKET' in item_up:
        gt = gskt_type(item); key = (iso, ln, 'GSKT', gt)
        mc = f'GSKT-{gt}-{dc}' if (gt and dc) else None; cat = 'Others'; desc = item[:120]
    elif 'STUD' in item_up or 'BOLT' in item_up:
        gr = stb_grade(item); key = (iso, ln, 'STB', gr or '', b_sz)
        mc = f'STB-{gr}-{dc}-L150-NA' if (gr and dc) else None; cat = 'Others'; desc = item[:120]
    else:
        key = (iso, ln, 'OTHER', item[:50]); mc = None; cat = 'Others'; desc = item[:120]
    k = str(key)
    if k not in agg:
        agg[k] = {'qty': 0.0, 'mat_code': mc, 'cat': cat, 'sys': sys_, 'iso': iso, 'ln': ln, 'desc': desc}
    agg[k]['qty'] += qty
    if mc and not agg[k]['mat_code']: agg[k]['mat_code'] = mc

for k, v in agg.items():
    records.append({'mat_code': v['mat_code'], 'category': v['cat'], 'tag': None,
                    'system': v['sys'], 'iso_dwg_no': v['iso'], 'line_no': v['ln'],
                    'full_description': v['desc'], 'uom': 'EA', 'qty': round(v['qty'], 2)})

total = len(records)
print(f'  → B&G {len(agg)}건 / 합계 {total}건\n')

# ─── INSERT ───────────────────────────────────────────────────────────────────
BATCH = 500
ok = 0
for start in range(0, total, BATCH):
    chunk = records[start:start + BATCH]
    r = requests.post(f'{SUPABASE_URL}/rest/v1/bom', headers=H, data=json.dumps(chunk))
    if r.status_code in (200, 201, 204):
        ok += len(chunk)
        if (start // BATCH) % 10 == 0:
            print(f'  {ok:>6}/{total}건 삽입됨...')
    else:
        print(f'오류 (row {start+1}~{start+len(chunk)}): {r.status_code} {r.text[:200]}')
        break
    time.sleep(0.03)

print(f'\n삽입 완료: {ok}/{total}건')

# 최종 확인
r2 = requests.get(f'{SUPABASE_URL}/rest/v1/bom?select=uom',
                  headers={**H, 'Prefer': 'count=exact', 'Range': '0-0'})
print(f'DB 최종 행 수: {r2.headers.get("Content-Range", "unknown")}')
