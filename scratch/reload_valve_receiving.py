# Valve (Receiving).xlsx(Valve/Untagged Items 2시트) -> receiving 테이블 category='Valve' 전체 재적재
# 사용자 확인 사항(2026-07-05):
#  - 새 파일이 전체 기준(Full Replace). DB에만 있던 PGU-DE-0364/0521도 함께 삭제.
#  - 수량은 새 파일이 맞음(기존 DB의 PGU-DE-0536-BOP-BFV 등 큰 수량은 과거 오류로 판단).
#  - Valve는 MatCode를 만들지 않음(Tag/parent_tag만 사용) — 세션 내 확정 정책.
# 2차 개정(같은 날): Operation Type/Valve Type을 별도 컬럼으로 저장, Mat을 Mat1/Mat2로 분리,
#  Tag가 bom(Valve List)과 일치하면 Mat1/Mat2/Size/Rating을 BOM 값으로 덮어씀(원본 입력값보다 신뢰).
import pandas as pd
import requests
import re
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json', 'Prefer': 'return=minimal'}

PATH = 'Raw File/Valve (Receiving).xlsx'

MAT1_GRADE = {
    'A105': 'CS', 'SA105': 'CS', 'A216-WCB': 'CS', 'A216-WCC': 'CS',
    'A351-CF8': 'SS', 'A182-F304': 'SS', 'A182-F316': 'SS', 'A182-F316L': 'SS', 'A182F-F316': 'SS',
    'A182-F22': 'ALLOY (P22)',
    'A182-F91': 'ALLOY (P91)', 'A192-F91': 'ALLOY (P91)', 'SA182-F91': 'ALLOY (P91)', 'A217-C12A': 'ALLOY (P91)',
    # 2026-07-05 추가분 — Spare Valve/Stud Bolt 재질 매핑 보강 (사용자 확인)
    'A193-B7': 'CS',      # Stud Bolt B7 (STB matcode 규칙과 동일: B700=CS)
    'A193-B8': 'SS',      # Stud Bolt B8 (STB matcode 규칙과 동일: B800=SS)
    'CFB-304': 'SS',      # 스테인리스 주조(CF8 계열) 304
    'CS05': 'CS',         # 구 MatCode 세그먼트 표기가 Mat 필드에 그대로 남은 경우
    'SS04': 'SS',         # 구 MatCode 세그먼트 표기가 Mat 필드에 그대로 남은 경우
    'WCB-13CR': 'CS',     # WCB 바디 + 13Cr 트림 — 바디 기준 CS
    'WCB-304': 'CS',      # WCB 바디 기준 CS
}
# 원본 오타 교정 — 사용자 확인(2026-07-05): A182-F136은 A182-F316의 오타
MAT2_TYPO_FIX = {
    'A182-F136': 'A182-F316',
}
DN_TO_INCH = {25: '1', 50: '2', 80: '3', 100: '4', 150: '6', 200: '8',
              250: '10', 300: '12', 350: '14', 400: '16', 500: '20', 600: '24'}


def clean(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s if s else None


def norm_rating(v):
    if not v:
        return None
    return re.sub(r'\s+', '', str(v).upper())


# ── 0. bom(Valve List) 기준 Tag -> Mat1/Mat2/Size/Rating 참조맵 구성 ───────────
bom_map = {}
offset = 0
while True:
    r = requests.get(f'{URL}/rest/v1/bom', headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}'},
                      params={'select': 'tag,mat1,mat2,full_description', 'category': 'eq.Valve',
                              'limit': 1000, 'offset': offset})
    batch = r.json()
    if not batch:
        break
    for b in batch:
        if not b['tag']:
            continue
        desc = b['full_description'] or ''
        dn_m = re.search(r'DN\s*(\d+)', desc)
        size = f'{DN_TO_INCH[int(dn_m.group(1))]}"' if dn_m and int(dn_m.group(1)) in DN_TO_INCH else None
        rt_m = re.search(r'\bCL\d+\b', desc, re.I)
        rating = rt_m.group(0).upper() if rt_m else None
        bom_map[b['tag']] = {'mat1': b['mat1'], 'mat2': b['mat2'], 'size': size, 'rating': rating}
    offset += 1000
    if len(batch) < 1000:
        break
print(f'bom(Valve) 참조맵: {len(bom_map)}개 Tag')


