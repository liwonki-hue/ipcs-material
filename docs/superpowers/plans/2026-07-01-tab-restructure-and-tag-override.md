# 사이드바/탭 구조 재편 + Valve·Speciality Tag 수동 ISO 지정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사이드바 최상위 탭을 13개에서 9개로 줄이고(MatCode Master→BOM 서브탭, Stock/Shortage/Surplus→Material Status 서브탭 통합, Support→TAG Item 재배치, Material Finding→상단 이동), Valve/Speciality를 BOM 비교 없는 순수 Tag 기반 조회로 전환하고 미매칭 Tag에 대한 수동 ISO/Line No 지정 기능을 추가한다.

**Architecture:** Flask + Supabase(REST) + Vanilla JS SPA. 기존 BOM 탭의 서브탭 전환 패턴(버튼 클릭 → JS 상태 변수 갱신 → 표시 영역 전환)을 재사용한다. 빌드 스텝 없음, Playwright로 검증.

**Tech Stack:** Flask, Supabase(anon key, REST), Vanilla JS, Playwright(Python, 검증용).

## Global Constraints

- **선행조건**: 본 계획의 Task 5는 `docs/superpowers/plans/2026-07-01-material-finding-redesign.md`의 Task 1~6(공용 헬퍼, Material Stock 전환, 죽은 코드 제거, 3-모드 셸, Mode A, Mode B)이 이미 구현되어 있다고 가정한다. 아직 구현되지 않았다면 Task 5보다 먼저 그 계획을 실행해야 한다.
- 사이드바 `data-target` 값과 `<section>`/`<div>` id는 항상 일치해야 한다 — 재구성 중간에 끊어진 링크가 남지 않도록 각 태스크는 HTML과 JS를 함께 수정해 완결된 상태로 끝낸다.
- 기존 코드 스타일(들여쓰기 4칸, 세미콜론, 인라인 스타일 관례)을 따른다.
- 매 태스크 종료 시 `node --check static/js/app.js`로 문법 검증 후 커밋한다.

---

### Task 1: MatCode Master를 BOM 탭의 4번째 서브탭으로 통합

**Files:**
- Modify: `templates/index.html` (사이드바, BOM 탭 서브탭 바, BOM 섹션 구조, MatCode Master 섹션 삭제)
- Modify: `static/js/app.js` (`initBomTabs`, `showSection`, `syncFromSupabase` 재렌더 로직)

**Interfaces:**
- Consumes: 기존 `renderMatCodeMaster()`, `renderBomTable()` (변경 없음)
- Produces: `_bomActiveTab`에 `'matcode'` 값 추가 (기존 `'piping'|'fitting'|'others'`에 이어)

- [ ] **Step 1: 사이드바에서 MatCode Master 항목 제거, 섹션 타이틀 변경**

`templates/index.html`에서:

```html
                 <div class="section-title">Master Data</div>
                 <div class="nav-item" data-target="matcode_master"><i class="fas fa-barcode"></i> MatCode Master</div>
                 <div class="nav-item" data-target="piping_bom"><i class="fas fa-layer-group"></i> BOM</div>
```

를 다음으로 교체한다.

```html
                 <div class="section-title">BOM</div>
                 <div class="nav-item" data-target="piping_bom"><i class="fas fa-layer-group"></i> BOM</div>
```

- [ ] **Step 2: BOM 탭 서브탭 바에 4번째 버튼 추가**

```html
                     <button class="bom-tab-btn" data-tab="others" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">OTHERS</button>
                 </div>
```

를 다음으로 교체한다.

```html
                     <button class="bom-tab-btn" data-tab="others" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">OTHERS</button>
                     <button class="bom-tab-btn" data-tab="matcode" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">MATCODE MASTER</button>
                 </div>
```

- [ ] **Step 3: BOM 본문(필터+테이블)을 `bomMainPanel`로 감싸기**

탭 바 바로 뒤, 다음 부분을 찾는다.

```html
                 </div>

                 <div class="panel filter-panel" style="margin-bottom: 20px;">
                      <div style="display: flex; align-items: flex-end; justify-content: space-between; width: 100%; gap: 10px; flex-wrap: nowrap;">
```

다음으로 교체한다 (탭 바를 닫는 `</div>` 바로 뒤에 `bomMainPanel`을 새로 연다).

```html
                 </div>

                 <div id="bomMainPanel">
                 <div class="panel filter-panel" style="margin-bottom: 20px;">
                      <div style="display: flex; align-items: flex-end; justify-content: space-between; width: 100%; gap: 10px; flex-wrap: nowrap;">
```

- [ ] **Step 4: `bomMainPanel`을 닫고 MatCode Master 패널을 그 뒤에 추가**

BOM 섹션의 끝부분, 다음을 찾는다.

```html
                     <div id="bomPagination"></div>
                 </div>
            </section>

            <!-- 3. BOM Tab -->
```

주의: 이 문자열은 파일에 2번 나타날 수 있으므로(원본 BOM 섹션 자체가 `<!-- 3. BOM Tab -->` 주석 뒤에 시작하는 구조), 실제로는 `<div id="bomPagination"></div>` 다음 줄의 `</div>`, `</section>` 두 줄만 대상으로 삼는다 — `bomPagination` id는 파일 전체에서 유일하므로 이 두 줄 앞뒤 문맥으로 고유하게 특정 가능하다.

```html
                     <div id="bomPagination"></div>
                 </div>
            </section>
```

를 다음으로 교체한다 (matcode_master 섹션의 필터 패널+테이블 내용을 그대로 옮겨와 `bomMatCodeMasterPanel`로 감싼다. `page-header`는 BOM 탭 자체의 헤더와 중복되므로 가져오지 않는다).

