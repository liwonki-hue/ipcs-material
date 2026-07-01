# Dashboard KPI, Shortage, Surplus가 이번 변경과 무관하게 정상 렌더링되는지 확인
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

        await page.click('[data-target="dashboard"]')
        await page.wait_for_timeout(1500)
        kpi_text = await page.locator('.kpi-grid').first.inner_text()
        assert kpi_text.strip(), "Dashboard KPI 카드가 비어있음"

        await page.click('[data-target="material_shortage"]')
        await page.wait_for_timeout(1500)
        short_rows = await page.locator('#shortageTable tbody tr').count()
        print("shortage rows:", short_rows)

        await page.click('[data-target="surplus_material"]')
        await page.wait_for_timeout(1500)
        surplus_rows = await page.locator('#surplusTable tbody tr').count()
        print("surplus rows:", surplus_rows)

        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
