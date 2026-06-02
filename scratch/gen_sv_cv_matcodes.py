# Safety Valve / Control Valve BOM matcode 생성
# 형식: PSV-{MATL}-{DCODE}-{CLASS}-{END}, CON-{MATL}-{DCODE}-{CLASS}-{END}
# 출력: insert_sv_cv_matcodes.sql, update_sv_cv_bom_matcodes.sql

import re, sys, io, openpyxl
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ── 코드 매핑 ───────────────────────────────────────────────────────────────
MATL_MAP = {
    'A105': 'CS05', 'SA105': 'CS05',
    'A216-WCB': 'CS05', 'SA216-WCB': 'CS05',
    'A216-WCC': 'CS05', 'SA216-WCC': 'CS05',
    'A351-CF8': 'SS04', 'SA351-CF8': 'SS04',
    'A351-CF8M': 'SS16', 'CF8M': 'SS16',
}
MATL_DESC_MAP = {
    'CS05': 'A105 / A216-WCB (Carbon Steel)',
    'SS04': 'A351-CF8 (Stainless Steel 304)',
    'SS16': 'A351-CF8M (Stainless Steel 316)',
}
DN_TO_D = {
    15:'D005', 20:'D008', 25:'D010', 40:'D015',
    50:'D020', 65:'D025', 80:'D030', 100:'D040',
    125:'D050', 150:'D060', 200:'D080', 250:'D100',
    300:'D120', 350:'D140', 400:'D160', 500:'D200',
}
D_TO_NPS = {
    'D005':'1/2"', 'D008':'3/4"', 'D010':'1"', 'D015':'1-1/2"',
    'D020':'2"', 'D025':'2-1/2"', 'D030':'3"', 'D040':'4"',
    'D050':'5"', 'D060':'6"', 'D080':'8"', 'D100':'10"',
    'D120':'12"', 'D140':'14"', 'D160':'16"', 'D200':'20"',
}

def parse_dn(s):
    m = re.search(r'DN\s*(\d+)', str(s), re.I)
    return DN_TO_D.get(int(m.group(1))) if m else None

def parse_matl(s):
    s = str(s).strip()
    return MATL_MAP.get(s) or MATL_MAP.get(s.replace('SA','A')) or 'CS05'

def parse_class(s):
    m = re.search(r'(\d+)\s*#', str(s))
    return f'C{m.group(1)}' if m else 'C150'

def parse_end(s):
    s = str(s).strip().upper()
    for e in ('SW', 'BW', 'RF', 'FF'):
        if e in s.split():
            return e
    return s if s in ('SW','BW','RF','FF') else 'BW'

def esc(v):
    if v is None: return 'NULL'
    return "'" + str(v).replace("'","''") + "'"

# ── 1. Safety Valve ─────────────────────────────────────────────────────────
sv_rows = []
wb = openpyxl.load_workbook('Raw File/BOM Data/Safety Valve BOM.xlsx')
ws = wb.active
for r in range(2, ws.max_row+1):
    sys_   = ws.cell(r,1).value
    desc   = ws.cell(r,4).value
    tag    = str(ws.cell(r,5).value or '').strip()
    size_s = ws.cell(r,7).value   # e.g. '6"'
    matl_s = ws.cell(r,8).value   # e.g. 'SA216-WCB'
    conn_s = ws.cell(r,9).value   # e.g. 'ASME 150# RF'
    if not tag: continue

    # full_description 재구성 (DN 포함)
    full_desc = f'{desc}, {size_s}, {matl_s}, {conn_s}'

    # 인치 → DN (Safety Valve size는 인치 문자열)
    inch_m = re.match(r'(\d+)"', str(size_s).strip())
    inch   = int(inch_m.group(1)) if inch_m else None
    INCH_TO_DN = {1:25,2:50,3:80,4:100,6:150,8:200,10:250,12:300}
    dn = INCH_TO_DN.get(inch)
    d_code = DN_TO_D.get(dn) if dn else None

    matl_code = parse_matl(str(matl_s).strip())
    cls_code  = parse_class(conn_s)
    end_code  = parse_end(conn_s)

    if not d_code:
        print(f'  [WARN] PSV size 파싱 실패: tag={tag}, size={size_s}')
        continue

    mat_code = f'PSV-{matl_code}-{d_code}-{cls_code}-{end_code}'
    sv_rows.append({'tag': tag, 'mat_code': mat_code, 'system': sys_,
                    'matl_code': matl_code, 'd_code': d_code,
                    'cls_code': cls_code, 'end_code': end_code})

print(f'Safety Valve: {len(sv_rows)}행')

