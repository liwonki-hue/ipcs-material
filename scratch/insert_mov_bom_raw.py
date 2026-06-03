# MOV Valve BOM → bom 테이블 직접 INSERT SQL 생성
# mat_code = NULL, full_description = Excel Description 그대로
# 출력: insert_mov_bom_raw.sql

import pandas as pd
import sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

def esc(v):
    if v is None or (isinstance(v, float) and v != v):
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"

def nan_to_none(v):
    try:
        if v is None or pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    s = str(v).strip()
    return s if s else None

xl = pd.ExcelFile('Raw File/BOM Data/MOV Valve BOM.xlsx')
rows = []

# Sheet 1: Butterfly Valve
df = xl.parse('Butterfly Valve', header=0)
for _, r in df.iterrows():
    tag = nan_to_none(r.get('Tag No.'))
    if not tag:
        continue
    rows.append({
        'tag':         tag,
        'system':      nan_to_none(r.get('System')),
        'iso_dwg_no':  nan_to_none(r.get('ISO Drawing')),
        'line_no':     nan_to_none(r.get('Line no')),
        'description': nan_to_none(r.get('Description')),
        'qty':         float(r.get("Q'ty") or 1),
    })

# Sheet 2: GATE GLOBE
df2 = xl.parse('GATE GLOBE', header=0)
for _, r in df2.iterrows():
    tag = nan_to_none(r.get('Tag No.'))
    if not tag:
        continue
    rows.append({
        'tag':         tag,
        'system':      nan_to_none(r.get('System')),
        'iso_dwg_no':  nan_to_none(r.get('ISO Drawing')),
        'line_no':     nan_to_none(r.get('Line No')),
        'description': nan_to_none(r.get('Description')),
        'qty':         float(r.get("Q'ty") or 1),
    })

print(f'총 {len(rows)}행')

with open('scratch/insert_mov_bom_raw.sql', 'w', encoding='utf-8') as f:
    f.write('-- MOV Valve BOM INSERT (Excel 원본 그대로)\n')
    f.write('SET search_path TO material, public;\n\n')
    f.write("DELETE FROM material.bom\n")
    f.write("  WHERE category = 'Valve' AND tag ~ '^B[012]-MOV-';\n\n")
    for row in rows:
        f.write(
            f"INSERT INTO material.bom "
            f"(mat_code, category, tag, system, iso_dwg_no, line_no, full_description, uom, qty) VALUES "
            f"(NULL, 'Valve', {esc(row['tag'])}, {esc(row['system'])}, "
            f"{esc(row['iso_dwg_no'])}, {esc(row['line_no'])}, "
            f"{esc(row['description'])}, 'EA', {row['qty']});\n"
        )

print('→ scratch/insert_mov_bom_raw.sql 생성')
