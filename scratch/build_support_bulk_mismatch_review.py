# Support BULK BOM↔Receiving 표기 불일치(BOM 전용 Shortage / 입고 전용 Surplus) 후보 매칭 검토용 Excel 생성
import os, re, psycopg2
from collections import defaultdict
from dotenv import load_dotenv
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

load_dotenv()
conn = psycopg2.connect(os.environ['SUPABASE_DB_URL'])
cur = conn.cursor()

cur.execute("""select item, matl, size_or_type, sum(qty) from support_bom
               where support_tag is null or support_tag='BULK' group by 1,2,3""")
bom = {(i or '-', m or '-', s or '-'): float(q) for i, m, s, q in cur.fetchall()}

cur.execute("""select item, matl, size_or_type, sum(qty), string_agg(distinct package_no, ', ' order by package_no)
               from support_receiving where support_tag is null or support_tag in ('BULK','-') group by 1,2,3""")
rec, rec_pkgs = {}, {}
for i, m, s, q, pk in cur.fetchall():
    k = (i or '-', m or '-', s or '-')
    rec[k] = float(q)
    rec_pkgs[k] = pk


def norm_size(s):
    s = s.upper().replace(' ', '')
    s = re.sub(r'/W/[\dA-Z.&]*(NUTS?|N)$', '', s)         # 너트 부속 표기 (/W/4NUTS, /W/2H.N&2T.N)
    s = re.sub(r'/[A-Z]=\d+(\(.*\))?$', '', s)             # 치수 접미어 (/E=130, /H=100, /A=117, /D=12)
    s = re.sub(r'-L=\d+M?$|[-/]\d+M$', '', s)              # 길이 접미어 (-L=100, -10M, /10M)
    s = re.sub(r'^(SAB|SRC|TRDF|TRRL|BAB|ENR|TBS)-', '', s)  # 부품코드 접두어
    s = re.sub(r'^([LCH])-', r'\1', s)                     # H-100x... → H100x...
    s = re.sub(r'^(\d+)T(?=\d)', r'PL\1', s)               # 16Tx32x60 → PL16x32x60
    s = re.sub(r'^PCS\d?-', 'PCS-', s)                     # PCS1-S-DN25-1-1 → PCS-S-DN25
    s = re.sub(r'^(PCS-[A-Z]-DN\d+)-\d-\d$', r'\1', s)
    s = s.replace('X', 'x').replace('/', 'x')              # 6/8 ↔ 6x8
    return s


ITEM_ALIAS = {'PIPE CLAMP SHOE': 'CLAMP SHOE', 'WELDED BEAM ATTACHMENT': 'BEAM ATTACHMENT'}


def norm_item(i):
    i = i.upper().strip()
    return ITEM_ALIAS.get(i, i)


exact = set(bom) & set(rec)
bom_only = {k: q for k, q in bom.items() if k not in rec}
rec_only = {k: q for k, q in rec.items() if k not in bom}

# 정규화한 (Item, Size) 단위로 묶어 합계를 비교. 정확 매칭된 키도 같은 그룹에 넣어야 합계가 맞는다
# (예: A36 H100x100x6/8 BOM 66 ↔ 입고 13은 정확 매칭이지만 H-BEAM 재질 행과 같은 규격 그룹)
groups = defaultdict(lambda: {'bom': [], 'rec': []})
for k, q in bom.items():
    groups[(norm_item(k[0]), norm_size(k[2]))]['bom'].append((k, q))
for k, q in rec.items():
    groups[(norm_item(k[0]), norm_size(k[2]))]['rec'].append((k, q))

# 정확 매칭만으로 이뤄진 그룹은 검토 대상이 아님 — bom_only/rec_only 키가 하나라도 있고 양쪽이 모두 있는 그룹만
matched = {g: v for g, v in groups.items() if v['bom'] and v['rec']
           and (any(k in bom_only for k, _ in v['bom']) or any(k in rec_only for k, _ in v['rec']))}
paired_bom = {k for v in matched.values() for k, _ in v['bom'] if k in bom_only}
used_rec = {k for v in matched.values() for k, _ in v['rec'] if k in rec_only}

