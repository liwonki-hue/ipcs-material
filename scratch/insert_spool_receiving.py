# PGU-DE-0466 Spool Receiving 데이터를 파싱하여 Supabase에 삽입
import openpyxl
import requests
import json

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Content-Profile': 'material',
    'Accept-Profile': 'material',
    'Prefer': 'return=minimal'
}

# 1. spool_bom 전체 로드 (tag_no → row 매핑)
print('spool_bom 로딩...')
bom_map = {}
offset = 0
while True:
    r = requests.get(
        f'{SUPABASE_URL}/rest/v1/spool_bom?select=tag_no,system,iso_dwg_no,line_no,description,size&limit=1000&offset={offset}',
        headers={**HEADERS, 'Prefer': 'count=none'}
    )
    data = r.json()
    if not data:
        break
    for row in data:
        bom_map[row['tag_no']] = row
    offset += len(data)
    if len(data) < 1000:
        break
print(f'  spool_bom: {len(bom_map)}건 로드')

# 2. PGU-DE-0466 파싱
wb = openpyxl.load_workbook('Raw File/Packing List/PGU-DE-0466_BOP Piping_Piping Spool - 2nd.xlsx', read_only=True)
ws = wb['Detail PL']

records = []
pkg_seq = {}
for row in ws.iter_rows(min_row=2, values_only=True):
    pkg_no, qty, unit, tag_no = row[0], row[1], row[2], row[3]
    if not pkg_no:
        continue
    if pkg_no not in pkg_seq:
        pkg_seq[pkg_no] = len(pkg_seq) + 1

    bom = bom_map.get(tag_no, {})
    unit_clean = 'EA' if unit and 'EA' in str(unit).upper() else (unit or 'EA')

    records.append({
        'pkg_seq': pkg_seq[pkg_no],
        'pkg_no': pkg_no,
        'qty': int(qty or 1),
        'unit': unit_clean,
        'tag_no': tag_no,
        'description': bom.get('description', ''),
        'system': bom.get('system', ''),
        'iso_dwg_no': bom.get('iso_dwg_no', ''),
        'line_no': bom.get('line_no', ''),
        'size': bom.get('size', ''),
        'item': 'Spool',
        'purpose': ''
    })

matched = sum(1 for r in records if r['system'])
print(f'파싱 완료: {len(records)}건 (BOM 매칭: {matched}건, 미매칭: {len(records)-matched}건)')

# 3. CREATE TABLE SQL 출력
print('\n--- SQL Editor에서 실행 ---')
print('''CREATE TABLE IF NOT EXISTS material.spool_receiving (
    id bigserial primary key,
    pkg_seq integer,
    pkg_no text,
    qty numeric default 1,
    unit text default 'EA',
    tag_no text,
    description text,
    system text,
    iso_dwg_no text,
    line_no text,
    size text,
    item text default 'Spool',
    purpose text
);
GRANT SELECT, INSERT ON material.spool_receiving TO anon;
GRANT USAGE, SELECT ON SEQUENCE material.spool_receiving_id_seq TO anon;
ALTER TABLE material.spool_receiving DISABLE ROW LEVEL SECURITY;''')
print('---')

# 4. 삽입
print('\n삽입 시작...')
BATCH = 100
ok = 0
for i in range(0, len(records), BATCH):
    batch = records[i:i+BATCH]
    r = requests.post(
        f'{SUPABASE_URL}/rest/v1/spool_receiving',
        headers=HEADERS,
        data=json.dumps(batch)
    )
    if r.status_code in (200, 201):
        ok += len(batch)
        print(f'  [{min(i+BATCH, len(records))}/{len(records)}] OK')
    else:
        print(f'  [{min(i+BATCH, len(records))}/{len(records)}] FAIL {r.status_code}: {r.text[:200]}')
        break

print(f'삽입 완료: {ok}건')
