# 이미 입고 완료된 MOV/Control Valve(CV)/Bypass Valve/Safety Valve(PSV)를
# bom 테이블(category='Valve')에 신규 등록 — 기존 Manual Valve List BOM에는 이 4종이 아예 없었음
import psycopg2

DB_URL = open('.env').read().strip().split('=', 1)[1]
conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# NPS(inch) 표기 -> DN(mm), 사용자 확인된 표준 배관 사이즈만 (extractDnSizeFromDesc가 "DN nn" 형식을 요구)
DN_MAP = {
    '1/2"': 15, '3/4"': 20, '1"': 25, '1.5"': 40, '2"': 50, '3"': 80, '4"': 100,
    '6"': 150, '8"': 200, '10"': 250, '12"': 300, '14"': 350, '16"': 400,
    '18"': 450, '20"': 500, '22"': 550,
}
# 사용자 확인(2026-08-07): 'HP TBS D-TUBE' 4건의 '34"'는 '3/4"' 오타로 보이지만
# 원본을 임의로 정정하지 않고 그대로 유지하기로 결정 — DN 변환하지 않고 원문 보존
UNRESOLVED_SIZE = '34"'


def convert_size(raw_size):
    """'1"' -> 'DN25', '1"/2"' -> 'DN25/DN50' (Inlet/Outlet 둘 다 보존, 사용자 확인).
    '34"'처럼 매핑 불가한 조각은 원문 그대로 남긴다."""
    parts = raw_size.split('/')
    out = []
    for p in parts:
        if p == UNRESOLVED_SIZE:
            out.append(p)
        elif p in DN_MAP:
            out.append(f'DN {DN_MAP[p]}')
        else:
            raise ValueError(f'매핑 불가 SIZE 조각: {p!r} (raw={raw_size!r})')
    return '/'.join(out)


def normalize_rating(raw_rating):
    # 'C150' -> 'CL150' (오타), 'CL 3000' -> 'CL3000' (공백 제거) — 그 외(SCH 80 등)는 그대로 유지
    if raw_rating == 'C150':
        return 'CL150'
    return raw_rating.replace('CL ', 'CL')


cur.execute("SELECT tag FROM bom WHERE category='Valve'")
bom_tags = set(r[0] for r in cur.fetchall())

cur.execute("""
    SELECT tag, parent_tag, mat1, mat2, size, rating, unit, qty, full_description
    FROM receiving
    WHERE category='Valve' AND op_type IN ('MOV','CV','BYPASS','PSV')
      AND tag NOT LIKE '%-ACC-%' AND tag NOT LIKE '%-SPARE-%'
""")
rows = cur.fetchall()
target = [r for r in rows if r[1] not in bom_tags]
print(f'대상 행: {len(target)}건')

insert_rows = []
for tag, parent_tag, mat1, mat2, size, rating, unit, qty, full_desc in target:
    new_size = convert_size(size)
    new_rating = normalize_rating(rating)
    parts = full_desc.split(', ')
    # [item+" VALVE", mat2, old_size, old_rating, conn] — item/mat2/conn만 재사용, size/rating은 교체
    new_desc = f'{parts[0]}, {mat2}, {new_size}, {new_rating}, {parts[4]}'
    insert_rows.append((None, 'Valve', tag, None, None, None, new_desc, unit, qty, mat1, mat2))

# Tag 유니크성 확인 (buildTagRecvMaps가 bom.tag == receiving.tag로 매칭하므로 receiving.tag 그대로 사용)
tags = [r[2] for r in insert_rows]
assert len(tags) == len(set(tags)), 'BOM에 추가할 Tag 중복 발견'
assert not (set(tags) & bom_tags), '기존 BOM Tag와 충돌 발견'
print('Tag 유니크성/기존 BOM 미충돌 확인 완료')

insert_sql = """
    INSERT INTO bom (mat_code, category, tag, system, iso_dwg_no, line_no,
                      full_description, uom, qty, mat1, mat2)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""
cur.executemany(insert_sql, insert_rows)
conn.commit()
print(f'삽입된 행: {cur.rowcount if cur.rowcount != -1 else len(insert_rows)}')

cur.execute("SELECT count(*) FROM bom WHERE category='Valve'")
print(f'최종 bom category=Valve 총 행: {cur.fetchone()[0]}')

cur.close()
conn.close()
