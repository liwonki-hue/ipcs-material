import os, psycopg2
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.environ['SUPABASE_DB_URL'])
cur = conn.cursor()

pkg = 'PGU-DE-0454-BOP-VLV-021'
updates = [
    (10941, f'{pkg}-SPARE-001'),
    (10942, f'{pkg}-SPARE-002'),
]

for row_id, new_tag in updates:
    cur.execute("""
        update receiving
        set tag = %s,
            valve_type = 'SPARE',
            full_description = 'Globe (8" SS)',
            mat1 = null,
            mat2 = null,
            size = null,
            rating = null,
            op_type = null,
            parent_tag = %s
        where id = %s
    """, (new_tag, pkg, row_id))

conn.commit()

cur.execute("select id, pkg_no, tag, valve_type, full_description, mat1, mat2, size, rating, qty, op_type, parent_tag from receiving where pkg_no = %s order by id", (pkg,))
for r in cur.fetchall():
    print(r)

cur.close()
conn.close()
