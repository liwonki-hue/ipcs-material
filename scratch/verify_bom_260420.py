# BOM 검증 스크립트: Excel vs Supabase DB (ISO+System 기준)
# TOTAL BOM_260420.xls 데이터와 DB 데이터 1:1 비교
import xlrd, requests, json, sys, io, re
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
H = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}',
     'Accept-Profile': 'material'}

NPS_TO_DN = {'0.5':15,'1/2':15,'0.75':20,'3/4':20,'1':25,'1.0':25,'1.5':40,
             '1-1/2':40,'2':50,'2.0':50,'2.5':65,'3':80,'3.0':80,'4':100,'4.0':100,
             '5':125,'5.0':125,'6':150,'6.0':150,'8':200,'8.0':200,'10':250,'10.0':250,
             '12':300,'12.0':300,'14':350,'14.0':350,'16':400,'16.0':400,'18':450,
             '18.0':450,'20':500,'20.0':500,'22':550,'22.0':550,'24':600,'24.0':600,
             '26':650,'26.0':650,'28':700,'28.0':700,'30':750,'30.0':750,'32':800,'36':900}


def norm_qty(qty, uom):
    """단위 정규화"""
    try: q = float(qty)
    except: q = 0.0
    if str(uom).upper() == 'MM':
        return round(q / 1000, 4), 'M'
    return round(q, 4), str(uom).upper()


def norm_desc(s):
    return ' '.join(str(s).upper().strip().split())


def fetch_db_bom():
    """DB에서 전체 bom 가져오기 (페이지 처리)"""
    all_rows = []
    page = 0
    while True:
        r = requests.get(
            f'{SUPABASE_URL}/rest/v1/bom?select=system,iso_dwg_no,line_no,full_description,uom,qty'
            f'&limit=2000&offset={page*2000}',
            headers=H
        )
        data = r.json()
        if not isinstance(data, list) or not data:
            break
        all_rows.extend(data)
        if len(data) < 2000:
            break
        page += 1
    return all_rows


def build_excel_summary(wb):
    """Excel에서 ISO별 item+qty 집계"""
    # 구조: {(system, iso, line_no, norm_desc): qty_M_or_EA}
    xl = defaultdict(float)

    ws = wb.sheet_by_name('Piping&Fitting')
    for i in range(1, ws.nrows):
        row = [ws.cell_value(i, j) for j in range(ws.ncols)]
        system = str(row[0]).strip()
        iso    = str(row[1]).strip()
        ln     = str(row[2]).strip()
        item   = str(row[3]).strip()
        matl   = str(row[4]).strip()
        size   = str(row[5]).strip()
        thick  = str(row[6]).strip()
        et     = str(row[7]).strip()
        uom    = str(row[8]).strip()
        try: qty = float(row[9])
        except: qty = 0.0
        if uom.upper() == 'MM':
            qty = round(qty / 1000, 4)
        desc = norm_desc(', '.join(p for p in [item, matl, size, thick, et] if p))
        xl[(system, iso, ln, desc)] += qty

    ws2 = wb.sheet_by_name('Bolt&Gasket')
    # DB와 동일한 집계 키: (iso, line_no, item_type_tag, grade_or_type, bolt_size)
    # DB description = item[:120] (원문 그대로)
    agg_bg = {}
    for i in range(1, ws2.nrows):
        row = [ws2.cell_value(i, j) for j in range(ws2.ncols)]
        iso = str(row[2]).strip(); ln = str(row[3]).strip()
        item = str(row[4]).strip(); b_sz = str(row[5]).strip()
        try: qty = float(row[7])
        except: qty = 0.0
        if not iso or not item: continue
        parts = ln.split('-')
        sys_ = parts[1].strip() if len(parts) >= 2 else ''
        item_up = item.upper()
        # DB와 동일한 집계 키 사용
        if 'INSULATION' in item_up:
            key = (iso, ln, 'IGSKT', '')
            desc_key = f'INSULATION GASKET KIT, {ln[:50]}'
        elif 'SPIRAL' in item_up or 'GASKET' in item_up:
            gt = 'SW316' if '316' in item_up else ('SW321' if '321' in item_up else 'SW304')
            key = (iso, ln, 'GSKT', gt)
            desc_key = item[:120]
        elif 'STUD' in item_up or 'BOLT' in item_up:
            if 'B8M' in item_up: gr = 'B8M0'
            elif 'B8' in item_up: gr = 'B800'
            elif 'B16' in item_up: gr = 'B160'
            elif 'B7' in item_up or 'GALVANIZED' in item_up: gr = 'B700'
            else: gr = ''
            key = (iso, ln, 'STB', gr, b_sz)
            desc_key = item[:120]
        else:
            key = (iso, ln, 'OTHER', item[:50])
            desc_key = item[:120]
        k = str(key)
        if k not in agg_bg:
            agg_bg[k] = {'qty': 0.0, 'sys': sys_, 'iso': iso, 'ln': ln, 'desc': desc_key}
        agg_bg[k]['qty'] += qty

    for k, v in agg_bg.items():
        desc = norm_desc(v['desc'])
        xl[(v['sys'], v['iso'], v['ln'], desc)] += v['qty']

    return xl


