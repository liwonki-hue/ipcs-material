# Material Finding 탭 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Material Finding 탭을 Material Issue Slip 기반 불출 처리 도구에서 ISO Drawing/Support Tag No/Item 3가지 키로 자재를 조회하는 순수 Lookup 도구로 재설계하고, Stock 계산을 Shipping 탭의 PKG Issue Date 기준으로 통일한다.

**Architecture:** Flask + Supabase(REST) + Vanilla JS SPA. 모든 로직은 `static/js/app.js` 한 파일에 있고 화면은 `templates/index.html`의 `<section>` 단위로 구성된다. 빌드 스텝이 없으므로 브라우저 새로고침만으로 변경이 반영된다. 자동화 테스트 프레임워크가 없어 이 프로젝트의 기존 관행대로 Playwright로 실제 브라우저를 띄워 검증한다.

**Tech Stack:** Flask, Supabase(anon key, REST), Vanilla JS, SheetJS(XLSX), Playwright(Python, 검증용).

## Global Constraints

- 대상 Supabase 프로젝트는 **운영 중인 실 데이터**다. 검증 스크립트가 `pl_updates`, `issued` 등 실 데이터를 변경하면 반드시 원래 값으로 되돌린다.
- `issued` Supabase 테이블은 삭제하지 않는다. 더 이상 읽지도 쓰지도 않을 뿐이다.
- Dashboard KPI, ISO Readiness 도넛차트, Material Shortage/Surplus는 이번 변경과 무관해야 한다(회귀 없어야 함) — 이들은 BOM vs Received만 사용하고 Issued를 쓰지 않는다.
- 파일 최상단에 새 파일을 만들 경우가 아니면 기존 코드 스타일(들여쓰기 4칸, 세미콜론 사용, 함수 선언 방식)을 따른다.
- 매 태스크 종료 시 `node --check static/js/app.js`로 문법 검증 후 커밋한다.

---

### Task 1: Issued/Stock 공용 헬퍼 함수 추가

**Files:**
- Modify: `static/js/app.js` (기존 `isReceivingActive` 함수 바로 뒤에 추가)

**Interfaces:**
- Produces: `isPkgIssued(pkgNo: string): boolean`, `getIssuedQtyMap(filterFn: (r: ReceivingRow) => boolean): {[matCode: string]: number}`, `buildPkgBreakdown(filterFn): {[matCode: string]: {[pkgNo: string]: number}}`, `renderPkgListCell(pkgMap: {[pkgNo: string]: number}): string` (이후 모든 태스크가 이 4개 함수를 사용한다)
- Consumes: 기존 전역 `_plUpdatesCache`(pkg_no → {status, issue_date, ...}), `db.receiving`(matCode, plNo, qty 필드 보유)

`isReceivingActive`는 아래 위치에 있다.

```javascript
function isReceivingActive(plNo) {
    const status = (_plUpdatesCache[plNo] || {}).status || '';
    return status !== 'Preparing' && status !== 'Shipping';
}
```

- [ ] **Step 1: 헬퍼 함수 4개를 `isReceivingActive` 바로 뒤에 추가**

`static/js/app.js`에서 위 `isReceivingActive` 함수 블록을 찾아 바로 뒤에 다음을 삽입한다.

```javascript
// PKG의 Issue Date가 설정되어 있으면 "불출 완료"로 판정
function isPkgIssued(plNo) {
    return !!(_plUpdatesCache[plNo] || {}).issue_date;
}

// matCode 단위 Issued 수량 맵 — PKG Issue Date 기준 (구 db.issued 테이블 대체)
function getIssuedQtyMap(filterFn) {
    const map = {};
    db.receiving.forEach(r => {
        if (!r.matCode) return;
        if (!filterFn(r)) return;
        if (!isPkgIssued(r.plNo)) return;
        map[r.matCode] = (map[r.matCode] || 0) + (r.qty || 0);
    });
    return map;
}

// matCode → { pkgNo: qty } — Packing List 컬럼 렌더링용 원자료
function buildPkgBreakdown(filterFn) {
    const map = {};
    db.receiving.filter(filterFn).forEach(r => {
        if (!r.matCode || r.plNo === '-') return;
        if (!map[r.matCode]) map[r.matCode] = {};
        map[r.matCode][r.plNo] = (map[r.matCode][r.plNo] || 0) + (r.qty || 0);
    });
    return map;
}

// { pkgNo: qty } → "Packing List (PKG No)" 컬럼 HTML (불출 여부 표시 포함)
function renderPkgListCell(pkgMap) {
    if (!pkgMap || Object.keys(pkgMap).length === 0) return '-';
    return Object.entries(pkgMap).sort((a, b) => a[0].localeCompare(b[0])).map(([pkgNo, qty]) => {
        const done = isPkgIssued(pkgNo);
        const qtyStr = qty % 1 === 0 ? qty : qty.toFixed(2);
        const label = done ? `불출 ${(_plUpdatesCache[pkgNo] || {}).issue_date || ''}` : '미불출';
        return `<div>${pkgNo} (${qtyStr} EA) — <span style="color:${done ? '#2e7d32' : '#999'};">${label}</span></div>`;
    }).join('');
}
```

- [ ] **Step 2: 문법 검증**

Run: `node --check static/js/app.js`
Expected: 출력 없음(에러 없으면 조용히 종료, exit code 0)

- [ ] **Step 3: 브라우저 콘솔에서 동작 확인**

앱을 실행한다 (`python app.py`, 기본 포트 5200). 브라우저에서 `http://127.0.0.1:5200` 접속 후 개발자 콘솔에서 아래를 실행해 함수가 정의되어 있고 정상 동작하는지 확인한다.

```javascript
typeof isPkgIssued === 'function' && typeof getIssuedQtyMap === 'function' && typeof buildPkgBreakdown === 'function' && typeof renderPkgListCell === 'function'
// true 반환되어야 함
isPkgIssued('__NONEXISTENT_PKG__')
// false 반환되어야 함 (pl_updates에 없는 PKG는 미불출)
```

Expected: 두 표현식 모두 콘솔에 `true`, `false` 출력.

- [ ] **Step 4: 커밋**

```bash
git add static/js/app.js
git commit -m "feat: PKG Issue Date 기반 Issued/Stock 공용 헬퍼 함수 추가"
```

---

### Task 2: Material Stock 탭을 새 Issued 계산으로 전환

**Files:**
- Modify: `static/js/app.js` (`renderStockTable` 함수, `btnExportStock` 핸들러)

**Interfaces:**
- Consumes: Task 1의 `getIssuedQtyMap`
- Produces: 변경 없음 (기존 `renderStockTable(forcedCats, hideMatCode)` 시그니처 그대로 유지)

`renderStockTable` 안의 기존 Issued 집계 블록(다음 코드, 현재 약 1094~1104행)을 교체한다.

```javascript
    // Aggregate Issued per MatCode — db.issued 실제 출고 기록 기준 (matCode 단위)
    const issMap = {};
    db.issued.forEach(i => {
        if (!i.matCode) return;
        const mData = masterMap[i.matCode] || {};
        const cat = mData.category && mData.category !== '-'
            ? mData.category
            : window.getCategory(mData.itemDesc, i.matCode);
        if (Array.isArray(forcedCats) && !forcedCats.includes(cat)) return;
        issMap[i.matCode] = (issMap[i.matCode] || 0) + i.qty;
    });
```

- [ ] **Step 1: `renderStockTable`의 Issued 집계 로직 교체**

위 블록을 다음으로 교체한다.

```javascript
    // Aggregate Issued per MatCode — PKG Issue Date 기준 (pl_updates.issue_date 존재 여부)
    const issMap = getIssuedQtyMap(r => {
        const mData = masterMap[r.matCode] || {};
        const cat = mData.category && mData.category !== '-'
            ? mData.category
            : window.getCategory(mData.itemDesc, r.matCode);
        return !Array.isArray(forcedCats) || forcedCats.includes(cat);
    });
```

- [ ] **Step 2: `btnExportStock` 핸들러의 Issued 집계 로직 교체**

같은 파일에서 `btnExportStock` 클릭 핸들러 안의 다음 블록을 찾는다.

```javascript
            const issMap = {};
            db.issued.forEach(i => {
                if (!i.matCode) return;
                issMap[i.matCode] = (issMap[i.matCode] || 0) + i.qty;
            });
```

다음으로 교체한다.

```javascript
            const issMap = getIssuedQtyMap(() => true);
```

- [ ] **Step 3: 문법 검증**

Run: `node --check static/js/app.js`
Expected: 에러 없음

- [ ] **Step 4: Playwright로 Stock 탭 기본 동작 확인 (회귀 체크)**

`scratch/verify_stock_basic.py` 파일을 새로 만든다.

```python
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
        await page.click('[data-target="stock_ledger"]')
        await page.wait_for_timeout(2000)
        rows = await page.locator('#stockTable tbody tr').count()
        print(f"stock rows rendered: {rows}")
        assert rows > 0, "Stock table rendered 0 rows"
        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
```

Run: `python scratch/verify_stock_basic.py`
Expected: `stock rows rendered: <N>` (N > 0) 다음 줄에 `PASS` 출력. `AssertionError` 없어야 함.

- [ ] **Step 5: 실제 PKG에 Issue Date를 걸었을 때 Stock이 줄어드는지 확인 (반드시 원복)**

`scratch/verify_issue_date_stock.py` 파일을 새로 만든다. 이 스크립트는 **운영 데이터를 건드리므로 실행 후 반드시 원래 값으로 되돌린다** (스크립트 안에 원복 로직 포함).

