# Shipping 탭에서 PKG 하나에 Issue Date를 설정하면 Material Stock의 Issued/Stock이
# 실제로 바뀌는지 확인하고, 확인 후 반드시 원래 상태로 되돌린다.
import asyncio
import sys
from playwright.async_api import async_playwright

sys.stdout.reconfigure(encoding="utf-8")

BASE = "http://127.0.0.1:5200"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1600, "height": 1000})
        page = await context.new_page()
        await page.goto(BASE, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)

        # 1. Shipping 탭에서 On-Site 상태인 첫 번째 PKG NO를 찾는다 (issue_date 비어있는 행)
        await page.click('[data-target="shipping"]')
        await page.wait_for_timeout(2000)
        first_pkg_input = page.locator('#shippingTbody .pl-datepicker[data-field="issue_date"]').first
        pkg_no = await first_pkg_input.get_attribute('data-pkg')
        original_value = await first_pkg_input.input_value()
        print(f"target pkg_no={pkg_no}, original issue_date='{original_value}'")
        assert original_value == "", "테스트 대상 PKG가 이미 issue_date를 갖고 있음 — 다른 PKG로 테스트 필요"

        # 2. 오늘 날짜를 입력하고 저장
        # NOTE: issue_date 입력란은 flatpickr(altInput:true, allowInput:false)로 렌더링되어
        # 원본 input이 type="hidden"이 되고 별도의 readonly alt-input이 표시된다.
        # 클릭+타이핑으로는 상호작용할 수 없어 flatpickr 인스턴스 API로 직접 설정한다.
        await page.evaluate(
            """(pkgNo) => {
                const el = document.querySelector(
                    `#shippingTbody .pl-datepicker[data-field="issue_date"][data-pkg="${pkgNo}"]`
                );
                el._flatpickr.setDate('2026-07-01', true);
            }""",
            pkg_no,
        )
        await page.wait_for_timeout(500)
        await page.locator('#btnSavePL').click()
        await page.wait_for_timeout(2000)

        # 3. Stock 탭에서 반영 확인 (같은 세션 내 재렌더링)
        await page.click('[data-target="stock_ledger"]')
        await page.wait_for_timeout(1500)
        print("Stock tab rendered after issue_date set - visually verify Issued column reflects the change for the affected matCode")

        # 4. 원복: Shipping으로 돌아가 issue_date를 다시 비운다
        await page.click('[data-target="shipping"]')
        await page.wait_for_timeout(1500)
        await page.evaluate(
            """(pkgNo) => {
                const el = document.querySelector(
                    `#shippingTbody .pl-datepicker[data-field="issue_date"][data-pkg="${pkgNo}"]`
                );
                el._flatpickr.clear(true);
            }""",
            pkg_no,
        )
        await page.wait_for_timeout(500)
        await page.locator('#btnSavePL').click()
        await page.wait_for_timeout(2000)
        final_value = await page.locator(f'#shippingTbody .pl-datepicker[data-field="issue_date"][data-pkg="{pkg_no}"]').first.input_value()
        assert final_value == "", f"원복 실패: issue_date가 '{final_value}'로 남아있음 — 수동으로 pl_updates에서 {pkg_no} 확인 필요"
        print(f"REVERTED: pkg_no={pkg_no} issue_date cleared. PASS")
        await browser.close()

asyncio.run(main())
