# BOM 탭 안에 MatCode Master가 4번째 서브탭으로 통합됐는지 확인
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

        assert await page.locator('[data-target="matcode_master"]').count() == 0, "사이드바에 MatCode Master 항목이 아직 남아있음"

        await page.click('[data-target="piping_bom"]')
        await page.wait_for_timeout(1000)
        assert await page.locator('#bomMainPanel').is_visible(), "BOM 기본 패널이 보여야 함"
        assert not await page.locator('#bomMatCodeMasterPanel').is_visible(), "MatCode Master 패널은 기본 숨김"

        await page.click('.bom-tab-btn[data-tab="matcode"]')
        await page.wait_for_timeout(1000)
        assert await page.locator('#bomMatCodeMasterPanel').is_visible(), "MatCode Master 서브탭 클릭 후 보여야 함"
        assert not await page.locator('#bomMainPanel').is_visible(), "BOM 기본 패널은 숨겨져야 함"
        rows = await page.locator('#matCodeTable tbody tr').count()
        assert rows > 0, "MatCode Master 테이블이 비어있음"

        await page.click('.bom-tab-btn[data-tab="piping"]')
        await page.wait_for_timeout(1000)
        assert await page.locator('#bomMainPanel').is_visible(), "PIPING 서브탭 복귀 후 BOM 패널이 다시 보여야 함"

        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