```python
# Shipping 탭에서 PKG 하나에 Issue Date를 설정하면 Material Stock의 Issued/Stock이
# 실제로 바뀌는지 확인하고, 확인 후 반드시 원래 상태로 되돌린다.
import asyncio
from playwright.async_api import async_playwright

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
        await first_pkg_input.click()
        await page.keyboard.type("2026-07-01")
        await page.keyboard.press("Escape")
        await page.locator('#btnSavePL').click()
        await page.wait_for_timeout(2000)

        # 3. Stock 탭에서 반영 확인 (같은 세션 내 재렌더링)
        await page.click('[data-target="stock_ledger"]')
        await page.wait_for_timeout(1500)
        print("Stock tab rendered after issue_date set — visually verify Issued column reflects the change for the affected matCode")

        # 4. 원복: Shipping으로 돌아가 issue_date를 다시 비운다
        await page.click('[data-target="shipping"]')
        await page.wait_for_timeout(1500)
        revert_input = page.locator(f'#shippingTbody .pl-datepicker[data-field="issue_date"][data-pkg="{pkg_no}"]').first
        await revert_input.click()
        await page.keyboard.press("Control+A")
        await page.keyboard.press("Delete")
        await page.keyboard.press("Escape")
        await page.locator('#btnSavePL').click()
        await page.wait_for_timeout(2000)
        final_value = await page.locator(f'#shippingTbody .pl-datepicker[data-field="issue_date"][data-pkg="{pkg_no}"]').first.input_value()
        assert final_value == "", f"원복 실패: issue_date가 '{final_value}'로 남아있음 — 수동으로 pl_updates에서 {pkg_no} 확인 필요"
        print(f"REVERTED: pkg_no={pkg_no} issue_date cleared. PASS")
        await browser.close()

asyncio.run(main())
```

Run: `python scratch/verify_issue_date_stock.py`
Expected: `target pkg_no=... original issue_date=''` → `REVERTED: ... PASS`. `AssertionError`가 나오면 즉시 중단하고 Supabase `pl_updates` 테이블에서 해당 `pkg_no`의 `issue_date`를 수동으로 NULL 처리한다.

- [ ] **Step 6: 커밋**

```bash
git add static/js/app.js scratch/verify_stock_basic.py scratch/verify_issue_date_stock.py
git commit -m "fix: Material Stock의 Issued 계산을 PKG Issue Date 기준으로 전환"
```

---

### Task 3: 죽은 코드 제거 (MR History/ISO Progress, Receiving Detail 팝업)

**Files:**
- Modify: `static/js/app.js` (두 블록 삭제)
- Modify: `templates/index.html` (Receiving Detail Modal 삭제)

**Interfaces:**
- Consumes: 없음 (다른 코드가 참조하지 않는 죽은 코드 확인 완료 — `grep -rn "mrHistTbody\|isoMrProgressTbody\|showReceivingDetail" templates/index.html`가 빈 결과여야 함)
- Produces: 없음 (순수 삭제)

- [ ] **Step 1: 사전 확인 — 정말 죽은 코드인지 재확인**

Run: `grep -rn "mrHistTbody\|isoMrProgressTbody\|mrHistIsoSearch\|showReceivingDetail" templates/index.html`
Expected: 출력 없음 (아무 것도 매치되지 않아야 삭제 진행)

- [ ] **Step 2: `app.js`에서 "MR History & ISO Progress" 블록 삭제**

다음 주석으로 시작해서

```javascript
// ==========================================
// MR History & ISO Progress
// ==========================================

let _mrHistPage = 1;
let _mrProgPage = 1;
let _mrHistCache = null; // { mrList, isoRows }
```

`window.loadSupplementMR = function(iso, baseMrNo) { ... };` 함수 전체(마지막 줄 `};`까지)로 끝나는 구간을 통째로 삭제한다. **주의**: 바로 다음에 오는 `window.showIsoDetail = function(isoDwgNo) {...}` 함수는 Dashboard의 ISO 목록에서 실제로 호출되는 살아있는 코드이므로 **삭제하지 않는다** (Task 5에서 내용만 수정한다).

- [ ] **Step 3: `app.js`에서 "Receiving Detail Popup" 블록 삭제**

`window.showIsoDetail` 함수 바로 뒤, 다음 주석으로 시작하는 블록을 찾는다.

```javascript
// ── Receiving Detail Popup ────────────────────────────────────────
window.showReceivingDetail = function(matCode) {
```

이 함수 전체(`modal.style.display = 'flex';\n};`로 끝나는 지점까지)를 삭제한다. 바로 뒤에 오는 `// ── Shipping / Custom Clearance ──` 주석과 `let _shippingData = null;` 등은 살아있는 코드이므로 그대로 둔다.

- [ ] **Step 4: `templates/index.html`에서 Receiving Detail Modal 삭제**

다음 블록을 찾아 통째로 삭제한다.

```html
    <!-- Receiving Detail Modal -->
    <div id="receivingDetailModal" class="modal-overlay" style="display:none;">
        <div class="modal-content" style="width:720px; max-height:88vh; display:flex; flex-direction:column;">
            <div class="modal-header">
                <h2><i class="fas fa-box-open"></i> Material Receiving Detail</h2>
                <button onclick="document.getElementById('receivingDetailModal').style.display='none'" style="background:none;border:none;font-size:18px;cursor:pointer;color:#666;"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body" style="overflow-y:auto; flex:1; padding:20px;">
                <!-- Summary cards -->
                <div id="rdSummary" style="display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap;"></div>
                <!-- Info -->
                <div id="rdInfo" style="background:#f8fafc; border-radius:8px; padding:14px 18px; margin-bottom:18px; font-size:13px;"></div>
                <!-- Receiving records table -->
                <div style="font-weight:700; font-size:13px; color:#0A2540; margin-bottom:8px;"><i class="fas fa-truck"></i> Receiving Records by PKG NO</div>
                <table class="data-table" style="font-size:12px;">
                    <thead>
                        <tr>
                            <th>PKG</th>
                            <th>PKG NO</th>
                            <th>Qty</th>
                            <th>Unit</th>
                        </tr>
                    </thead>
                    <tbody id="rdRecordsTbody"></tbody>
                </table>
            </div>
            <div class="modal-footer">
                <button class="btn btn-outline" onclick="document.getElementById('receivingDetailModal').style.display='none'">Close</button>
            </div>
        </div>
    </div>
```

- [ ] **Step 5: 문법 검증**

Run: `node --check static/js/app.js`
Expected: 에러 없음

- [ ] **Step 6: Playwright로 전체 탭 콘솔 에러 없는지 스윕**

`scratch/verify_full_sweep.py`를 만든다 (이 세션에서 이미 검증한 버튼 스윕 방식과 동일).

```python
# 죽은 코드 제거 후 전체 탭을 순회하며 콘솔 에러/예외가 없는지 확인
import asyncio
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:5200"
TARGETS = [
    "dashboard", "matcode_master", "piping_bom",
    "rec_bulk_piping", "rec_bulk_fitting", "rec_bulk_others",
    "rec_tag_support", "rec_tag_spool", "rec_tag_valve", "rec_tag_speciality",
    "issue", "stock_ledger", "material_shortage", "surplus_material", "shipping",
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
```

Run: `python scratch/verify_full_sweep.py`
Expected: `console errors: []`, `page errors: []`, `PASS`

- [ ] **Step 7: 커밋**

```bash
git add static/js/app.js templates/index.html scratch/verify_full_sweep.py
git commit -m "chore: 죽은 코드 제거 (MR History/ISO Progress 리포트, Receiving Detail 팝업)"
```

---

### Task 4: Material Finding 탭 HTML을 3-모드 셸로 교체 + Issue Slip 흐름 제거

**Files:**
- Modify: `templates/index.html` (Material Finding `<section id="issue">` 전체 교체, Print Modal 삭제)
- Modify: `static/js/app.js` (Add-to-MR/Generate-Issue-Slip/Print-Modal 핸들러 삭제, `db.mrTable`/`sessionMrNo`/`renderMrTable` 삭제)
- Modify: `static/css/style.css` (Print Modal 전용 print CSS 삭제)

**Interfaces:**
- Consumes: 없음
- Produces: `#mfModeIso`, `#mfModeSupport`, `#mfModeItem` 패널 컨테이너(Task 5~7에서 채움), `.mf-mode-btn` 모드 전환 버튼, 기존 `#issueTable`/`#btnFilterIssue`/`#issueIsoSearch`/`#issueSystemFilter`/`#issueCategoryFilter`/`#issueItemFilter`/`#issueSizeFilter`/`#suppMatTbody` id는 그대로 유지(Mode A 내부로 이동)

- [ ] **Step 1: `templates/index.html`에서 `<section id="issue">` 전체를 교체**

현재 `<section id="issue" class="view-section">`부터 그 짝 `</section>`까지 통째로 찾아(Step 3 Pending MR Table 및 `btnGenerateIssueSlip`까지 포함) 아래 내용으로 교체한다.

