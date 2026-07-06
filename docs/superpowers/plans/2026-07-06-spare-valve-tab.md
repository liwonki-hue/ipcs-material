# Valve/Speciality Spare 탭 신설 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Valve/Speciality Receiving 데이터 중 "SPARE" 합성 태그가 붙은 예비 밸브/기기 본체(120건)를 별도 "Spare" 탭으로 분리하고, 딸린 Accessory/Fitting 부속품(17건)은 기존 탭에 남긴다.

**Architecture:** 저장 컬럼을 새로 만들지 않고 런타임 필터(`isSpareBodyRow()`)로 분류한다. 사이드바 TAG Item (Receiving) 그룹에 Support 다음 5번째 탭 `#recTagSpare`를 Valve 탭(`#recTagValve`) 마크업을 복제해 추가하고, 전용 렌더러 `renderTagSpareTable()`을 신설한다. 기존 Valve/Speciality 렌더러에는 Spare 대상 행을 제외하는 필터 한 줄만 추가한다.

**Tech Stack:** Flask + Supabase(public 스키마) + Vanilla JS SPA(`static/js/app.js`), 서버 사이드 렌더링 없음(클라이언트에서 `db.receiving` 배열을 필터링). 테스트 프레임워크 없음(프로젝트 컨벤션) — 검증은 Playwright MCP를 이용한 수동 브라우저 확인으로 대체한다.

## Global Constraints

- ipcs-material 모듈만 수정 (다른 프로젝트/레포 손대지 않음)
- UI 텍스트는 항상 영문(코드 주석은 한글)
- 저장 컬럼 추가 없음 — `receiving.purpose` 백필하지 않음, Tag 문자열 패턴(`/SPARE/i`)으로만 판별
- 분류 규칙: `category IN ('Valve','Speciality')` AND `tag`에 `SPARE` 포함 AND `full_description`이 `ACCESSORY_RE`에 매칭되지 않음 → Spare / 매칭되면 Accessory(기존 탭에 잔류)
- Material Status(Stock/Material Summary)·Dashboard에는 반영하지 않음 — TAG Item (Receiving) 목록 화면 전용
- 검증 기준값(현재 데이터): Spare 120건, Accessory 17건 (전부 category='Valve', Speciality는 현재 0건)

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `static/js/app.js` | `ACCESSORY_RE`/`isSpareBodyRow()` 공용화, 기존 Valve/Speciality 렌더러에 Spare 제외 필터 추가, 신규 `renderTagSpareTable()` + 필터 옵션 채움 + 탭 배선 + Export 추가 |
| `templates/index.html` | 사이드바 nav-item 1줄 추가, `#recTagSpare` 패널 신규(Valve 패널 마크업 복제) |

---

### Task 1: `ACCESSORY_RE` 공용 상수화 + `isSpareBodyRow()` 헬퍼 추가

**Files:**
- Modify: `static/js/app.js:97` (신규 코드 삽입 지점, `ITEM_PREFIX_MAP` 정의 직후)
- Modify: `static/js/app.js:888-891` (기존 지역 변수 제거)

**Interfaces:**
- Produces: 모듈 top-level `const ACCESSORY_RE`, 함수 `isSpareBodyRow(r)` — 이후 모든 Task에서 사용.

- [ ] **Step 1: `ITEM_PREFIX_MAP` 정의 직후(현재 97번째 줄, `};` 다음)에 공용 상수/헬퍼 삽입**

`static/js/app.js`에서 다음 코드를 찾는다(`ITEM_PREFIX_MAP` 정의의 마지막 부분):

```js
    'GASKET':['GSKT','GSK'], 'STUD BOLT':['STB'], 'NUT':['NUT'], 'BOLT':['BOL'],
    'UNION':['UNI'], 'PLUG':['PLG'], 'BUSHING':['BUS'],
};
```

바로 뒤에 다음을 추가한다:

```js

// Valve/Speciality 부속품/스페어파트 판별 정규식 — updateCategoryCharts()의 Speciality 집계와
// Spare 탭 분류에서 공유 (2026-07-06 모듈 top-level로 승격)
const ACCESSORY_RE = /STUD BOLT|SUTD BOLT|NUT |GASKET|FLANGE|BODY |PACKING SET|PACKING GUIDE|STEM PACKING|SPARE PARTS|SPECIAL TOOLS|BLIND FLANGE|BONNET GASKET|TRIM PARTS|SCREW|WASHER|SLEEVE|SPACER|O-RING|PLUG M|SPRING |SEAT COVER|COVER HOLDER|SLOTTED NUT|LOCK WASHER|STUD :|PIPE |B16\.5|GASKET KIT|PRESSURE SEAL|STEM GUIDE|BALANCE SEAL|PISTON RING|WAVE SPRING|DUMMY BONNET|DUMMY CAGE|DUMMY SEAT|FLUSHING|HYDRO TEST|EYE BOLT|BLOW OUT|BLOW THROUGH|TEST PRESSURE|HINGE PIN|SEAL RING| RING FOR|PIN RING/;

// Valve/Speciality Receiving 중 "SPARE" 합성 태그가 붙은 예비 밸브/기기 본체 판별
// (Accessory/Fitting 부속품은 false — 기존 탭 제외 필터 및 Spare 탭 분류에서 공유)
function isSpareBodyRow(r) {
    if (r.category !== 'Valve' && r.category !== 'Speciality') return false;
    if (!/SPARE/i.test(r.tag || '')) return false;
    return !ACCESSORY_RE.test((r.desc || '').toUpperCase());
}
```

