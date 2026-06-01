# PGU-DE-0465 / 0477 / 0478 Spool Receiving 데이터를 Supabase에 추가 삽입
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

# 1. spool_bom tag_no → row 매핑 로드
print('spool_bom 로딩...')
bom_map = {}
offset = 0
while True:
    r = requests.get(
        f'{SUPABASE_URL}/rest/v1/spool_bom?select=tag_no,system,iso_dwg_no,line_no,description,size&limit=1000&offset={offset}',
        headers=HEADERS
    )
    data = r.json()
    if not data: break
    for row in data:
        bom_map[row['tag_no']] = row
    offset += len(data)
    if len(data) < 1000: break
print(f'  spool_bom: {len(bom_map)}건')

# 2. 기존 spool_receiving의 pkg_seq 최댓값 조회
r = requests.get(
    f'{SUPABASE_URL}/rest/v1/spool_receiving?select=pkg_seq&order=pkg_seq.desc&limit=1',
    headers=HEADERS
)
max_seq = r.json()[0]['pkg_seq'] if r.json() else 0
print(f'  기존 최대 pkg_seq: {max_seq}')

# 3. 기존 tag_no 목록 (중복 방지)
r = requests.get(
    f'{SUPABASE_URL}/rest/v1/spool_receiving?select=tag_no&limit=10000',
    headers=HEADERS
)
existing_tags = set(row['tag_no'] for row in r.json() if row.get('tag_no'))
print(f'  기존 tag_no: {len(existing_tags)}건')

# 4. 파일 파싱
FILES = {
    'PGU-DE-0465': 'Raw File/Packing List/PGU-DE-0465_BOP Piping_Piping Spool - 1st batch_CIPL(Rev.4)_IM-70 No.22.xlsx',
    'PGU-DE-0477': 'Raw File/Packing List/PGU-DE-477_BOP Critical Piping Spool_Batch 3_CIPL(Rev.2).xlsx',
    'PGU-DE-0478': 'Raw File/Packing List/PGU-DE-478_BOP Critical Piping Spool_Batch 4_CIPL(Rev.2).xlsx',
}

all_records = []
pkg_global_seq = max_seq

for doc_id, path in FILES.items():
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb['Detail PL']
    pkg_local = {}

    for row in ws.iter_rows(min_row=2, values_only=True):
        pkg_no = row[0]
        if not pkg_no: continue
        qty = row[1] if row[1] else 1
        tag_no = row[2] if row[2] else None
        if not tag_no: continue

        if pkg_no not in pkg_local:
            pkg_global_seq += 1
            pkg_local[pkg_no] = pkg_global_seq

        if tag_no in existing_tags:
            print(f'  SKIP (중복): {tag_no}')
            continue

        bom = bom_map.get(tag_no, {})
        all_records.append({
            'pkg_seq': pkg_local[pkg_no],
            'pkg_no': pkg_no,
            'qty': int(qty),
            'unit': 'EA',
            'tag_no': tag_no,
            'description': bom.get('description', ''),
            'system': bom.get('system', ''),
            'iso_dwg_no': bom.get('iso_dwg_no', ''),
            'line_no': bom.get('line_no', ''),
            'size': bom.get('size', ''),
            'item': 'Spool',
            'purpose': ''
        })

    matched = sum(1 for r in all_records if r.get('system') and any(r['pkg_no'].startswith(doc_id) for r in all_records if r.get('system')))
    print(f'  {doc_id}: {len(pkg_local)} PKG 파싱 완료')

total = len(all_records)
matched = sum(1 for r in all_records if r['system'])
print(f'\n총 {total}건 (BOM 매칭: {matched}건, 미매칭: {total-matched}건)')

# 5. 삽입
print('\n삽입 시작...')
BATCH = 100
ok = 0
for i in range(0, len(all_records), BATCH):
    batch = all_records[i:i+BATCH]
    r = requests.post(
        f'{SUPABASE_URL}/rest/v1/spool_receiving',
        headers=HEADERS,
        data=json.dumps(batch)
    )
    if r.status_code in (200, 201):
        ok += len(batch)
        print(f'  [{min(i+BATCH, total)}/{total}] OK')
    else:
        print(f'  [{min(i+BATCH, total)}/{total}] FAIL {r.status_code}: {r.text[:200]}')
        break

print(f'\n삽입 완료: {ok}건')