```html
                        <section id="issue" class="view-section">
                <div class="page-header">
                     <div>
                         <h1>Material Finding</h1>
                         <p class="subtitle">ISO Drawing / Support Tag No / Item(Valve·Speciality)으로 자재를 조회합니다.</p>
                     </div>
                 </div>

                 <!-- Mode Switcher -->
                 <div style="display:flex;gap:0;border-bottom:2px solid #c8cfe0;margin-bottom:16px;">
                     <button class="mf-mode-btn active" data-mode="iso" style="padding:8px 24px;border:none;border-bottom:3px solid #0A2540;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#0A2540;margin-bottom:-2px;letter-spacing:0.5px;">ISO DRAWING</button>
                     <button class="mf-mode-btn" data-mode="support" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">SUPPORT TAG NO</button>
                     <button class="mf-mode-btn" data-mode="item" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">ITEM (VALVE·SPECIALITY)</button>
                 </div>

                 <!-- Mode A: ISO Drawing -->
                 <div id="mfModeIso" class="mf-mode-panel">
                     <div class="panel filter-panel" style="margin-bottom: 20px;">
                         <div style="display: flex; align-items: flex-end; gap: 15px; width: 100%;">
                             <div class="form-group" style="flex: 2;">
                                 <label>ISO Drawing (Search & Select)</label>
                                 <input type="text" id="issueIsoSearch" class="form-control" style="width: 100%;" placeholder="Type to search ISO Drawing..." list="isoDatalist">
                                 <datalist id="isoDatalist"></datalist>
                             </div>
                             <div class="form-group" style="flex: 1;">
                                 <label>System</label>
                                 <select id="issueSystemFilter" class="form-control" style="width: 100%;"><option>All</option></select>
                             </div>
                             <div class="form-group" style="flex: 1;">
                                 <label>Category</label>
                                 <select id="issueCategoryFilter" class="form-control" style="width: 100%;">
                                     <option value="All">All Categories</option>
                                     <option value="Pipe">Pipe</option>
                                     <option value="Fitting">Fitting</option>
                                     <option value="Valve">Valve</option>
                                     <option value="Speciality">Speciality</option>
                                     <option value="Others">Others</option>
                                 </select>
                             </div>
                             <div class="form-group" style="flex: 1;">
                                 <label>Item</label>
                                 <select id="issueItemFilter" class="form-control" style="width: 100%;"><option value="All">All Items</option></select>
                             </div>
                             <div class="form-group" style="flex: 1;">
                                 <label>Size</label>
                                 <select id="issueSizeFilter" class="form-control" style="width: 100%;"><option value="All">All Sizes</option></select>
                             </div>
                             <div class="form-group" style="flex: 0 0 160px;">
                                 <button class="btn btn-primary" id="btnFilterIssue" style="height: 38px; width: 160px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0;"><i class="fas fa-search"></i> Search</button>
                             </div>
                         </div>
                     </div>

                     <div class="panel data-panel" style="margin-bottom: 20px; border: 1px solid #ddd;">
                         <div class="panel-header" style="background:#f8f9fa; padding:6px 15px; margin-bottom:0; min-height:44px; border-bottom:1px solid #ddd;">
                             <h3 style="margin:0; font-size:14px; font-weight:600; color:#222;"><i class="fas fa-layer-group"></i> Piping Material List</h3>
                         </div>
                         <div class="table-responsive">
                             <table class="data-table" id="issueTable" style="text-align:center;table-layout:fixed;width:100%;">
                                 <colgroup>
                                     <col style="width:300px;"><col style="width:110px;"><col style="width:260px;">
                                     <col style="width:auto;"><col style="width:70px;"><col style="width:100px;">
                                     <col style="width:100px;"><col style="width:100px;"><col style="width:220px;">
                                 </colgroup>
                                 <thead>
                                     <tr>
                                         <th style="text-align:center;">ISO Drawing</th>
                                         <th style="text-align:center;">Category</th>
                                         <th style="text-align:center;">Mat Code</th>
                                         <th style="text-align:center;">Description</th>
                                         <th style="text-align:center;">Unit</th>
                                         <th style="text-align:center;">BOM Qty</th>
                                         <th style="text-align:center;">Received Qty</th>
                                         <th style="text-align:center;">Stock Qty</th>
                                         <th style="text-align:center;">Packing List (PKG No)</th>
                                     </tr>
                                 </thead>
                                 <tbody>
                                     <tr><td colspan="9" style="text-align:center;">Enter an ISO Drawing and click Search.</td></tr>
                                 </tbody>
                             </table>
                         </div>
                     </div>

                     <div class="panel data-panel" style="border: 1px solid #ddd;">
                         <div class="panel-header" style="background:#f8f9fa; padding:6px 15px; margin-bottom:0; min-height:44px; border-bottom:1px solid #ddd;">
                             <h3 style="margin:0; font-size:14px; font-weight:600; color:#222;"><i class="fas fa-tools"></i> Support Tag List</h3>
                         </div>
                         <div class="table-responsive">
                             <table class="data-table" id="suppMatTable" style="text-align:center;table-layout:fixed;width:100%;">
                                 <colgroup>
                                     <col style="width:260px;"><col style="width:200px;"><col style="width:150px;">
                                     <col style="width:110px;"><col style="width:auto;"><col style="width:70px;">
                                     <col style="width:100px;"><col style="width:100px;"><col style="width:100px;"><col style="width:220px;">
                                 </colgroup>
                                 <thead>
                                     <tr>
                                         <th style="text-align:center;">ISO Drawing</th>
                                         <th style="text-align:center;">Support Tag</th>
                                         <th style="text-align:center;">Item</th>
                                         <th style="text-align:center;">Matl</th>
                                         <th style="text-align:center;">Size or Type</th>
                                         <th style="text-align:center;">Unit</th>
                                         <th style="text-align:center;">BOM Qty</th>
                                         <th style="text-align:center;">Received Qty</th>
                                         <th style="text-align:center;">Stock Qty</th>
                                         <th style="text-align:center;">Packing List (PKG No)</th>
                                     </tr>
                                 </thead>
                                 <tbody id="suppMatTbody">
                                     <tr><td colspan="10" style="text-align:center;color:#888;">Select an ISO Drawing and click Search.</td></tr>
                                 </tbody>
                             </table>
                         </div>
                     </div>
                 </div>

                 <!-- Mode B: Support Tag No -->
                 <div id="mfModeSupport" class="mf-mode-panel" style="display:none;">
                     <div class="panel filter-panel" style="margin-bottom: 20px;">
                         <div style="display: flex; align-items: flex-end; gap: 15px; width: 100%;">
                             <div class="form-group" style="flex: 2;">
                                 <label>Support Tag No (Search & Select)</label>
                                 <input type="text" id="mfSupportTagSearch" class="form-control" style="width: 100%;" placeholder="Type to search Support Tag No..." list="mfSupportTagDatalist">
                                 <datalist id="mfSupportTagDatalist"></datalist>
                             </div>
                             <div class="form-group" style="flex: 0 0 160px;">
                                 <button class="btn btn-primary" id="btnFilterSupportTag" style="height: 38px; width: 160px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0;"><i class="fas fa-search"></i> Search</button>
                             </div>
                         </div>
                     </div>
                     <div class="panel data-panel" style="border: 1px solid #ddd;">
                         <div class="panel-header" style="background:#f8f9fa; padding:6px 15px; margin-bottom:0; min-height:44px; border-bottom:1px solid #ddd;">
                             <h3 style="margin:0; font-size:14px; font-weight:600; color:#222;"><i class="fas fa-tools"></i> Support Material List</h3>
                         </div>
                         <div class="table-responsive">
                             <table class="data-table" id="mfSupportTagTable" style="text-align:center;table-layout:fixed;width:100%;">
                                 <colgroup>
                                     <col style="width:260px;"><col style="width:200px;"><col style="width:150px;">
                                     <col style="width:110px;"><col style="width:auto;"><col style="width:70px;">
                                     <col style="width:100px;"><col style="width:100px;"><col style="width:100px;"><col style="width:220px;">
                                 </colgroup>
                                 <thead>
                                     <tr>
                                         <th style="text-align:center;">ISO Drawing</th>
                                         <th style="text-align:center;">Support Tag</th>
                                         <th style="text-align:center;">Item</th>
                                         <th style="text-align:center;">Matl</th>
                                         <th style="text-align:center;">Size or Type</th>
                                         <th style="text-align:center;">Unit</th>
                                         <th style="text-align:center;">BOM Qty</th>
                                         <th style="text-align:center;">Received Qty</th>
                                         <th style="text-align:center;">Stock Qty</th>
                                         <th style="text-align:center;">Packing List (PKG No)</th>
                                     </tr>
                                 </thead>
                                 <tbody id="mfSupportTagTbody">
                                     <tr><td colspan="10" style="text-align:center;color:#888;">Search a Support Tag No.</td></tr>
                                 </tbody>
                             </table>
                         </div>
                     </div>
                 </div>

                 <!-- Mode C: Item (Valve/Speciality) -->
                 <div id="mfModeItem" class="mf-mode-panel" style="display:none;">
                     <div class="panel filter-panel" style="margin-bottom: 20px;">
                         <div style="display: flex; align-items: flex-end; gap: 15px; width: 100%;">
                             <div class="form-group" style="flex: 1;">
                                 <label>Category</label>
                                 <select id="mfItemCategoryFilter" class="form-control" style="width: 100%;">
                                     <option value="Valve">Valve</option>
                                     <option value="Speciality">Speciality</option>
                                 </select>
                             </div>
                             <div class="form-group" style="flex: 2;">
                                 <label>Item</label>
                                 <select id="mfItemItemFilter" class="form-control" style="width: 100%;"><option value="All">All Items</option></select>
                             </div>
                             <div class="form-group" style="flex: 1;">
                                 <label>System</label>
                                 <select id="mfItemSystemFilter" class="form-control" style="width: 100%;"><option>All</option></select>
                             </div>
                             <div class="form-group" style="flex: 1;">
                                 <label>Size</label>
                                 <select id="mfItemSizeFilter" class="form-control" style="width: 100%;"><option value="All">All Sizes</option></select>
                             </div>
                             <div class="form-group" style="flex: 0 0 160px;">
                                 <button class="btn btn-primary" id="btnFilterItem" style="height: 38px; width: 160px; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0;"><i class="fas fa-search"></i> Search</button>
                             </div>
                         </div>
                     </div>
                     <div class="panel data-panel" style="border: 1px solid #ddd;">
                         <div class="panel-header" style="background:#f8f9fa; padding:6px 15px; margin-bottom:0; min-height:44px; border-bottom:1px solid #ddd;">
                             <h3 style="margin:0; font-size:14px; font-weight:600; color:#222;"><i class="fas fa-faucet"></i> Item Search Result</h3>
                         </div>
                         <div class="table-responsive">
                             <table class="data-table" id="mfItemTable" style="text-align:center;table-layout:fixed;width:100%;">
                                 <colgroup>
                                     <col style="width:200px;"><col style="width:260px;"><col style="width:110px;">
                                     <col style="width:auto;"><col style="width:70px;"><col style="width:100px;">
                                     <col style="width:100px;"><col style="width:100px;"><col style="width:220px;">
                                 </colgroup>
                                 <thead>
                                     <tr>
                                         <th style="text-align:center;">Tag No</th>
                                         <th style="text-align:center;">ISO Drawing</th>
                                         <th style="text-align:center;">Category</th>
                                         <th style="text-align:center;">Description</th>
                                         <th style="text-align:center;">Unit</th>
                                         <th style="text-align:center;">BOM Qty</th>
                                         <th style="text-align:center;">Received Qty</th>
                                         <th style="text-align:center;">Stock Qty</th>
                                         <th style="text-align:center;">Packing List (PKG No)</th>
                                     </tr>
                                 </thead>
                                 <tbody id="mfItemTbody">
                                     <tr><td colspan="9" style="text-align:center;color:#888;">Select Category/Item and click Search.</td></tr>
                                 </tbody>
                             </table>
                         </div>
                     </div>
                 </div>
            </section>
```

