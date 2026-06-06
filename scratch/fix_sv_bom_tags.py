# BOM Safety Valve Tag 수정 + 재매칭 검증
# 1) PSV-301193 → PSV-31193
# 2) PSVnnnn → PSV-nnnn (대시 누락 수정)
import requests, re, os

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Accept-Profile': 'material'
}

def fetch_all(table, params, limit=10000):
    rows, offset = [], 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?{params}&limit={limit}&offset={offset}"
        r = requests.get(url, headers=HEADERS)
        r.raise_for_status()
        data = r.json()
        if not data: break
        rows.extend(data)
        if len(data) < limit: break
        offset += limit
    return rows

def fix_tag(tag):
    if not tag:
        return tag
    t = tag.strip()
    # Fix 1: PSV-301193 → PSV-31193
    t = t.replace('PSV-301193', 'PSV-31193')
    # Fix 2: PSV뒤에 숫자가 바로 오면 대시 삽입 (B0-PSV32001 → B0-PSV-32001)
    t = re.sub(r'(PSV)(\d)', r'\1-\2', t)
    return t

# ── 1. BOM PSV 태그 조회 ──────────────────────────────────────────────────
print("BOM PSV 태그 조회 중...")
bom_rows = fetch_all(
    'bom_detail',
    'select=tag,mat_code,full_description,system,iso_dwg_no,qty,uom'
    '&tag=not.is.null'
    '&or=(mat_code.ilike.PSV*,mat_code.ilike.PRV*,'
    'full_description.ilike.*Safety Valve*,full_description.ilike.*PSV*)'
)

# ── 2. 수정 대상 식별 ─────────────────────────────────────────────────────
changes = []
for row in bom_rows:
    old = (row.get('tag') or '').strip()
    new = fix_tag(old)
    if old != new:
        changes.append({'old': old, 'new': new, 'row': row})

print(f"\n[수정 대상 태그]")
for c in changes:
    print(f"  {c['old']:30s} → {c['new']}")
print(f"  총 {len(changes)}건")

# ── 3. SQL 파일 생성 ──────────────────────────────────────────────────────
sql_lines = ["-- BOM Safety Valve Tag 수정 SQL", "-- 생성: fix_sv_bom_tags.py", ""]

# Fix 1: 301193 오타
sql_lines.append("-- Fix 1: PSV-301193 → PSV-31193")
sql_lines.append("UPDATE material.bom SET tag = REPLACE(tag, 'PSV-301193', 'PSV-31193')")
sql_lines.append("WHERE tag LIKE '%PSV-301193%';")
sql_lines.append("")

# Fix 2: PSVnnnn → PSV-nnnn
sql_lines.append("-- Fix 2: PSVnnnn → PSV-nnnn (대시 누락)")
sql_lines.append("UPDATE material.bom")
sql_lines.append("SET tag = REGEXP_REPLACE(tag, 'PSV([0-9])', 'PSV-\\1', 'g')")
sql_lines.append("WHERE tag ~ 'PSV[0-9]';")
sql_lines.append("")

# 검증 쿼리
sql_lines.append("-- 검증: 수정 후 태그 확인")
sql_lines.append("SELECT DISTINCT tag FROM material.bom")
sql_lines.append("WHERE tag ILIKE '%PSV%'")
sql_lines.append("ORDER BY tag;")

sql_path = os.path.join(os.path.dirname(__file__), 'fix_sv_bom_tags.sql')
with open(sql_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines))
print(f"\nSQL 파일 저장: {sql_path}")

# ── 4. 수정 후 재매칭 시뮬레이션 ─────────────────────────────────────────
print("\n[수정 후 예상 매칭 결과 시뮬레이션]")
recv_rows = fetch_all(
    'receiving',
    'select=tag,mat_code,full_description,doc_no,pkg_no,qty'
    '&category=eq.Valve'
    '&tag=not.is.null'
    '&or=(full_description.ilike.*Safety Valve*,full_description.ilike.*PSV*,'
    'tag.ilike.*PSV*,tag.ilike.*PRV*)'
)

bom_tags_fixed = set()
for row in bom_rows:
    t = fix_tag((row.get('tag') or '').strip().upper())
    if t:
        bom_tags_fixed.add(t)

recv_tags = set()
for row in recv_rows:
    t = (row.get('tag') or '').strip().upper()
    if t:
        recv_tags.add(t)

matched   = bom_tags_fixed & recv_tags
bom_only  = bom_tags_fixed - recv_tags
recv_only = recv_tags - bom_tags_fixed

print(f"  BOM PSV Tags (수정 후): {len(bom_tags_fixed)}건")
print(f"  Received PSV Tags:       {len(recv_tags)}건")
print(f"  매칭:                    {len(matched)}건")
print(f"  BOM만 (미입고):          {len(bom_only)}건")
print(f"  Received만 (BOM없음):    {len(recv_only)}건")

if bom_only:
    print("\n  [BOM에만 있는 태그]")
    for t in sorted(bom_only): print(f"    {t}")
if recv_only:
    print("\n  [Received에만 있는 태그]")
    for t in sorted(recv_only): print(f"    {t}")

print("\nSQL을 Supabase SQL Editor에서 실행한 뒤 완전 매칭됩니다.")
