# PGU-DE-0364 Valve Receiving 6행 등록 (VLV-002 Tag는 B1이 아니라 B2로 정정)
import os, psycopg2
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ['SUPABASE_DB_URL'])
cur = conn.cursor()

cur.execute("select coalesce(max(id),0) from receiving")
next_id = cur.fetchone()[0] + 1

rows = [
    # pkg_no, tag, valve_type, full_desc, mat1, mat2, size, rating, qty
    ('PGU-DE-0364-MOV-VLV-001', 'B1-MOV-34012', 'T-Type Globe', 'T-Type Globe Valve 2"', 'CS', 'A105', '2"', 'CL150', 1),
    ('PGU-DE-0364-MOV-VLV-001', 'B1-MOV-34014', 'T-Type Globe', 'T-Type Globe Valve 2"', 'CS', 'A105', '2"', 'CL150', 1),
    ('PGU-DE-0364-MOV-VLV-002', 'B2-MOV-34012', 'T-Type Globe', 'T-Type Globe Valve 2"', 'CS', 'A105', '2"', 'CL150', 1),
    ('PGU-DE-0364-MOV-VLV-002', 'B2-MOV-34014', 'T-Type Globe', 'T-Type Globe Valve 2"', 'CS', 'A105', '2"', 'CL150', 1),
]

insert_sql = """
insert into receiving (id, doc_no, mat_code, unit, qty, category, pkg_no, full_description, tag, purpose, parent_tag, op_type, valve_type, mat1, mat2, size, rating)
values (%s, %s, null, 'EA', %s, 'Valve', %s, %s, %s, null, %s, 'MOV', %s, %s, %s, %s, %s)
"""

n = next_id
for pkg_no, tag, vtype, desc, mat1, mat2, size, rating, qty in rows:
    cur.execute(insert_sql, (n, 'PGU-DE-0364', qty, pkg_no, desc, tag, tag, vtype, mat1, mat2, size, rating))
    n += 1

# Spare rows (VLV-003) — 원본에 완전 동일 행이 2번 있음(과거 사례상 정상 패턴), 유니크 Tag 부여
spare_pkg = 'PGU-DE-0364-MOV-VLV-003'
for seq in (1, 2):
    tag = f"{spare_pkg}-SPARE-{seq:03d}"
    cur.execute(insert_sql, (n, 'PGU-DE-0364', 2, spare_pkg, 'Packing & Gasket', tag, spare_pkg, 'Spare', None, None, None, None))
    n += 1

conn.commit()
print(f"Inserted {n - next_id} rows, id range {next_id}..{n-1}")

cur.execute("select id, pkg_no, tag, valve_type, full_description, mat1, mat2, size, rating, qty from receiving where doc_no='PGU-DE-0364' order by id")
for r in cur.fetchall():
    print(r)
cur.close()
conn.close()