- [ ] **Step 2: `templates/index.html`에서 Print Modal(Material Issue Slip 인쇄용) 삭제**

다음 블록(`<div id="printModal" class="modal-overlay">`부터 그 짝 `</div>`까지, `<!-- Packing List Print Modal -->` 주석 바로 앞까지)을 통째로 삭제한다.

```html
    <div id="printModal" class="modal-overlay">
        <div class="modal-content" style="width:880px; max-height:92vh; display:flex; flex-direction:column; padding:0; overflow:hidden;">
            <!-- Modal header (screen only) -->
            <div class="modal-header" id="printModalHeader" style="flex-shrink:0;">
                <h2><i class="fas fa-file-alt"></i> Slip Preview &nbsp;<span style="font-size:12px;font-weight:400;color:#888;">A4 size</span></h2>
                <button class="btn btn-outline" id="btnClosePrintModal" style="border:none; font-size:18px;"><i class="fas fa-times"></i></button>
            </div>
            <!-- A4 scroll viewport (gray background) -->
            <div style="background:#5a5a5a; overflow-y:auto; flex:1; padding:24px; display:flex; justify-content:center;">
                <!-- A4 paper: 794px × min 1123px at 96dpi -->
                <div id="printArea" style="width:794px; min-height:1123px; background:#fff; padding:40px 50px; box-shadow:0 4px 20px rgba(0,0,0,0.4); box-sizing:border-box; font-family:'Segoe UI',Arial,sans-serif; color:#000; flex-shrink:0;">
                    <h2 style="text-align:center; font-size:22px; color:#000; font-weight:800; margin:0 0 5px; border-bottom:2px solid #000; padding-bottom:10px; letter-spacing:1px;">MATERIAL ISSUE SLIP</h2>
                    <div style="display:flex; justify-content:space-between; margin:15px 0 10px; font-size:13px; font-weight:600; color:#333;">
                        <div><strong>MR No:</strong> <span id="printMrNo"></span></div>
                        <div><strong>Date:</strong> <span id="printDate"></span></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:18px; font-size:13px; font-weight:600; color:#333; border-bottom:1px dashed #ccc; padding-bottom:12px;">
                        <div><strong>Issuer:</strong> _______________________</div>
                        <div><strong>Receiver (Sign):</strong> _______________________</div>
                    </div>
                    <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
                        <thead>
                            <tr style="background:#0A2540; color:#fff;">
                                <th style="border:1px solid #000; padding:8px 6px; font-size:11px; text-align:left;">ISO Drawing</th>
                                <th style="border:1px solid #000; padding:8px 6px; font-size:11px; text-align:left;">PKG NO</th>
                                <th style="border:1px solid #000; padding:8px 6px; font-size:11px; text-align:left;">Mat Code</th>
                                <th style="border:1px solid #000; padding:8px 6px; font-size:11px; text-align:left;">Description</th>
                                <th style="border:1px solid #000; padding:8px 6px; font-size:11px; text-align:center;">Size</th>
                                <th style="border:1px solid #000; padding:8px 6px; font-size:11px; text-align:center;">Unit</th>
                                <th style="border:1px solid #000; padding:8px 6px; font-size:11px; text-align:center;">Issued Qty</th>
                            </tr>
                        </thead>
                        <tbody id="printTbody" style="font-size:11px;">
                            <!-- Print content -->
                        </tbody>
                    </table>
                    <div style="margin-top:auto; padding-top:20px; border-top:1px solid #ccc; font-size:10px; color:#666; text-align:right;">
                        * All materials listed above have been verified and transferred to the designated area.
                    </div>
                </div>
            </div>
            <!-- Modal footer (screen only) -->
            <div class="modal-footer" id="printModalFooter" style="flex-shrink:0;">
                <button class="btn btn-outline" id="btnCancelPrint">Cancel</button>
                <button class="btn btn-primary highlight-btn" id="btnConfirmPrint"><i class="fas fa-print"></i> Confirm Print & Process Issue</button>
            </div>
        </div>
    </div>

```

(바로 뒤에 남는 `<!-- Packing List Print Modal -->`과 `#plModal` 블록은 Shipping 탭에서 쓰는 별개 기능이므로 **삭제하지 않는다**.)

- [ ] **Step 3: `static/js/app.js`에서 삭제할 JS 블록들을 지운다**

다음 4개 블록을 찾아 삭제한다 (모두 `attachEventListeners()` 함수 내부에 있다).

1) `btnAddToMr` 핸들러 전체:
```javascript
    // "Add To MR" logic
    const btnAddToMr = document.getElementById('btnAddToMr');
    if (btnAddToMr) {
        btnAddToMr.addEventListener('click', () => {
            const inputs = document.querySelectorAll('#issueTable input[type="number"]');
            let addedCount = 0;
            // Session MR number: generate only on the first Add To MR click
            if (!sessionMrNo) {
                sessionMrNo = "MR-" + new Date().getFullYear() + "-" + (Math.floor(Math.random() * 9000) + 1000);
            }
            let currentMr = sessionMrNo;

            inputs.forEach(inp => {
                let reqQty = parseFloat(inp.value) || 0;
                let maxLimit = parseFloat(inp.getAttribute('max')) || 0; 
                
                if (reqQty > maxLimit) {
                    alert(`Requested quantity cannot exceed receiving limit! Fixing MatCode: ${inp.getAttribute('data-matcode')}`);
                    reqQty = maxLimit;
                    inp.value = maxLimit;
                }

                if(reqQty > 0) {
                    let matCode = inp.getAttribute('data-matcode');
                    let iso = inp.getAttribute('data-iso');
                    let size = inp.getAttribute('data-size');
                    let unit = inp.getAttribute('data-unit');
                    let desc = inp.getAttribute('data-desc');
                    
                    db.mrTable.push({ 
                        mrNo: currentMr, 
                        iso: iso, 
                        matCode: matCode, 
                        desc: desc, 
                        size: size, 
                        unit: unit, 
                        reqQty: reqQty 
                    });
                    addedCount++;
                }
            });

            if(addedCount > 0) {
                alert(`Successfully saved ${addedCount} items to MR Table (MR Table No: ${currentMr}).`);
                renderMrTable(); // newly defined to update the MR section
            } else {
                alert("No valid quantities were selected to add to MR.");
            }
        });
    }
```

2) `btnSuppAddToMr` 핸들러 전체:
```javascript
    // Step 2: Support Material "Add To MR" 버튼
    const btnSuppAddToMr = document.getElementById('btnSuppAddToMr');
    if (btnSuppAddToMr) {
        btnSuppAddToMr.addEventListener('click', () => {
            const inputs = document.querySelectorAll('#suppMatTbody .supp-req-qty');
            let addedCount = 0;
            if (!sessionMrNo) {
                sessionMrNo = "MR-" + new Date().getFullYear() + "-" + (Math.floor(Math.random() * 9000) + 1000);
            }
            inputs.forEach(inp => {
                const reqQty = parseFloat(inp.value) || 0;
                if (reqQty <= 0) return;
                db.mrTable.push({
                    mrNo:    sessionMrNo,
                    iso:     inp.getAttribute('data-iso'),
                    matCode: '[SUP] ' + inp.getAttribute('data-tag'),
                    desc:    inp.getAttribute('data-item'),
                    size:    inp.getAttribute('data-size'),
                    unit:    'EA',
                    reqQty:  reqQty,
                    isSupport: true,
                });
                addedCount++;
            });
            if (addedCount > 0) {
                alert(`Successfully saved ${addedCount} support item(s) to MR Table (${sessionMrNo}).`);
                renderMrTable();
            } else {
                alert("No valid quantities selected.");
            }
        });
    }
```

