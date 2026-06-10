# BOM에서 FLEXIBLE HOSE/JOINT, AIR TRAP, STEAM TRAP, EDUCTOR, MIXER 삭제
import requests

URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Accept-Profile': 'material'}
H_W = {**H, 'Content-Profile': 'material', 'Prefer': 'return=representation'}

KEYWORDS = ['FLEXIBLE HOSE', 'FLEXIBLE JOINT', 'AIR TRAP', 'STEAM TRAP', 'EDUCTOR', 'MIXER']

# 1. 전체 BOM 로드
print('Loading BOM...')
bom_rows = []
step = 1000
offset = 0
while True:
    r = requests.get(f'{URL}/rest/v1/bom', headers=H, params={
        'select': 'id,mat_code,category,full_description,uom,qty,iso_dwg_no,system',
        'limit': step, 'offset': offset
    })
    batch = r.json()
    if not batch:
        break
    bom_rows.extend(batch)
    offset += step
    if len(batch) < step:
        break
print(f'  총 BOM rows: {len(bom_rows):,}')

# 2. 키워드 매칭 조회
targets = []
for row in bom_rows:
    desc = (row.get('full_description') or '').upper()
    for kw in KEYWORDS:
        if kw in desc:
            targets.append(row)
            break

print(f'\n삭제 대상: {len(targets)}건')
print('-' * 80)
for r in targets:
    print(f"  id={r['id']:6d} | {r['full_description'][:50]:<50} | {r['iso_dwg_no']} | {r['system']}")

if not targets:
    print('삭제 대상 없음.')
    exit()

# 3. 사용자 확인
print(f'\n위 {len(targets)}건을 BOM에서 삭제합니다.')
confirm = input('계속하려면 yes 입력: ').strip().lower()
if confirm != 'yes':
    print('취소.')
    exit()

# 4. id 목록으로 삭제
ids = [str(r['id']) for r in targets]
id_filter = f"({','.join(ids)})"

del_r = requests.delete(
    f'{URL}/rest/v1/bom',
    headers={**H_W},
    params={'id': f'in.{id_filter}'}
)
print(f'\n삭제 결과: HTTP {del_r.status_code}')
if del_r.status_code in (200, 204):
    print(f'✓ {len(targets)}건 삭제 완료.')
else:
    print(f'오류: {del_r.text}')
