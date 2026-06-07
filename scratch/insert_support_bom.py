# material.support_bom 테이블에 Support BOM 데이터 삽입
# Raw File/BOM Data/Support BOM.xlsx → material.support_bom INSERT
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

XLSX_PATH = r'Raw File/BOM Data/Support BOM.xlsx'
BATCH = 500

def clean(v):
    if v is None: return None
    s = str(v).strip()
    return None if s == '' else s

def parse_qty(v):
    if v is None: return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None

wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
ws = wb.active

rows = []
skipped = 0
for r in ws.iter_rows(min_row=2, values_only=True):
    category, system, iso_dwg_no, support_tag, part_no, id_no, item, matl, size_or_type, length_mm, qty = r
    if not support_tag and not iso_dwg_no:
        skipped += 1
        continue
    rows.append({
        'category':     clean(category),
        'system':       clean(system),
        'iso_dwg_no':   clean(iso_dwg_no),
        'support_tag':  clean(support_tag),
        'part_no':      clean(part_no),
        'id_no':        clean(id_no),
        'item':         clean(item),
        'matl':         clean(matl),
        'size_or_type': clean(size_or_type),
        'length_mm':    clean(length_mm),
        'qty':          parse_qty(qty),
    })

print(f'Parsed: {len(rows)} rows (skipped {skipped} empty rows)')

# 배치 INSERT
total_ok = 0
for i in range(0, len(rows), BATCH):
    batch = rows[i:i+BATCH]
    r = requests.post(f'{SUPABASE_URL}/rest/v1/support_bom', headers=H, data=json.dumps(batch))
    if r.status_code in (200, 201):
        total_ok += len(batch)
        print(f'  Inserted batch {i//BATCH+1}: {len(batch)} rows (total {total_ok})')
    else:
        print(f'  ERROR batch {i//BATCH+1}: {r.status_code} {r.text[:200]}')
        sys.exit(1)

print(f'\nDone. Total inserted: {total_ok} rows.')
