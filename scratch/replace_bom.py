# TOTAL_BOM_260420.xls → Supabase bom 테이블 교체 스크립트
# Piping&Fitting + Bolt&Gasket 파싱 → matcode 매핑 → SQL 생성
import xlrd
import json
import sys
import io
import re
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ─── matcode_master 로드 ──────────────────────────────────────────────────────
with open('scratch/matcode_master_dump.json', encoding='utf-8') as f:
    MATCODE_MASTER = {m['mat_code']: m for m in json.load(f)}

# ─── DN → D-code 매핑 ────────────────────────────────────────────────────────
DN_TO_DCODE = {
    15: 'D005', 20: 'D008', 25: 'D010', 32: 'D012', 40: 'D015',
    50: 'D020', 65: 'D025', 80: 'D030', 100: 'D040', 125: 'D050',
    150: 'D060', 200: 'D080', 250: 'D100', 300: 'D120', 350: 'D140',
    400: 'D160', 450: 'D180', 500: 'D200', 550: 'D220', 600: 'D240',
    650: 'D260', 700: 'D280', 750: 'D300', 800: 'D320', 900: 'D360',
}

# NPS(인치) 문자열 → DN
NPS_TO_DN = {
    '0.5': 15, '1/2': 15,
    '0.75': 20, '3/4': 20,
    '1': 25, '1.0': 25,
    '1.25': 32, '1-1/4': 32,
    '1.5': 40, '1-1/2': 40,
    '2': 50, '2.0': 50,
    '2.5': 65, '2-1/2': 65,
    '3': 80, '3.0': 80,
    '4': 100, '4.0': 100,
    '5': 125, '5.0': 125,
    '6': 150, '6.0': 150,
    '8': 200, '8.0': 200,
    '10': 250, '10.0': 250,
    '12': 300, '12.0': 300,
    '14': 350, '14.0': 350,
    '16': 400, '16.0': 400,
    '18': 450, '18.0': 450,
    '20': 500, '20.0': 500,
    '22': 550, '22.0': 550,
    '24': 600, '24.0': 600,
    '26': 650, '26.0': 650,
    '28': 700, '28.0': 700,
    '30': 750, '30.0': 750,
    '32': 800, '32.0': 800,
    '36': 900, '36.0': 900,
}


def parse_dn(size_str):
    """'DN 250' → 250, 'DN 250 x DN 150' → (250, 150)"""
    s = str(size_str).strip()
    parts = [p.strip() for p in s.split('x')]
    dns = []
    for p in parts:
        m = re.search(r'DN\s*(\d+)', p, re.I)
        if m:
            dns.append(int(m.group(1)))
    if len(dns) == 1:
        return dns[0], None
    elif len(dns) >= 2:
        return dns[0], dns[1]
    return None, None


def dn_to_dcode(dn):
    return DN_TO_DCODE.get(dn, f'D{dn:03d}') if dn else None


def size_to_dcodes(size_str, item_code=None):
    """SIZE → (main_dcode, sub_dcode or None)"""
    dn1, dn2 = parse_dn(size_str)
    d1 = dn_to_dcode(dn1)
    d2 = dn_to_dcode(dn2) if dn2 else None
    # COUPLING-HALF: D-code는 소구경(outlet) 기준
    if item_code == 'CPH' and d2:
        return d2, None
    return d1, d2


# ─── MATL 코드 매핑 ───────────────────────────────────────────────────────────
MATL_MAP = {
    'A105': 'CS05', 'SA105': 'CS05',
    'A234-WPB': 'CS05', 'A234-WPBW': 'CS05',
    'A106-B': 'CS06', 'A106-C': 'CS06', 'SA106-B': 'CS06',
    'A53-B': 'A53B', 'A53B': 'A53B',
    'A672-B60-CL22': 'CSB6', 'A672-B60 CL22': 'CSB6',
    'A182-F22': 'AS22', 'A335-P22': 'AS22', 'A234-WP22': 'AS22',
    'A182-F91': 'AS91', 'SA182-F91': 'AS91',
    'A335-P91': 'AS91', 'SA335-P91': 'AS91', 'A234-WP91': 'AS91',
    'A182-F92': 'AS92',  # F92: F91과 유사하나 별도 자재 → AS92 신규 코드
    'A182-F304': 'SS04', 'A312-TP304': 'SS04', 'A312-TP304W': 'SS04',
    'A403-WP304': 'SS04', 'A403-WP304W': 'SS04',
    'A312-TP304L': 'SS04', 'A312-TP304LW': 'SS04',
    'A403-WP304L': 'SS04', 'A403-WP304LW': 'SS04',
    'A182-F316': 'SS16', 'A312-TP316': 'SS16', 'A312-TP316H': 'SS16',
    'A182-F316H': 'SS16', 'A182-F316L': 'SS16', 'A312-TP316L': 'SS16',
    'A403-WP316': 'SS16', 'A403-WP316W': 'SS16',
    'A234-WPC': 'CSWC',
}