3) `btnGenerateIssueSlip` 핸들러 + Modal 버튼(`btnClosePrintModal`/`btnCancelPrint`/`btnConfirmPrint`) 핸들러 전체 (아래 블록 통째로):
```javascript
    // "Generate Issue Slip" logic (Shows Print Preview Modal)
    const btnGenerateIssueSlip = document.getElementById('btnGenerateIssueSlip');
    if (btnGenerateIssueSlip) {
        btnGenerateIssueSlip.addEventListener('click', () => {
             if (db.mrTable.length === 0) {
                 alert("MR Table is empty! Please Search ISO BOM and [Add to MR] first.");
                 return;
             }
             
             // Populate Print Modal
             let firstMr = db.mrTable[0].mrNo;
             document.getElementById('printMrNo').innerText = firstMr;
             document.getElementById('printDate').innerText = new Date().toISOString().split('T')[0];
             
             const printTbody = document.getElementById('printTbody');
             const printRows = [];

             // Build matCode → [{plNo, qty}] sorted by PKG NO ascending (On-Site만)
             const pkgRecords = {};
             db.receiving.filter(r => isReceivingActive(r.plNo)).forEach(r => {
                 if (!r.matCode || r.plNo === '-') return;
                 if (!pkgRecords[r.matCode]) pkgRecords[r.matCode] = {};
                 pkgRecords[r.matCode][r.plNo] = (pkgRecords[r.matCode][r.plNo] || 0) + (r.qty || 0);
             });
             // Convert to arrays sorted by PKG NO ascending
             const pkgSorted = {};
             Object.keys(pkgRecords).forEach(mat => {
                 pkgSorted[mat] = Object.entries(pkgRecords[mat])
                     .sort((a, b) => a[0].localeCompare(b[0]))
                     .map(([plNo, qty]) => ({ plNo, qty }));
             });

             db.mrTable.forEach(mrItem => {
                 const records = pkgSorted[mrItem.matCode] || [];
                 let remaining = mrItem.reqQty;
                 const allocated = [];

                 for (const rec of records) {
                     if (remaining <= 0) break;
                     const take = Math.min(remaining, rec.qty);
                     // Show PKG NO only if single package covers the request; show qty if multiple needed
                     allocated.push({ plNo: rec.plNo, take });
                     remaining -= take;
                 }

                 let pkgDisplay;
                 if (allocated.length === 0) {
                     pkgDisplay = '-';
                 } else if (allocated.length === 1) {
                     pkgDisplay = allocated[0].plNo;
                 } else {
                     pkgDisplay = allocated.map(a => `${a.plNo}<br><span style="font-size:10px;color:#555;">(${a.take % 1 === 0 ? a.take : a.take.toFixed(2)})</span>`).join('<br>');
                 }

                 printRows.push(`<tr>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.iso}</td>
                     <td style="border:1px solid #000; padding:8px; font-weight:600; color:#0d47a1; line-height:1.6;">${pkgDisplay}</td>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.matCode}</td>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.desc}</td>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.size}</td>
                     <td style="border:1px solid #000; padding:8px;">${mrItem.unit}</td>
                     <td style="border:1px solid #000; padding:8px; font-weight:bold;">${mrItem.reqQty.toFixed(2)}</td>
                 </tr>`);
             });
             printTbody.innerHTML = printRows.join('');

             document.getElementById('printModal').style.display = 'flex';
        });
    }

    // Modal buttons
    const btnClosePrintModal = document.getElementById('btnClosePrintModal');
    const btnCancelPrint = document.getElementById('btnCancelPrint');
    const btnConfirmPrint = document.getElementById('btnConfirmPrint');

    if(btnClosePrintModal) btnClosePrintModal.addEventListener('click', () => { document.getElementById('printModal').style.display = 'none'; });
    if(btnCancelPrint) btnCancelPrint.addEventListener('click', () => { document.getElementById('printModal').style.display = 'none'; });
    
    if(btnConfirmPrint) {
        btnConfirmPrint.addEventListener('click', () => {
             // 1. Invoke browser print
             window.print();

             // 2. Confirm Issue: translate MR contents into Issued tracker and persist to Supabase
             const issuedToInsert = db.mrTable.map(mrItem => ({
                 iso: mrItem.iso,
                 mat_code: mrItem.matCode,
                 qty: mrItem.reqQty,
                 mr_no: mrItem.mrNo,
                 issue_date: new Date().toISOString()
             }));

             if (supabaseClient) {
                supabaseClient.from('issued').insert(issuedToInsert).then(({ error }) => {
                    if (error) console.error("❌ Supabase Persist Error:", error);
                    else {
                        issuedToInsert.forEach(item => {
                            db.issued.push({
                                matCode: item.mat_code,
                                qty: item.qty,
                                iso: item.iso
                            });
                        });
                        updateDashboard();
                    }
                });
             } else {
                 // Fallback to local only if no client
                 db.mrTable.forEach(mrItem => {
                     db.issued.push({
                         id: Date.now() + Math.random(),
                         iso: mrItem.iso,
                         matCode: mrItem.matCode,
                         qty: mrItem.reqQty,
                         date: new Date().toISOString()
                     });
                 });
             }

             // 3. Cleanup & Success feedback
             alert("Material Issue Slip Printed and Stock updated successfully!");
             document.getElementById('printModal').style.display = 'none';
             db.mrTable = [];
             sessionMrNo = null; // Reset session MR number after slip is issued
             renderMrTable();
             
             const filterBtn = document.getElementById('btnFilterIssue');
             if(filterBtn) filterBtn.click();
             updateDashboard();
        });
    }
```

- [ ] **Step 4: `renderMrTable()` 함수 전체 삭제**

`static/js/app.js`에서 `function renderMrTable() {`로 시작해 그 함수의 마지막 `}`까지(약 70줄) 통째로 삭제한다.

- [ ] **Step 5: `db.mrTable`, `sessionMrNo` 선언 정리**

파일 최상단의 다음 부분

```javascript
let db = {
    matCodeMaster: [],
    bom: [],           // bom_agg: aggregated by matCode+category+system
    bomIsoList: [],    // bom_iso_list: distinct system+iso_dwg_no pairs for dropdowns
    bomDesc: {},       // bom_desc view: matCode → full_description (BOM 설계 원문)
    bomTagMap: {},     // bom_detail: tag → {matCode, fullDescription, lineNo} (NULL matCode 입고 레코드 매칭용)
    specialityItems: [], // Speciality category distinct items (mat_code NULL → desc 기반)
    receiving: [],
    mrTable: [],
    issued: []
};

// Session MR number - reused until MR Table is cleared after slip generation
let sessionMrNo = null;
```

를 다음으로 교체한다.

```javascript
let db = {
    matCodeMaster: [],
    bom: [],           // bom_agg: aggregated by matCode+category+system
    bomIsoList: [],    // bom_iso_list: distinct system+iso_dwg_no pairs for dropdowns
    bomDesc: {},       // bom_desc view: matCode → full_description (BOM 설계 원문)
    bomTagMap: {},     // bom_detail: tag → {matCode, fullDescription, lineNo} (NULL matCode 입고 레코드 매칭용)
    specialityItems: [], // Speciality category distinct items (mat_code NULL → desc 기반)
    receiving: [],
    issued: []
};
```

(`sessionMrNo` 변수 선언 라인은 삭제한다. `db.mrTable` 필드도 제거한다. `db.issued`는 `issued` Supabase 테이블 자체는 유지하기로 했으므로 필드는 남겨두되 이제 아무도 채우지 않는다 — 읽는 코드도 이번 Task 이후로는 없다.)

- [ ] **Step 6: `static/css/style.css`에서 Material Issue Slip 전용 print CSS 삭제**

다음 블록(주석 `/* Hide everything except the slip */`부터 `#printArea thead tr {...}` 줄까지)을 찾아 삭제한다. **`/* Packing List Print */` 이후 블록(`#plPrintArea`, `#plModal`)은 Shipping 탭에서 쓰는 별개 기능이므로 그대로 둔다.**

```css
    /* Hide everything except the slip */
    body * { visibility: hidden; }
    #printArea, #printArea * { visibility: visible; }

    /* Reset modal positioning — show printArea as the full page */
    #printModal {
        position: fixed !important;
        inset: 0 !important;
        background: none !important;
        display: block !important;
    }
    #printArea {
        position: fixed !important;
        top: 0 !important; left: 0 !important;
        width: 100% !important;
        min-height: auto !important;
        padding: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
    }

    /* Table print styles — Material Issue Slip */
    #printArea table { border-collapse: collapse; width: 100%; }
    #printArea th, #printArea td { border: 1px solid #000 !important; padding: 6px 5px !important; font-size: 10pt; }
    #printArea thead tr { background: #0A2540 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
```

삭제 후 `@media print { @page { size: A4 portrait; margin: 10mm; } ... /* Packing List Print */ ... }` 형태로 남아야 한다(빈 줄 하나 정도는 남아도 무방).

- [ ] **Step 7: 모드 전환 JS 추가**

`static/js/app.js`의 `attachEventListeners()` 함수 안, 삭제한 `btnAddToMr` 자리 근처에 아래를 추가한다.

