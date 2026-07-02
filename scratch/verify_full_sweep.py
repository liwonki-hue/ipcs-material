# 죽은 코드 제거 후 전체 탭을 순회하며 콘솔 에러/예외가 없는지 확인
import asyncio
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:5200"
TARGETS = [
    "dashboard", "issue", "piping_bom",
    "rec_bulk_piping", "rec_bulk_fitting", "rec_bulk_others",
    "rec_tag_support", "rec_tag_spool", "rec_tag_valve", "rec_tag_speciality",
    "material_status", "shipping",
]

async def main():
    console_errors = []
    page_errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        await page.goto(BASE, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)
        for target in TARGETS:
            await page.click(f'[data-target="{target}"]')
            await page.wait_for_timeout(800)
        await browser.close()
    print("console errors:", console_errors)
    print("page errors:", page_errors)
    assert not console_errors and not page_errors, "에러 발생 — 위 목록 확인"
    print("PASS")

asyncio.run(main())