```html
                     <div id="bomPagination"></div>
                 </div>
                 </div>

                 <div id="bomMatCodeMasterPanel" style="display:none;">
                 <div class="panel filter-panel" style="margin-bottom:20px;">
                     <div style="display:flex; align-items:flex-end; justify-content:space-between; width:100%;">
                         <div style="display:flex; align-items:flex-end; gap:12px; width:66.67%;">
                             <div class="form-group" style="flex:2;">
                                 <label>MatCode Search</label>
                                 <input type="text" id="masterSearch" class="form-control" style="width:100%;" placeholder="Type MatCode keyword...">
                             </div>
                             <div class="form-group" style="flex:1;">
                                 <label>Category</label>
                                 <select id="masterCatFilter" class="form-control" style="width:100%;"><option value="All">All Categories</option></select>
                             </div>
                             <div class="form-group" style="flex:1;">
                                 <label>Item</label>
                                 <select id="masterItemFilter" class="form-control" style="width:100%;"><option value="All">All Items</option></select>
                             </div>
                             <div class="form-group" style="flex:1;">
                                 <label>Size</label>
                                 <select id="masterSizeFilter" class="form-control" style="width:100%;"><option value="All">All Sizes</option></select>
                             </div>
                             <div style="padding-bottom:1px;">
                                 <button class="btn btn-primary" id="btnFilterMaster" style="height:38px; white-space:nowrap; display:flex; align-items:center; gap:8px;">
                                     <i class="fas fa-search"></i> Search
                                 </button>
                             </div>
                         </div>
                         <div style="padding-bottom:1px; margin-left:12px; display:flex; align-items:center; gap:12px;">
                             <span id="masterInfo" style="font-size:11px; color:#666; white-space:nowrap;"></span>
                             <button class="btn btn-outline" id="btnExportMaster" style="height:38px; white-space:nowrap; display:flex; align-items:center; gap:6px;"><i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export Excel</button>
                         </div>
                     </div>
                 </div>
                 <div class="panel data-panel">
                     <div class="panel-header">
                         <h3>MatCode Rules & Reference Table</h3>
                     </div>
                     <div class="table-responsive">
                         <table class="data-table" id="matCodeTable" style="table-layout:fixed;width:100%;">
                             <colgroup>
                                 <col style="width:195px;">
                                 <col style="width:100px;">
                                 <col style="width:280px;">
                                 <col style="width:160px;">
                                 <col style="width:130px;">
                                 <col style="width:95px;">
                                 <col style="width:95px;">
                                 <col style="width:90px;">
                                 <col style="width:90px;">
                             </colgroup>
                             <thead>
                                 <tr>
                                     <th style="text-align:center;">MatCode</th>
                                     <th style="text-align:center;">Category</th>
                                     <th style="text-align:center;">Full Description</th>
                                     <th style="text-align:center;">Item</th>
                                     <th style="text-align:center;">Material</th>
                                     <th style="text-align:center;">Size (Inch)</th>
                                     <th style="text-align:center;">Size (DN)</th>
                                     <th style="text-align:center;">Class</th>
                                     <th style="text-align:center;">End Type</th>
                                 </tr>
                             </thead>
                             <tbody>
                                 <!-- Data will be loaded via JS -->
                             </tbody>
                         </table>
                     </div>
                     <div id="matCodePagination"></div>
                 </div>
                 </div>
            </section>
```

- [ ] **Step 5: 원래의 독립 MatCode Master 섹션 삭제**

다음 블록(원래 `matcode_master` 섹션 전체)을 찾아 통째로 삭제한다.

```html
             <section id="matcode_master" class="view-section">
                <div class="page-header">
                     <div>
                         <h1>MatCode Master</h1>
                         <p class="subtitle">Reference rules for generating MatCodes.</p>
                     </div>
                 </div>
                 <div class="panel filter-panel" style="margin-bottom:20px;">
                     <div style="display:flex; align-items:flex-end; justify-content:space-between; width:100%;">
                         <div style="display:flex; align-items:flex-end; gap:12px; width:66.67%;">
                             <div class="form-group" style="flex:2;">
                                 <label>MatCode Search</label>
                                 <input type="text" id="masterSearch" class="form-control" style="width:100%;" placeholder="Type MatCode keyword...">
                             </div>
                             <div class="form-group" style="flex:1;">
                                 <label>Category</label>
                                 <select id="masterCatFilter" class="form-control" style="width:100%;"><option value="All">All Categories</option></select>
                             </div>
                             <div class="form-group" style="flex:1;">
                                 <label>Item</label>
                                 <select id="masterItemFilter" class="form-control" style="width:100%;"><option value="All">All Items</option></select>
                             </div>
                             <div class="form-group" style="flex:1;">
                                 <label>Size</label>
                                 <select id="masterSizeFilter" class="form-control" style="width:100%;"><option value="All">All Sizes</option></select>
                             </div>
                             <div style="padding-bottom:1px;">
                                 <button class="btn btn-primary" id="btnFilterMaster" style="height:38px; white-space:nowrap; display:flex; align-items:center; gap:8px;">
                                     <i class="fas fa-search"></i> Search
                                 </button>
                             </div>
                         </div>
                         <div style="padding-bottom:1px; margin-left:12px; display:flex; align-items:center; gap:12px;">
                             <span id="masterInfo" style="font-size:11px; color:#666; white-space:nowrap;"></span>
                             <button class="btn btn-outline" id="btnExportMaster" style="height:38px; white-space:nowrap; display:flex; align-items:center; gap:6px;"><i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export Excel</button>
                         </div>
                     </div>
                 </div>
                 <div class="panel data-panel">
                     <div class="panel-header">
                         <h3>MatCode Rules & Reference Table</h3>
                     </div>
                     <div class="table-responsive">
                         <table class="data-table" id="matCodeTable" style="table-layout:fixed;width:100%;">
                             <colgroup>
                                 <col style="width:195px;">
                                 <col style="width:100px;">
                                 <col style="width:280px;">
                                 <col style="width:160px;">
                                 <col style="width:130px;">
                                 <col style="width:95px;">
                                 <col style="width:95px;">
                                 <col style="width:90px;">
                                 <col style="width:90px;">
                             </colgroup>
                             <thead>
                                 <tr>
                                     <th style="text-align:center;">MatCode</th>
                                     <th style="text-align:center;">Category</th>
                                     <th style="text-align:center;">Full Description</th>
                                     <th style="text-align:center;">Item</th>
                                     <th style="text-align:center;">Material</th>
                                     <th style="text-align:center;">Size (Inch)</th>
                                     <th style="text-align:center;">Size (DN)</th>
                                     <th style="text-align:center;">Class</th>
                                     <th style="text-align:center;">End Type</th>
                                 </tr>
                             </thead>
                             <tbody>
                                 <!-- Data will be loaded via JS -->
                             </tbody>
                         </table>
                     </div>
                     <div id="matCodePagination"></div>
                 </div>
            </section>

            <!-- 3. BOM Tab -->
```

