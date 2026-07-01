# Material Finding 탭 셸(모드 전환)과 기존 ISO 검색이 살아있는지 확인
import asyncio
from playwright.async_api import async_playwright

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

        assert await page.locator('#mfModeIso').is_visible(), "ISO 모드 패널이 기본 표시되어야 함"
        assert not await page.locator('#mfModeSupport').is_visible(), "Support 모드는 기본 숨김이어야 함"

        await page.click('.mf-mode-btn[data-mode="support"]')
        await page.wait_for_timeout(300)
        assert await page.locator('#mfModeSupport').is_visible(), "Support 모드 클릭 후 표시되어야 함"
        assert not await page.locator('#mfModeIso').is_visible(), "ISO 모드는 숨겨져야 함"

        await page.click('.mf-mode-btn[data-mode="item"]')
        await page.wait_for_timeout(300)
        assert await page.locator('#mfModeItem').is_visible(), "Item 모드 클릭 후 표시되어야 함"

        await page.click('.mf-mode-btn[data-mode="iso"]')
        await page.wait_for_timeout(300)

        # 기존 ISO 검색 버튼이 여전히 동작하는지 (Step5에서 Packing List 컬럼 추가 전이므로 결과 내용은 검증하지 않음)
        await page.fill('#issueIsoSearch', '')
        await page.click('#btnFilterIssue')
        await page.wait_for_timeout(1000)

        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
