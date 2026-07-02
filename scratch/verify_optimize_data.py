# 최적화 3단계: 각 탭이 실제 데이터를 렌더링하는지(빈 테이블/무한 로딩 아닌지) 확인
import sys
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

CHECKS = [
    ('dashboard', '.kpi-card, .dashboard-card'),
    ('piping_bom', '#bomTbody tr'),
    ('rec_bulk_piping', '#plTbody tr, #plTableBody tr'),
    ('rec_tag_valve', '#valTbody tr, #valTableBody tr'),
    ('material_status', '#stockTbody tr, #msPanelStock table tbody tr'),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.goto('http://127.0.0.1:5200/', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(1500)

    for target, sel in CHECKS:
        page.click(f'.nav-item[data-target="{target}"]')
        page.wait_for_timeout(1500)
        count = page.locator(sel).count()
        print(f'{target}: {sel} -> {count}개 행/카드')

    browser.close()