교체 후에는 `<!-- 3. BOM Tab -->` 주석과 `<section id="piping_bom" ...>`만 남는다.

- [ ] **Step 6: `initBomTabs()`가 4번째 버튼을 처리하도록 수정**

`static/js/app.js`에서:

```javascript
let _bomTabsInited = false;
function initBomTabs() {
    if (_bomTabsInited) return;
    _bomTabsInited = true;
    document.querySelectorAll('.bom-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _bomActiveTab = btn.dataset.tab;
            document.querySelectorAll('.bom-tab-btn').forEach(b => {
                b.style.borderBottomColor = b === btn ? '#0A2540' : 'transparent';
                b.style.color = b === btn ? '#0A2540' : '#888';
            });
            currentBomPage = 1;
            refreshBomItemFilter();
            renderBomTable();
        });
    });
}
```

를 다음으로 교체한다.

```javascript
let _bomTabsInited = false;
function initBomTabs() {
    if (_bomTabsInited) return;
    _bomTabsInited = true;
    document.querySelectorAll('.bom-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _bomActiveTab = btn.dataset.tab;
            document.querySelectorAll('.bom-tab-btn').forEach(b => {
                b.style.borderBottomColor = b === btn ? '#0A2540' : 'transparent';
                b.style.color = b === btn ? '#0A2540' : '#888';
            });

            const mainPanel = document.getElementById('bomMainPanel');
            const mcPanel = document.getElementById('bomMatCodeMasterPanel');
            if (_bomActiveTab === 'matcode') {
                if (mainPanel) mainPanel.style.display = 'none';
                if (mcPanel) mcPanel.style.display = '';
                renderMatCodeMaster();
                return;
            }
            if (mainPanel) mainPanel.style.display = '';
            if (mcPanel) mcPanel.style.display = 'none';
            currentBomPage = 1;
            refreshBomItemFilter();
            renderBomTable();
        });
    });
}
```

- [ ] **Step 7: `showSection`과 `syncFromSupabase`의 재렌더 로직에서 `matcode_master` 참조 제거**

`static/js/app.js`에서 (약 445~447행 부근, `syncFromSupabase` 내부):

```javascript
                if(id === 'piping_bom') { initBomTabs(); renderBomTable(); }
                if(id === 'receiving') { initReceivingTabs(); renderActiveReceivingTab(); }
                if(id === 'matcode_master') renderMatCodeMaster();
```

를 다음으로 교체한다.

```javascript
                if(id === 'piping_bom') { initBomTabs(); if (_bomActiveTab === 'matcode') renderMatCodeMaster(); else renderBomTable(); }
                if(id === 'receiving') { initReceivingTabs(); renderActiveReceivingTab(); }
```

그리고 (약 509~511행 부근, `showSection` 함수 내부):

```javascript
        if(targetId === 'piping_bom') { initBomTabs(); renderBomTable(); }
        if(targetId === 'receiving') { initReceivingTabs(); renderActiveReceivingTab(); }
        if(targetId === 'matcode_master') renderMatCodeMaster();
```

를 다음으로 교체한다.

```javascript
        if(targetId === 'piping_bom') { initBomTabs(); if (_bomActiveTab === 'matcode') renderMatCodeMaster(); else renderBomTable(); }
        if(targetId === 'receiving') { initReceivingTabs(); renderActiveReceivingTab(); }
```

- [ ] **Step 8: 문법 검증**

Run: `node --check static/js/app.js`
Expected: 에러 없음

- [ ] **Step 9: Playwright로 확인**

`scratch/verify_bom_matcode_merge.py`를 만든다.

```python
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
```

Run: `python scratch/verify_bom_matcode_merge.py`
Expected: `PASS`

- [ ] **Step 10: 커밋**

```bash
git add templates/index.html static/js/app.js scratch/verify_bom_matcode_merge.py
git commit -m "refactor: MatCode Master를 BOM 탭의 4번째 서브탭으로 통합"
```

---

### Task 2: Material Stock/Shortage/Surplus를 "Material Status" 탭으로 통합

