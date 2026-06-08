# PGU-DE-0072 MOV Packing List → material.receiving INSERT
# 원본: Raw File/PGU-DE-072_MOV_CIPL(Rev.3)_IM-70 No.8.xlsx
import sys, io, json, requests, openpyxl

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
H = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Accept-Profile': 'material',
    'Content-Profile': 'material',
    'Prefer': 'return=minimal',
}

XLSX_PATH = 'Raw File/PGU-DE-072_MOV_CIPL(Rev.3)_IM-70 No.8.xlsx'
DOC_NO    = 'PGU-DE-0072'
BATCH     = 100

wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
ws = wb['Detail PL']

rows = []
for row in ws.iter_rows(min_row=2, values_only=True):
    pkg_no = row[0]
    desc   = row[1]
    qty    = row[2]
    unit   = row[3]
    tag    = row[4]

    if not pkg_no and not desc:
        continue

    tag_clean = str(tag).strip() if tag else None
    if tag_clean and tag_clean.upper() == 'LATER':
        tag_clean = None

    rows.append({
        'doc_no':           DOC_NO,
        'pkg_no':           str(pkg_no).strip() if pkg_no else None,
        'mat_code':         None,
        'full_description': str(desc).strip() if desc else None,
        'qty':              float(qty) if qty is not None else 1.0,
        'unit':             str(unit).strip() if unit else 'EA',
        'category':         'Valve',
        'tag':              tag_clean,
    })

print(f'파싱 완료: {len(rows)}행')
tag_count  = sum(1 for r in rows if r['tag'])
notag_count = len(rows) - tag_count
print(f'  TAG 있음: {tag_count}건 / TAG 없음: {notag_count}건')

# 중복 삽입 방지: 기존 데이터 확인
resp = requests.get(
    f'{SUPABASE_URL}/rest/v1/receiving',
    headers={**H, 'Range': '0-0'},
    params={'select': 'id', 'doc_no': f'eq.{DOC_NO}', 'limit': '1'}
)
check = requests.get(
    f'{SUPABASE_URL}/rest/v1/receiving?select=id&doc_no=eq.{DOC_NO}&limit=1',
    headers=H
)
existing = check.json()
if isinstance(existing, list) and len(existing) > 0:
    print(f'\n이미 {DOC_NO} 데이터가 존재합니다. 중복 삽입 중단.')
    sys.exit(0)

# 배치 INSERT
total_ok = 0
for i in range(0, len(rows), BATCH):
    batch = rows[i:i+BATCH]
    r = requests.post(
        f'{SUPABASE_URL}/rest/v1/receiving',
        headers=H,
        data=json.dumps(batch)
    )
    if r.status_code in (200, 201):
        total_ok += len(batch)
        print(f'  배치 {i//BATCH+1}: {len(batch)}건 삽입 (누적 {total_ok}건)')
    else:
        print(f'  ERROR 배치 {i//BATCH+1}: {r.status_code} {r.text[:300]}')
        sys.exit(1)

print(f'\n완료. 총 {total_ok}건 삽입.')
