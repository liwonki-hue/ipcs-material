# Support 사이드바 항목이 TAG Item 섹션 아래로 이동했고, 클릭 시 여전히 정상 동작하는지 확인
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

        # Support 항목이 Spool 항목보다 sidebar 상에서 앞(위)에 오는지 확인 (TAG Item 그룹 진입)
        nav_targets = await page.locator('.nav-item').evaluate_all(
            "els => els.map(e => e.getAttribute('data-target'))"
        )
        idx_support = nav_targets.index('rec_tag_support')
        idx_spool = nav_targets.index('rec_tag_spool')
        idx_others = nav_targets.index('rec_bulk_others')
        assert idx_others < idx_support < idx_spool, f"순서가 예상과 다름: {nav_targets}"

        await page.click('[data-target="rec_tag_support"]')
        await page.wait_for_timeout(1500)
        rows = await page.locator('#srecTable tbody tr').count()
        assert rows > 0, "Support Receiving 테이블이 비어있음 — 클릭 후에도 정상 동작해야 함"

        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