- [ ] **Step 2: `updateCategoryCharts()` 안의 지역 변수 제거**

같은 파일에서 다음 3줄을 찾는다(`updateCategoryCharts()` 내부, Step 1에서 승격한 것과 동일한 정규식):

```js
        // Speciality: B0/B1/B2- 형식 tag만 + 부속 아이템(플랜지/볼트/가스켓 등) 제외
        // 부속품/스페어파트 정규식 (단일 pass로 모든 키워드 검사)
        const ACCESSORY_RE = /STUD BOLT|SUTD BOLT|NUT |GASKET|FLANGE|BODY |PACKING SET|PACKING GUIDE|STEM PACKING|SPARE PARTS|SPECIAL TOOLS|BLIND FLANGE|BONNET GASKET|TRIM PARTS|SCREW|WASHER|SLEEVE|SPACER|O-RING|PLUG M|SPRING |SEAT COVER|COVER HOLDER|SLOTTED NUT|LOCK WASHER|STUD :|PIPE |B16\.5|GASKET KIT|PRESSURE SEAL|STEM GUIDE|BALANCE SEAL|PISTON RING|WAVE SPRING|DUMMY BONNET|DUMMY CAGE|DUMMY SEAT|FLUSHING|HYDRO TEST|EYE BOLT|BLOW OUT|BLOW THROUGH|TEST PRESSURE|HINGE PIN|SEAL RING| RING FOR|PIN RING/;
```

`// Speciality: ...` 주석 줄은 남기고, `// 부속품/스페어파트 정규식...` 주석과 `const ACCESSORY_RE = ...` 줄만 삭제한다(아래에서 여전히 `ACCESSORY_RE.test(desc)`를 호출하는 코드는 그대로 두면 Step 1에서 승격한 top-level 상수를 그대로 참조하게 된다).

- [ ] **Step 3: 브라우저 콘솔로 회귀 확인**

`python app.py` 실행 후 브라우저에서 Dashboard를 열고 개발자 콘솔에 에러가 없는지 확인한다(특히 `ACCESSORY_RE is not defined` 같은 참조 에러가 없어야 함 — Speciality KPI 카드 값이 이전과 동일하게 나오면 정상).

- [ ] **Step 4: Commit**

```bash
git add static/js/app.js
git commit -m "refactor: ACCESSORY_RE를 모듈 top-level로 승격, isSpareBodyRow 헬퍼 추가"
```

---

### Task 2: 기존 Valve/Speciality 탭에서 Spare 대상 행 제외

**Files:**
- Modify: `static/js/app.js:3941-3972` (`renderTagValveTable`)
- Modify: `static/js/app.js:3753-3775` (`_renderRecvCore`, Speciality 탭이 사용)

**Interfaces:**
- Consumes: Task 1의 `isSpareBodyRow(r)`

- [ ] **Step 1: `renderTagValveTable()`에 제외 필터 추가**

다음 코드를 찾는다:

```js
    const data = db.receiving.filter(r => {
        if (r.category !== 'Valve') return false;
        const item = window.extractItemFromDesc(r.valveType);
```

다음으로 교체한다:

```js
    const data = db.receiving.filter(r => {
        if (r.category !== 'Valve') return false;
        if (isSpareBodyRow(r)) return false; // Spare 예비 밸브 본체는 별도 Spare 탭에서 관리
        const item = window.extractItemFromDesc(r.valveType);
```

- [ ] **Step 2: `_renderRecvCore()`에 제외 필터 추가 (Speciality 탭 등에 공용 적용)**

다음 코드를 찾는다:

```js
    const data = db.receiving.filter(r => {
        const matchSearch  = !search || (r.matCode||'').toUpperCase().includes(search) || r.plNo.toUpperCase().includes(search) || (r.category||'').toUpperCase().includes(search) || r.desc.toUpperCase().includes(search);
        const matchDoc     = doc  === 'All' || r.docNo === doc;
```

다음으로 교체한다:

```js
    const data = db.receiving.filter(r => {
        if (isSpareBodyRow(r)) return false; // Spare 예비 본체는 별도 Spare 탭에서 관리
        const matchSearch  = !search || (r.matCode||'').toUpperCase().includes(search) || r.plNo.toUpperCase().includes(search) || (r.category||'').toUpperCase().includes(search) || r.desc.toUpperCase().includes(search);
        const matchDoc     = doc  === 'All' || r.docNo === doc;
```

(`_renderRecvCore`는 Pipe/Fitting/Others/Speciality가 공유하지만 `isSpareBodyRow`가 Valve/Speciality 카테고리가 아니면 즉시 `false`를 반환하므로 다른 카테고리 동작에는 영향 없음.)

- [ ] **Step 3: 수동 검증 — Valve 탭 행 수 감소 확인**

`python app.py` 실행 후 브라우저에서 Valve 탭을 열고 개발자 콘솔에서:

```js
db.receiving.filter(r => r.category === 'Valve' && isSpareBodyRow(r)).length
```

결과가 `120`인지 확인한다. 이어서 필터 없이 Valve 탭 페이지네이션 마지막 페이지로 이동해 총 건수가 기존 대비 120건 줄었는지 확인한다(정확한 총 건수는 Data Health/Export 등에서 카테고리 합계로 대조 가능).

- [ ] **Step 4: Commit**

```bash
git add static/js/app.js
git commit -m "fix: Valve/Speciality 탭에서 Spare 예비 본체 120건 제외"
```

---

### Task 3: HTML — 사이드바 nav-item + `#recTagSpare` 패널

