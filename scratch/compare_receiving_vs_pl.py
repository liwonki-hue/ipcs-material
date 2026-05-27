# receiving 테이블 등록 수량 vs Packing List Summary 비교 스크립트
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import requests
import openpyxl
from collections import defaultdict

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
HEADERS = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Accept-Profile': 'material'}

PL_SUMMARY_PATH = 'Raw File/Packing List Summary.xlsx'

# ── 1. Receiving DB 전체 조회 ──────────────────────────────────────────
print('DB receiving 조회 중...')
all_rows = []
offset = 0
while True:
    r = requests.get(
        f'{SUPABASE_URL}/rest/v1/receiving?select=pkg_no,qty,unit&limit=1000&offset={offset}',
        headers=HEADERS
    )
    data = r.json()
    if not data:
        break
    all_rows.extend(data)
    offset += 1000
    if len(data) < 1000:
        break

# pkg_no + unit 기준 SUM(qty)
db_qty = defaultdict(lambda: defaultdict(float))
for row in all_rows:
    db_qty[row['pkg_no']][row['unit']] += row['qty'] or 0

print(f'  → {len(all_rows)}행, {len(db_qty)}개 pkg_no\n')

# ── 2. PL Summary 로드 ────────────────────────────────────────────────
print('PL Summary 로드 중...')
wb = openpyxl.load_workbook(PL_SUMMARY_PATH, read_only=True)
ws = wb.active

# pl_qty: pkg_no → {unit → qty}
pl_qty = {}
pl_desc = {}
for row in ws.iter_rows(min_row=2, values_only=True):
    pkg_no = row[1]
    qty    = row[3]
    unit   = row[4]
    desc   = row[2]
    if pkg_no and qty is not None:
        pl_qty[str(pkg_no).strip()]  = {'qty': float(qty), 'unit': str(unit).strip() if unit else ''}
        pl_desc[str(pkg_no).strip()] = str(desc).strip() if desc else ''

print(f'  → {len(pl_qty)}개 pkg_no\n')

# ── 3. 비교 (receiving에 등록된 pkg_no만) ──────────────────────────────
results = []
for pkg_no, unit_map in sorted(db_qty.items()):
    if pkg_no not in pl_qty:
        # PL Summary에 없는 pkg_no
        for unit, db_sum in unit_map.items():
            results.append({
                'pkg_no': pkg_no,
                'description': '',
                'unit': unit,
                'db_qty': db_sum,
                'pl_qty': None,
                'diff': None,
                'status': 'PL없음'
            })
        continue

    pl = pl_qty[pkg_no]
    pl_unit = pl['unit']
    pl_sum  = pl['qty']

    # DB에서 해당 unit의 합계
    db_sum = unit_map.get(pl_unit, 0)

    # 단위가 여러 개인 경우 전체 합산으로 대비
    if pl_unit not in unit_map:
        # DB unit과 PL unit 불일치 → 전체 합산으로 비교
        db_sum = sum(unit_map.values())

    diff = round(db_sum - pl_sum, 4)
    status = 'OK' if diff == 0 else ('DB초과' if diff > 0 else 'DB부족')

    results.append({
        'pkg_no': pkg_no,
        'description': pl_desc.get(pkg_no, ''),
        'unit': pl_unit,
        'db_qty': db_sum,
        'pl_qty': pl_sum,
        'diff': diff,
        'status': status
    })

# ── 4. 출력 ───────────────────────────────────────────────────────────
ok    = [r for r in results if r['status'] == 'OK']
diff  = [r for r in results if r['status'] in ('DB초과', 'DB부족')]
nopl  = [r for r in results if r['status'] == 'PL없음']

print(f'{'='*80}')
print(f'비교 결과 요약 (receiving 등록 pkg_no 기준)')
print(f'{'='*80}')
print(f'  OK (일치):    {len(ok)}건')
print(f'  DIFF (불일치): {len(diff)}건')
print(f'  PL없음:       {len(nopl)}건')
print()

if diff:
    print(f'{'─'*80}')
    print(f'[불일치 목록]')
    print(f'{'─'*80}')
    print(f'{'PKG NO':<42} {'Unit':<6} {'DB합계':>10} {'PL합계':>10} {'차이':>10}  상태')
    print(f'{'─'*80}')
    for r in diff:
        print(f"{r['pkg_no']:<42} {r['unit']:<6} {r['db_qty']:>10.2f} {r['pl_qty']:>10.2f} {r['diff']:>+10.2f}  {r['status']}")
    print()

if nopl:
    print(f'{'─'*80}')
    print(f'[PL Summary에 없는 pkg_no]')
    print(f'{'─'*80}')
    for r in nopl:
        print(f"  {r['pkg_no']}  ({r['unit']} {r['db_qty']:.2f})")
    print()

print(f'{'─'*80}')
print(f'[OK 목록]')
print(f'{'─'*80}')
print(f'{'PKG NO':<42} {'Unit':<6} {'DB=PL':>10}')
for r in ok:
    print(f"  {r['pkg_no']:<42} {r['unit']:<6} {r['db_qty']:>10.2f}")