wb = Workbook()
hdr_fill = PatternFill('solid', fgColor='0A2540')


def sheet(ws, headers, rows, widths):
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF'); c.fill = hdr_fill
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    for r in rows:
        ws.append(list(r))
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = ws.dimensions


group_rows, detail_rows = [], []
for gid, ((gi, gs), v) in enumerate(sorted(matched.items()), 1):
    bt = sum(q for _, q in v['bom']); rt = sum(q for _, q in v['rec'])
    allk = [k for k, _ in v['bom']] + [k for k, _ in v['rec']]
    matls = {k[1] for k in allk}; raw_items = {k[0] for k in allk}
    conf = 'High' if len(matls) == 1 and len(raw_items) == 1 else 'Medium (' + ', '.join(
        x for x, flag in (('MATL differs', len(matls) > 1), ('Item name differs', len(raw_items) > 1)) if flag) + ')'
    diff = rt - bt
    status = 'Balanced' if diff == 0 else ('Surplus' if diff > 0 else 'Shortage')
    group_rows.append((gid, gi, gs, bt, rt, diff, status, conf,
                       '\n'.join(f'{k[1]} | {k[2]} : {q:g}' for k, q in v['bom']),
                       '\n'.join(f'{k[1]} | {k[2]} : {q:g}  [{rec_pkgs[k]}]' for k, q in v['rec'])))
    for side, rows in (('BOM', v['bom']), ('Received', v['rec'])):
        for k, q in rows:
            detail_rows.append((gid, side, k[0], k[1], k[2], q, 'Exact match' if k in exact else 'Notation mismatch', rec_pkgs.get(k, '') if side == 'Received' else ''))

ws = wb.active; ws.title = 'Groups'
sheet(ws, ['Group', 'Item', 'Normalized Size', 'BOM Total', 'Recv Total', 'Diff (Recv-BOM)', 'Result', 'Confidence',
           'BOM rows (Matl | Size : Qty)', 'Received rows (Matl | Size : Qty [Packages])'],
      group_rows, [8, 16, 22, 11, 11, 14, 11, 22, 46, 70])
for row in ws.iter_rows(min_row=2):
    for c in row[8:10]:
        c.alignment = Alignment(wrap_text=True, vertical='top')

ws = wb.create_sheet('Group details')
sheet(ws, ['Group', 'Side', 'Item', 'Matl', 'Size', 'Qty', 'Key match', 'Packages'], detail_rows, [8, 10, 18, 12, 34, 10, 20, 50])

ws = wb.create_sheet('BOM only (no match)')
sheet(ws, ['Item', 'Matl', 'Size', 'BOM Qty (= Shortage)'],
      [(k[0], k[1], k[2], q) for k, q in sorted(bom_only.items()) if k not in paired_bom],
      [22, 12, 34, 18])

ws = wb.create_sheet('Received only (no match)')
sheet(ws, ['Item', 'Matl', 'Size', 'Recv Qty (= Surplus)', 'Packages'],
      [(k[0], k[1], k[2], q, rec_pkgs[k]) for k, q in sorted(rec_only.items()) if k not in used_rec],
      [22, 12, 34, 18, 50])

out = 'scratch/support_bulk_bom_receiving_mismatch_review.xlsx'
wb.save(out)
print('saved', out)
print('BOM keys', len(bom), 'REC keys', len(rec), '| exact match', len(set(bom) & set(rec)))
print('bom_only', len(bom_only), 'rec_only', len(rec_only), '| groups', len(matched),
      '| bom paired', len(paired_bom), 'rec paired', len(used_rec))
print('unmatched bom qty sum', sum(q for k, q in bom_only.items() if k not in paired_bom),
      'unmatched rec qty sum', sum(q for k, q in rec_only.items() if k not in used_rec))
for r in group_rows:
    print(f'G{r[0]:<2} {r[7][:4]:4} {r[1]:14} {r[2]:22} BOM {r[3]:7g} REC {r[4]:7g} diff {r[5]:+7g} {r[6]}')