```javascript
    // Material Finding 모드 전환 (ISO Drawing / Support Tag No / Item)
    document.querySelectorAll('.mf-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mf-mode-btn').forEach(b => {
                b.classList.remove('active');
                b.style.borderBottomColor = 'transparent';
                b.style.color = '#888';
            });
            btn.classList.add('active');
            btn.style.borderBottomColor = '#0A2540';
            btn.style.color = '#0A2540';
            const mode = btn.dataset.mode;
            document.getElementById('mfModeIso').style.display     = mode === 'iso'     ? '' : 'none';
            document.getElementById('mfModeSupport').style.display = mode === 'support' ? '' : 'none';
            document.getElementById('mfModeItem').style.display    = mode === 'item'    ? '' : 'none';
            if (mode === 'support') loadSupportTagDatalist();
        });
    });
```

`loadSupportTagDatalist`는 Task 6에서 정의한다. 이 시점에는 아직 정의되어 있지 않으므로, 임시로 함수 위에 다음 스텁을 추가해 이 태스크를 독립적으로 테스트 가능하게 만든다 (Task 6에서 실제 구현으로 교체).

```javascript
async function loadSupportTagDatalist() { /* Task 6에서 구현 */ }
```

- [ ] **Step 8: 문법 검증**

Run: `node --check static/js/app.js`
Expected: 에러 없음

- [ ] **Step 9: Playwright로 모드 전환 및 기존 ISO 검색 동작 확인**

`scratch/verify_mf_shell.py`를 만든다.

```python
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
```

Run: `python scratch/verify_mf_shell.py`
Expected: `PASS` 출력, `AssertionError` 없음

- [ ] **Step 10: 커밋**

```bash
git add templates/index.html static/js/app.js static/css/style.css scratch/verify_mf_shell.py
git commit -m "refactor: Material Finding을 3-모드 검색 셸로 교체, Material Issue Slip 흐름 제거"
```

---

### Task 5: Mode A(ISO Drawing) 완성 — Packing List 컬럼 + Support Received/Stock 실제 계산

**Files:**
- Modify: `static/js/app.js` (`btnFilterIssue` 핸들러, `window.showIsoDetail`)

**Interfaces:**
- Consumes: Task 1의 `buildPkgBreakdown`, `getIssuedQtyMap`, `renderPkgListCell`, `isPkgIssued`
- Produces: `fetchAndRenderSupportRows({filterField, filterValue, tbodyEl, emptyMsg}): Promise<void>` (Task 6에서 재사용)

`btnFilterIssue`의 현재 클릭 핸들러(Task 4 완료 시점 기준, `static/js/app.js`)는 다음과 같다.

```javascript
        btnFilterIssue.addEventListener('click', async () => {
            let sys = document.getElementById('issueSystemFilter')?.value || 'All';
            let iso = (document.getElementById('issueIsoSearch')?.value || '').trim();
            let categoryFilter = document.getElementById('issueCategoryFilter')?.value || 'All';
            let itemFilter = document.getElementById('issueItemFilter')?.value || 'All';
            let sizeFilter = document.getElementById('issueSizeFilter')?.value || 'All';

            let tbody = document.querySelector('#issueTable tbody');
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:16px;color:#888;">Loading...</td></tr>';

            let query = supabaseClient.from('bom')
                .select('mat_code, iso_dwg_no, full_description, uom, qty, system')
                .order('iso_dwg_no');

            if (sys !== 'All') query = query.eq('system', sys);
            if (iso && iso !== 'All') {
                query = query.eq('iso_dwg_no', iso);
            } else {
                query = query.limit(200);
            }

            const { data: bomRows, error } = await query;
            if (error) {
                tbody.innerHTML = `<tr><td colspan="9" style="color:red;text-align:center;">Error: ${error.message}</td></tr>`;
                return;
            }

            if (!bomRows || bomRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No BOM materials found for the selected ISO Drawing.</td></tr>';
                return;
            }

            // Pre-build receiving/issued maps for quick lookup (On-Site 도착 패키지만)
            const recMap = {};
            db.receiving.filter(r => isReceivingActive(r.plNo)).forEach(r => { if(r.matCode) recMap[r.matCode] = (recMap[r.matCode] || 0) + r.qty; });
            const issMap = {};
            db.issued.forEach(i => { if(i.matCode) issMap[i.matCode] = (issMap[i.matCode] || 0) + i.qty; });

            // (이하 카테고리 정렬/필터/렌더링 로직, Request Qty 입력 컬럼으로 끝남 — 삭제 대상)
        });
    }
```

(전체 원본은 Task 4 적용 직후 `static/js/app.js`에서 `btnFilterIssue.addEventListener`로 검색하면 확인할 수 있다. 아래 Step 1에서 이 핸들러 전체를 교체한다.)

- [ ] **Step 1: `btnFilterIssue` 핸들러를 아래 내용으로 통째로 교체**

```javascript
        btnFilterIssue.addEventListener('click', async () => {
            let sys = document.getElementById('issueSystemFilter')?.value || 'All';
            let iso = (document.getElementById('issueIsoSearch')?.value || '').trim();
            let categoryFilter = document.getElementById('issueCategoryFilter')?.value || 'All';
            let itemFilter = document.getElementById('issueItemFilter')?.value || 'All';
            let sizeFilter = document.getElementById('issueSizeFilter')?.value || 'All';

            let tbody = document.querySelector('#issueTable tbody');
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:16px;color:#888;">Loading...</td></tr>';

            let query = supabaseClient.from('bom')
                .select('mat_code, iso_dwg_no, full_description, uom, qty, system')
                .order('iso_dwg_no');

            if (sys !== 'All') query = query.eq('system', sys);
            if (iso && iso !== 'All') {
                query = query.eq('iso_dwg_no', iso);
            } else {
                query = query.limit(200);
            }

            const { data: bomRows, error } = await query;
            if (error) {
                tbody.innerHTML = `<tr><td colspan="9" style="color:red;text-align:center;">Error: ${error.message}</td></tr>`;
                return;
            }

            if (!bomRows || bomRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No BOM materials found for the selected ISO Drawing.</td></tr>';
                return;
            }

            // PKG 단위 원자료(matCode → {pkgNo: qty}) — Received/Stock/Packing List 컬럼 공통 소스
            const pkgBreakdown = buildPkgBreakdown(r => isReceivingActive(r.plNo));
            const issMap = getIssuedQtyMap(r => isReceivingActive(r.plNo));

            const catColors = {
                'Pipe': '#1565c0', 'Fitting': '#2e7d32', 'Valve': '#e65100',
                'Speciality': '#6a1b9a', 'Others': '#546e7a'
            };

            const CAT_ORDER = { 'Pipe': 1, 'Fitting': 2, 'Valve': 3, 'Speciality': 4, 'Others': 5 };
            bomRows.sort((a, b) => {
                const ca = CAT_ORDER[window.getCategory(a.full_description, a.mat_code)] || 9;
                const cb = CAT_ORDER[window.getCategory(b.full_description, b.mat_code)] || 9;
                return ca - cb;
            });

            let htmlString = '';
            bomRows.forEach(b => {
                let mat = (b.mat_code || '').trim().toUpperCase();
                if (!mat || mat === 'NONE') return;

                let category = window.getCategory(b.full_description, mat);

                if (categoryFilter !== 'All' && category !== categoryFilter) return;

                if (itemFilter !== 'All') {
                    const itemFromMat = window.extractItemFromMatCode(mat);
                    const item = (itemFromMat && itemFromMat !== '-') ? itemFromMat : window.extractItemFromDesc(b.full_description || '');
                    if (item !== itemFilter) return;
                }

                if (sizeFilter !== 'All') {
                    const size = window.extractSizeFromMatCode(mat);
                    if (size !== sizeFilter) return;
                }

                const pkgMap = pkgBreakdown[mat] || {};
                let totalRec = Object.values(pkgMap).reduce((a, b2) => a + b2, 0);
                let totalIss = issMap[mat] || 0;
                let stockQty = Math.max(0, totalRec - totalIss);
                let qty = parseFloat(b.qty) || 0;
                let safeDesc = (b.full_description || '-').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                let catColor = catColors[category] || '#546e7a';
                let stockStyle = stockQty >= qty ? 'background:#f1f8e9;' : (stockQty > 0 ? 'background:#fff8e1;' : '');

                htmlString += `<tr style="${stockStyle}">
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.iso_dwg_no||''}">${b.iso_dwg_no || '-'}</td>
                    <td style="text-align:center;"><span style="font-size:11px;font-weight:600;color:${catColor};background:${catColor}18;padding:2px 7px;border-radius:10px;white-space:nowrap;">${category}</span></td>
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${mat}"><strong>${mat}</strong></td>
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeDesc}">${safeDesc.length > 40 ? safeDesc.substring(0,40)+'...' : safeDesc}</td>
                    <td style="text-align:center;">${b.uom || 'EA'}</td>
                    <td style="text-align:center;">${qty.toFixed(2)}</td>
                    <td style="text-align:center;">${totalRec.toFixed(2)}</td>
                    <td style="text-align:center;"><strong style="color:${stockQty >= qty ? '#2e7d32' : (stockQty > 0 ? '#e65100' : '#c62828')};">${stockQty.toFixed(2)}</strong></td>
                    <td style="text-align:left;font-size:11px;line-height:1.6;">${renderPkgListCell(pkgMap)}</td>
                </tr>`;
            });

            tbody.innerHTML = htmlString || `<tr><td colspan="9" style="text-align:center;color:#888;">No BOM materials found for the selected ISO Drawing.</td></tr>`;

            if (!iso || iso === 'All') {
                tbody.innerHTML += `<tr><td colspan="9" style="text-align:center;color:var(--color-warning);font-size:11px;padding:8px;">
                    <i class="fas fa-info-circle"></i> Specify an ISO Drawing to view all materials for that drawing.</td></tr>`;
            }

            // Support Tag List 렌더링 (Task 6과 공유하는 헬퍼 재사용)
            const suppTbody = document.getElementById('suppMatTbody');
            if (suppTbody) {
                if (iso && iso !== 'All') {
                    await fetchAndRenderSupportRows({
                        filterField: 'iso_dwg_no', filterValue: iso, tbodyEl: suppTbody,
                        emptyMsg: 'No support materials for this ISO.'
                    });
                } else {
                    suppTbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#888;">Select an ISO Drawing and click Search.</td></tr>';
                }
            }
        });
    }

    // ISO/Support Tag 공용: support_bom + support_receiving을 조합해 BOM/Received/Stock/PKG 렌더링
    // filterField: 'iso_dwg_no' | 'support_tag'
    async function fetchAndRenderSupportRows({ filterField, filterValue, tbodyEl, emptyMsg }) {
        tbodyEl.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#aaa;padding:12px;">Loading...</td></tr>';
        const { data: suppRows, error } = await supabaseClient.from('support_bom')
            .select('iso_dwg_no, support_tag, item, matl, size_or_type, qty, part_no')
            .eq(filterField, filterValue)
            .order('support_tag').order('part_no');

        if (error || !suppRows || suppRows.length === 0) {
            tbodyEl.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#aaa;padding:12px;">${emptyMsg}</td></tr>`;
            return;
        }

        const tags = [...new Set(suppRows.map(s => s.support_tag).filter(Boolean))];
        const { data: recRows } = await supabaseClient.from('support_receiving')
            .select('support_tag, part_no, package_no, qty')
            .in('support_tag', tags);

        // key = support_tag::part_no → { package_no: qty }
        const pkgByRow = {};
        (recRows || []).forEach(r => {
            const key = `${r.support_tag}::${r.part_no}`;
            if (!pkgByRow[key]) pkgByRow[key] = {};
            pkgByRow[key][r.package_no] = (pkgByRow[key][r.package_no] || 0) + (r.qty || 0);
        });

        const safe = v => (v || '-').toString().replace(/"/g, '&quot;');
        tbodyEl.innerHTML = suppRows.map(s => {
            const key = `${s.support_tag}::${s.part_no}`;
            const pkgMap = pkgByRow[key] || {};
            const received = Object.values(pkgMap).reduce((a, b) => a + b, 0);
            const issued = Object.entries(pkgMap)
                .filter(([pkg]) => isPkgIssued(pkg))
                .reduce((a, [, qty]) => a + qty, 0);
            const stock = Math.max(0, received - issued);
            const bomQty = s.qty ?? 0;
            return `<tr>
                <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safe(s.iso_dwg_no)}">${s.iso_dwg_no || '-'}</td>
                <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;" title="${safe(s.support_tag)}">${s.support_tag || '-'}</td>
                <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safe(s.item)}">${s.item || '-'}</td>
                <td style="text-align:center;">${s.matl || '-'}</td>
                <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safe(s.size_or_type)}">${s.size_or_type || '-'}</td>
                <td style="text-align:center;">EA</td>
                <td style="text-align:center;">${bomQty}</td>
                <td style="text-align:center;">${received}</td>
                <td style="text-align:center;"><strong style="color:${stock >= bomQty ? '#2e7d32' : (stock > 0 ? '#e65100' : '#c62828')};">${stock}</strong></td>
                <td style="text-align:left;font-size:11px;line-height:1.6;">${renderPkgListCell(pkgMap)}</td>
            </tr>`;
        }).join('');
    }
