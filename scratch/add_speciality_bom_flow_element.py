# Receiving에는 있으나 BOM에 없는 FLOW ELEMENT(Speciality) 14건을 Receiving 데이터 그대로 bom에 신규 등록
# (MOV/CV/Bypass/PSV Valve BOM 신규 등록과 동일한 원칙 — 이미 입고 완료된 항목이므로 그대로 반영)
import psycopg2

DB_URL = open('.env').read().strip().split('=', 1)[1]
conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

cur.execute("SELECT tag FROM bom WHERE category='Speciality'")
bom_tags = set(r[0] for r in cur.fetchall())

cur.execute("""
    SELECT tag, mat1, mat2, full_description, unit, qty
    FROM receiving
    WHERE category='Speciality' AND parent_tag=tag AND valve_type ILIKE '%FLOW ELEMENT%'
""")
rows = cur.fetchall()
target = [r for r in rows if r[0] not in bom_tags]
print(f'대상 행: {len(target)}건')

insert_rows = []
for tag, mat1, mat2, full_desc, unit, qty in target:
    insert_rows.append((None, 'Speciality', tag, None, None, None, full_desc, unit, qty, mat1, mat2))

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
print(f'삽입된 행: {len(insert_rows)}')

cur.execute("SELECT count(*) FROM bom WHERE category='Speciality'")
print(f'최종 bom category=Speciality 총 행: {cur.fetchone()[0]}')

cur.close()
conn.close()
