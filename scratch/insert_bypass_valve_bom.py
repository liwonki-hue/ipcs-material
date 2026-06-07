# Bypass Valve BOM 등록 스크립트
# Raw File/BOM Data/Bypass Valve.xlsx → material.bom INSERT
import sys, io, re, requests, openpyxl

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

def get_system(tag):
    """태그 번호에서 system 코드 추출. 260xx→HP, 270xx→LP, 280xx→AS"""
    if 'HP TBS' in tag:
        return 'HP'
    if 'LP TBS' in tag:
        return 'LP'
    # "-tank" suffix 제거 후 5자리 숫자 추출
    base = re.sub(r'-tank$', '', tag, flags=re.IGNORECASE)
    m = re.search(r'-(\d{5})$', base)
    if m:
        num = int(m.group(1))
        if 26000 <= num < 27000:
            return 'HP'
        elif 27000 <= num < 28000:
            return 'LP'
        elif 28000 <= num < 29000:
            return 'AS'
    return None


wb = openpyxl.load_workbook('Raw File/BOM Data/Bypass Valve.xlsx', read_only=True)
ws = wb['Sheet2']
rows = list(ws.iter_rows(values_only=True))

records = []
for row in rows[1:]:  # skip header
    _, cat, iso, lineno, desc, tag_raw, item, size, matl, rating, et, unit, qty = row
    tag = (tag_raw or '').strip()
    if not tag:
        print(f'  [SKIP] tag 없음: {desc}')
        continue

    system = get_system(tag)
    records.append({
        'mat_code': None,
        'category': 'Valve',
        'tag': tag,
        'system': system,
        'iso_dwg_no': None,
        'line_no': None,
        'full_description': (desc or '').strip(),
        'uom': 'EA',
        'qty': float(qty) if qty else 1.0,
    })

print(f'준비된 레코드: {len(records)}건')
print()

# 시스템별 분포 출력
from collections import Counter
dist = Counter(r['system'] for r in records)
for sys_, cnt in sorted(dist.items(), key=lambda x: str(x[0])):
    print(f'  system={sys_}: {cnt}건')

# HP D-TUBE 태그 불일치 경고
dtube_hp = [r['tag'] for r in records if 'HP TBS D-TUBE' in r['tag']]
print(f'\n[주의] HP TBS D-TUBE 태그 {len(dtube_hp)}건: {dtube_hp}')
print('  → receiving에는 "HP TBS D-TUBE" (suffix 없음) 4건 존재')
print('  → TAG 매칭 불일치 발생 예상. 필요시 수동 수정 필요.')
print()

# DRY RUN: 실제 INSERT 전 미리보기
print('=== INSERT 미리보기 (처음 5건) ===')
for r in records[:5]:
    print(f'  tag={r["tag"]:<28s} system={str(r["system"]):<5s} desc={r["full_description"][:40]}')

answer = input('\nINSERT 진행하시겠습니까? [y/N] ')
if answer.strip().lower() != 'y':
    print('취소됨.')
    sys.exit(0)

# BATCH INSERT (10건씩)
BATCH = 10
ok_count = 0
fail_count = 0

for i in range(0, len(records), BATCH):
    batch = records[i:i+BATCH]
    r = requests.post(f'{SUPABASE_URL}/rest/v1/bom', headers=H, json=batch)
    if r.status_code in (200, 201):
        ok_count += len(batch)
        print(f'  [{i+1}~{i+len(batch)}] OK')
    else:
        fail_count += len(batch)
        print(f'  [{i+1}~{i+len(batch)}] FAIL {r.status_code}: {r.text[:200]}')

print(f'\n완료: 성공={ok_count}건, 실패={fail_count}건')
