# Material Finding이 Dashboard 바로 아래로 이동했는지 확인
import asyncio
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:5200"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(BASE, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)

        nav_targets = await page.locator('.nav-item').evaluate_all(
            "els => els.map(e => e.getAttribute('data-target'))"
        )
        assert nav_targets[0] == 'dashboard', f"첫 항목은 dashboard여야 함: {nav_targets[0]}"
        assert nav_targets[1] == 'issue', f"두 번째 항목은 issue(Material Finding)여야 함: {nav_targets[1]}"
        print("PASS")
        await browser.close()

asyncio.run(main())