```

- [ ] **Step 2: `window.showIsoDetail`이 항상 ISO 모드를 켜도록 수정**

현재 코드:

```javascript
window.showIsoDetail = function(isoDwgNo) {
    if (!isoDwgNo) return;
    if (typeof showSection === 'function') showSection('issue');
    // Wait for section switch and renderIssueOptions() to complete before searching
    setTimeout(() => {
        const searchInput = document.getElementById('issueIsoSearch');
        if (searchInput) searchInput.value = isoDwgNo;
        // Reset category filter then search all
        const catFilter = document.getElementById('issueCategoryFilter');
        if (catFilter) catFilter.value = 'All';
        document.getElementById('btnFilterIssue')?.click();
    }, 150);
};
```

다음으로 교체한다 (모드 전환 한 줄 추가).

```javascript
window.showIsoDetail = function(isoDwgNo) {
    if (!isoDwgNo) return;
    if (typeof showSection === 'function') showSection('issue');
    // Wait for section switch and renderIssueOptions() to complete before searching
    setTimeout(() => {
        document.querySelector('.mf-mode-btn[data-mode="iso"]')?.click();
        const searchInput = document.getElementById('issueIsoSearch');
        if (searchInput) searchInput.value = isoDwgNo;
        // Reset category filter then search all
        const catFilter = document.getElementById('issueCategoryFilter');
        if (catFilter) catFilter.value = 'All';
        document.getElementById('btnFilterIssue')?.click();
    }, 150);
};
```

- [ ] **Step 3: 문법 검증**

Run: `node --check static/js/app.js`
Expected: 에러 없음

- [ ] **Step 4: Playwright로 실제 데이터가 있는 ISO를 검색해 Packing List 컬럼과 Support Stock이 채워지는지 확인**

`scratch/verify_mode_a.py`를 만든다.

```python
# Mode A(ISO Drawing) 검색 결과에 Packing List 컬럼과 Support 실제 Received/Stock이 채워지는지 확인
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

        # datalist의 첫 ISO를 사용 (실 데이터 존재 확인된 것으로 아무거나 선택)
        first_iso = await page.eval_on_selector('#isoDatalist option', 'el => el.value')
        assert first_iso, "isoDatalist에 옵션이 없음 — BOM 데이터 로딩 확인 필요"
        print(f"searching ISO: {first_iso}")

        await page.fill('#issueIsoSearch', first_iso)
        await page.click('#btnFilterIssue')
        await page.wait_for_timeout(2000)

        row_count = await page.locator('#issueTable tbody tr').count()
        assert row_count > 0, "검색 결과 행이 0개"
        first_row_text = await page.locator('#issueTable tbody tr').first.inner_text()
        print("first row:", first_row_text.replace("\n", " | "))
        assert "-" in first_row_text or "EA" in first_row_text, "Packing List 컬럼 내용이 비정상"

        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
```

Run: `python scratch/verify_mode_a.py`
Expected: `searching ISO: ...` → `first row: ...` → `PASS`

- [ ] **Step 5: 커밋**

```bash
git add static/js/app.js scratch/verify_mode_a.py
git commit -m "feat: Mode A(ISO Drawing)에 Packing List 컬럼 추가, Support 실제 Received/Stock 계산으로 수정"
```

---

### Task 6: Mode B (Support Tag No 단독 검색) 구현

**Files:**
- Modify: `static/js/app.js` (`loadSupportTagDatalist` 스텁을 실제 구현으로 교체, `btnFilterSupportTag` 핸들러 추가)

**Interfaces:**
- Consumes: Task 5의 `fetchAndRenderSupportRows`
- Produces: 없음 (최종 사용자 기능)

- [ ] **Step 1: `loadSupportTagDatalist` 스텁을 실제 구현으로 교체**

Task 4에서 추가한 스텁

```javascript
async function loadSupportTagDatalist() { /* Task 6에서 구현 */ }
```

를 다음으로 교체한다.

```javascript
let _supportTagDatalistLoaded = false;
async function loadSupportTagDatalist() {
    if (_supportTagDatalistLoaded) return;
    const dl = document.getElementById('mfSupportTagDatalist');
    if (!dl || !supabaseClient) return;
    const { data } = await supabaseClient.from('support_bom').select('support_tag').limit(20000);
    const tags = [...new Set((data || []).map(r => r.support_tag).filter(Boolean))].sort();
    dl.innerHTML = tags.map(t => `<option value="${t}">`).join('');
    _supportTagDatalistLoaded = true;
}
```

- [ ] **Step 2: `btnFilterSupportTag` 클릭 핸들러 추가**

`attachEventListeners()` 함수 안, Mode 전환 핸들러 바로 뒤에 추가한다.

```javascript
    const btnFilterSupportTag = document.getElementById('btnFilterSupportTag');
    if (btnFilterSupportTag) {
        btnFilterSupportTag.addEventListener('click', async () => {
            const tag = (document.getElementById('mfSupportTagSearch')?.value || '').trim();
            const tbody = document.getElementById('mfSupportTagTbody');
            if (!tbody) return;
            if (!tag) {
                tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#888;">Enter a Support Tag No.</td></tr>';
                return;
            }
            await fetchAndRenderSupportRows({
                filterField: 'support_tag', filterValue: tag, tbodyEl: tbody,
                emptyMsg: 'No support materials found for this Tag No.'
            });
        });
    }
```

- [ ] **Step 3: 문법 검증**

Run: `node --check static/js/app.js`
Expected: 에러 없음

- [ ] **Step 4: Playwright로 실제 Support Tag 검색 확인**

`scratch/verify_mode_b.py`를 만든다.

```python
# Mode B(Support Tag No)로 실제 태그를 검색해 결과가 나오는지 확인
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
        await page.click('.mf-mode-btn[data-mode="support"]')
        await page.wait_for_timeout(1500)  # datalist 로딩 대기

        first_tag = await page.eval_on_selector('#mfSupportTagDatalist option', 'el => el.value')
        assert first_tag, "mfSupportTagDatalist에 옵션이 없음 — support_bom 조회 확인 필요"
        print(f"searching tag: {first_tag}")

        await page.fill('#mfSupportTagSearch', first_tag)
        await page.click('#btnFilterSupportTag')
        await page.wait_for_timeout(2000)

        row_count = await page.locator('#mfSupportTagTbody tr').count()
        assert row_count > 0, "검색 결과 행이 0개"
        print("row count:", row_count)

        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
