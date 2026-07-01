# Stock/Shortage/Surplus가 Material Status 탭의 3개 서브탭으로 통합됐는지 확인
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

        for old in ["stock_ledger", "material_shortage", "surplus_material"]:
            assert await page.locator(f'[data-target="{old}"]').count() == 0, f"사이드바에 {old} 항목이 아직 남아있음"

        await page.click('[data-target="material_status"]')
        await page.wait_for_timeout(1500)
        assert await page.locator('#msPanelStock').is_visible(), "기본 STOCK 서브탭이 보여야 함"
        stock_rows = await page.locator('#stockTable tbody tr').count()
        assert stock_rows > 0, "Stock 테이블이 비어있음"

        await page.click('.ms-tab-btn[data-tab="shortage"]')
        await page.wait_for_timeout(1500)
        assert await page.locator('#msPanelShortage').is_visible(), "SHORTAGE 서브탭이 보여야 함"
        assert not await page.locator('#msPanelStock').is_visible(), "STOCK 패널은 숨겨져야 함"

        await page.click('.ms-tab-btn[data-tab="surplus"]')
        await page.wait_for_timeout(1500)
        assert await page.locator('#msPanelSurplus').is_visible(), "SURPLUS 서브탭이 보여야 함"

        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
