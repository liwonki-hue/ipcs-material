# support_receiving 테이블 pkg/package_no 비동기 병렬 업데이트
import asyncio, aiohttp, openpyxl, urllib.request, json

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
EXCEL_PATH   = 'Raw File/TURKISTAN BOP SUPPLY LIST_251120 - 제출.xlsx'
CONCURRENCY  = 50

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
}

def extract_mapping():
    wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True)
    mapping = {}
    for shname in ['CRITICAL', 'GENERAL']:
        ws = wb[shname]
        for r in list(ws.iter_rows(values_only=True))[1:]:
            tag_raw = r[7] if len(r) > 7 else None
            part_raw = r[8] if len(r) > 8 else None
            if not tag_raw or part_raw is None:
                continue
            try:
                part = int(part_raw)
            except (ValueError, TypeError):
                continue
            tag = str(tag_raw).strip()
            pkg    = r[20] if shname == 'GENERAL' and len(r) > 20 else None
            pkg_no = (r[21] if shname == 'GENERAL' else r[20]) if len(r) > 20 else None
            if not pkg_no or not str(pkg_no).strip().startswith('PGU'):
                continue
            mapping[(tag, part)] = (
                str(pkg).strip() if pkg else None,
                str(pkg_no).strip()
            )
    return mapping

def fetch_db_rows():
    all_rows = []
    page_size = 1000
    offset = 0
    while True:
        url = (f"{SUPABASE_URL}/rest/v1/support_receiving"
               f"?select=id,support_tag,part_no,pkg,package_no"
               f"&limit={page_size}&offset={offset}")
        req = urllib.request.Request(url, headers={
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}'
        })
        data = json.loads(urllib.request.urlopen(req).read())
        all_rows.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    return all_rows

async def patch_row(session, sem, row_id, pkg, pkg_no):
    url = f"{SUPABASE_URL}/rest/v1/support_receiving?id=eq.{row_id}"
    async with sem:
        async with session.patch(url, json={'pkg': pkg, 'package_no': pkg_no}, headers=HEADERS) as resp:
            return resp.status

async def main():
    print("1. 엑셀 매핑 추출 중...")
    mapping = extract_mapping()
    print(f"   매핑 {len(mapping)}개")

    print("2. DB 조회 중...")
    db_rows = fetch_db_rows()
    print(f"   DB 행 {len(db_rows)}개")

    to_update = []
    for r in db_rows:
        key = (r['support_tag'] or '', r['part_no'])
        if key not in mapping:
            continue
        pkg, pkg_no = mapping[key]
        if r.get('pkg') == pkg and r.get('package_no') == pkg_no:
            continue
        to_update.append((r['id'], pkg, pkg_no))

    print(f"   업데이트 대상: {len(to_update)}행")
    if not to_update:
        print("업데이트할 항목 없음.")
        return

    print(f"3. 병렬 업데이트 중 (동시 {CONCURRENCY}개)...")
    sem = asyncio.Semaphore(CONCURRENCY)
    async with aiohttp.ClientSession() as session:
        tasks = [patch_row(session, sem, rid, pkg, pkg_no) for rid, pkg, pkg_no in to_update]
        results = []
        batch = 200
        for i in range(0, len(tasks), batch):
            chunk = await asyncio.gather(*tasks[i:i+batch])
            results.extend(chunk)
            done = min(i + batch, len(tasks))
            print(f"   {done}/{len(tasks)} 완료", end='\r')

    ok = sum(1 for s in results if s in (200, 204))
    fail = len(results) - ok
    print(f"\n완료: 성공 {ok}행, 실패 {fail}행")

if __name__ == '__main__':
    asyncio.run(main())