def build_db_summary(db_rows):
    """DB 데이터 → 동일 구조로 집계"""
    db = defaultdict(float)
    for row in db_rows:
        system = str(row.get('system', '') or '').strip()
        iso    = str(row.get('iso_dwg_no', '') or '').strip()
        ln     = str(row.get('line_no', '') or '').strip()
        desc   = norm_desc(str(row.get('full_description', '') or ''))
        try: qty = float(row.get('qty', 0))
        except: qty = 0.0
        db[(system, iso, ln, desc)] += qty
    return db


def compare(xl, db):
    """Excel vs DB 비교 → 불일치 목록 반환"""
    all_keys = set(xl.keys()) | set(db.keys())
    diffs = []
    ok = 0
    missing_in_db = []
    extra_in_db = []
    qty_diff = []

    for key in sorted(all_keys):
        xl_qty = xl.get(key, 0.0)
        db_qty = db.get(key, 0.0)
        diff = abs(xl_qty - db_qty)
        if diff < 0.001:
            ok += 1
        elif key not in db:
            missing_in_db.append((key, xl_qty))
        elif key not in xl:
            extra_in_db.append((key, db_qty))
        else:
            qty_diff.append((key, xl_qty, db_qty))

    return ok, missing_in_db, extra_in_db, qty_diff


def main():
    print('=== BOM 검증 시작 ===\n')

    print('Excel 파싱 중...')
    wb = xlrd.open_workbook('Raw File/TOTAL BOM_260420.xls')
    xl = build_excel_summary(wb)
    print(f'  Excel 레코드 (unique key): {len(xl)}건')

    print('DB 데이터 가져오는 중...')
    db_rows = fetch_db_bom()
    print(f'  DB 레코드: {len(db_rows)}건')
    db = build_db_summary(db_rows)
    print(f'  DB unique key: {len(db)}건')

    print('\n비교 중...')
    ok, missing, extra, qty_diffs = compare(xl, db)
    total = len(set(xl.keys()) | set(db.keys()))

    print(f'\n=== 검증 결과 ===')
    print(f'  일치:           {ok:>6}건')
    print(f'  DB에 없음:      {len(missing):>6}건')
    print(f'  DB에만 있음:    {len(extra):>6}건')
    print(f'  수량 불일치:    {len(qty_diffs):>6}건')
    print(f'  총 unique key:  {total:>6}건')

    with open('scratch/verify_bom_260420_result.txt', 'w', encoding='utf-8') as f:
        f.write('=== BOM 검증 결과 (TOTAL BOM_260420 vs DB) ===\n\n')
        f.write(f'일치: {ok}건 / 총 {total}건\n')
        f.write(f'불일치: {len(missing)+len(extra)+len(qty_diffs)}건\n\n')

        if missing:
            f.write(f'── DB에 없음 ({len(missing)}건) ──\n')
            for key, xl_q in missing[:50]:
                sys_, iso, ln, desc = key
                f.write(f'  [{sys_}] {iso} | {ln} | {desc[:60]} | Excel={xl_q}\n')
            if len(missing) > 50:
                f.write(f'  ... 외 {len(missing)-50}건\n')

        if extra:
            f.write(f'\n── DB에만 있음 ({len(extra)}건) ──\n')
            for key, db_q in extra[:50]:
                sys_, iso, ln, desc = key
                f.write(f'  [{sys_}] {iso} | {ln} | {desc[:60]} | DB={db_q}\n')

        if qty_diffs:
            f.write(f'\n── 수량 불일치 ({len(qty_diffs)}건) ──\n')
            for key, xl_q, db_q in qty_diffs[:100]:
                sys_, iso, ln, desc = key
                f.write(f'  [{sys_}] {ln} | {desc[:50]} | Excel={xl_q} vs DB={db_q}\n')

        # 시스템별 집계 비교
        f.write('\n── 시스템별 DB 행 수 ──\n')
        by_sys = defaultdict(int)
        for row in db_rows:
            by_sys[str(row.get('system', '') or '')] += 1
        for s, cnt in sorted(by_sys.items()):
            f.write(f'  {s}: {cnt}건\n')

    print(f'\n결과 → scratch/verify_bom_260420_result.txt')

    if len(missing) + len(extra) + len(qty_diffs) == 0:
        print('  ✔ 완전 일치 - 교체 성공')
    else:
        print(f'  ⚠ {len(missing)+len(extra)+len(qty_diffs)}건 불일치 발견')

    return missing, extra, qty_diffs


if __name__ == '__main__':
    main()
