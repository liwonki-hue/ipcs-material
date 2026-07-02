# Speciality receiving 중 tag=NULL인 행(334건)을 유니크 tag + parent_tag로 재생성하기 전 dry-run
import urllib.request, urllib.parse, json, sys, re
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
H = {'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}

req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/receiving?select=id,pkg_no,full_description,qty&category=eq.Speciality&tag=is.null&limit=1000', headers=H)
rows = json.loads(urllib.request.urlopen(req).read())
print('target rows (Speciality, tag IS NULL):', len(rows))

# 실제 설계 Tag처럼 보이는 패턴: 알파벳(1~3)+숫자 조합이 하이픈/슬래시로 연결된 토큰이 괄호 안에 있는 경우
TAG_TOKEN_RE = re.compile(r'^[A-Z0-9][A-Z0-9/&\-\s]*[0-9][A-Z0-9/&\-\s]*$')
PAREN_ALL_RE = re.compile(r'\(([^()]+)\)')

def looks_like_tag(s):
    s = s.strip()
    if not s or len(s) > 40 or len(s) < 6:
        return False
    # 크기/치수 설명(따옴표, x, 길이단위 L 등)은 제외
    if '"' in s or ' x ' in s.lower() or re.search(r'\b\d+L\b', s):
        return False
    # 원본 데이터의 괄호 짝 오류(예: "(B0-F)J-46026/27/28")로 잘려나간 토큰 방지
    if not re.search(r'\d{3,}', s):
        return False
    has_sep = bool(re.search(r'[-/]', s))
    return has_sep

with_tag, without_tag = [], []
for r in rows:
    desc = r['full_description'] or ''
    parens = PAREN_ALL_RE.findall(desc)
    parent = None
    for p in reversed(parens):  # 뒤에서부터 우선 탐색
        if looks_like_tag(p):
            parent = p.strip()
            break
    if parent:
        with_tag.append((r, parent))
    else:
        without_tag.append(r)

print(f'parent tag 추출 성공: {len(with_tag)}건')
print(f'parent tag 추출 실패 (실제 Tag 참조 없음): {len(without_tag)}건')
print()
print('=== 추출 성공 샘플 (10) ===')
for r, p in with_tag[:10]:
    print('  {:30s} parent={!r:35s} desc={}'.format(r['pkg_no'], p, r['full_description']))
print()
print('=== 추출 실패 샘플 (10) - 실제 Tag 참조가 description에 없는 경우 ===')
for r in without_tag[:10]:
    print('  {:30s} desc={}'.format(r['pkg_no'], r['full_description']))

# 계획 생성: with_tag는 parent_tag 기준, without_tag는 pkg_no 기준으로 유니크 tag 생성
seq = defaultdict(int)
updates = []
for r, parent in with_tag:
    seq[parent] += 1
    updates.append({'id': r['id'], 'pkg_no': r['pkg_no'], 'parent_tag': parent,
                     'new_tag': f"{parent}-{seq[parent]:02d}", 'full_description': r['full_description']})
for r in without_tag:
    key = ('PKG', r['pkg_no'])
    seq[key] += 1
    updates.append({'id': r['id'], 'pkg_no': r['pkg_no'], 'parent_tag': r['pkg_no'],
                     'new_tag': f"{r['pkg_no']}-{seq[key]:02d}", 'full_description': r['full_description']})

newtags = [u['new_tag'] for u in updates]
print()
print(f'전체 계획: {len(updates)}건, 충돌: {len(newtags)-len(set(newtags))}건')

with open(r'C:\Users\PCLOVE\AppData\Local\Temp\claude\c--Users-PCLOVE-Downloads-ipcs-material\565a3270-4679-47da-bc13-498ce4c05c3b\scratchpad\speciality_tag_fix_plan.json', 'w', encoding='utf-8') as f:
    json.dump(updates, f, ensure_ascii=False, indent=2)
print('plan saved to scratchpad/speciality_tag_fix_plan.json')
