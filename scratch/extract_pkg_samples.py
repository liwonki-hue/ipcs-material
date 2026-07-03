# PKG별 대표 샘플(Tag 있는 본체 + 부속품 소그룹) 추출 - 원본 Valve (Receiving).xlsx 기준
import openpyxl, sys, json
from collections import defaultdict
sys.stdout.reconfigure(encoding='utf-8')

wb = openpyxl.load_workbook('Raw File/Valve (Receiving).xlsx', data_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
header = rows[0]
idx = {h: i for i, h in enumerate(header) if h}
data_rows = [r for r in rows[1:] if r[idx['PKG']]]

by_pkgno = defaultdict(list)
for r in data_rows:
    by_pkgno[r[idx['PKG NO']]].append(r)

by_pkg = defaultdict(list)
for pkgno, rs in by_pkgno.items():
    pkg = rs[0][idx['PKG']]
    by_pkg[pkg].append((pkgno, rs))

for pkg in sorted(by_pkg):
    groups = by_pkg[pkg]
    # TAG NO 있는 본체가 포함되고 그룹 크기가 2~8인 것 우선 선택
    candidates = [g for g in groups if 2 <= len(g[1]) <= 8 and any(r[idx['TAG NO']] for r in g[1])]
    if not candidates:
        candidates = [g for g in groups if any(r[idx['TAG NO']] for r in g[1])]
    pkgno, rs = candidates[0] if candidates else groups[0]
    print(f'=== PKG={pkg}  PKG NO={pkgno}  ({len(rs)}행) ===')
    for r in rs:
        print('  ', dict(zip(header, r)))
    print()