**Files:**
- Modify: `templates/index.html` (사이드바, 3개 섹션을 1개 섹션+3개 서브패널로 병합)
- Modify: `static/js/app.js` (`showSection`, `savePlUpdates`, 전역 검색 핸들러, 신규 `initMaterialStatusTabs`/`switchMaterialStatusTab`)

**Interfaces:**
- Consumes: 기존 `initStockFilters`, `initStockTabs`, `syncShortageData`, `renderSurplusTable`, `renderActiveStockTab` (변경 없음)
- Produces: `switchMaterialStatusTab(tab: 'stock'|'shortage'|'surplus'): void`, 전역 `_msActiveTab`

- [ ] **Step 1: 사이드바에서 3개 항목을 1개로 통합**

`templates/index.html`에서:

```html
                 <div class="section-title">Reports</div>
                 <div class="nav-item" data-target="stock_ledger"><i class="fas fa-warehouse"></i> Material Stock</div>
                 <div class="nav-item" data-target="material_shortage"><i class="fas fa-exclamation-triangle"></i> Material Shortage</div>
                 <div class="nav-item" data-target="surplus_material"><i class="fas fa-boxes"></i> Surplus Material</div>
```

를 다음으로 교체한다.

```html
                 <div class="section-title">Material Status</div>
                 <div class="nav-item" data-target="material_status"><i class="fas fa-warehouse"></i> Material Status</div>
```

- [ ] **Step 2: `stock_ledger` 섹션을 통합 섹션의 시작부로 변경, 서브탭 바 추가**

```html
            <section id="stock_ledger" class="view-section">
                <div class="page-header">
                     <div>
                         <h1>Material Stock</h1>
                         <p class="subtitle">Overview of all material stock changes (Receiving vs Issue).</p>
                     </div>
                 </div>

                 <!-- Stock Filter Panel -->
```

를 다음으로 교체한다.

```html
            <section id="material_status" class="view-section">
                <div class="page-header">
                     <div>
                         <h1>Material Status</h1>
                         <p class="subtitle">BOM 대비 입고/불출/Stock, 부족 자재, 잉여 자재 현황.</p>
                     </div>
                 </div>

                 <!-- Material Status Tab bar -->
                 <div style="display:flex;gap:0;border-bottom:2px solid #c8cfe0;margin-bottom:16px;">
                     <button class="ms-tab-btn" data-tab="stock" style="padding:8px 24px;border:none;border-bottom:3px solid #0A2540;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#0A2540;margin-bottom:-2px;letter-spacing:0.5px;">STOCK</button>
                     <button class="ms-tab-btn" data-tab="shortage" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">SHORTAGE</button>
                     <button class="ms-tab-btn" data-tab="surplus" style="padding:8px 24px;border:none;border-bottom:3px solid transparent;font-size:12px;font-weight:700;cursor:pointer;background:#fff;color:#888;margin-bottom:-2px;letter-spacing:0.5px;">SURPLUS</button>
                 </div>

                 <div id="msPanelStock">
                 <!-- Stock Filter Panel -->
```

- [ ] **Step 3: Stock↔Shortage 경계 처리**

```html
                 </div>
            </section>

            <!-- 7. Material Shortage -->
             <section id="material_shortage" class="view-section">
                <div class="page-header">
                    <div>
                        <h1>Material Shortage</h1>
                        <p class="subtitle">Items with insufficient receiving quantity compared to BOM.</p>
                    </div>
                </div>

                <div class="panel filter-panel" style="margin-bottom: 20px;">
```

를 다음으로 교체한다 (`msPanelStock`을 닫고, `material_shortage`의 자체 `<section>`/`page-header`는 없애고 `msPanelShortage`로 감싼다).

```html
                 </div>
                 </div>

            <!-- Material Shortage -->
                 <div id="msPanelShortage" style="display:none;">
                <div class="panel filter-panel" style="margin-bottom: 20px;">
```

- [ ] **Step 4: Shortage↔Surplus 경계 처리**

```html
                    <div id="shortagePagination"></div>
                </div>
            </section>

            <!-- 8. Surplus Material -->
             <section id="surplus_material" class="view-section">
                <div class="page-header">
                    <div>
                        <h1>Surplus Material</h1>
                        <p class="subtitle">Items with receiving quantity exceeding BOM requirement.</p>
                    </div>
                </div>

                <div class="panel filter-panel" style="margin-bottom: 20px;">
```

를 다음으로 교체한다.

```html
                    <div id="shortagePagination"></div>
                </div>
                 </div>

            <!-- Surplus Material -->
                 <div id="msPanelSurplus" style="display:none;">
                <div class="panel filter-panel" style="margin-bottom: 20px;">
```

- [ ] **Step 5: Surplus 끝을 닫고 전체 섹션 닫기**

```html
                    <div id="surplusPagination"></div>
                </div>
            </section>


            <!-- ── Shipping / Custom Clearance ──────────────────────────── -->
```

를 다음으로 교체한다.

```html
                    <div id="surplusPagination"></div>
                </div>
                 </div>
            </section>


            <!-- ── Shipping / Custom Clearance ──────────────────────────── -->
```

- [ ] **Step 6: 서브탭 전환 JS 추가**

`static/js/app.js`에서 `initStockTabs` 함수 정의(약 1215행 부근) 바로 위에 다음을 추가한다.