**Files:**
- Modify: `templates/index.html:54` (사이드바)
- Modify: `templates/index.html:1155` (`#recSecTag` 안, Support 패널 뒤)

**Interfaces:**
- Produces: DOM id들 — `recTagSpare`, `sprItemSearch`, `sprDocFilter`, `sprPkgFilter`, `sprOpTypeFilter`, `sprItemFilter`, `sprMat1Filter`, `sprMat2Filter`, `sprSizeFilter`, `sprStatusFilter`, `btnFilterSpr`, `btnExportSpr`, `sprTable`, `sprPagination` — Task 4/5/6의 JS가 이 id들을 그대로 사용한다.

- [ ] **Step 1: 사이드바에 Spare nav-item 추가**

다음 줄을 찾는다:

```html
                 <div class="nav-item" data-target="rec_tag_support"><i class="fas fa-tools"></i> Support</div>
```

바로 뒤에 추가한다:

```html
                 <div class="nav-item" data-target="rec_tag_spare"><i class="fas fa-box-archive"></i> Spare</div>
```

- [ ] **Step 2: `#recTagSpare` 패널 추가 (Valve 패널 복제)**

다음 줄을 찾는다:

```html
                    </div><!-- end recTagSupport -->
                </div><!-- end recSecTag -->
```

`</div><!-- end recTagSupport -->` 바로 뒤, `</div><!-- end recSecTag -->` 앞에 다음 블록을 삽입한다:

```html

                    <!-- Spare tab -->
                    <div id="recTagSpare" style="display:none;">
                        <div class="panel filter-panel" style="margin-bottom:20px;">
                            <div style="display:flex;align-items:flex-end;justify-content:space-between;width:100%;gap:10px;flex-wrap:nowrap;">
                                <div style="display:flex;align-items:flex-end;gap:10px;flex:1;min-width:0;">
                                    <div class="form-group" style="flex:2;min-width:0;margin-bottom:0;">
                                        <label>Search</label>
                                        <input type="text" id="sprItemSearch" class="form-control" style="width:100%;" placeholder="Search by Item, Description...">
                                    </div>
                                    <div class="form-group" style="flex:1;min-width:0;margin-bottom:0;">
                                        <label>PKG</label>
                                        <select id="sprDocFilter" class="form-control" style="width:100%;"><option value="All">All DOCs</option></select>
                                    </div>
                                    <div class="form-group" style="flex:1;min-width:0;margin-bottom:0;">
                                        <label>PKG NO</label>
                                        <select id="sprPkgFilter" class="form-control" style="width:100%;"><option value="All">All PKGs</option></select>
                                    </div>
                                    <div class="form-group" style="flex:1;min-width:0;margin-bottom:0;">
                                        <label>Operation Type</label>
                                        <select id="sprOpTypeFilter" class="form-control" style="width:100%;"><option value="All">All Op. Types</option></select>
                                    </div>
                                    <div class="form-group" style="flex:1;min-width:0;margin-bottom:0;">
                                        <label>Item</label>
                                        <select id="sprItemFilter" class="form-control" style="width:100%;"><option value="All">All Items</option></select>
                                    </div>
                                    <div class="form-group" style="flex:1;min-width:0;margin-bottom:0;">
                                        <label>Mat 1</label>
                                        <select id="sprMat1Filter" class="form-control" style="width:100%;"><option value="All">All Mat 1</option></select>
                                    </div>
                                    <div class="form-group" style="flex:1;min-width:0;margin-bottom:0;">
                                        <label>Mat 2</label>
                                        <select id="sprMat2Filter" class="form-control" style="width:100%;"><option value="All">All Mat 2</option></select>
                                    </div>
                                    <div class="form-group" style="flex:1;min-width:0;margin-bottom:0;">
                                        <label>Size</label>
                                        <select id="sprSizeFilter" class="form-control" style="width:100%;"><option value="All">All Sizes</option></select>
                                    </div>
                                    <div class="form-group" style="flex:1;min-width:0;">
                                        <label>Status</label>
                                        <select id="sprStatusFilter" class="form-control" style="width:100%;">
                                            <option value="All">All Status</option>
                                            <option value="Preparing">Preparing</option>
                                            <option value="Shipping">Shipping</option>
                                            <option value="On-Site">On-Site</option>
                                        </select>
                                    </div>
                                    <div style="padding-bottom:1px;flex-shrink:0;">
                                        <button class="btn btn-primary" id="btnFilterSpr" style="white-space:nowrap;"><i class="fas fa-search"></i> Search</button>
                                    </div>
                                </div>
                                <div style="display:flex;gap:8px;align-items:flex-end;padding-bottom:1px;">
                                    <button class="btn btn-outline" id="btnExportSpr" style="white-space:nowrap;display:flex;align-items:center;gap:6px;"><i class="fas fa-file-excel" style="color:#1d6f42;"></i> Export Excel</button>
                                </div>
                            </div>
                        </div>
                        <div class="panel data-panel">
                            <div class="panel-header"><h3>Spare Receiving</h3></div>
                            <div class="table-responsive">
                                <table class="data-table" id="sprTable">
                                    <thead>
                                        <tr>
                                            <th style="width:120px;">PKG</th><th style="width:220px;">PKG NO</th>
                                            <th style="width:170px;">TAG NO</th>
                                            <th style="width:90px;">Operation Type</th>
                                            <th style="width:190px;">Valve Type</th>
                                            <th style="width:120px;">Item</th>
                                            <th style="width:90px;">Mat 1</th>
                                            <th style="width:100px;">Mat 2</th>
                                            <th style="width:65px;">Size</th>
                                            <th style="width:70px;">Rating</th>
                                            <th style="width:60px;">Unit</th>
                                            <th style="width:60px;">Qty</th>
                                            <th style="width:80px;">Status</th>
                                            <th style="width:110px;">Purpose</th>
                                        </tr>
                                    </thead>
                                    <tbody></tbody>
                                </table>
                            </div>
                            <div id="sprPagination"></div>
                        </div>
                    </div><!-- end recTagSpare -->
```

