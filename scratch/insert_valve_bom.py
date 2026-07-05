# Valve List.xlsx(VALVELIST_BOP) -> bom 테이블 등록 (category='Valve')
# Valve/Speciality는 Tag로만 매칭하므로 mat_code는 생성하지 않고 NULL로 둡다.
import pandas as pd
import requests
import math
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}

# 재질 그레이드 분류 (Pipe/Fitting과 동일한 mat1 관례 재사용)
MAT1_GRADE = {
    'A105': 'CS', 'SA105': 'CS', 'A216-WCB': 'CS', 'A216-WCC': 'CS',
    'A351-CF8': 'SS', 'A182-F304': 'SS', 'A182-F316': 'SS', 'A182-F316L': 'SS',
    'A182-F22': 'ALLOY (P22)',
    'A182-F91': 'ALLOY (P91)', 'SA182-F91': 'ALLOY (P91)', 'A217-C12A': 'ALLOY (P91)',
}

SIZE_DN = {
    1: 25, 2: 50, 3: 80, 4: 100, 6: 150, 8: 200,
    10: 250, 12: 300, 14: 350, 16: 400, 20: 500, 24: 600,
}

RATING_DESC = {'150#': 'CL150', '300#': 'CL300', '600#': 'CL600', '1500#': 'CL1500'}
ET_DESC = {'SW': 'SW', 'BW': 'BW', 'FLGD-RF': 'RF', 'FLGD-FF': 'FF'}
VALVE_TYPE_DESC = {
    'GATE': 'GATE VALVE', 'GLOBE': 'GLOBE VALVE', 'CHECK': 'CHECK VALVE',
    'BALL': 'BALL VALVE', 'BUTTERFLY': 'BUTTERFLY VALVE',
}


def clean(v):
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    s = str(v).strip()
    return s if s else None


df = pd.read_excel('Raw File/Valve List.xlsx', sheet_name='VALVELIST_BOP', header=0)

rows = []
errors = []
for i, r in df.iterrows():
    tag = clean(r['TAG'])
    if not tag:
        errors.append((i, 'TAG 없음'))
        continue

    vtype = (clean(r['VALVE\nTYPE']) or '').upper().strip()
    mat2 = clean(r['MAT 2'])
    size = r['SIZE']
    rating = clean(r['RATING'])
    end = clean(r['END TYPE'])

    item_desc = VALVE_TYPE_DESC.get(vtype)
    mat1 = MAT1_GRADE.get(mat2) if mat2 else None
    dn = SIZE_DN.get(int(size)) if not pd.isna(size) else None
    rdesc = RATING_DESC.get(rating, rating)
    edesc = ET_DESC.get(end, end)

    if not all([item_desc, mat2, mat1, dn, rating, end]):
        errors.append((i, tag, f'누락: item={item_desc} mat2={mat2} mat1={mat1} dn={dn} rating={rating} end={end}'))
        continue

    full_desc = f'{item_desc}, {mat2}, DN {dn}, {rdesc}, {edesc}'

    rows.append({
        'mat_code': None,
        'category': 'Valve',
        'tag': tag,
        'system': clean(r['SYSTM']),
        'iso_dwg_no': clean(r['ISO DRAWING']),
        'line_no': clean(r['LINE NO']),
        'full_description': full_desc,
        'uom': 'EA',
        'qty': float(r['QTY']),
        'mat1': mat1,
        'mat2': mat2,
    })

print(f'변환 완료: {len(rows)}행 (원본 {len(df)}행), 오류 {len(errors)}건')
for e in errors[:20]:
    print('  SKIP:', e)

# Tag 중복 검증
tags = [r['tag'] for r in rows]
dup = set([t for t in tags if tags.count(t) > 1])
if dup:
    print(f'⚠️  중복 TAG {len(dup)}건:', list(dup)[:10])
else:
    print('Tag 중복 없음 확인 완료')

if '--dry-run' in sys.argv:
    print('\n[DRY RUN] 샘플 3행:')
    for r in rows[:3]:
        print(r)
    sys.exit(0)

# 기존 Valve BOM 삭제 (재실행 대비)
del_r = requests.delete(f'{URL}/rest/v1/bom', headers={**H, 'Prefer': 'return=minimal'}, params={'category': 'eq.Valve'})
print('기존 Valve BOM 삭제:', del_r.status_code)

BATCH = 500
ok, fail = 0, 0
for i in range(0, len(rows), BATCH):
    chunk = rows[i:i + BATCH]
    resp = requests.post(f'{URL}/rest/v1/bom', headers=H, json=chunk)
    if resp.status_code in (200, 201):
        ok += len(chunk)
    else:
        fail += len(chunk)
        print(f'  실패 batch {i}: {resp.status_code} {resp.text[:300]}')

print(f'\n삽입 완료: ok={ok} fail={fail}')

# 검증: 실제 DB row 수 확인
cnt_r = requests.get(f'{URL}/rest/v1/bom', headers={**H, 'Prefer': 'count=exact'},
                      params={'select': 'tag', 'category': 'eq.Valve', 'limit': 1})
print('DB 실제 Valve 행 수:', cnt_r.headers.get('Content-Range'))