```javascript
let _msActiveTab = 'stock'; // 'stock' | 'shortage' | 'surplus'
let _msTabsInited = false;
function initMaterialStatusTabs() {
    if (_msTabsInited) return;
    _msTabsInited = true;
    document.querySelectorAll('.ms-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchMaterialStatusTab(btn.dataset.tab));
    });
}
function switchMaterialStatusTab(tab) {
    _msActiveTab = tab;
    document.querySelectorAll('.ms-tab-btn').forEach(b => {
        b.style.borderBottomColor = b.dataset.tab === tab ? '#0A2540' : 'transparent';
        b.style.color = b.dataset.tab === tab ? '#0A2540' : '#888';
    });
    document.getElementById('msPanelStock').style.display    = tab === 'stock'    ? '' : 'none';
    document.getElementById('msPanelShortage').style.display = tab === 'shortage' ? '' : 'none';
    document.getElementById('msPanelSurplus').style.display  = tab === 'surplus'  ? '' : 'none';

    if (tab === 'stock') {
        initStockFilters();
        initStockTabs();
    } else if (tab === 'shortage') {
        syncShortageData();
        if (!shortageRefreshTimer) {
            shortageRefreshTimer = setInterval(syncShortageData, SHORTAGE_REFRESH_INTERVAL_MS);
        }
    } else if (tab === 'surplus') {
        renderSurplusTable();
    }

    if (tab !== 'shortage' && shortageRefreshTimer) {
        clearInterval(shortageRefreshTimer);
        shortageRefreshTimer = null;
    }
}
```

- [ ] **Step 7: `showSection`의 3개 분기를 1개로 교체**

`static/js/app.js`에서 (`showSection` 함수 내부):

```javascript
        if(targetId === 'stock_ledger') { initStockFilters(); initStockTabs(); }
        if(targetId === 'shipping') initShipping();

        // Material Shortage 탭: 진입 시 즉시 싱크 + 폴링 시작, 이탈 시 정리
        if (targetId === 'material_shortage') {
            syncShortageData();
            if (!shortageRefreshTimer) {
                shortageRefreshTimer = setInterval(syncShortageData, SHORTAGE_REFRESH_INTERVAL_MS);
            }
        } else {
            if (shortageRefreshTimer) {
                clearInterval(shortageRefreshTimer);
                shortageRefreshTimer = null;
            }
        }

        if (targetId === 'surplus_material') {
            renderSurplusTable();
        }
```

를 다음으로 교체한다.

```javascript
        if(targetId === 'material_status') { initMaterialStatusTabs(); switchMaterialStatusTab(_msActiveTab); }
        if(targetId === 'shipping') initShipping();

        if (targetId !== 'material_status' && shortageRefreshTimer) {
            clearInterval(shortageRefreshTimer);
            shortageRefreshTimer = null;
        }
```

- [ ] **Step 8: `savePlUpdates`의 활성 탭 체크 수정**

`static/js/app.js`에서:

```javascript
            // issue_date 변경이 Stock Ledger에 즉시 반영되도록 재렌더링
            if (document.getElementById('stock_ledger')?.classList.contains('active')) {
                renderActiveStockTab();
            }
```

를 다음으로 교체한다.

```javascript
            // issue_date 변경이 Stock Ledger에 즉시 반영되도록 재렌더링
            if (document.getElementById('material_status')?.classList.contains('active') && _msActiveTab === 'stock') {
                renderActiveStockTab();
            }
```

- [ ] **Step 9: 전역 검색의 폴백 대상 수정**

`static/js/app.js`에서 (`attachEventListeners` 내 `globalSearchInput` 핸들러):

```javascript
                } else {
                    showSection('stock_ledger');
                }
```

를 다음으로 교체한다.

```javascript
                } else {
                    showSection('material_status');
                }
```

- [ ] **Step 10: 문법 검증**

Run: `node --check static/js/app.js`
Expected: 에러 없음

- [ ] **Step 11: Playwright로 확인**

`scratch/verify_material_status_merge.py`를 만든다.

```python
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
```

Run: `python scratch/verify_material_status_merge.py`
Expected: `PASS`

- [ ] **Step 12: 커밋**

```bash
git add templates/index.html static/js/app.js scratch/verify_material_status_merge.py
git commit -m "refactor: Material Stock/Shortage/Surplus를 Material Status 탭으로 통합"
```

---

### Task 3: Support를 TAG Item 섹션으로 재분류 (사이드바만)

**Files:**
- Modify: `templates/index.html` (사이드바 nav-item 위치만 이동)

**Interfaces:** 없음 (순수 네비게이션 재배치)

`switchReceivingTab`/`REC_TAB_MAP`(`static/js/app.js`)와 `recTagSupport` HTML 블록(`templates/index.html`)은 이미 `sec:'tag'`/`recSecTag` 컨테이너 안에 있으므로 JS나 렌더링 로직 변경이 전혀 필요 없다. 사이드바 nav-item 위치만 옮기면 된다.

- [ ] **Step 1: 사이드바 재배치**

`templates/index.html`에서:

```html
                 <div class="section-title">Bulk Item (Receiving)</div>
                 <div class="nav-item" data-target="rec_bulk_piping"><i class="fas fa-stream"></i> Piping</div>
                 <div class="nav-item" data-target="rec_bulk_fitting"><i class="fas fa-puzzle-piece"></i> Fitting</div>
                 <div class="nav-item" data-target="rec_bulk_others"><i class="fas fa-bolt"></i> Others</div>
                 <div class="nav-item" data-target="rec_tag_support"><i class="fas fa-tools"></i> Support</div>

                 <div class="section-title">TAG Item (Receiving)</div>
                 <div class="nav-item" data-target="rec_tag_spool"><i class="fas fa-circle-notch"></i> Spool</div>
                 <div class="nav-item" data-target="rec_tag_valve"><i class="fas fa-faucet"></i> Valve</div>
                 <div class="nav-item" data-target="rec_tag_speciality"><i class="fas fa-star"></i> Speciality</div>
```