# ─── ITEM 코드 매핑 ───────────────────────────────────────────────────────────
ITEM_MAP = {
    'PIPE SMLS': 'PIS',
    'PIPE WELDED': 'PIW',
    'PIPE NIPPLE': 'PIN',
    'ELBOW LR 90D': 'EL9L',
    'ELBOW LR 89.4D': 'EL9L', 'ELBOW LR 89.7D': 'EL9L',
    'ELBOW LR 90.3D': 'EL9L', 'ELBOW LR 90.6D': 'EL9L',
    'ELBOW SR 90D': 'EL9S',
    'ELBOW 45D': 'EL4L', 'ELBOW LR 45D': 'EL4L',
    'ELBOW 30D': 'EL4L',                            # 30° ≤ 45° → 45도 처리
    'ELBOW LR 55D': 'EL9L', 'ELBOW LR 72D': 'EL9L', # >45° → 90도 LR 처리
    'ELBOW SR 55D': 'EL9S',                          # >45° → 90도 SR 처리
    'TEE': 'TEE',
    'TEE-RED': 'TER',
    'REDUCER-CON': 'RDC',
    'REDUCER-ECC': 'RDE',
    'CAP': 'CAP',
    'WELDOLET': 'WOL',
    'LATROLET': 'LAT',
    'COUPLING-HALF': 'CPH',
    'COUPLING-FULL': 'CPF',
    'SWAGE-CON': 'SWC',
    'SWAGE-ECC': 'SWE',
    'FLANGE': 'FLN',
    'FLANGE-BLIND': 'FLB',
}

# ─── CATEGORY 매핑 ────────────────────────────────────────────────────────────
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


def sch_to_code(thick_str, item_code=None):
    """SCH/THICK 문자열 → matcode SCH 부분"""
    s = str(thick_str).strip()
    # 플랜지: CL150 X S-40 → C150 (class만 추출)
    if item_code in ('FLN', 'FLB', 'FLS', 'FLA'):
        m = re.match(r'CL(\d+)', s, re.I)
        if m:
            cl = int(m.group(1))
            if cl == 150: return 'C150'
            if cl == 300: return 'C300'
            if cl == 600: return 'C600'
            if cl == 900: return 'C900'
            if cl == 1500: return 'C1500'
            return f'C{cl}'
        return s
    # 일반 SCH: 순서 중요 - 긴 패턴 먼저
    replacements = [
        ('S-10S', 'S10S'), ('S-40S', 'S40S'), ('S-20', 'S20'), ('S-30', 'S30'),
        ('S-40', 'S40'), ('S-80', 'S80'), ('S-120', 'S120'),
        ('CL3000', 'C3K'), ('CL6000', 'C6K'),
        ('CL1500', 'C1500'), ('CL600', 'C600'),
        ('CL300', 'C300'), ('CL150', 'C150'),
        ('STD', 'STD'),
    ]
    # 복합 SCH: "S-40 x S-80" → 대구경(첫번째) SCH 사용
    first = s.split('x')[0].strip() if 'x' in s.lower() else s
    for src, dst in replacements:
        if src.upper() in first.upper():
            return dst
    return first.replace('-', '').replace(' ', '')


