# Spool BOM 데이터를 Supabase에 직접 삽입 (REST API)
import openpyxl
import requests
import json

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Content-Profile': 'material',
    'Accept-Profile': 'material',
    'Prefer': 'return=minimal'
}

# 데이터 파싱
wb = openpyxl.load_workbook('Raw File/bom/Spool BOM.xlsx', read_only=True)
ws = wb['Detail PL']

records = []
for row in ws.iter_rows(min_row=2, values_only=True):
    if row[1]:
        _, system, iso_dwg_no, line_no, description, tag_no, item, size, uom, qty = row
        records.append({
            'system': system,
            'iso_dwg_no': iso_dwg_no,
            'line_no': (line_no or '').strip(),
            'description': description,
            'tag_no': tag_no,
            'size': size,
            'uom': uom or 'EA',
            'qty': int(qty or 1)
        })

print(f'파싱 완료: {len(records)}건')

# 배치 삽입 (100건씩)
BATCH = 100
ok = 0
for i in range(0, len(records), BATCH):
    batch = records[i:i+BATCH]
    r = requests.post(
        f'{SUPABASE_URL}/rest/v1/spool_bom',
        headers=headers,
        data=json.dumps(batch)
    )
    if r.status_code in (200, 201):
        ok += len(batch)
        print(f'  [{i+len(batch)}/{len(records)}] OK')
    else:
        print(f'  [{i+len(batch)}/{len(records)}] FAIL: {r.status_code} {r.text[:200]}')
        break

print(f'삽입 완료: {ok}건')