를 다음으로 교체한다.

```html
                 <div class="section-title">Bulk Item (Receiving)</div>
                 <div class="nav-item" data-target="rec_bulk_piping"><i class="fas fa-stream"></i> Piping</div>
                 <div class="nav-item" data-target="rec_bulk_fitting"><i class="fas fa-puzzle-piece"></i> Fitting</div>
                 <div class="nav-item" data-target="rec_bulk_others"><i class="fas fa-bolt"></i> Others</div>

                 <div class="section-title">TAG Item (Receiving)</div>
                 <div class="nav-item" data-target="rec_tag_support"><i class="fas fa-tools"></i> Support</div>
                 <div class="nav-item" data-target="rec_tag_spool"><i class="fas fa-circle-notch"></i> Spool</div>
                 <div class="nav-item" data-target="rec_tag_valve"><i class="fas fa-faucet"></i> Valve</div>
                 <div class="nav-item" data-target="rec_tag_speciality"><i class="fas fa-star"></i> Speciality</div>
```

- [ ] **Step 2: Playwright로 확인**

`scratch/verify_support_nav_move.py`를 만든다.

```python
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
```

Run: `python scratch/verify_support_nav_move.py`
Expected: `PASS`

- [ ] **Step 3: 커밋**

```bash
git add templates/index.html scratch/verify_support_nav_move.py
git commit -m "refactor: Support 사이드바 항목을 TAG Item 섹션으로 재배치"
```

---

### Task 4: Material Finding을 사이드바 상단(Dashboard 바로 아래)으로 이동

**Files:**
- Modify: `templates/index.html` (사이드바 nav-item/section-title 위치만 이동)

**Interfaces:** 없음 (순수 네비게이션 재배치)

- [ ] **Step 1: 사이드바 재배치**

`templates/index.html`에서:

```html
                 <div class="section-title">Dashboard</div>
                 <div class="nav-item active" data-target="dashboard"><i class="fas fa-chart-pie"></i> Integrated Dashboard</div>

                 <div class="section-title">BOM</div>
```

(Task 1 적용 후의 상태 기준) 를 다음으로 교체한다.

```html
                 <div class="section-title">Dashboard</div>
                 <div class="nav-item active" data-target="dashboard"><i class="fas fa-chart-pie"></i> Integrated Dashboard</div>

                 <div class="section-title">Finding</div>
                 <div class="nav-item" data-target="issue"><i class="fas fa-file-signature"></i> Material Finding</div>

                 <div class="section-title">BOM</div>
```

그리고 원래 위치에 있던 다음 블록을 삭제한다.

```html
                 <div class="section-title">Finding</div>
                 <div class="nav-item" data-target="issue"><i class="fas fa-file-signature"></i> Material Finding</div>

```

- [ ] **Step 2: Playwright로 확인**

`scratch/verify_finding_nav_move.py`를 만든다.

```python
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
```

Run: `python scratch/verify_finding_nav_move.py`
Expected: `PASS`

- [ ] **Step 3: 커밋**

```bash
git add templates/index.html scratch/verify_finding_nav_move.py
git commit -m "refactor: Material Finding 사이드바 항목을 Dashboard 바로 아래로 이동"
```

---

### Task 5: Valve·Speciality를 순수 Tag 기반으로 전환 + 미매칭 Tag 수동 ISO 지정

**선행조건**: `docs/superpowers/plans/2026-07-01-material-finding-redesign.md`의 Task 1~6이 구현되어 있어야 한다 (`#mfModeItem`, `#mfItemTbody` 등 Mode C용 HTML 셸과 `isPkgIssued`/`renderPkgListCell` 헬퍼가 존재해야 함). 이 Task는 그 계획의 Task 7(Mode C)을 대체 구현한다.

**Files:**
- Modify: `static/js/app.js` (`btnFilterItem` 핸들러를 `db.receiving` 기반으로 재작성, `tag_overrides` 저장/조회 로직 추가)
- Modify: `templates/index.html` (`mfItemTable`에서 BOM Qty 컬럼 제거, ISO 지정 액션 자리 추가)
- Create (Supabase, 수동): `tag_overrides` 테이블

**Interfaces:**
- Consumes: Material Finding 계획의 `isPkgIssued`, `renderPkgListCell` (Task 1에서 정의됨)
- Produces: `saveTagOverride(tag, isoDwgNo, lineNo): Promise<void>`, 전역 캐시 `_tagOverrides`

- [ ] **Step 0: Supabase에 `tag_overrides` 테이블 생성 (SQL Editor에서 수동 실행)**

```sql
create table if not exists tag_overrides (
    tag text primary key,
    iso_dwg_no text,
    line_no text,
    updated_at timestamptz default now()
);
alter table tag_overrides enable row level security;
create policy "Public Access" on tag_overrides for all using (true) with check (true);
```

(이 프로젝트의 다른 테이블들처럼 anon key로 읽기/쓰기가 되도록 "Public Access" 정책을 반드시 추가한다 — 없으면 0행 반환.)

- [ ] **Step 1: `mfItemTable`에서 BOM Qty 컬럼 제거**

`templates/index.html`에서 (Material Finding 계획 Task 4에서 만든 `mfItemTable`):

```html
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
```

를 다음으로 교체한다 (BOM Qty 삭제, Line No 컬럼 추가).