```

Run: `python scratch/verify_mode_b.py`
Expected: `searching tag: ...` → `row count: N` (N > 0) → `PASS`

- [ ] **Step 5: 커밋**

```bash
git add static/js/app.js scratch/verify_mode_b.py
git commit -m "feat: Mode B(Support Tag No 단독 검색) 구현"
```

---

### Task 7: Mode C (Item — Valve · Speciality) 구현

**Files:**
- Modify: `static/js/app.js` (`setupItemModeFilters` 신규, `btnFilterItem` 핸들러 추가)

**Interfaces:**
- Consumes: 기존 `getBomItemsForCat`, `getBomSizesForCatItem`, `setupCatItemSize`(재사용, 신규 아님), Task 1의 `isPkgIssued`, `renderPkgListCell`
- Produces: 없음 (최종 사용자 기능)

- [ ] **Step 1: Item 모드 필터 초기화 함수 추가**

`attachEventListeners()` 함수 안, `btnFilterSupportTag` 핸들러 바로 뒤에 추가한다.

```javascript
    // Item 모드(Valve/Speciality) 필터 초기화
    const mfItemCategoryFilter = document.getElementById('mfItemCategoryFilter');
    if (mfItemCategoryFilter) {
        setupCatItemSize(
            mfItemCategoryFilter,
            document.getElementById('mfItemItemFilter'),
            document.getElementById('mfItemSizeFilter'),
            getBomItemsForCat, getBomSizesForCatItem, 'All'
        );
        // setupCatItemSize는 최초 진입 시 'All' 카테고리로 Item 목록을 채우는데,
        // Item 모드는 Category에 'All' 옵션이 없으므로 실제 선택된 카테고리로 다시 채운다.
        mfItemCategoryFilter.dispatchEvent(new Event('change'));
    }
```

- [ ] **Step 2: `btnFilterItem` 클릭 핸들러 추가**

바로 뒤에 이어서 추가한다.

```javascript
    const btnFilterItem = document.getElementById('btnFilterItem');
    if (btnFilterItem) {
        btnFilterItem.addEventListener('click', async () => {
            const cat  = document.getElementById('mfItemCategoryFilter')?.value || 'Valve';
            const item = document.getElementById('mfItemItemFilter')?.value || 'All';
            const sys  = document.getElementById('mfItemSystemFilter')?.value || 'All';
            const size = document.getElementById('mfItemSizeFilter')?.value || 'All';
            const tbody = document.getElementById('mfItemTbody');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:16px;color:#888;">Loading...</td></tr>';

            let query = supabaseClient.from('bom_detail')
                .select('mat_code, category, system, iso_dwg_no, tag, full_description, uom, qty')
                .eq('category', cat)
                .not('tag', 'is', null)
                .order('iso_dwg_no');
            if (sys !== 'All') query = query.eq('system', sys);

            const { data: rows, error } = await query;
            if (error) {
                tbody.innerHTML = `<tr><td colspan="9" style="color:red;text-align:center;">Error: ${error.message}</td></tr>`;
                return;
            }

            const filtered = (rows || []).filter(r => {
                const mat = (r.mat_code || '').trim().toUpperCase();
                const mcItem = window.extractItemFromMatCode(mat);
                const rowItem = (mcItem && mcItem !== '-') ? mcItem : window.extractItemFromDesc(r.full_description || '');
                if (item !== 'All' && rowItem !== item) return false;
                if (size !== 'All') {
                    const sz = window.extractSizeFromMatCode(mat);
                    if (sz !== size) return false;
                }
                return true;
            });

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;">No matching items found.</td></tr>';
                return;
            }

            // 태그별 PKG 원자료 (동일 카테고리의 db.receiving 기준)
            const pkgBreakdown = {};
            db.receiving.filter(r => isReceivingActive(r.plNo) && r.category === cat).forEach(r => {
                const tagKey = (r.tag || '').toUpperCase();
                if (!tagKey) return;
                if (!pkgBreakdown[tagKey]) pkgBreakdown[tagKey] = {};
                pkgBreakdown[tagKey][r.plNo] = (pkgBreakdown[tagKey][r.plNo] || 0) + (r.qty || 0);
            });

            tbody.innerHTML = filtered.map(r => {
                const tagKey = (r.tag || '').toUpperCase();
                const pkgMap = pkgBreakdown[tagKey] || {};
                const received = Object.values(pkgMap).reduce((a, b) => a + b, 0);
                const issuedQty = Object.entries(pkgMap)
                    .filter(([pkg]) => isPkgIssued(pkg))
                    .reduce((a, [, qty]) => a + qty, 0);
                const stock = Math.max(0, received - issuedQty);
                const bomQty = parseFloat(r.qty) || 0;
                const safeDesc = (r.full_description || '-').replace(/"/g, '&quot;');
                return `<tr>
                    <td style="text-align:center;font-weight:600;">${r.tag}</td>
                    <td style="text-align:center;">${r.iso_dwg_no || '-'}</td>
                    <td style="text-align:center;">${r.category}</td>
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeDesc}">${safeDesc}</td>
                    <td style="text-align:center;">${r.uom || 'EA'}</td>
                    <td style="text-align:center;">${bomQty.toFixed(2)}</td>
                    <td style="text-align:center;">${received.toFixed(2)}</td>
                    <td style="text-align:center;"><strong style="color:${stock >= bomQty ? '#2e7d32' : (stock > 0 ? '#e65100' : '#c62828')};">${stock.toFixed(2)}</strong></td>
                    <td style="text-align:left;font-size:11px;line-height:1.6;">${renderPkgListCell(pkgMap)}</td>
                </tr>`;
            }).join('');
        });
    }
```

- [ ] **Step 3: 문법 검증**

Run: `node --check static/js/app.js`
Expected: 에러 없음

- [ ] **Step 4: Playwright로 Valve Item 검색 확인**

`scratch/verify_mode_c.py`를 만든다.

```python
# Mode C(Item — Valve/Speciality)에서 Valve 카테고리로 검색해 결과가 나오는지 확인
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
        await page.click('.mf-mode-btn[data-mode="item"]')
        await page.wait_for_timeout(500)

        # 기본 Category=Valve 상태에서 바로 검색 (All Items)
        await page.click('#btnFilterItem')
        await page.wait_for_timeout(2000)

        row_count = await page.locator('#mfItemTbody tr').count()
        print("row count:", row_count)
        assert row_count > 0, "Valve Item 검색 결과가 0개 — BOM에 Valve 데이터 존재 여부 확인 필요"

        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
```

Run: `python scratch/verify_mode_c.py`
Expected: `row count: N` (N > 0) → `PASS`

- [ ] **Step 5: 커밋**

```bash
git add static/js/app.js scratch/verify_mode_c.py
git commit -m "feat: Mode C(Item — Valve/Speciality 검색) 구현"
```

---

### Task 8: 전체 회귀 검증 및 마무리

**Files:**
- Test only (수정 없음)

- [ ] **Step 1: Task 3에서 만든 전체 탭 스윕 재실행**

Run: `python scratch/verify_full_sweep.py`
Expected: `console errors: []`, `page errors: []`, `PASS`

- [ ] **Step 2: Dashboard/Shortage/Surplus 수치 회귀 확인 (Issued 미사용 확인)**

`scratch/verify_no_regression.py`를 만든다.

```python
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
```

Run: `python scratch/verify_no_regression.py`
Expected: `shortage rows: N`, `surplus rows: N`, `PASS`

- [ ] **Step 3: 모든 검증 스크립트를 순서대로 재실행해 최종 확인**

```bash
python scratch/verify_stock_basic.py
python scratch/verify_full_sweep.py
python scratch/verify_mf_shell.py
python scratch/verify_mode_a.py
python scratch/verify_mode_b.py
python scratch/verify_mode_c.py
python scratch/verify_no_regression.py
```

Expected: 전부 `PASS` 출력, 예외 없음. (`verify_issue_date_stock.py`는 운영 데이터를 건드리므로 이 최종 재실행에는 포함하지 않는다 — Task 2에서 이미 원복까지 확인했다.)

- [ ] **Step 4: 최종 커밋**

```bash
git add -A
git commit -m "test: Material Finding 재설계 전체 회귀 검증 스크립트 추가"
```

---

## Self-Review 결과

- **스펙 커버리지**: 설계서의 4개 섹션(탭 재편/3모드 검색/Issued 계산 전환/에러 처리) 모두 Task 1~7에 매핑됨. "미결정 사항"(자동완성 목록 구축 시점)은 Task 6에서 `_supportTagDatalistLoaded` 플래그로 "모드 최초 진입 시 1회 로드" 방식으로 확정함.
- **플레이스홀더 스캔**: TBD/TODO 없음. 모든 스텝에 실행 가능한 완전한 코드 포함.
- **타입/이름 일관성**: `buildPkgBreakdown`/`getIssuedQtyMap`/`renderPkgListCell`/`isPkgIssued`/`fetchAndRenderSupportRows`는 Task 1, 5에서 정의된 이름 그대로 Task 2, 5, 6, 7에서 사용됨.
- **범위 검토**: Shipping 탭 UI 자체는 건드리지 않음(설계서의 Out-of-scope 준수). `issued` 테이블은 삭제하지 않음.