def et_to_code(et_str, item_code=None, dn=None):
    """END TYPE → matcode ET 부분"""
    s = str(et_str).strip().upper()
    # 플랜지 페이스 처리
    if item_code in ('FLN', 'FLB', 'FLA', 'FLS'):
        if 'FF' in s: return 'FF'
        if 'RTJ' in s: return 'RTJ'
        return 'RF'  # WNRF / SWRF / RF 모두 RF
    # WOL, LAT: 항상 -BW (메인파이프 버트용접)
    if item_code in ('WOL', 'LAT'):
        return 'BW'
    # 파이프 (PIS, PIW, PIN): DN≤50 → PE, DN≥65 → BW (기존 matcode 규칙)
    if item_code in ('PIS', 'PIW', 'PIN'):
        if dn and dn <= 50:
            return 'PE'
        return 'BW'  # 대구경: BE지만 기존 matcode는 -BW 사용
    # 스웨이지/니플 엔드타입
    if s in ('BLE X PSE', 'PLE X TSE', 'PBE'):
        return 'BW'
    if s == 'PE X TE':
        return 'PE'
    if s == 'BE': return 'BW'  # BE → BW (matcode 규칙)
    if s == 'PE': return 'PE'
    if s == 'BW': return 'BW'
    if s == 'SW': return 'SW'
    if s in ('TH', 'THRD'): return 'TH'
    return s


def build_matcode(item_code, matl_code, main_dcode, sub_dcode, sch_code, et_code):
    """matcode 조합"""
    if not all([item_code, matl_code, main_dcode, sch_code, et_code]):
        return None
    size_part = f'{main_dcode}{sub_dcode}' if sub_dcode else main_dcode
    return f'{item_code}-{matl_code}-{size_part}-{sch_code}-{et_code}'


def get_category_from_matcode(mat_code):
    if mat_code in MATCODE_MASTER:
        cat = MATCODE_MASTER[mat_code]['category']
        # 정규화
        if cat == 'Other': cat = 'Others'
        return cat
    return None


def extract_system_from_lineno(line_no):
    """라인번호에서 시스템 코드 추출: '4\"-HWS-B1-...' → 'HWS'"""
    parts = str(line_no).strip().split('-')
    if len(parts) >= 2:
        # 첫 파트는 크기("4\""), 두번째가 시스템
        return parts[1].strip()
    return ''


def nps_from_lineno(line_no):
    """라인번호에서 NPS(인치) 추출: '4\"-HWS-...' → 4 → DN100"""
    m = re.match(r'(\d+(?:\.\d+)?)"', str(line_no).strip())
    if m:
        nps_str = m.group(1)
        dn = NPS_TO_DN.get(nps_str)
        return dn
    return None


# ─── GSKT 재료 매핑 ───────────────────────────────────────────────────────────
def gskt_type_code(item_desc):
    s = str(item_desc).upper()
    if '316' in s:
        return 'SW316'
    if '321' in s:
        return 'SW321'
    if '304' in s or 'SPIRAL' in s:
        return 'SW304'
    return None


def stb_grade_code(item_desc):
    s = str(item_desc).upper()
    if 'B8M' in s:
        return 'B8M0'
    if 'B8' in s:
        return 'B800'
    if 'B16' in s:
        return 'B160'
    if 'B7' in s or 'GALVANIZED' in s:
        return 'B700'
    return None


