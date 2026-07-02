# 최적화 프로세스 4단계: 전체 탭 콘솔 에러 없이 로딩되는지 Playwright로 점검
import sys
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

TARGETS = [
    'dashboard', 'issue', 'piping_bom',
    'rec_bulk_piping', 'rec_bulk_fitting', 'rec_bulk_others',
    'rec_tag_support', 'rec_tag_spool', 'rec_tag_valve', 'rec_tag_speciality',
    'material_status', 'shipping',
]

errors_by_target = {}

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    console_errors = []
    page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)
    page.on('pageerror', lambda exc: console_errors.append(f'PAGEERROR: {exc}'))

    page.goto('http://127.0.0.1:5200/', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(1500)
    console_errors.clear()

    for target in TARGETS:
        console_errors.clear()
        page.click(f'.nav-item[data-target="{target}"]')
        page.wait_for_timeout(1200)
        errors_by_target[target] = list(console_errors)

    browser.close()

print('=== 탭별 콘솔 에러 ===')
any_err = False
for t, errs in errors_by_target.items():
    if errs:
        any_err = True
        print(f'[{t}] {len(errs)}건:')
        for e in errs[:5]:
            print('   ', e[:200])
    else:
        print(f'[{t}] OK (에러 없음)')

print()
print('전체 결과:', 'FAIL - 에러 발견' if any_err else 'PASS - 전체 탭 에러 없음')
