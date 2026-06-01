# Spool BOM 데이터를 파싱하여 Supabase SQL INSERT 스크립트 생성
import openpyxl

wb = openpyxl.load_workbook('Raw File/bom/Spool BOM.xlsx', read_only=True)
ws = wb['Detail PL']

rows = []
for row in ws.iter_rows(min_row=2, values_only=True):
    if row[1]:
        mat_code, system, iso_dwg_no, line_no, description, tag_no, item, size, uom, qty = row
        line_no = (line_no or '').strip()
        rows.append((system, iso_dwg_no, line_no, description, tag_no, size, uom or 'EA', int(qty or 1)))

def esc(s):
    return str(s).replace("'", "''") if s else ''

lines = []
lines.append('-- spool_bom 테이블 생성 및 데이터 등록 (material 스키마)')
lines.append('-- SQL Editor에서 실행하세요')
lines.append('')
lines.append('CREATE TABLE IF NOT EXISTS material.spool_bom (')
lines.append('    id bigserial primary key,')
lines.append('    system text,')
lines.append('    iso_dwg_no text,')
lines.append('    line_no text,')
lines.append('    description text,')
lines.append('    tag_no text,')
lines.append('    size text,')
lines.append("    uom text default 'EA',")
lines.append('    qty numeric default 1')
lines.append(');')
lines.append('')
lines.append('GRANT SELECT ON material.spool_bom TO anon;')
lines.append('')
lines.append('TRUNCATE TABLE material.spool_bom;')
lines.append('')
lines.append('INSERT INTO material.spool_bom (system, iso_dwg_no, line_no, description, tag_no, size, uom, qty) VALUES')

vals = []
for r in rows:
    vals.append(f"    ('{esc(r[0])}', '{esc(r[1])}', '{esc(r[2])}', '{esc(r[3])}', '{esc(r[4])}', '{esc(r[5])}', '{esc(r[6])}', {r[7]})")

lines.append(',\n'.join(vals) + ';')

sql = '\n'.join(lines)
with open('scratch/create_spool_bom.sql', 'w', encoding='utf-8') as f:
    f.write(sql)
print(f'완료: {len(rows)}건 → scratch/create_spool_bom.sql')
