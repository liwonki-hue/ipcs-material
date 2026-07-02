# Valve Item 검색이 db.receiving 기반(BOM Qty 없이)으로 동작하는지,
# 그리고 tag_overrides 테이블이 아직 없어도 ISO 지정 시도 시 페이지가 죽지 않고
# 알림으로 실패 처리되는지 확인 (테이블은 사람이 SQL Editor에서 수동 생성 예정)
import asyncio
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:5200"

async def main():
    page_errors = []
    dialog_messages = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on("dialog", lambda d: (dialog_messages.append(d.message), asyncio.create_task(d.accept())))
        await page.goto(BASE, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)
        await page.click('[data-target="issue"]')
        await page.wait_for_timeout(500)
        await page.click('.mf-mode-btn[data-mode="item"]')
        await page.wait_for_timeout(500)

        # Search button should be enabled (no more "coming soon" stopgap)
        is_disabled = await page.locator('#btnFilterItem').is_disabled()
        assert not is_disabled, "btnFilterItem should be enabled now"

        await page.click('#btnFilterItem')
        await page.wait_for_timeout(2000)

        row_count = await page.locator('#mfItemTbody tr').count()
        assert row_count > 0, "Valve Item 검색 결과가 0개"
        header_text = await page.locator('#mfItemTable thead').inner_text()
        assert 'BOM QTY' not in header_text.upper(), "BOM Qty 컬럼이 제거되어야 함"
        assert 'LINE NO' in header_text.upper(), "Line No 컬럼이 추가되어야 함"
        print("row count:", row_count)
        print("header:", header_text.replace("\n", " | "))

        # 미매칭 Tag(= "ISO 지정" 버튼이 있는 행)가 있으면 지정 플로우 확인
        # tag_overrides 테이블이 아직 없으므로 저장은 실패해야 하지만, 페이지가 죽으면 안 됨
        assign_btn = page.locator('.mf-assign-iso').first
        if await assign_btn.count() > 0:
            await assign_btn.click()
            await page.wait_for_timeout(300)
            await page.fill('.mf-assign-iso-input', 'TEST-ISO-0001')
            await page.click('.mf-assign-iso-save')
            await page.wait_for_timeout(2000)
            print("dialog messages after save attempt:", dialog_messages)
            # table not existing yet -> saveTagOverride should alert with an error, not crash
            row_text = await page.locator('#mfItemTbody tr').first.inner_text()
            print("after assign attempt, first row still renders:", row_text.replace("\n", " | "))
        else:
            print("no unmatched tag rows found (all tags matched in BOM) - skipping ISO-assign flow")

        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
