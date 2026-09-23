# PGU-DE-0596 (BOP Hanger Support 구조재 Bulk) → support_receiving 18행 + support_packing_list 13행 등록
import os, re, openpyxl, psycopg2
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv()
DOC = 'PGU-DE-0596'
wb = openpyxl.load_workbook('Raw File/PGU-DE-0596.xlsx', data_only=True)
ws = wb['Detail PL']

rows = []
for pkg_no, desc, qty, unit, note, *_ in ws.iter_rows(min_row=2, values_only=True):
    if not pkg_no:
        continue
    m = re.match(r'^(.+?)\s*/\s*(.+)\((.+)\)$', desc.strip())
    item, size, matl = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
    ml = re.search(r'x(\d+)L$', size)
    length = ml.group(1) if ml else None
    if ml:
        size = size[:ml.start()]
    # Tag No 열의 값은 Tag가 아니라 Small Bore BULK 번호/추가분 표기 → 무태그 BULK 행의 id_no에 보존
    rows.append((pkg_no, item, matl, size, length, int(qty), note.strip()))

conn = psycopg2.connect(os.environ['SUPABASE_DB_URL'])
cur = conn.cursor()

# 0603 BULK 행과 동일: system='BULK', support_tag NULL, sys_rank=23, pkg_null_rank=0, delivery_date NULL
for pkg_no, item, matl, size, length, qty, note in rows:
    cur.execute("""
        insert into support_receiving
            (system, support_tag, id_no, item, matl, size_or_type, length_mm, qty, pkg, package_no, sys_rank, pkg_null_rank)
        values ('BULK', null, %s, %s, %s, %s, %s, %s, %s, %s, 23, 0)
    """, (note, item, matl, size, length, qty, DOC, pkg_no))

per_pkg = defaultdict(int)
for r in rows:
    per_pkg[r[0]] += r[5]

cur.execute("select column_default from information_schema.columns where table_name='support_packing_list' and column_name='id'")
has_default = cur.fetchone()[0] is not None
cur.execute("select coalesce(max(id),0) from support_packing_list")
next_id = cur.fetchone()[0] + 1
for pkg_no in sorted(per_pkg):
    if has_default:
        cur.execute("insert into support_packing_list (pkg, package_no, description, qty, unit, block_info) values (%s,%s,'BOP Piping_Hanger and Support',%s,'EA',null)", (DOC, pkg_no, per_pkg[pkg_no]))
    else:
        cur.execute("insert into support_packing_list (id, pkg, package_no, description, qty, unit, block_info) values (%s,%s,%s,'BOP Piping_Hanger and Support',%s,'EA',null)", (next_id, DOC, pkg_no, per_pkg[pkg_no]))
        next_id += 1

conn.commit()

cur.execute("select package_no, id_no, item, matl, size_or_type, length_mm, qty from support_receiving where pkg=%s order by id", (DOC,))
for r in cur.fetchall():
    print(r)
cur.execute("select count(*), sum(qty) from support_receiving where pkg=%s", (DOC,))
print('support_receiving', cur.fetchone())
cur.execute("select count(*), sum(qty) from support_packing_list where pkg=%s", (DOC,))
print('support_packing_list', cur.fetchone())
cur.close()
conn.close()