- [ ] **Step 2: Commit**

```bash
git add templates/index.html
git commit -m "feat: Spare 탭 HTML 패널 추가 (Valve 탭 구조 복제)"
```

---

### Task 4: JS 탭 배선 (사이드바 라우팅, 섹션 토글, 페이지네이션 상태)

**Files:**
- Modify: `static/js/app.js:599-607` (`REC_TAB_MAP`)
- Modify: `static/js/app.js:3885-3888` (`_recActiveTagTab` 주석 + 페이지 상태 변수)
- Modify: `static/js/app.js:4020-4031` (`renderActiveReceivingTab`)
- Modify: `static/js/app.js:4033-4062` (`switchReceivingTab`)
- Modify: `static/js/app.js:4098-4111` (`initReceivingTabs` 내 tag-tab-btn 핸들러)
- Modify: `static/js/app.js:4117-4125` (필터 버튼 + go-page 함수)

**Interfaces:**
- Consumes: Task 3의 DOM id `recTagSpare`, `btnFilterSpr`
- Produces: `currentSprPage`(let, page 상태), `window._sprGoPage(p)` — Task 5의 `renderTagSpareTable()`이 이 상태 변수를 읽는다.

- [ ] **Step 1: `REC_TAB_MAP`에 Spare 추가**

다음을 찾는다:

```js
    const REC_TAB_MAP = {
        rec_bulk_piping:    { sec: 'bulk', tab: 'piping' },
        rec_bulk_fitting:   { sec: 'bulk', tab: 'fitting' },
        rec_bulk_others:    { sec: 'bulk', tab: 'others' },
        rec_tag_spool:      { sec: 'tag',  tab: 'spool' },
        rec_tag_valve:      { sec: 'tag',  tab: 'valve' },
        rec_tag_speciality: { sec: 'tag',  tab: 'speciality' },
        rec_tag_support:    { sec: 'tag',  tab: 'support' },
    };
```

다음으로 교체한다:

```js
    const REC_TAB_MAP = {
        rec_bulk_piping:    { sec: 'bulk', tab: 'piping' },
        rec_bulk_fitting:   { sec: 'bulk', tab: 'fitting' },
        rec_bulk_others:    { sec: 'bulk', tab: 'others' },
        rec_tag_spool:      { sec: 'tag',  tab: 'spool' },
        rec_tag_valve:      { sec: 'tag',  tab: 'valve' },
        rec_tag_speciality: { sec: 'tag',  tab: 'speciality' },
        rec_tag_support:    { sec: 'tag',  tab: 'support' },
        rec_tag_spare:      { sec: 'tag',  tab: 'spare' },
    };
```

- [ ] **Step 2: 페이지 상태 변수 추가 + 주석 갱신**

다음을 찾는다:

```js
let _recActiveTagTab  = 'spool';  // 'spool' | 'valve' | 'speciality' | 'support'
let currentOthPage = 1;
let currentValPage = 1;
let currentSplPage = 1;
```

다음으로 교체한다:

```js
let _recActiveTagTab  = 'spool';  // 'spool' | 'valve' | 'speciality' | 'support' | 'spare'
let currentOthPage = 1;
let currentValPage = 1;
let currentSplPage = 1;
let currentSprPage = 1;
```

- [ ] **Step 3: `renderActiveReceivingTab()`에 spare 분기 추가**

다음을 찾는다:

```js
        if (_recActiveTagTab === 'spool') initSpoolReceiving();
        else if (_recActiveTagTab === 'valve') renderTagValveTable();
        else if (_recActiveTagTab === 'speciality') renderTagSpecialityTable();
        else if (_recActiveTagTab === 'support') { renderSupportReceivingTable(); renderSupportBulkTable(); }
```

다음으로 교체한다:

```js
        if (_recActiveTagTab === 'spool') initSpoolReceiving();
        else if (_recActiveTagTab === 'valve') renderTagValveTable();
        else if (_recActiveTagTab === 'speciality') renderTagSpecialityTable();
        else if (_recActiveTagTab === 'support') { renderSupportReceivingTable(); renderSupportBulkTable(); }
        else if (_recActiveTagTab === 'spare') renderTagSpareTable();
```

- [ ] **Step 4: `switchReceivingTab()`에 recTagSpare 토글 추가**

다음을 찾는다:

```js
        const sp = document.getElementById('recTagSpool');
        const vl = document.getElementById('recTagValve');
        const sl = document.getElementById('recTagSpeciality');
        const su = document.getElementById('recTagSupport');
        if (sp) sp.style.display = tab === 'spool'      ? '' : 'none';
        if (vl) vl.style.display = tab === 'valve'      ? '' : 'none';
        if (sl) sl.style.display = tab === 'speciality' ? '' : 'none';
        if (su) su.style.display = tab === 'support'    ? '' : 'none';
    }
```

다음으로 교체한다:

