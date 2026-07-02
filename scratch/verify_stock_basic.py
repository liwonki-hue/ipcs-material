# Material Stock 탭이 새 Issued 계산 후에도 정상 렌더링되는지 확인
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
        await page.click('[data-target="material_status"]')
        await page.wait_for_timeout(2000)
        rows = await page.locator('#stockTable tbody tr').count()
        print(f"stock rows rendered: {rows}")
        assert rows > 0, "Stock table rendered 0 rows"
        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