```html
                                 <thead>
                                     <tr>
                                         <th style="text-align:center;">Tag No</th>
                                         <th style="text-align:center;">ISO Drawing</th>
                                         <th style="text-align:center;">Line No</th>
                                         <th style="text-align:center;">Category</th>
                                         <th style="text-align:center;">Description</th>
                                         <th style="text-align:center;">Unit</th>
                                         <th style="text-align:center;">Received Qty</th>
                                         <th style="text-align:center;">Stock Qty</th>
                                         <th style="text-align:center;">Packing List (PKG No)</th>
                                     </tr>
                                 </thead>
```

- [ ] **Step 2: `btnFilterItem` 핸들러를 `db.receiving` 기반으로 재작성**

Material Finding 계획 Task 7에서 만든 `btnFilterItem` 핸들러 전체(`bom_detail` 쿼리 방식)를 다음으로 교체한다.

```javascript
    let _tagOverrides = {}; // tag(upper) → { iso_dwg_no, line_no }
    let _tagOverridesLoaded = false;
    async function loadTagOverrides() {
        if (_tagOverridesLoaded || !supabaseClient) return;
        const { data } = await supabaseClient.from('tag_overrides').select('tag, iso_dwg_no, line_no');
        (data || []).forEach(r => { _tagOverrides[(r.tag || '').toUpperCase()] = r; });
        _tagOverridesLoaded = true;
    }

    async function saveTagOverride(tag, isoDwgNo, lineNo) {
        const key = tag.toUpperCase();
        const row = { tag: key, iso_dwg_no: isoDwgNo || null, line_no: lineNo || null, updated_at: new Date().toISOString() };
        const { error } = await supabaseClient.from('tag_overrides').upsert(row);
        if (error) { alert('저장 실패: ' + error.message); return false; }
        _tagOverrides[key] = row;
        return true;
    }

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

            await loadTagOverrides();

            // Tag별로 db.receiving 그룹핑 (BOM 매칭 여부 무관 — 입고 기록이 있는 모든 Tag를 대상으로 함)
            const byTag = {};
            db.receiving.filter(r => isReceivingActive(r.plNo) && r.category === cat && r.tag).forEach(r => {
                const key = r.tag.toUpperCase();
                if (!byTag[key]) byTag[key] = { tag: r.tag, records: [], pkgMap: {} };
                byTag[key].records.push(r);
                byTag[key].pkgMap[r.plNo] = (byTag[key].pkgMap[r.plNo] || 0) + (r.qty || 0);
            });

            const rows = Object.values(byTag).filter(g => {
                const sample = g.records[0];
                const bomInfo = db.bomTagMap[g.tag.toUpperCase()];
                const desc = bomInfo ? bomInfo.fullDescription : sample.desc;
                const mcItem = bomInfo ? window.extractItemFromMatCode(bomInfo.matCode) : null;
                const rowItem = (mcItem && mcItem !== '-') ? mcItem : window.extractItemFromDesc(desc || '');
                if (item !== 'All' && rowItem !== item) return false;
                if (size !== 'All') {
                    const sz = bomInfo ? window.extractSizeFromMatCode(bomInfo.matCode) : '-';
                    if (sz !== size) return false;
                }
                if (sys !== 'All' && sample.system && sample.system !== sys) return false;
                return true;
            });

            if (rows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#888;">No matching items found.</td></tr>';
                return;
            }

            tbody.innerHTML = rows.map(g => {
                const sample = g.records[0];
                const bomInfo = db.bomTagMap[g.tag.toUpperCase()];
                const override = _tagOverrides[g.tag.toUpperCase()];
                const iso = bomInfo ? (bomInfo.iso_dwg_no || '') : (override ? override.iso_dwg_no : '');
                const lineNo = override ? (override.line_no || '') : '';
                const desc = (bomInfo ? bomInfo.fullDescription : sample.desc) || '-';
                const safeDesc = desc.replace(/"/g, '&quot;');
                const received = Object.values(g.pkgMap).reduce((a, b) => a + b, 0);
                const issued = Object.entries(g.pkgMap).filter(([pkg]) => isPkgIssued(pkg)).reduce((a, [, qty]) => a + qty, 0);
                const stock = Math.max(0, received - issued);

                const isoCell = iso
                    ? `${iso}${!bomInfo ? ' <span style="font-size:10px;color:#1565c0;">(수동)</span>' : ''}`
                    : `<button class="btn btn-outline btn-small mf-assign-iso" data-tag="${g.tag}" style="font-size:11px;padding:2px 8px;">ISO 지정</button>`;

                return `<tr data-tag-row="${g.tag}">
                    <td style="text-align:center;font-weight:600;">${g.tag}</td>
                    <td style="text-align:center;" class="mf-iso-cell">${isoCell}</td>
                    <td style="text-align:center;" class="mf-lineno-cell">${lineNo || '-'}</td>
                    <td style="text-align:center;">${cat}</td>
                    <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${safeDesc}">${safeDesc}</td>
                    <td style="text-align:center;">${sample.unit || 'EA'}</td>
                    <td style="text-align:center;">${received.toFixed(2)}</td>
                    <td style="text-align:center;"><strong style="color:${stock > 0 ? '#2e7d32' : '#c62828'};">${stock.toFixed(2)}</strong></td>
                    <td style="text-align:left;font-size:11px;line-height:1.6;">${renderPkgListCell(g.pkgMap)}</td>
                </tr>`;
            }).join('');
        });
    }

    // ISO 지정 버튼 클릭 → 인라인 입력 폼으로 교체
    document.getElementById('mfItemTbody')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.mf-assign-iso');
        if (!btn) return;
        const tag = btn.dataset.tag;
        const cell = btn.closest('.mf-iso-cell');
        cell.innerHTML = `
            <input type="text" class="form-control mf-assign-iso-input" style="width:140px;display:inline-block;font-size:11px;" placeholder="ISO Drawing" list="isoDatalist">
            <button class="btn btn-primary btn-small mf-assign-iso-save" data-tag="${tag}" style="font-size:11px;padding:2px 8px;">저장</button>
        `;
    });

    document.getElementById('mfItemTbody')?.addEventListener('click', async (e) => {
        const saveBtn = e.target.closest('.mf-assign-iso-save');
        if (!saveBtn) return;
        const tag = saveBtn.dataset.tag;
        const row = saveBtn.closest('tr');
        const isoInput = row.querySelector('.mf-assign-iso-input');
        const isoVal = (isoInput?.value || '').trim();
        if (!isoVal) { alert('ISO Drawing을 입력하세요.'); return; }
        const lineNoCell = row.querySelector('.mf-lineno-cell');
        const lineNoVal = (lineNoCell?.textContent || '').trim();
        const ok = await saveTagOverride(tag, isoVal, lineNoVal === '-' ? '' : lineNoVal);
        if (ok) {
            document.getElementById('btnFilterItem')?.click();
        }
    });
```

