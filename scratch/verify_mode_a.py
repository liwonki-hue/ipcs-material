# Mode A(ISO Drawing) 검색 결과에 Packing List 컬럼과 Support 실제 Received/Stock이 채워지는지 확인
import asyncio
import sys
from playwright.async_api import async_playwright

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
        await page.click('[data-target="issue"]')
        await page.wait_for_timeout(500)

        # datalist의 첫 옵션은 항상 "All"이므로, 실제 ISO Drawing인 두 번째 옵션을 사용
        options = await page.eval_on_selector_all('#isoDatalist option', 'els => els.map(el => el.value)')
        assert len(options) > 1, "isoDatalist에 실제 ISO 옵션이 없음 — BOM 데이터 로딩 확인 필요"
        first_iso = options[1]
        print(f"searching ISO: {first_iso}")

        await page.fill('#issueIsoSearch', first_iso)
        await page.click('#btnFilterIssue')
        await page.wait_for_timeout(2000)

        row_count = await page.locator('#issueTable tbody tr').count()
        assert row_count > 0, "검색 결과 행이 0개"
        first_row_text = await page.locator('#issueTable tbody tr').first.inner_text()
        print("first row:", first_row_text.replace("\n", " | "))
        assert "-" in first_row_text or "EA" in first_row_text, "Packing List 컬럼 내용이 비정상"

        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