```js
        const sp = document.getElementById('recTagSpool');
        const vl = document.getElementById('recTagValve');
        const sl = document.getElementById('recTagSpeciality');
        const su = document.getElementById('recTagSupport');
        const sr = document.getElementById('recTagSpare');
        if (sp) sp.style.display = tab === 'spool'      ? '' : 'none';
        if (vl) vl.style.display = tab === 'valve'      ? '' : 'none';
        if (sl) sl.style.display = tab === 'speciality' ? '' : 'none';
        if (su) su.style.display = tab === 'support'    ? '' : 'none';
        if (sr) sr.style.display = tab === 'spare'      ? '' : 'none';
    }
```

- [ ] **Step 5: `initReceivingTabs()`의 tag-tab-btn 핸들러에 recTagSpare 토글 추가**

다음을 찾는다:

```js
            document.getElementById('recTagSpool').style.display      = _recActiveTagTab === 'spool'      ? '' : 'none';
            document.getElementById('recTagValve').style.display      = _recActiveTagTab === 'valve'      ? '' : 'none';
            document.getElementById('recTagSpeciality').style.display = _recActiveTagTab === 'speciality' ? '' : 'none';
            document.getElementById('recTagSupport').style.display    = _recActiveTagTab === 'support'    ? '' : 'none';
            renderActiveReceivingTab();
        });
    });

    // Filter buttons
```

다음으로 교체한다:

```js
            document.getElementById('recTagSpool').style.display      = _recActiveTagTab === 'spool'      ? '' : 'none';
            document.getElementById('recTagValve').style.display      = _recActiveTagTab === 'valve'      ? '' : 'none';
            document.getElementById('recTagSpeciality').style.display = _recActiveTagTab === 'speciality' ? '' : 'none';
            document.getElementById('recTagSupport').style.display    = _recActiveTagTab === 'support'    ? '' : 'none';
            document.getElementById('recTagSpare').style.display      = _recActiveTagTab === 'spare'      ? '' : 'none';
            renderActiveReceivingTab();
        });
    });

    // Filter buttons
```

- [ ] **Step 6: 필터 버튼 핸들러 + go-page 함수 추가**

다음을 찾는다:

```js
    document.getElementById('btnFilterVal')?.addEventListener('click', () => { currentValPage = 1; renderTagValveTable(); });
    document.getElementById('btnFilterSpl')?.addEventListener('click', () => { currentSplPage = 1; renderTagSpecialityTable(); });
}

window._plGoPage  = function(p) { currentPlPage  = p; renderBulkPipingTable(); };
window._fitGoPage = function(p) { currentFitPage = p; renderBulkFittingTable(); };
window._othGoPage = function(p) { currentOthPage = p; renderBulkOthersTable(); };
window._valGoPage = function(p) { currentValPage = p; renderTagValveTable(); };
window._splGoPage = function(p) { currentSplPage = p; renderTagSpecialityTable(); };
```

다음으로 교체한다:

```js
    document.getElementById('btnFilterVal')?.addEventListener('click', () => { currentValPage = 1; renderTagValveTable(); });
    document.getElementById('btnFilterSpl')?.addEventListener('click', () => { currentSplPage = 1; renderTagSpecialityTable(); });
    document.getElementById('btnFilterSpr')?.addEventListener('click', () => { currentSprPage = 1; renderTagSpareTable(); });
}

window._plGoPage  = function(p) { currentPlPage  = p; renderBulkPipingTable(); };
window._fitGoPage = function(p) { currentFitPage = p; renderBulkFittingTable(); };
window._othGoPage = function(p) { currentOthPage = p; renderBulkOthersTable(); };
window._valGoPage = function(p) { currentValPage = p; renderTagValveTable(); };
window._splGoPage = function(p) { currentSplPage = p; renderTagSpecialityTable(); };
window._sprGoPage = function(p) { currentSprPage = p; renderTagSpareTable(); };
```

- [ ] **Step 7: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Spare 탭 라우팅/토글/페이지 상태 배선"
```

(주의: 이 시점까지는 `renderTagSpareTable`이 아직 정의되지 않아 사이드바에서 Spare 클릭 시 콘솔 에러가 난다 — Task 5에서 해소됨. 커밋은 남기되, 브라우저 확인은 Task 5 완료 후 진행.)

---

### Task 5: `renderTagSpareTable()` 렌더러 + 필터 옵션 채움

**Files:**
- Modify: `static/js/app.js` (Valve/Speciality 렌더러 정의부 근처, `renderTagSpecialityTable()` 함수 뒤에 추가)
- Modify: `static/js/app.js:2902-3169` (`initFilterOptions()`, Speciality Filters 블록 뒤에 추가)

**Interfaces:**
- Consumes: Task 1의 `isSpareBodyRow(r)`, Task 4의 `currentSprPage`/`window._sprGoPage`, Task 3의 DOM id들
- Produces: `renderTagSpareTable()` — Task 4의 `renderActiveReceivingTab()`/필터 버튼이 호출

- [ ] **Step 1: `renderTagSpareTable()` 함수 추가**

다음 함수 정의를 찾는다:

```js
function renderTagSpecialityTable() {
    _renderRecvCore({
        tableId: 'splTable', searchId: 'splItemSearch',
        docId: 'splDocFilter', pkgId: 'splPkgFilter', statusId: 'splStatusFilter',
        itemId: 'splItemFilter', sizeId: 'splSizeFilter',
        forcedCats: ['Speciality'],
        hideMatCode: true,
        hideCat: true,
        getPage: () => currentSplPage,
        paginationId: 'splPagination', goPageFn: '_splGoPage'
    });
}
```

바로 뒤에 다음 함수를 추가한다:

```js