- [ ] **Step 3: 문법 검증**

Run: `node --check static/js/app.js`
Expected: 에러 없음

- [ ] **Step 4: Playwright로 확인**

`scratch/verify_tag_override.py`를 만든다.

```python
# Valve Item 검색이 db.receiving 기반(BOM Qty 없이)으로 동작하고, 미매칭 Tag에 ISO 지정이 가능한지 확인
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

        await page.click('#btnFilterItem')
        await page.wait_for_timeout(2000)

        row_count = await page.locator('#mfItemTbody tr').count()
        assert row_count > 0, "Valve Item 검색 결과가 0개"
        header_text = await page.locator('#mfItemTable thead').inner_text()
        assert 'BOM Qty' not in header_text, "BOM Qty 컬럼이 제거되어야 함"
        print("row count:", row_count)

        # 미매칭 Tag(= "ISO 지정" 버튼이 있는 행)가 있으면 지정 플로우 확인
        assign_btn = page.locator('.mf-assign-iso').first
        if await assign_btn.count() > 0:
            await assign_btn.click()
            await page.wait_for_timeout(300)
            await page.fill('.mf-assign-iso-input', 'TEST-ISO-0001')
            await page.click('.mf-assign-iso-save')
            await page.wait_for_timeout(2000)
            row_text = await page.locator('#mfItemTbody tr').first.inner_text()
            print("after assign, first row:", row_text.replace("\n", " | "))

        assert not page_errors, f"page errors: {page_errors}"
        print("PASS")
        await browser.close()

asyncio.run(main())
```

Run: `python scratch/verify_tag_override.py`
Expected: `row count: N`, `PASS`. (미매칭 Tag가 있었다면 `tag_overrides`에 `TEST-ISO-0001` 테스트 값이 남으므로, 확인 후 Supabase에서 해당 행을 삭제해 정리한다.)

- [ ] **Step 5: 커밋**

```bash
git add templates/index.html static/js/app.js scratch/verify_tag_override.py
git commit -m "feat: Valve/Speciality를 순수 Tag 기반으로 전환, 미매칭 Tag 수동 ISO 지정 기능 추가"
```

---

### Task 6: 전체 회귀 검증

**Files:** Test only (수정 없음)

- [ ] **Step 1: 모든 검증 스크립트 재실행**

```bash
python scratch/verify_bom_matcode_merge.py
python scratch/verify_material_status_merge.py
python scratch/verify_support_nav_move.py
python scratch/verify_finding_nav_move.py
python scratch/verify_tag_override.py
```

Expected: 전부 `PASS`

- [ ] **Step 2: 전체 탭 콘솔 에러 스윕 (Material Finding 계획의 스크립트 재사용)**

Run: `python scratch/verify_full_sweep.py`

(이 스크립트의 `TARGETS` 목록에 있는 `matcode_master`, `stock_ledger`, `material_shortage`, `surplus_material`은 이번 작업으로 더 이상 존재하지 않는 data-target이므로, 실행 전 스크립트의 `TARGETS` 리스트를 다음으로 갱신해야 한다.)

```python
TARGETS = [
    "dashboard", "issue", "piping_bom",
    "rec_bulk_piping", "rec_bulk_fitting", "rec_bulk_others",
    "rec_tag_support", "rec_tag_spool", "rec_tag_valve", "rec_tag_speciality",
    "material_status", "shipping",
]
```

Expected: `console errors: []`, `page errors: []`, `PASS`

- [ ] **Step 3: 최종 커밋**

```bash
git add scratch/verify_full_sweep.py
git commit -m "test: 탭 구조 재편 전체 회귀 검증 갱신"
```

## Self-Review 결과

- **스펙 커버리지**: 설계서의 3개 섹션(사이드바 구조/서브탭 통합 방식/Valve·Speciality Tag 전환) 모두 Task 1~5에 매핑됨.
- **플레이스홀더 스캔**: TBD/TODO 없음.
- **의존성 명시**: Task 5가 Material Finding 계획의 Task 1~6에 의존함을 Global Constraints와 Task 5 선행조건에 명시함.
- **정합성**: `_bomActiveTab`(Task1), `_msActiveTab`(Task2) 등 신규 상태 변수명이 각 태스크 내에서 선언과 사용이 일치함.