# ── 2. Control Valve ────────────────────────────────────────────────────────
cv_rows = []
wb2 = openpyxl.load_workbook('Raw File/BOM Data/Control Valve BOM.xlsx')
ws2 = wb2['C01A']
for r in range(2, ws2.max_row+1):
    desc   = ws2.cell(r,4).value   # service description
    tag    = str(ws2.cell(r,5).value or '').strip()
    style  = ws2.cell(r,6).value   # GLOBE / 3WAY GLOBE
    size_s = ws2.cell(r,7).value   # '2"', '3"' (inch)
    matl_s = ws2.cell(r,8).value   # 'A105', 'A216-WCB'
    rating = ws2.cell(r,9).value   # 600 (numeric)
    conn_s = ws2.cell(r,10).value  # 'SW', 'BW', 'RF'
    if not tag: continue

    inch_m = re.match(r'(\d+)"', str(size_s).strip())
    inch   = int(inch_m.group(1)) if inch_m else None
    INCH_TO_DN = {1:25,2:50,3:80,4:100,6:150,8:200,10:250,12:300}
    dn = INCH_TO_DN.get(inch)
    d_code = DN_TO_D.get(dn) if dn else None

    matl_code = parse_matl(str(matl_s).strip())
    cls_code  = f'C{int(rating)}' if rating else 'C150'
    end_code  = parse_end(conn_s)

    if not d_code:
        print(f'  [WARN] CON size 파싱 실패: tag={tag}, size={size_s}')
        continue

    mat_code = f'CON-{matl_code}-{d_code}-{cls_code}-{end_code}'
    cv_rows.append({'tag': tag, 'mat_code': mat_code, 'system': None,
                    'matl_code': matl_code, 'd_code': d_code,
                    'cls_code': cls_code, 'end_code': end_code})

print(f'Control Valve: {len(cv_rows)}행')

# ── 3. 유니크 matcode 추출 → matcode_master ──────────────────────────────────
all_rows = sv_rows + cv_rows
seen_mc = {}
for row in all_rows:
    mc = row['mat_code']
    if mc not in seen_mc:
        prefix = mc.split('-')[0]
        item_desc = 'SAFETY VALVE' if prefix == 'PSV' else 'CONTROL VALVE'
        matl_desc = MATL_DESC_MAP.get(row['matl_code'], row['matl_code'])
        size1     = D_TO_NPS.get(row['d_code'], '')
        cls_desc  = row['cls_code'].replace('C','CL')  # C600 → CL600
        seen_mc[mc] = {
            'mat_code':   mc,
            'category':   'Valve',
            'item_desc':  item_desc,
            'matl_desc':  matl_desc,
            'size1':      size1,
            'size2':      '',
            'class_desc': cls_desc,
            'et_desc':    row['end_code'],
        }

print(f'\n신규 matcode: {len(seen_mc)}종')
for mc in sorted(seen_mc):
    r = seen_mc[mc]
    print(f'  {mc:35s} {r["item_desc"]:16s} {r["size1"]:8s} {r["class_desc"]:8s} {r["et_desc"]}')

# ── 4. SQL 생성 ──────────────────────────────────────────────────────────────
# 4a. matcode_master INSERT
with open('scratch/insert_sv_cv_matcodes.sql', 'w', encoding='utf-8') as f:
    f.write('-- Safety Valve / Control Valve matcode_master 등록\n')
    f.write('-- Supabase SQL Editor에서 실행\n\n')
    for mc, d in sorted(seen_mc.items()):
        f.write(
            f"INSERT INTO material.matcode_master "
            f"(mat_code, category, item_desc, matl_desc, size1, size2, class_desc, et_desc) VALUES "
            f"({esc(d['mat_code'])}, 'Valve', {esc(d['item_desc'])}, {esc(d['matl_desc'])}, "
            f"{esc(d['size1'])}, '', {esc(d['class_desc'])}, {esc(d['et_desc'])})"
            f" ON CONFLICT (mat_code) DO NOTHING;\n"
        )
print('\n→ scratch/insert_sv_cv_matcodes.sql 생성')

# 4b. bom UPDATE (tag → mat_code)
with open('scratch/update_sv_cv_bom_matcodes.sql', 'w', encoding='utf-8') as f:
    f.write('-- Safety Valve / Control Valve bom mat_code 할당\n')
    f.write('-- matcode_master 등록 후 실행\n\n')
    # 태그별 mat_code가 다를 수 있으므로 개별 UPDATE
    by_mc = {}
    for row in all_rows:
        mc = row['mat_code']
        if mc not in by_mc:
            by_mc[mc] = []
        by_mc[mc].append(row['tag'])
    for mc, tags in sorted(by_mc.items()):
        tag_list = ', '.join(f"'{t}'" for t in tags)
        f.write(f"UPDATE material.bom SET mat_code = '{mc}'\n")
        f.write(f"  WHERE tag IN ({tag_list});\n\n")
