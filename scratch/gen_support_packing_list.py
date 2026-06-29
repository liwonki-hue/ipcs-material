# Support Packing List → support_packing_list 테이블 CREATE + INSERT SQL 생성
import openpyxl, os

wb = openpyxl.load_workbook(
    os.path.join(os.path.dirname(__file__), '..', 'Raw File', 'Support Packing List.xlsx'),
    read_only=True, data_only=True
)
ws = wb['Summary PL']

def esc(v):
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"

rows_sql = []
for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i == 0:
        continue
    pkg        = row[0]  # PKG
    package_no = row[1]  # PACKAGE NO
    desc       = row[2]  # DESCRIPTION
    qty        = row[3]  # Q'TY
    unit       = row[4]  # UNIT
    block_info = row[5]  # HP STEAM BLOCK #1 등

    if not package_no:
        continue

    rows_sql.append(
        f"  ({esc(pkg)}, {esc(package_no)}, {esc(desc)}, "
        f"{qty if qty is not None else 0}, {esc(unit or 'EA')}, {esc(block_info)})"
    )

sql = """\
-- ─────────────────────────────────────────────────────────────
-- 1. 테이블 생성
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_packing_list (
    id          SERIAL PRIMARY KEY,
    pkg         TEXT,
    package_no  TEXT UNIQUE,
    description TEXT,
    qty         NUMERIC,
    unit        TEXT DEFAULT 'EA',
    block_info  TEXT
);

-- RLS: anon key 조회 허용
ALTER TABLE support_packing_list ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access" ON support_packing_list
    FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 2. 데이터 삽입 (중복 시 무시)
-- ─────────────────────────────────────────────────────────────
INSERT INTO support_packing_list (pkg, package_no, description, qty, unit, block_info)
VALUES
"""
sql += ',\n'.join(rows_sql)
sql += '\nON CONFLICT (package_no) DO NOTHING;\n'
sql += f'\n-- Total: {len(rows_sql)} rows\n'

out_path = os.path.join(os.path.dirname(__file__), 'create_support_packing_list.sql')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(sql)
print(f'Saved: {out_path}')
print(f'Rows: {len(rows_sql)}')
