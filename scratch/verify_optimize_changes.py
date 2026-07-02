# 최적화 중 직접 수정한 항목 검증: Export 버튼 통합(Pipe/Fitting/Others), MatCode Master 검색 onclick
import sys
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errs = []
    page.on('console', lambda msg: errs.append(msg.text) if msg.type == 'error' else None)
    page.on('pageerror', lambda exc: errs.append(f'PAGEERROR: {exc}'))
    page.on('download', lambda d: print('  다운로드 감지:', d.suggested_filename))

    page.goto('http://127.0.0.1:5200/', wait_until='networkidle', timeout=30000)
    page.wait_for_timeout(1000)

    # 1) Piping / Fitting / Others Export 버튼 (통합된 _exportBulkReceiving)
    for target, btn_id in [('rec_bulk_piping', 'btnExportPl'), ('rec_bulk_fitting', 'btnExportFit'), ('rec_bulk_others', 'btnExportOth')]:
        page.click(f'.nav-item[data-target="{target}"]')
        page.wait_for_timeout(800)
        errs.clear()
        with page.expect_download(timeout=10000) as dl_info:
            page.click(f'#{btn_id}')
        dl = dl_info.value
        print(f'{btn_id}: 다운로드 파일명 = {dl.suggested_filename}, 콘솔에러 = {len(errs)}건')
        if errs:
            print('  ', errs[:3])

    # 2) MatCode Master 검색 (Material Finding > Item 모드 등 검색창에서 matCode 검색 시 onclick 렌더)
    page.click('.nav-item[data-target="piping_bom"]')
    page.wait_for_timeout(800)
    # BOM 탭의 4번째 서브탭(MatCode Master)으로 전환 시도
    matcode_tab = page.locator('[data-bom-tab="matcode"], .bom-tab-btn:has-text("MatCode")')
    if matcode_tab.count() > 0:
        matcode_tab.first.click()
        page.wait_for_timeout(500)
    print('MatCode Master 서브탭 존재 여부:', matcode_tab.count() > 0)

    browser.close()

print('done. total console errors during interactions:', len(errs))