print('→ scratch/update_sv_cv_bom_matcodes.sql 생성')

# 4c. insert_sv_cv_bom.sql 재생성 (mat_code 포함 버전)
with open('scratch/insert_sv_cv_bom_v2.sql', 'w', encoding='utf-8') as f:
    f.write('-- Safety Valve + Control Valve BOM INSERT (mat_code 포함)\n')
    f.write('-- matcode_master 등록 후 실행\n\n')
    f.write("DELETE FROM material.bom\n")
    f.write("WHERE category = 'Valve'\n")
    f.write("  AND tag ~ '^B[012w][-]?(PSV|TCV|LCV|FCV|FV|PCV)';\n\n")
    tag_to_mc = {row['tag']: row['mat_code'] for row in all_rows}
    # SV 먼저
    f.write(f'-- Safety Valve ({len(sv_rows)}행)\n')
    wb_sv = openpyxl.load_workbook('Raw File/BOM Data/Safety Valve BOM.xlsx')
    ws_sv = wb_sv.active
    for r in range(2, ws_sv.max_row+1):
        sys_ = ws_sv.cell(r,1).value
        desc_v = ws_sv.cell(r,4).value
        tag  = str(ws_sv.cell(r,5).value or '').strip()
        size_s = ws_sv.cell(r,7).value
        matl_s = ws_sv.cell(r,8).value
        conn_s = ws_sv.cell(r,9).value
        if not tag: continue
        inch_m = re.match(r'(\d+)"', str(size_s).strip())
        inch   = int(inch_m.group(1)) if inch_m else None
        INCH_TO_DN = {1:25,2:50,3:80,4:100,6:150,8:200,10:250,12:300}
        dn = INCH_TO_DN.get(inch)
        dn_str = f'DN {dn}' if dn else str(size_s)
        full_d = f'{desc_v}, {dn_str}, {matl_s}, {conn_s}'
        mc = tag_to_mc.get(tag, 'NULL')
        mc_sql = f"'{mc}'" if mc != 'NULL' else 'NULL'
        f.write(
            f"INSERT INTO material.bom (mat_code,category,tag,system,iso_dwg_no,line_no,full_description,uom,qty) VALUES "
            f"({mc_sql},'Valve',{esc(tag)},{esc(sys_)},NULL,NULL,{esc(full_d)},'EA',1.0);\n"
        )
    # CV 다음
    f.write(f'\n-- Control Valve ({len(cv_rows)}행)\n')
    wb_cv = openpyxl.load_workbook('Raw File/BOM Data/Control Valve BOM.xlsx')
    ws_cv = wb_cv['C01A']
    for r in range(2, ws_cv.max_row+1):
        desc_v = ws_cv.cell(r,4).value
        tag    = str(ws_cv.cell(r,5).value or '').strip()
        style  = ws_cv.cell(r,6).value
        size_s = ws_cv.cell(r,7).value
        matl_s = ws_cv.cell(r,8).value
        rating = ws_cv.cell(r,9).value
        conn_s = ws_cv.cell(r,10).value
        if not tag: continue
        import re as re2
        inch_m = re2.match(r'(\d+)"', str(size_s).strip())
        inch   = int(inch_m.group(1)) if inch_m else None
        INCH_TO_DN2 = {1:25,2:50,3:80,4:100,6:150,8:200,10:250,12:300}
        dn = INCH_TO_DN2.get(inch)
        dn_str = f'DN {dn}' if dn else str(size_s)
        rating_str = f'{int(rating)}#' if rating else ''
        full_d = ', '.join(filter(None,[
            str(desc_v).strip() if desc_v else '',
            str(style).replace('\n',' ').strip() if style else '',
            dn_str, str(matl_s).strip() if matl_s else '',
            rating_str, str(conn_s).strip() if conn_s else ''
        ]))
        mc = tag_to_mc.get(tag, 'NULL')
        mc_sql = f"'{mc}'" if mc != 'NULL' else 'NULL'
        f.write(
            f"INSERT INTO material.bom (mat_code,category,tag,system,iso_dwg_no,line_no,full_description,uom,qty) VALUES "
            f"({mc_sql},'Valve',{esc(tag)},NULL,NULL,NULL,{esc(full_d)},'EA',1.0);\n"
        )
print('→ scratch/insert_sv_cv_bom_v2.sql 생성')
print('\n실행 순서:')
print('  1. insert_sv_cv_matcodes.sql  (matcode_master 신규 등록)')
print('  2. insert_sv_cv_bom_v2.sql    (기존 bom DELETE 후 mat_code 포함 재삽입)')
