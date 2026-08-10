# PGU-DE-0474-BOP-MBV-001에서 Tag 미확정 상태(SPARE)로 발송된 1" Ball Valve 53개를
# BOM 대비 부족(미수령) 1" Ball Valve(A105, CL600) Tag 목록 순서대로 배정해 receiving에 개별 등록
import psycopg2
import psycopg2.extras

DB_URL = open('.env').read().strip().split('=', 1)[1]
conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

BOM_DESC = 'BALL VALVE, A105, DN 25, CL600, RF'
SPARE_COUNT = 53

cur.execute("SELECT tag FROM bom WHERE category='Valve' AND full_description=%s ORDER BY tag", (BOM_DESC,))
bom_tags = [r[0] for r in cur.fetchall()]

cur.execute("SELECT tag FROM receiving WHERE category='Valve'")
recv_tags = set(r[0] for r in cur.fetchall())

missing = sorted(t for t in bom_tags if t not in recv_tags)
print(f'BOM 대비 부족(미수령) 1" Ball Valve(A105, CL600) 총: {len(missing)}건')
assert len(missing) >= SPARE_COUNT, '부족 Tag 수가 배정 대상보다 적음'

assign_tags = missing[:SPARE_COUNT]
leftover = missing[SPARE_COUNT:]
print(f'배정 대상: {len(assign_tags)}건, 남는 Tag: {leftover}')

cur.execute("SELECT COALESCE(MAX(id), 0) FROM receiving")
next_id = cur.fetchone()[0] + 1

rows = []
for tag in assign_tags:
    rows.append((
        next_id, 'PGU-DE-0474', 'PGU-DE-0474-BOP-MBV-001', 'Valve', tag, tag,
        'Manual', 'BALL', 'CS', 'A105', '1"', 'CL600',
        'BALL VALVE, A105, 1", CL600, RF', 'EA', 1
    ))
    next_id += 1

insert_sql = """
    INSERT INTO receiving (id, doc_no, pkg_no, category, tag, parent_tag, op_type, valve_type,
                            mat1, mat2, size, rating, full_description, unit, qty)
    VALUES %s
"""
psycopg2.extras.execute_values(cur, insert_sql, rows)
conn.commit()
print(f'삽입된 행: {len(rows)}')

cur.execute("SELECT COUNT(*), COUNT(DISTINCT tag) FROM receiving WHERE category='Valve'")
print('receiving category=Valve 전체:', cur.fetchone())

cur.close()
conn.close()