// Spare Receiving — Valve/Speciality의 SPARE 합성 태그 예비 밸브/기기 본체만 모아서 별도 관리.
// TAG NO 컬럼은 실제 합성 태그 대신 고정 텍스트 "Spare"로 표시한다.
function renderTagSpareTable() {
    const tbody = document.querySelector('#sprTable tbody');
    if (!tbody) return;

    const search   = (document.getElementById('sprItemSearch')?.value || '').trim().toUpperCase();
    const doc      = document.getElementById('sprDocFilter')?.value    || 'All';
    const pkg      = document.getElementById('sprPkgFilter')?.value    || 'All';
    const opTypeF  = document.getElementById('sprOpTypeFilter')?.value || 'All';
    const itemF    = document.getElementById('sprItemFilter')?.value   || 'All';
    const mat1F    = document.getElementById('sprMat1Filter')?.value   || 'All';
    const mat2F    = document.getElementById('sprMat2Filter')?.value   || 'All';
    const sizeF    = document.getElementById('sprSizeFilter')?.value   || 'All';
    const statusF  = document.getElementById('sprStatusFilter')?.value || 'All';

    const data = db.receiving.filter(r => {
        if (!isSpareBodyRow(r)) return false;
        const item = window.extractItemFromDesc(r.valveType);
        const matchSearch = !search
            || (r.valveType || '').toUpperCase().includes(search)
            || (r.desc || '').toUpperCase().includes(search);
        const matchDoc    = doc === 'All' || r.docNo === doc;
        const matchPkg    = pkg === 'All' || r.plNo  === pkg;
        const matchOpType = opTypeF === 'All' || r.opType === opTypeF;
        const matchItemF  = itemF === 'All' || item === itemF;
        const matchMat1F  = mat1F === 'All' || r.mat1 === mat1F;
        const matchMat2F  = mat2F === 'All' || r.mat2 === mat2F;
        const matchSizeF  = sizeF === 'All' || r.size === sizeF;
        const pkgSt       = (_plUpdatesCache[r.plNo] || {}).status || '';
        const matchStatusF = statusF === 'All' || pkgSt === statusF;
        return matchSearch && matchDoc && matchPkg && matchOpType && matchItemF && matchMat1F && matchMat2F && matchSizeF && matchStatusF;
    }).sort((a, b) => a.docNo.localeCompare(b.docNo) || a.plNo.localeCompare(b.plNo));

    const page = currentSprPage;
    const rows = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(r => {
        const item = window.extractItemFromDesc(r.valveType);
        const pkgStatus  = (_plUpdatesCache[r.plNo] || {}).status || '';
        const isOnSite   = pkgStatus === 'On-Site';
        const statusColor = pkgStatus === 'On-Site' ? '#2e7d32' : pkgStatus === 'Shipping' ? '#1565c0' : pkgStatus === 'Preparing' ? '#888' : '#bbb';
        const purposeOpts = PURPOSE_OPTS.map(v =>
            `<option value="${v}"${r.purpose === v ? ' selected' : ''}>${v || '—'}</option>`
        ).join('');
        const purposeSel = `<select class="pl-purpose-sel" data-recv-id="${r.id}"
            style="width:100%;border:1px solid #dde3ee;border-radius:4px;padding:3px 6px;font-size:12px;background:#fff;color:#0A2540;text-align:center;">
            ${purposeOpts}</select>`;
        return `<tr${isOnSite ? '' : ' style="color:#999;"'}>
            <td style="text-align:center;white-space:nowrap;">${r.docNo}</td>
            <td style="text-align:center;white-space:nowrap;">${r.plNo}</td>
            <td style="text-align:center;">Spare</td>
            <td style="text-align:center;white-space:nowrap;">${r.opType}</td>
            <td style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.valveType || ''}">${r.valveType}</td>
            <td style="text-align:center;font-weight:600;white-space:nowrap;">${item}</td>
            <td style="text-align:center;">${r.mat1}</td>
            <td style="text-align:center;">${r.mat2}</td>
            <td style="text-align:center;font-weight:600;">${r.size}</td>
            <td style="text-align:center;">${r.rating}</td>
            <td style="white-space:nowrap;text-align:center;">${r.unit || 'EA'}</td>
            <td style="white-space:nowrap;text-align:center;">${Math.round(r.qty).toLocaleString()}</td>
            <td style="text-align:center;white-space:nowrap;font-weight:600;color:${statusColor};">${pkgStatus || '—'}</td>
            <td style="text-align:center;padding:3px;">${purposeSel}</td>
        </tr>`;
    });
    tbody.innerHTML = rows.join('');
    renderPagination('sprPagination', page, Math.max(1, Math.ceil(data.length / PAGE_SIZE)), '_sprGoPage');
}
```

(Valve 탭과 달리 Search는 Tag가 아닌 Valve Type/Description만 대상으로 한다 — TAG NO가 항상 "Spare"로 고정 표시되므로 실제 합성 Tag로 검색할 이유가 없고, 대신 PKG NO 필터/검색으로 원본 패키지를 찾을 수 있다.)

- [ ] **Step 2: `initFilterOptions()`에 Spare 필터 옵션 채움 추가**

다음 블록을 찾는다(Speciality Filters, `initFilterOptions()` 함수의 마지막 부분):

```js
    const splSizeEl = document.getElementById('splSizeFilter');
    if (splSizeEl) {
        const sizes = [...new Set(recByCat.Speciality.map(_tagSize).filter(v => v && v !== '-'))]
            .sort((a, b) => parseFloat(a) - parseFloat(b));
        splSizeEl.innerHTML = '<option value="All">All Sizes</option>'
            + sizes.map(s => `<option value="${s.replace(/"/g,'&quot;')}">${s}</option>`).join('');
    }

}
```

다음으로 교체한다:

```js
    const splSizeEl = document.getElementById('splSizeFilter');
    if (splSizeEl) {
        const sizes = [...new Set(recByCat.Speciality.map(_tagSize).filter(v => v && v !== '-'))]
            .sort((a, b) => parseFloat(a) - parseFloat(b));
        splSizeEl.innerHTML = '<option value="All">All Sizes</option>'
            + sizes.map(s => `<option value="${s.replace(/"/g,'&quot;')}">${s}</option>`).join('');
    }

    // Spare Filters — Valve/Speciality의 SPARE 합성 태그 예비 본체만 별도 집계
    const spareRows = db.receiving.filter(r => isReceivingActive(r.plNo) && isSpareBodyRow(r));
    const sprDoc = document.getElementById('sprDocFilter'), sprPkg = document.getElementById('sprPkgFilter');
    if (sprDoc && sprPkg) setDocPkg(sprDoc, sprPkg, spareRows);
    const sprItemEl = document.getElementById('sprItemFilter');
    if (sprItemEl) {
        const items = [...new Set(spareRows.map(r => window.extractItemFromDesc(r.valveType)).filter(v => v && v !== '-'))].sort();
        sprItemEl.innerHTML = '<option value="All">All Items</option>'
            + items.map(i => `<option value="${i.replace(/"/g,'&quot;')}">${i}</option>`).join('');
    }
    const sprSizeEl = document.getElementById('sprSizeFilter');
    if (sprSizeEl) {
        const sizes = [...new Set(spareRows.map(r => r.size).filter(v => v && v !== '-'))]
            .sort((a, b) => parseFloat(a) - parseFloat(b));
        sprSizeEl.innerHTML = '<option value="All">All Sizes</option>'
            + sizes.map(s => `<option value="${s.replace(/"/g,'&quot;')}">${s}</option>`).join('');
    }
    const sprOpTypeEl = document.getElementById('sprOpTypeFilter');
    if (sprOpTypeEl) {
        const opTypes = [...new Set(spareRows.map(r => r.opType).filter(v => v && v !== '-'))].sort();
        sprOpTypeEl.innerHTML = '<option value="All">All Op. Types</option>'
            + opTypes.map(o => `<option value="${o.replace(/"/g,'&quot;')}">${o}</option>`).join('');
    }
    const sprMat1El = document.getElementById('sprMat1Filter');
    if (sprMat1El) {
        const mat1s = [...new Set(spareRows.map(r => r.mat1).filter(v => v && v !== '-'))].sort();
        sprMat1El.innerHTML = '<option value="All">All Mat 1</option>'
            + mat1s.map(m => `<option value="${m.replace(/"/g,'&quot;')}">${m}</option>`).join('');
    }
    const sprMat2El = document.getElementById('sprMat2Filter');
    if (sprMat2El) {
        const mat2s = [...new Set(spareRows.map(r => r.mat2).filter(v => v && v !== '-'))].sort();
        sprMat2El.innerHTML = '<option value="All">All Mat 2</option>'
            + mat2s.map(m => `<option value="${m.replace(/"/g,'&quot;')}">${m}</option>`).join('');
    }

}
```

- [ ] **Step 3: 수동 검증 (Playwright)**

`python app.py` 실행 후 브라우저에서:
1. 사이드바 TAG Item (Receiving) → Spare 클릭 → 테이블에 데이터가 로드되는지(로딩 상태로 멈추지 않는지) 확인
2. TAG NO 컬럼이 모든 행에서 "Spare"로 표시되는지 확인
3. 필터 없이 페이지네이션을 마지막 페이지까지 넘겨 총 120건(5페이지, PAGE_SIZE=25)인지 확인
4. Search/PKG/PKG NO/Operation Type/Item/Mat 1/Mat 2/Size/Status 필터를 하나씩 선택해 결과가 줄어드는지 확인(정상 동작이면 충분, 개수 재계산까지는 불필요)
5. 개발자 콘솔에 에러 없는지 확인

- [ ] **Step 4: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Spare 탭 렌더러 및 필터 옵션 구현"
```

