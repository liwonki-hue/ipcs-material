# PGU-DE-0605 Valve Receiving 3행 등록 (Butterfly Valve 2대 + Tap Bolt 부자재 1행)
import os, psycopg2
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ['SUPABASE_DB_URL'])
cur = conn.cursor()

cur.execute("select coalesce(max(id),0) from receiving")
next_id = cur.fetchone()[0] + 1

pkg = 'PGU-DE-0605-BOP-BFV-001'
insert_sql = """
insert into receiving (id, doc_no, mat_code, unit, qty, category, pkg_no, full_description, tag, purpose, parent_tag, op_type, valve_type, mat1, mat2, size, rating)
values (%s, %s, null, 'EA', %s, 'Valve', %s, %s, %s, null, %s, %s, %s, %s, %s, %s, %s)
"""

n = next_id
for tag in ('B0-MV-35141', 'B0-MV-35142'):
    cur.execute(insert_sql, (n, 'PGU-DE-0605', 1, pkg, 'Butterfly VALVE, A351 CF8, 8", C150, RF', tag, tag, 'Manual', 'Butterfly', 'SS', 'A351 CF8', '8"', 'C150'))
    n += 1

acc_tag = f'{pkg}-ACC-001'
cur.execute(insert_sql, (n, 'PGU-DE-0605', 32, pkg, 'Tap Bolt - 3/4" x 55L', acc_tag, pkg, None, 'Tap Bolt', None, None, None, None))
n += 1

conn.commit()
print(f"Inserted {n - next_id} rows, id range {next_id}..{n-1}")

cur.execute("select id, pkg_no, tag, valve_type, full_description, mat1, mat2, size, rating, qty, op_type, parent_tag from receiving where doc_no='PGU-DE-0605' order by id")
for r in cur.fetchall():
    print(r)
cur.close()
conn.close()
