# CRITICAL BOP SUPPLY LIST를 support_receiving 테이블에 로드
# - ipcs-drawing API에서 support_master 전체를 가져와 ISO DWG NO 매핑
# - CRITICAL 시트만 처리 (GENERAL은 중복 데이터)
import os, re, json, urllib.request, openpyxl
from supabase import create_client

# ── Supabase 연결 ──────────────────────────────────────────────
SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'

supa = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── ipcs-drawing API에서 전체 support drawing 로드 ─────────────
DRAWING_API = 'http://127.0.0.1:5100/api/support/drawings'

def fetch_all_support_drawings():
    all_data = []
    page = 1
    per_page = 1000
    while True:
        url = f'{DRAWING_API}?per_page={per_page}&page={page}'
        with urllib.request.urlopen(url, timeout=30) as r:
            d = json.loads(r.read())
        batch = d.get('data', [])
        all_data.extend(batch)
        total = d.get('total', 0)
        print(f'  fetched page {page}: {len(all_data)}/{total}')
        if len(all_data) >= total:
            break
        page += 1
    return all_data

# ── 태그 정규화: 12"-HS-B1-26/001-BA2-S-005 → HS-B1-26/001-S-005 ─
SIZE_PREFIX_RE = re.compile(r'^\d+(?:\s+\d+/\d+)?"-')

def normalize_tag(tag):
    """ipcs-drawing support_drawing에서 size prefix + spec code 제거."""
    tag = SIZE_PREFIX_RE.sub('', str(tag).strip())
    slash = tag.find('/')
    if slash == -1:
        return tag
    before = tag[:slash]
    after  = tag[slash + 1:]
    parts  = after.split('-')
    # "001-BA2-S-005" → parts=['001','BA2','S','005'] → normalized='001-S-005'
    if len(parts) >= 3:
        after = parts[0] + '-' + '-'.join(parts[2:])
    return before + '/' + after

print('ipcs-drawing에서 support drawing 로드 중...')
support_drawings = fetch_all_support_drawings()
print(f'총 {len(support_drawings)}건 로드 완료')

# exact match 및 normalized match 두 가지 lookup 구성
exact_lookup      = {}  # support_drawing → iso_drawing
normalized_lookup = {}  # normalized_tag  → iso_drawing

for d in support_drawings:
    sd  = d.get('support_drawing', '')
    iso = d.get('iso_drawing', '') or ''
    if sd:
        exact_lookup[sd] = iso
        nk = normalize_tag(sd)
        if nk not in normalized_lookup:
            normalized_lookup[nk] = iso

print(f'exact lookup: {len(exact_lookup)}건')
print(f'normalized lookup: {len(normalized_lookup)}건')

# ── CRITICAL 시트 파싱 ─────────────────────────────────────────
EXCEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'Raw File',
                          '[TURKISTAN]CRITICAL BOP SUPPLY LIST_260319.xlsx')

print(f'\nExcel 파싱 중: {EXCEL_PATH}')
wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
ws = wb['CRITICAL']

rows_to_insert = []
matched = 0
unmatched = 0

for row in ws.iter_rows(min_row=2, values_only=True):
    system, iso_from_excel, support_tag, type_, part_no, id_no, item, matl, size_or_type, length_mm, qty = row

    if support_tag is None:
        continue

    tag_str = str(support_tag).strip()

    # ISO DWG NO 매칭: exact → normalized → excel 원본
    iso_dwg_no = iso_from_excel
    if not iso_dwg_no:
        if tag_str in exact_lookup:
            iso_dwg_no = exact_lookup[tag_str]
            matched += 1
        else:
            nk = normalize_tag(tag_str)
            if nk in normalized_lookup:
                iso_dwg_no = normalized_lookup[nk]
                matched += 1
            else:
                unmatched += 1

    rows_to_insert.append({
        'system':       str(system).strip()       if system       else None,
        'iso_dwg_no':   str(iso_dwg_no).strip()   if iso_dwg_no   else None,
        'support_tag':  tag_str,
        'type':         str(type_).strip()         if type_        else None,
        'part_no':      int(part_no)               if part_no is not None else None,
        'id_no':        str(id_no).strip()         if id_no        else None,
        'item':         str(item).strip()          if item         else None,
        'matl':         str(matl).strip()          if matl         else None,
        'size_or_type': str(size_or_type).strip()  if size_or_type else None,
        'length_mm':    str(length_mm).strip()     if length_mm is not None else None,
        'qty':          int(qty)                   if qty is not None else None,
    })

print(f'파싱 완료: 총 {len(rows_to_insert)}행')
print(f'ISO 매칭: {matched}건 / 미매칭: {unmatched}건')

# ── support_receiving 테이블 재생성 ────────────────────────────
print('\nSupabase support_receiving 테이블 초기화 중...')
# 기존 데이터 전체 삭제 (id > 0)
del_res = supa.table('support_receiving').delete().neq('id', 0).execute()
print('기존 데이터 삭제 완료')

# ── 배치 INSERT ────────────────────────────────────────────────
BATCH_SIZE = 1000
total_inserted = 0
for i in range(0, len(rows_to_insert), BATCH_SIZE):
    batch = rows_to_insert[i:i + BATCH_SIZE]
    res = supa.table('support_receiving').insert(batch).execute()
    total_inserted += len(batch)
    print(f'  INSERT {total_inserted}/{len(rows_to_insert)}')

print(f'\n완료: {total_inserted}행 삽입')
print(f'ISO 매칭률: {matched}/{matched+unmatched} ({100*matched/(matched+unmatched):.1f}%)')