---

### Task 6: Spare 탭 Export Excel

**Files:**
- Modify: `static/js/app.js` (`attachEventListeners()` 내, `btnExportVal` 핸들러 뒤)

**Interfaces:**
- Consumes: Task 1의 `isSpareBodyRow(r)`, 기존 `_exportTagRecvRows(rows, sheetName, filenamePrefix)` 헬퍼(수정하지 않고 그대로 재사용)
- Produces: 없음(버튼 클릭 시 파일 다운로드로 끝나는 leaf 기능)

- [ ] **Step 1: `_buildSpareExportRows()` + `btnExportSpr` 핸들러 추가**

다음 블록을 찾는다:

```js
    const btnExportVal = document.getElementById('btnExportVal');
    if (btnExportVal) {
        btnExportVal.addEventListener('click', () => {
            const rows = _buildTagRecvExportRows({
                searchId: 'valItemSearch', docId: 'valDocFilter', pkgId: 'valPkgFilter',
                itemId: 'valItemFilter', sizeId: 'valSizeFilter', statusId: 'valStatusFilter',
                forcedCat: 'Valve',
            });
            _exportTagRecvRows(rows, 'Valve', 'Valve_Receiving');
        });
    }

    const btnExportSpl = document.getElementById('btnExportSpl');
```

