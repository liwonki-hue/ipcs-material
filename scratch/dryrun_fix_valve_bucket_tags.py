# Valve/Speciality 부속품의 통짜(bucket) tag를 유니크 tag + parent_tag로 재생성하기 전 dry-run 분석
# 대상: 실제 설계 Tag가 아니라 범주명을 그대로 tag로 쓴 4개 값만 (Tool/COMMISSIONING/Steam Blow Tool/Hydro Test Tool)
# 실제 밸브 Tag(예: B1-NV-30201A)가 밸브 본체+부속품 여러 행을 공유하는 것은 정상 동작이므로 건드리지 않는다.
import urllib.request, urllib.parse, json, sys, re
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
H = {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}

TARGET_TAGS = ['Tool', 'COMMISSIONING', 'Steam Blow Tool', 'Hydro Test Tool']

rows = []
for t in TARGET_TAGS:
    q = urllib.parse.quote(t)
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/receiving?select=id,pkg_no,tag,full_description,qty&tag=eq.{q}&limit=1000',
        headers=H)
    batch = json.loads(urllib.request.urlopen(req).read())
    rows.extend(batch)

print(f'target rows (tag in {TARGET_TAGS}): {len(rows)}')

PAREN_RE = re.compile(r'\(([^()]+)\)\s*$')

updates = []
seq_counter = defaultdict(int)
for r in rows:
    m = PAREN_RE.search(r['full_description'] or '')
    parent = m.group(1).strip() if m else r['tag']
    seq_counter[parent] += 1
    new_tag = f"{parent}-{seq_counter[parent]:02d}"
    updates.append({
        'id': r['id'], 'pkg_no': r['pkg_no'], 'old_tag': r['tag'],
        'parent_tag': parent, 'new_tag': new_tag,
        'full_description': r['full_description'], 'qty': r['qty']
    })

print(f'planned updates: {len(updates)}')
print('sample (first 6):')
for u in updates[:6]:
    print(' ', u)

# collision check
newtags = [u['new_tag'] for u in updates]
dupe = len(newtags) - len(set(newtags))
print(f'new_tag collisions: {dupe}')

# how many distinct parent_tag groups
parents = set(u['parent_tag'] for u in updates)
print(f'distinct parent_tag groups: {len(parents)}')

with open(r'C:\Users\PCLOVE\AppData\Local\Temp\claude\c--Users-PCLOVE-Downloads-ipcs-material\565a3270-4679-47da-bc13-498ce4c05c3b\scratchpad\valve_tag_fix_plan.json', 'w', encoding='utf-8') as f:
    json.dump(updates, f, ensure_ascii=False, indent=2)
print('plan saved to scratchpad/valve_tag_fix_plan.json')
