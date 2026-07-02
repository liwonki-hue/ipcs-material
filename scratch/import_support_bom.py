# support_bom 테이블에 Support BOM.xlsx(Total 시트) 데이터 등록 (기존 데이터 전체 교체)
import openpyxl, requests, json, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
H = {
    'apikey': KEY,
    'Authorization': f'Bearer {KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}
FILE = r'C:\Users\PCLOVE\Downloads\ipcs-material\Raw File\Support BOM.xlsx'

def col_idx(hdr, *names):
    for name in names:
        for i, h in enumerate(hdr):
            if h and name.lower() in str(h).lower():
                return i
    return None

def clean_str(v):
    if v is None: return None
    s = str(v).strip()
    if s in ('', '-', 'None'): return None
    if '�' in s: return None   # 깨진 한글 → NULL 처리
    return s

def clean_int(v):
    try: return int(float(v))
    except: return None

print('=== Excel 파싱 중... ===')
wb = openpyxl.load_workbook(FILE, read_only=True, data_only=True)
ws = wb['Total']
all_rows = list(ws.iter_rows(values_only=True))
hdr = all_rows[0]

ci = {
    'system':  col_idx(hdr, 'SYSTEM'),
    'iso':     col_idx(hdr, 'ISO DWG NO'),
    'tag':     col_idx(hdr, 'SUPPORT TAG NO'),
    'type':    col_idx(hdr, 'TYPE'),
    'part_no': col_idx(hdr, 'PART NO'),
    'id_no':   col_idx(hdr, 'ID NO'),
    'item':    col_idx(hdr, 'ITEM'),
    'matl':    col_idx(hdr, 'MATL'),
    'size':    col_idx(hdr, 'SIZE OR TYPE'),
    'length':  col_idx(hdr, 'LENGTH'),
    'qty':     col_idx(hdr, "Q'TY"),
}
print('컬럼 매핑:', ci)

rows = []
for r in all_rows[1:]:
    if not any(v is not None for v in r):
        continue
    def g(key):
        idx = ci.get(key)
        return r[idx] if idx is not None and idx < len(r) else None

    rows.append({
        'system':       clean_str(g('system')),
        'iso_dwg_no':   clean_str(g('iso')),
        'support_tag':  clean_str(g('tag')),
        'type':         clean_str(g('type')),
        'part_no':      clean_int(g('part_no')),
        'id_no':        clean_str(g('id_no')),
        'item':         clean_str(g('item')),
        'matl':         clean_str(g('matl')),
        'size_or_type': clean_str(g('size')),
        'length_mm':    clean_str(g('length')),
        'qty':          clean_int(g('qty')) or 0,
    })

print(f'총 파싱 행수: {len(rows)}')

# ── 기존 데이터 전체 삭제 ──────────────────────────
print('\n기존 support_bom 데이터 삭제 중...')
resp = requests.delete(
    f'{URL}/rest/v1/support_bom',
    headers={**H, 'Prefer': 'return=minimal'},
    params={'id': 'gte.0'}
)
print(f'  DELETE 상태: {resp.status_code}')
if resp.status_code not in (200, 204):
    print('  오류:', resp.text[:300])
    sys.exit(1)

# ── 배치 INSERT ───────────────────────────────────
BATCH = 500
ok, fail = 0, 0
for i in range(0, len(rows), BATCH):
    batch = rows[i:i+BATCH]
    resp = requests.post(
        f'{URL}/rest/v1/support_bom',
        headers=H,
        data=json.dumps(batch)
    )
    if resp.status_code in (200, 201):
        ok += len(batch)
        print(f'  배치 {i//BATCH+1}/{(len(rows)-1)//BATCH+1}: {len(batch)}행 삽입 완료')
    else:
        fail += len(batch)
        print(f'  배치 {i//BATCH+1} 실패 ({resp.status_code}): {resp.text[:200]}')

print(f'\n=== 완료: 성공 {ok}행 / 실패 {fail}행 ===')