def apply_bom_override(raw_tag, mat1, mat2, size, rating):
    """raw_tag(원래 Tag, 일련번호 붙기 전)가 bom과 일치하면 Mat1/Mat2/Size/Rating을 BOM 값으로 덮어씀."""
    b = bom_map.get(raw_tag)
    if not b:
        return mat1, mat2, size, rating
    return (b['mat1'] or mat1, b['mat2'] or mat2, b['size'] or size, b['rating'] or rating)


# ── 1. Valve 시트 (Tag 있는 항목) ──────────────────────────────────────────
df1 = pd.read_excel(PATH, sheet_name='Valve')
df1.columns = ['pkg', 'pkg_no', 'category', 'tag_no', 'op_type', 'valve_type',
               'mat', 'size', 'rating', 'unit', 'qty', 'status']

# 완전 깨진 artifact 행 제거 (TAG NO도 Mat도 없는 행 — 실제 데이터 없음)
df1_clean = df1[~(df1['tag_no'].isna() & df1['mat'].isna())].copy()
print(f'Valve 시트: {len(df1)}행 -> artifact 제외 {len(df1_clean)}행')

# TAG NO가 중복되는 값(예: 'SPARE', 'HP TBS D-TUBE' 같은 통짜 tag, 또는 서로 다른
# PKG에 같은 실제 Tag가 잘못/반복 기재된 경우) 미리 파악 — project_valve_bucket_tag_fix와 동일 원칙으로
# parent_tag=원래 TAG NO, tag={parent_tag}-{일련번호:02d}로 유니크화한다.
_tag_counts = df1_clean['tag_no'].value_counts()
_dup_tag_values = set(_tag_counts[_tag_counts > 1].index)

valve_rows = []
notag_seq = {}
dup_seq = {}
bom_hit = 0
for _, r in df1_clean.iterrows():
    pkg_no = clean(r['pkg_no'])
    raw_tag = clean(r['tag_no'])
    parent_tag = None
    if not raw_tag:
        notag_seq[pkg_no] = notag_seq.get(pkg_no, 0) + 1
        parent_tag = pkg_no
        tag = f'{pkg_no}-NOTAG-{notag_seq[pkg_no]:02d}'
    elif raw_tag in _dup_tag_values:
        # 패키지별로 일련번호를 붙여 어느 PKG 소속인지 tag만 봐도 알 수 있게 함
        # (전체 파일 기준 전역 번호는 SPARE처럼 여러 PKG에 걸친 경우 가독성이 떨어져서 개정, 2026-07-05)
        key = (pkg_no, raw_tag)
        dup_seq[key] = dup_seq.get(key, 0) + 1
        parent_tag = raw_tag
        tag = f'{pkg_no}-{raw_tag}-{dup_seq[key]:02d}'
    else:
        tag = raw_tag

    op_type = clean(r['op_type'])
    valve_type = clean(r['valve_type'])
    mat2 = clean(r['mat'])
    mat2 = MAT2_TYPO_FIX.get(mat2, mat2)
    mat1 = MAT1_GRADE.get(mat2) if mat2 else None
    size = f"{clean(r['size'])}\"" if clean(r['size']) else None
    rating = norm_rating(clean(r['rating']))

    if raw_tag:
        mat1, mat2, size, rating = apply_bom_override(raw_tag, mat1, mat2, size, rating)
        if raw_tag in bom_map:
            bom_hit += 1

    valve_rows.append({
        'category': 'Valve',
        'doc_no': clean(r['pkg']),
        'pkg_no': pkg_no,
        'tag': tag,
        'parent_tag': parent_tag,
        'op_type': op_type,
        'valve_type': valve_type,
        'full_description': valve_type,
        'mat1': mat1,
        'mat2': mat2,
        'size': size,
        'rating': rating,
        'unit': clean(r['unit']) or 'EA',
        'qty': float(r['qty']) if pd.notna(r['qty']) else 1.0,
        'mat_code': None,
        'purpose': None,
    })
print(f'  BOM 매칭으로 Mat/Size/Rating 보정된 행: {bom_hit}건')

# ── 2. Untagged Items 시트 (Tag 없는 부속품/공구) ──────────────────────────
df2 = pd.read_excel(PATH, sheet_name='Untagged Items')
df2.columns = ['pkg', 'pkg_no', 'tag_ref', 'seq_no', 'description', 'mat', 'size', 'rating', 'unit', 'qty', 'status']