# ─── Piping&Fitting 파싱 ──────────────────────────────────────────────────────
def parse_pf_sheet(ws):
    records = []
    new_matcodes = {}  # 새로 필요한 matcode → 예시 row info
    unmatched_items = defaultdict(int)

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
        uom     = str(row[8]).strip()
        qty_raw = row[9]

        # qty 정규화: MM → M
        try:
            qty = float(qty_raw)
        except:
            qty = 0.0
        if uom.upper() == 'MM':
            qty = round(qty / 1000, 4)
            uom = 'M'

        # full_description 조합
        desc_parts = [p for p in [item, matl, size, thick, et] if p]
        full_desc = ', '.join(desc_parts)

        # matcode 생성 시도
        item_code = ITEM_MAP.get(item)
        matl_code = MATL_MAP.get(matl)

        if item_code and matl_code:
            dn1, dn2 = parse_dn(size)
            # CPH: outlet(소구경) 기준
            if item_code == 'CPH':
                main_dn = dn2 if dn2 else dn1
                sub_dn = None
            elif item_code in ('RDC', 'RDE', 'TER', 'WOL', 'LAT', 'SWC', 'SWE'):
                main_dn = dn1
                sub_dn = dn2
            else:
                main_dn = dn1
                sub_dn = None

            main_dcode = dn_to_dcode(main_dn)
            sub_dcode  = dn_to_dcode(sub_dn) if sub_dn else None
            sch_code   = sch_to_code(thick, item_code)
            et_code    = et_to_code(et, item_code, main_dn)

            mat_code = build_matcode(item_code, matl_code, main_dcode, sub_dcode, sch_code, et_code)

            if mat_code:
                if mat_code not in MATCODE_MASTER:
                    # 신규 matcode 후보
                    if mat_code not in new_matcodes:
                        category = ITEM_CATEGORY.get(item_code, 'Fitting')
                        new_matcodes[mat_code] = {
                            'mat_code': mat_code,
                            'category': category,
                            'item_desc': item,
                            'matl_desc': matl,
                            'size1': size,
                            'size2': size,
                            'class_desc': thick,
                            'et_desc': et,
                            'example_row': i + 1
                        }
                category = ITEM_CATEGORY.get(item_code, 'Fitting')
            else:
                mat_code = None
                category = ITEM_CATEGORY.get(item_code, 'Fitting')
                unmatched_items[f'{item}|{matl}|{size}|{thick}|{et}'] += 1
        else:
            mat_code = None
            # 언매핑 아이템 카테고리 추론
            if item in ('FLANGE', 'FLANGE-BLIND', 'CAP', 'TEE', 'TEE-RED'):
                category = 'Fitting'
            elif item.startswith('PIPE'):
                category = 'Pipe'
            elif item in ('GSKT',):
                category = 'Others'
            else:
                category = 'Fitting'  # 기본값
            if not item_code:
                unmatched_items[f'[NO_ITEM_CODE] {item}'] += 1
            elif not matl_code:
                unmatched_items[f'[NO_MATL_CODE] {item}|{matl}'] += 1

        records.append({
            'mat_code': mat_code,
            'category': category,
            'tag': None,
            'system': system,
            'iso_dwg_no': iso,
            'line_no': line_no,
            'full_description': full_desc,
            'uom': uom,
            'qty': qty,
        })

    return records, new_matcodes, unmatched_items


