# Mode B(Support Tag No) 검색 기능 검증 — Playwright
# Note: support_bom 테이블이 현재 0행이므로, 타이핑 메커니즘과 에러 없이 동작하는지만 검증
import asyncio
import sys
from playwright.async_api import async_playwright

# Windows unicode fix
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

BASE = "http://127.0.0.1:5200"

async def main():
    page_errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        await page.goto(BASE, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)

        # Material Finding 탭으로 이동
        await page.click('[data-target="issue"]')
        await page.wait_for_timeout(500)

        # Mode B (Support Tag No) 선택
        await page.click('.mf-mode-btn[data-mode="support"]')
        await page.wait_for_timeout(1500)  # datalist 로딩 대기

        # 1. 빈 입력 시 "Enter a Support Tag No." 메시지 확인
        await page.click('#btnFilterSupportTag')
        await page.wait_for_timeout(500)

        empty_msg = await page.locator('#mfSupportTagTbody tr').first.inner_text()
        assert "Enter a Support Tag No." in empty_msg, f"Expected empty message, got: {empty_msg}"
        print("✓ Empty input shows correct message")

        # 2. 임의의 태그로 검색 (support_bom이 비어있으므로 "No support materials..." 예상)
        test_tag = "TEST-TAG-001"
        await page.fill('#mfSupportTagSearch', test_tag)
        await page.click('#btnFilterSupportTag')
        await page.wait_for_timeout(2000)

        # tbody가 로딩 상태("Loading...")에서 벗어났는지 확인
        tbody_text = await page.locator('#mfSupportTagTbody').inner_text()
        assert "Loading..." not in tbody_text, f"Still loading: {tbody_text}"
        print(f"✓ Search completed (not stuck on Loading...)")

        # 3. 결과가 표시됨 (empty state 또는 real rows)
        row_count = await page.locator('#mfSupportTagTbody tr').count()
        print(f"✓ Search returned {row_count} row(s)")

        # 4. Page error 없음 확인
        assert not page_errors, f"Page errors: {page_errors}"
        print("✓ No page errors")

        print("\nPASS - Mode B(Support Tag No 검색) 기능 정상 동작 (support_bom 0행 환경)")
        await browser.close()

asyncio.run(main())