untagged_rows = []
serial = {}
for _, r in df2.iterrows():
    pkg_no = clean(r['pkg_no'])
    tag_ref = clean(r['tag_ref'])
    parent_tag = tag_ref or pkg_no
    serial[parent_tag] = serial.get(parent_tag, 0) + 1
    tag = f'{parent_tag}-{serial[parent_tag]:02d}'

    mat2 = clean(r['mat'])
    mat2 = MAT2_TYPO_FIX.get(mat2, mat2)
    mat1 = MAT1_GRADE.get(mat2) if mat2 else None
    size = f"{clean(r['size'])}\"" if clean(r['size']) else None
    rating = norm_rating(clean(r['rating']))
    if tag_ref:
        mat1, mat2, size, rating = apply_bom_override(tag_ref, mat1, mat2, size, rating)

    untagged_rows.append({
        'category': 'Valve',
        'doc_no': clean(r['pkg']),
        'pkg_no': pkg_no,
        'tag': tag,
        'parent_tag': parent_tag,
        'op_type': None,
        'valve_type': None,
        'full_description': clean(r['description']),
        'mat1': mat1,
        'mat2': mat2,
        'size': size,
        'rating': rating,
        'unit': clean(r['unit']) or 'EA',
        'qty': float(r['qty']) if pd.notna(r['qty']) else 1.0,
        'mat_code': None,
        'purpose': None,
    })

print(f'Untagged Items 시트: {len(df2)}행 -> {len(untagged_rows)}행 변환')

all_rows = valve_rows + untagged_rows
print(f'\n총 {len(all_rows)}행 (Valve {len(valve_rows)} + Untagged {len(untagged_rows)})')
print(f'Qty 합계: {sum(r["qty"] for r in all_rows):,.1f}')

# 두 시트에서 독립적으로 생성한 tag가 서로 충돌하는 경우(예: Valve 시트 자체 중복 해소로 만든
# 'B0-PCV-36017-01'과 Untagged 시트의 TAG NO(참조) 기반 'B0-PCV-36017-01'이 같은 문자열이 되는 경우)를
# 최종 안전망으로 한 번 더 훑어 유니크화한다.
_seen = {}
for r in all_rows:
    t = r['tag']
    if t not in _seen:
        _seen[t] = 1
    else:
        _seen[t] += 1
        r['tag'] = f'{t}-DUP{_seen[t]:02d}'

# Tag 유니크성 검증
tags = [r['tag'] for r in all_rows]
dup = set(t for t in tags if tags.count(t) > 1)
if dup:
    print(f'\n⚠️  중복 TAG {len(dup)}건 발견:')
    for t in list(dup)[:15]:
        print('  ', t)
else:
    print('\nTag 유니크성 확인 완료 (중복 없음)')

if '--dry-run' in sys.argv:
    print('\n[DRY RUN] 샘플 5행 (Valve, BOM 매칭 우선 표시):')
    shown = 0
    for r in valve_rows:
        if r['mat1'] and shown < 5:
            print(r)
            shown += 1
    sys.exit(0)

# ── 3. 기존 Valve 카테고리 전체 삭제 후 재적재 ─────────────────────────────
del_r = requests.delete(f'{URL}/rest/v1/receiving', headers={**H, 'Prefer': 'return=representation'},
                         params={'category': 'eq.Valve'})
deleted = len(del_r.json()) if del_r.status_code == 200 else 0
print(f'\n기존 Valve receiving 삭제: status={del_r.status_code} 삭제행={deleted}')

# receiving.id는 auto-increment가 아니라 직접 채번 필요 (현재 최대값 조회 후 이어서 부여)
max_id_r = requests.get(f'{URL}/rest/v1/receiving', headers=H, params={'select': 'id', 'order': 'id.desc', 'limit': 1})
next_id = (max_id_r.json()[0]['id'] if max_id_r.json() else 0) + 1
for i, row in enumerate(all_rows):
    row['id'] = next_id + i
print(f'id 채번: {next_id} ~ {next_id + len(all_rows) - 1}')

BATCH = 500
ok, fail = 0, 0
for i in range(0, len(all_rows), BATCH):
    chunk = all_rows[i:i + BATCH]
    resp = requests.post(f'{URL}/rest/v1/receiving', headers=H, json=chunk)
    if resp.status_code in (200, 201):
        ok += len(chunk)
    else:
        fail += len(chunk)
        print(f'  실패 batch {i}: {resp.status_code} {resp.text[:300]}')

print(f'\n삽입 완료: ok={ok} fail={fail}')

cnt_r = requests.get(f'{URL}/rest/v1/receiving', headers={**H, 'Prefer': 'count=exact'},
                      params={'select': 'tag', 'category': 'eq.Valve', 'limit': 1})
print('DB 실제 Valve 행 수:', cnt_r.headers.get('Content-Range'))
