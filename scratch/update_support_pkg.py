# support_receiving 테이블에 pkg/package_no 데이터를 엑셀에서 읽어 업데이트하는 스크립트
import openpyxl
from supabase import create_client

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
EXCEL_PATH = 'Raw File/TURKISTAN BOP SUPPLY LIST_251120 - 제출.xlsx'

def extract_mapping(excel_path):
    wb = openpyxl.load_workbook(excel_path, read_only=True)
    mapping = {}  # (support_tag, part_no) -> (pkg, package_no)

    for shname in ['CRITICAL', 'GENERAL']:
        ws = wb[shname]
        rows = list(ws.iter_rows(values_only=True))
        for r in rows[1:]:
            tag_raw = r[7] if len(r) > 7 else None
            part_raw = r[8] if len(r) > 8 else None
            if not tag_raw or part_raw is None:
                continue
            try:
                part = int(part_raw)
            except (ValueError, TypeError):
                continue

            tag = str(tag_raw).strip()

            if shname == 'GENERAL':
                pkg = r[20] if len(r) > 20 else None
                pkg_no = r[21] if len(r) > 21 else None
            else:
                pkg = None
                pkg_no = r[20] if len(r) > 20 else None

            if not pkg_no or not str(pkg_no).strip().startswith('PGU'):
                continue

            mapping[(tag, part)] = (
                str(pkg).strip() if pkg else None,
                str(pkg_no).strip()
            )

    return mapping

def main():
    print("엑셀에서 PKG 매핑 추출 중...")
    mapping = extract_mapping(EXCEL_PATH)
    print(f"  추출된 매핑: {len(mapping)}개")

    print("\nSupabase support_receiving 전체 조회 중...")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    all_rows = []
    page_size = 1000
    offset = 0
    while True:
        res = sb.table('support_receiving') \
            .select('id,support_tag,part_no,pkg,package_no') \
            .range(offset, offset + page_size - 1) \
            .execute()
        batch = res.data or []
        all_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    print(f"  DB 총 행 수: {len(all_rows)}")

    # 매핑과 매칭하여 업데이트 목록 생성
    to_update = []
    matched = 0
    already_set = 0

    for row in all_rows:
        tag = row['support_tag'] or ''
        part = row['part_no']
        key = (tag, part)
        if key not in mapping:
            continue
        pkg, pkg_no = mapping[key]
        if row.get('pkg') == pkg and row.get('package_no') == pkg_no:
            already_set += 1
            continue
        to_update.append({
            'id': row['id'],
            'pkg': pkg,
            'package_no': pkg_no
        })
        matched += 1

    print(f"\n  매칭 성공: {matched}행 업데이트 예정")
    print(f"  이미 설정됨: {already_set}행 (스킵)")
    print(f"  매칭 안됨: {len(all_rows) - matched - already_set}행")

    if not to_update:
        print("\n업데이트할 항목 없음.")
        return

    # 100개씩 배치 업데이트
    batch_size = 100
    total = len(to_update)
    updated = 0
    for i in range(0, total, batch_size):
        batch = to_update[i:i + batch_size]
        for item in batch:
            sb.table('support_receiving') \
                .update({'pkg': item['pkg'], 'package_no': item['package_no']}) \
                .eq('id', item['id']) \
                .execute()
        updated += len(batch)
        print(f"  업데이트 진행: {updated}/{total}", end='\r')

    print(f"\n완료: {updated}행 업데이트 완료.")

if __name__ == '__main__':
    main()
