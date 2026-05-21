# BOM 교체 실행 스크립트
# 실행 전 SQL Editor에서 반드시 먼저 실행:
#   TRUNCATE TABLE material.bom;
import json, sys, io, time, requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SUPABASE_URL = 'https://ognhvfvlboqblueuldlm.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbmh2ZnZsYm9xYmx1ZXVsZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MzY2NTUsImV4cCI6MjA4ODMxMjY1NX0.paO5jr16M7yTySUAp9LgberoatDds9rTNa_eCU_ET_I'
H_MAT = {
    'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json', 'Accept-Profile': 'material',
    'Content-Profile': 'material', 'Prefer': 'resolution=ignore-duplicates,return=minimal',
}
H_BOM = {**H_MAT, 'Prefer': 'return=minimal'}

BATCH = 500


def get_bom_count():
    r = requests.get(f'{SUPABASE_URL}/rest/v1/bom?select=uom',
                     headers={**H_BOM, 'Prefer': 'count=exact', 'Range': '0-0'})
    cr = r.headers.get('Content-Range', '')
    if '/' in cr:
        return int(cr.split('/')[-1])
    return -1


def main():
    # replace_bom.py 임포트해서 records 생성
    import importlib.util
    spec = importlib.util.spec_from_file_location('replace_bom', 'scratch/replace_bom.py')
    assert spec is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    print('=== BOM 교체 실행 ===\n')
    new_mats, records = mod.main()

    # Step1: 신규 matcode 등록
    if new_mats:
        rows = list(new_mats.values())
        print(f'\n[Step1] 신규 matcode {len(rows)}건 등록 중...')
        r = requests.post(f'{SUPABASE_URL}/rest/v1/matcode_master',
                          headers=H_MAT, data=json.dumps(rows))
        if r.status_code in (200, 201, 204):
            print(f'  → 완료')
        else:
            print(f'  → 오류 {r.status_code}: {r.text[:200]}')
            sys.exit(1)
    else:
        print('\n[Step1] 신규 matcode 없음')

    # Step2: TRUNCATE 확인
    current_count = get_bom_count()
    print(f'\n[Step2] 현재 bom 테이블: {current_count}건')
    print('  Supabase SQL Editor에서 아래 명령을 실행하고 Enter를 눌러주세요.')
    print('  ┌─────────────────────────────────────────┐')
    print('  │  TRUNCATE TABLE material.bom;           │')
    print('  └─────────────────────────────────────────┘')
    input('  실행 완료 후 Enter ▶ ')

    after_count = get_bom_count()
    if after_count != 0:
        print(f'  경고: bom 테이블에 {after_count}건이 남아있습니다. TRUNCATE 확인 후 재시도.')
        sys.exit(1)
    print('  → TRUNCATE 확인 완료 (0건)')

    # Step3: 신규 BOM INSERT
    total = len(records)
    print(f'\n[Step3] 신규 BOM {total}건 삽입 중 (배치 {BATCH}건)...')
    ok = 0
    failed = 0
    for start in range(0, total, BATCH):
        chunk = records[start:start + BATCH]
        r = requests.post(f'{SUPABASE_URL}/rest/v1/bom',
                          headers=H_BOM, data=json.dumps(chunk))
        if r.status_code in (200, 201, 204):
            ok += len(chunk)
            if (start // BATCH) % 10 == 0:
                print(f'  {ok:>6}/{total}건 완료...')
        else:
            print(f'  오류 (row {start+1}): {r.status_code} {r.text[:200]}')
            failed += len(chunk)
        time.sleep(0.05)

    print(f'\n=== 완료: 성공 {ok}건 / 실패 {failed}건 (총 {total}건) ===')

    # Step4: 최종 확인
    final_count = get_bom_count()
    print(f'DB bom 행 수: {final_count}건')
    if final_count == total:
        print('  → 정상 완료.')
    else:
        print(f'  → 불일치! 예상 {total}건 vs 실제 {final_count}건')


if __name__ == '__main__':
    main()