다음으로 교체한다:

```js
    const btnExportVal = document.getElementById('btnExportVal');
    if (btnExportVal) {
        btnExportVal.addEventListener('click', () => {
            const rows = _buildTagRecvExportRows({
                searchId: 'valItemSearch', docId: 'valDocFilter', pkgId: 'valPkgFilter',
                itemId: 'valItemFilter', sizeId: 'valSizeFilter', statusId: 'valStatusFilter',
                forcedCat: 'Valve',
            });
            _exportTagRecvRows(rows, 'Valve', 'Valve_Receiving');
        });
    }

    // Spare는 MatCode가 없고 표시 컬럼(Operation Type/Valve Type/Mat 1/Mat 2)이 Valve 화면과 동일하므로
    // MatCode 기반 _buildTagRecvExportRows 대신 화면 표시값을 그대로 내보낸다.
    function _buildSpareExportRows() {
        return db.receiving.filter(r => isSpareBodyRow(r)).map(r => {
            const pkgStatus = (_plUpdatesCache[r.plNo] || {}).status || '-';
            return {
                'PKG':     r.docNo || '-',
                'PKG NO':  r.plNo  || '-',
                'TAG NO':  'Spare',
                'Operation Type': r.opType || '-',
                'Valve Type': r.valveType || '-',
                'Item':    window.extractItemFromDesc(r.valveType),
                'Mat 1':   r.mat1 || '-',
                'Mat 2':   r.mat2 || '-',
                'Size':    r.size || '-',
                'Rating':  r.rating || '-',
                'Unit':    r.unit || 'EA',
                'Qty':     r.qty || 0,
                'Status':  pkgStatus,
                'Purpose': r.purpose || '-',
            };
        });
    }

    const btnExportSpr = document.getElementById('btnExportSpr');
    if (btnExportSpr) {
        btnExportSpr.addEventListener('click', () => {
            _exportTagRecvRows(_buildSpareExportRows(), 'Spare', 'Spare_Receiving');
        });
    }

    const btnExportSpl = document.getElementById('btnExportSpl');
```

- [ ] **Step 2: 수동 검증**

Spare 탭에서 Export Excel 클릭 → `Spare_Export_YYYY-MM-DD.xlsx` 파일이 다운로드되고, 열었을 때 120행 + 14개 컬럼(PKG/PKG NO/TAG NO/Operation Type/Valve Type/Item/Mat 1/Mat 2/Size/Rating/Unit/Qty/Status/Purpose)이 채워져 있는지 확인. TAG NO 컬럼은 전부 "Spare"여야 한다.

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Spare 탭 Export Excel 추가"
```

---

### Task 7: 전체 회귀 확인

**Files:** 없음(코드 변경 없음, 검증 전용)

- [ ] **Step 1: DB 기준값 재확인**

프로젝트 루트에서 다음을 실행해 분류 기준값이 여전히 120/17인지 재확인한다(구현 중 `ACCESSORY_RE`를 잘못 옮겼다면 여기서 어긋난다):

```bash
python -c "
import os, re
from dotenv import load_dotenv
load_dotenv()
import psycopg2
conn = psycopg2.connect(os.environ['SUPABASE_DB_URL'])
cur = conn.cursor()
cur.execute(\"select tag, full_description from receiving where tag ILIKE '%%SPARE%%'\")
rows = cur.fetchall()
ACCESSORY_RE = re.compile(r'STUD BOLT|SUTD BOLT|NUT |GASKET|FLANGE|BODY |PACKING SET|PACKING GUIDE|STEM PACKING|SPARE PARTS|SPECIAL TOOLS|BLIND FLANGE|BONNET GASKET|TRIM PARTS|SCREW|WASHER|SLEEVE|SPACER|O-RING|PLUG M|SPRING |SEAT COVER|COVER HOLDER|SLOTTED NUT|LOCK WASHER|STUD :|PIPE |B16\.5|GASKET KIT|PRESSURE SEAL|STEM GUIDE|BALANCE SEAL|PISTON RING|WAVE SPRING|DUMMY BONNET|DUMMY CAGE|DUMMY SEAT|FLUSHING|HYDRO TEST|EYE BOLT|BLOW OUT|BLOW THROUGH|TEST PRESSURE|HINGE PIN|SEAL RING| RING FOR|PIN RING', re.I)
spare = sum(1 for _, d in rows if not ACCESSORY_RE.search(d or ''))
accessory = len(rows) - spare
print('spare:', spare, 'accessory:', accessory)
"
```

Expected: `spare: 120 accessory: 17`

- [ ] **Step 2: Playwright로 사이드바 전체 회귀 확인**

`python app.py` 실행 후 브라우저(Playwright MCP)로 사이드바 전 섹션(Dashboard, BOM, Bulk Item 3개, TAG Item 5개[Valve/Speciality/Spool/Support/Spare], Material Status, Logistics)을 순서대로 클릭하며:
- 콘솔 에러 없음
- Dashboard KPI 카드(Valve/Speciality 관련 %) 수치가 이번 변경 전후 동일(BOM Tag 매칭 기반이라 Spare/Accessory 분리와 무관하므로 값이 그대로여야 함)
- Material Status → Stock/Material Summary의 Valve/Speciality 탭 수치도 동일

- [ ] **Step 3: 최종 커밋 없음 — Task 1~6에서 이미 커밋 완료**

이 Task는 검증 전용이라 코드 변경이 없다. 문제가 발견되면 해당 Task로 돌아가 수정 후 새 커밋을 추가한다.