# ─── Bolt&Gasket 파싱 ─────────────────────────────────────────────────────────
def parse_bg_sheet(ws):
    records = []
    new_matcodes = {}
    # col: 0=implied, 1=GUID, 2=ISO, 3=LineNo, 4=Items, 5=BoltSize, 6=BoltLength, 7=Qty
    # 집계: (iso, line_no, system, item_key) → sum qty
    agg = defaultdict(lambda: {'qty': 0.0, 'info': {}})

    for i in range(1, ws.nrows):
        row = [ws.cell_value(i, j) for j in range(ws.ncols)]
        iso     = str(row[2]).strip()
        line_no = str(row[3]).strip()
        item    = str(row[4]).strip()
        b_size  = str(row[5]).strip()
        b_len   = str(row[6]).strip()
        try:
            qty = float(row[7])
        except:
            qty = 0.0

        if not iso or not item:
            continue

        system = extract_system_from_lineno(line_no)

        if 'INSULATION' in item.upper():
            item_type = 'IGSKT'
            mat_code = None
            category = 'Others'
            gskt_code = None
            item_key = (iso, line_no, 'IGSKT', '')
            full_desc = f'INSULATION GASKET KIT, {line_no}'
        elif 'SPIRAL' in item.upper() or 'GASKET' in item.upper():
            item_type = 'GSKT'
            gskt_code = gskt_type_code(item)
            category = 'Others'
            # 플랜지 DN: 라인번호에서 파이프 사이즈 추출
            dn = nps_from_lineno(line_no)
            dcode = dn_to_dcode(dn) if dn else None
            if gskt_code and dcode:
                mat_code = f'GSKT-{gskt_code}-{dcode}'
                if mat_code not in MATCODE_MASTER:
                    new_matcodes[mat_code] = {
                        'mat_code': mat_code,
                        'category': 'Others',
                        'item_desc': 'GSKT',
                        'matl_desc': gskt_code,
                        'size1': f'DN {dn}',
                        'size2': f'DN {dn}',
                        'class_desc': '',
                        'et_desc': 'RF',
                        'example_row': i + 1
                    }
            else:
                mat_code = None
            full_desc = item[:120]  # 긴 설명 truncate
            item_key = (iso, line_no, 'GSKT', gskt_code or '')
        elif 'STUD' in item.upper() or 'BOLT' in item.upper():
            item_type = 'STB'
            grade_code = stb_grade_code(item)
            category = 'Others'
            dn = nps_from_lineno(line_no)
            dcode = dn_to_dcode(dn) if dn else None
            if grade_code and dcode:
                mat_code = f'STB-{grade_code}-{dcode}-L150-NA'
                if mat_code not in MATCODE_MASTER:
                    new_matcodes[mat_code] = {
                        'mat_code': mat_code,
                        'category': 'Others',
                        'item_desc': 'STB',
                        'matl_desc': grade_code,
                        'size1': f'DN {dn}',
                        'size2': f'DN {dn}',
                        'class_desc': b_size,
                        'et_desc': 'NA',
                        'example_row': i + 1
                    }
            else:
                mat_code = None
            full_desc = item[:120]
            item_key = (iso, line_no, 'STB', grade_code or '', b_size)
        else:
            item_type = 'OTHER'
            mat_code = None
            category = 'Others'
            full_desc = item[:120]
            item_key = (iso, line_no, 'OTHER', item[:50])

        key = str(item_key)
        agg[key]['qty'] += qty
        if not agg[key]['info']:
            agg[key]['info'] = {
                'mat_code': mat_code,
                'category': category,
                'system': system,
                'iso_dwg_no': iso,
                'line_no': line_no,
                'full_description': full_desc,
                'uom': 'EA',
            }
        else:
            # matcode가 확정된 것으로 업데이트
            if mat_code and not agg[key]['info']['mat_code']:
                agg[key]['info']['mat_code'] = mat_code

    for key, data in agg.items():
        info = data['info']
        records.append({
            'mat_code': info['mat_code'],
            'category': info['category'],
            'tag': None,
            'system': info['system'],
            'iso_dwg_no': info['iso_dwg_no'],
            'line_no': info['line_no'],
            'full_description': info['full_description'],
            'uom': info['uom'],
            'qty': round(data['qty'], 2),
        })

    return records, new_matcodes


# ─── SQL 에스케이프 ───────────────────────────────────────────────────────────
def sql_val(v):
    if v is None:
        return 'NULL'
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


# ─── 메인 실행 ────────────────────────────────────────────────────────────────
def main():
    print('=== TOTAL BOM 260420 처리 시작 ===\n')
    wb = xlrd.open_workbook('Raw File/TOTAL BOM_260420.xls')

    # 1. Piping&Fitting 파싱
    ws_pf = wb.sheet_by_name('Piping&Fitting')
    print(f'Piping&Fitting: {ws_pf.nrows - 1}행 파싱 중...')
    pf_records, pf_new_mats, pf_unmatched = parse_pf_sheet(ws_pf)
    print(f'  → {len(pf_records)}건 레코드, {len(pf_new_mats)}개 신규 matcode 후보, '
          f'{sum(pf_unmatched.values())}건 미매핑')

    # 2. Bolt&Gasket 파싱
    ws_bg = wb.sheet_by_name('Bolt&Gasket')
    print(f'Bolt&Gasket: {ws_bg.nrows - 1}행 파싱 중...')
    bg_records, bg_new_mats = parse_bg_sheet(ws_bg)
    print(f'  → {len(bg_records)}건 레코드 (집계 후), {len(bg_new_mats)}개 신규 matcode 후보')

    all_records = pf_records + bg_records
    all_new_mats = {**pf_new_mats, **bg_new_mats}

    print(f'\n총 BOM 레코드: {len(all_records)}건')
    print(f'총 신규 matcode 후보: {len(all_new_mats)}개')

    # 3. 신규 matcode SQL 출력
    with open('scratch/01_new_matcodes.sql', 'w', encoding='utf-8') as f:
        f.write('-- 신규 matcode_master 등록 SQL (TOTAL BOM 260420 기준)\n')
        f.write('-- Supabase SQL Editor에서 실행\n\n')
        if all_new_mats:
            f.write('INSERT INTO material.matcode_master '
                    '(mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc)\nVALUES\n')
            rows = []
            for mc, info in sorted(all_new_mats.items()):
                rows.append(
                    f"  ({sql_val(info['mat_code'])}, {sql_val(info['category'])}, "
                    f"{sql_val(info['item_desc'])}, {sql_val(info['matl_desc'])}, "
                    f"{sql_val(info['size1'])}, {sql_val(info['size2'])}, "
                    f"{sql_val(info['class_desc'])}, {sql_val(info['et_desc'])})"
                )
            f.write(',\n'.join(rows) + '\n')
            f.write('ON CONFLICT (mat_code) DO NOTHING;\n')
        else:
            f.write('-- 신규 matcode 없음\n')
    print(f'\n신규 matcode SQL → scratch/01_new_matcodes.sql')

    # 4. BOM 교체 SQL 생성 (TRUNCATE + INSERT 청크)
    chunk_size = 2000
    total = len(all_records)
    file_count = 0
    for start in range(0, total, chunk_size):
        chunk = all_records[start:start + chunk_size]
        fname = f'scratch/02_bom_insert_{file_count:02d}.sql'
        with open(fname, 'w', encoding='utf-8') as f:
            if file_count == 0:
                f.write('-- BOM 교체 SQL Part 1: TRUNCATE + INSERT\n')
                f.write('-- !! 이 파일을 가장 먼저 실행하세요 !!\n\n')
                f.write('TRUNCATE TABLE material.bom;\n\n')
            else:
                f.write(f'-- BOM INSERT Part {file_count + 1} (row {start+1}~{start+len(chunk)})\n\n')
            f.write('INSERT INTO material.bom '
                    '(mat_code, category, tag, system, iso_dwg_no, line_no, full_description, uom, qty)\nVALUES\n')
            row_strs = []
            for r in chunk:
                row_strs.append(
                    f"  ({sql_val(r['mat_code'])}, {sql_val(r['category'])}, "
                    f"{sql_val(r['tag'])}, {sql_val(r['system'])}, "
                    f"{sql_val(r['iso_dwg_no'])}, {sql_val(r['line_no'])}, "
                    f"{sql_val(r['full_description'])}, {sql_val(r['uom'])}, {r['qty']})"
                )
            f.write(',\n'.join(row_strs) + ';\n')
        print(f'  BOM SQL Part {file_count}: {len(chunk)}건 → {fname}')
        file_count += 1

    # 5. 미매핑 아이템 리포트
    with open('scratch/03_unmatched_report.txt', 'w', encoding='utf-8') as f:
        f.write('=== 미매핑 아이템 리포트 (matcode=NULL) ===\n\n')
        f.write('--- Piping&Fitting 미매핑 ---\n')
        for key, cnt in sorted(pf_unmatched.items(), key=lambda x: -x[1]):
            f.write(f'  {cnt:5d}건: {key}\n')
        null_count = sum(1 for r in all_records if r['mat_code'] is None)
        f.write(f'\n총 NULL matcode: {null_count}건 / {total}건\n')
        f.write(f'matcode 할당 성공: {total - null_count}건 ({100*(total-null_count)//total}%)\n')

    print(f'\n미매핑 리포트 → scratch/03_unmatched_report.txt')

    # 6. 요약 통계
    print('\n=== 요약 ===')
    by_cat = defaultdict(lambda: {'count': 0, 'null': 0})
    for r in all_records:
        by_cat[r['category']]['count'] += 1
        if r['mat_code'] is None:
            by_cat[r['category']]['null'] += 1
    for cat, stat in sorted(by_cat.items()):
        print(f'  {cat}: {stat["count"]}건 (NULL: {stat["null"]}건)')

    by_sys = defaultdict(int)
    for r in all_records:
        by_sys[r['system']] += 1
    print(f'\n시스템별 건수: {dict(sorted(by_sys.items()))}')

    return all_new_mats, all_records


if __name__ == '__main__':
    new_mats, records = main()
