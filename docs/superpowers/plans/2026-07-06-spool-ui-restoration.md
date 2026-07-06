# Spool BOM/Receiving UI 복원 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spool 탭에 BOM 대비 입고 진행률 KPI 3개를 추가하고, Dashboard 전체 KPI 카드 그리드에 Spool을 8번째 카테고리로 통합한다.

**Architecture:** `spool_bom`(529 Tags)과 `spool_receiving`(574건)을 tag_no 기준으로 매칭해 진행률을 계산한다 — 새 백엔드/DB 변경 없이 기존 두 테이블을 클라이언트에서 조회·매칭하는 순수 프론트엔드 작업. Spool 탭은 자체 캐시(`_spoolBomTags`)를 새로 만들고, Dashboard는 기존 `updateCategoryCharts()`의 죽은 코드(조회하고 쓰지 않던 `spoolRecCount`)를 실제 기능으로 교체한다.

**Tech Stack:** Vanilla JS(빌드 없음), Supabase JS client(`supabaseClient` 전역), 기존 `.kpi-card`/`.kpi-card.highlight`/`.kpi-icon.received` CSS 클래스 재사용(신규 CSS 없음).

## Global Constraints

- 테스트 프레임워크 없음(프로젝트 컨벤션 확인됨) — 모든 검증은 `python app.py` 실행 후 **브라우저(Playwright MCP)로 직접 확인**한다.
- 기존 코드 스타일 그대로: `templates/index.html`은 인라인 `style="..."`, `static/js/app.js`는 4-space indent, 주석은 "왜"가 비자명할 때만 한글로.
- 이번 작업 범위는 설계 문서(`docs/superpowers/specs/2026-07-06-spool-ui-restoration-design.md`) "Out of scope" 섹션을 벗어나지 않는다 — Issued/Stock KPI, 미입고 Tag 상세 목록, Bulk Progress Bars 추가, `spool_bom`/`spool_receiving` 태그 불일치 정합화는 만들지 않는다.
- `spool_bom`.tag_no(529건)와 `spool_receiving`.tag_no(574건)는 385건만 겹친다(서로 다른 소스) — 이 불일치를 그대로 두고 매칭 비율만 계산한다.

---

### Task 1: Spool 탭 KPI 카드를 3개로 확장 (HTML)

**Files:**
- Modify: `templates/index.html:811-820` (`spoolRecKpiGrid`)

**Interfaces:**
- Produces: DOM 요소 `.spool-kpi-progress`, `.spool-kpi-prog-sub`, `.spool-kpi-bom`, `.spool-kpi-bom-sub` (신규), `.spool-kpi-received`, `.spool-kpi-rec-sub`(기존 유지). Task 3에서 이 클래스들을 갱신하는 JS를 작성한다.

- [ ] **Step 1: 카드 3개로 교체**

`templates/index.html`에서 현재(811-820행):

```html
                        <div class="kpi-grid" style="margin-bottom:20px;" id="spoolRecKpiGrid">
                            <div class="kpi-card">
                                <div class="kpi-info">
                                    <div class="kpi-title">Total Spool Received</div>
                                    <div class="kpi-value spool-kpi-received">— <span class="unit">EA</span></div>
                                    <div class="kpi-desc spool-kpi-rec-sub">—</div>
                                </div>
                                <div class="kpi-icon received"><i class="fas fa-truck-loading"></i></div>
                            </div>
                        </div>
```

다음으로 교체:

```html
                        <div class="kpi-grid" style="margin-bottom:20px;" id="spoolRecKpiGrid">
                            <div class="kpi-card highlight">
                                <div class="kpi-info">
                                    <div class="kpi-title">Overall Progress</div>
                                    <div class="kpi-value spool-kpi-progress">— <span class="unit">%</span></div>
                                    <div class="kpi-desc spool-kpi-prog-sub">—</div>
                                </div>
                                <div class="kpi-icon"><i class="fas fa-chart-line"></i></div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-info">
                                    <div class="kpi-title">Total Spool BOM</div>
                                    <div class="kpi-value spool-kpi-bom">— <span class="unit">Tags</span></div>
                                    <div class="kpi-desc spool-kpi-bom-sub">—</div>
                                </div>
                                <div class="kpi-icon"><i class="fas fa-cubes"></i></div>
                            </div>
                            <div class="kpi-card">
                                <div class="kpi-info">
                                    <div class="kpi-title">Total Spool Received</div>
                                    <div class="kpi-value spool-kpi-received">— <span class="unit">EA</span></div>
                                    <div class="kpi-desc spool-kpi-rec-sub">—</div>
                                </div>
                                <div class="kpi-icon received"><i class="fas fa-truck-loading"></i></div>
                            </div>
                        </div>
```

- [ ] **Step 2: 마크업만 렌더링되는지 확인**

Run: `python app.py`, 브라우저에서 `http://127.0.0.1:5200` 접속 → TAG Item → Spool 탭 클릭.
Expected: 콘솔 에러 없음, 카드 3개("Overall Progress", "Total Spool BOM", "Total Spool Received") 표시(값은 아직 "—", Task 3 전까지는 정상).

- [ ] **Step 3: Commit**

```bash
git add templates/index.html
git commit -m "feat: Spool 탭 KPI 카드 3개로 확장 (마크업만)"
```

---

### Task 2: `spool_bom` tag 조회 추가 + KPI 계산 로직 (JS)

**Files:**
- Modify: `static/js/app.js:6239-6271` (`updateSpoolKpis`, `_srData`/`_srPage` 선언, `initSpoolReceiving`)

**Interfaces:**
- Consumes: `supabaseClient`(전역), Supabase 테이블 `spool_bom`(컬럼 `tag_no`), `spool_receiving`(컬럼 `tag_no`, 기존 `_srData`가 이미 전체 컬럼 가져옴).
- Produces: 전역 `_spoolBomTags`(Set<string>, spool_bom의 tag_no 전체) — Task 1에서 만든 DOM 클래스를 채우는 `updateSpoolKpis()` 확장판.

- [ ] **Step 1: `updateSpoolKpis`/`initSpoolReceiving` 교체**

`static/js/app.js`에서 현재(6239-6271행):

```javascript
// ============================================================
// Spool Receiving
// ============================================================

function updateSpoolKpis() {
    const recCount = (_srData || []).length;
    const pkgCount = new Set((_srData || []).map(r => r.pkg_no)).size;
    document.querySelectorAll('.spool-kpi-received').forEach(el => el.innerHTML = `${recCount} <span class="unit">EA</span>`);
    document.querySelectorAll('.spool-kpi-rec-sub').forEach(el => el.textContent = `${pkgCount} PKG`);
}

// --- Spool Receiving ---
let _srData = null;
let _srPage = 1;

async function initSpoolReceiving() {
    if (_srData) { _initSrFilters(); renderSpoolReceiving(); return; }
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
        .from('spool_receiving')
        .select('*')
        .order('pkg_seq', { ascending: true })
        .order('id',      { ascending: true })
        .limit(10000);
    if (error) {
        const tb = document.getElementById('srTbody');
        if (tb) tb.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#c00;padding:40px;">Error: ${error.message}</td></tr>`;
        return;
    }
    _srData = data || [];
    _initSrFilters();
    renderSpoolReceiving();
}
```

다음으로 교체:

```javascript
// ============================================================
// Spool Receiving
// ============================================================

// spool_bom(tag_no)과 spool_receiving(tag_no)를 Tag 기준으로 매칭해 진행률 계산.
// 두 테이블은 서로 다른 시점 데이터라 tag_no가 완전히 겹치지 않음(385/529) — 있는 그대로 반영.
function updateSpoolKpis() {
    const recCount = (_srData || []).length;
    const pkgCount = new Set((_srData || []).map(r => r.pkg_no)).size;
    document.querySelectorAll('.spool-kpi-received').forEach(el => el.innerHTML = `${recCount} <span class="unit">EA</span>`);
    document.querySelectorAll('.spool-kpi-rec-sub').forEach(el => el.textContent = `${pkgCount} PKG`);

    const bomTags = _spoolBomTags || new Set();
    const recTagSet = new Set((_srData || []).map(r => (r.tag_no || '').trim()).filter(Boolean));
    let matched = 0;
    bomTags.forEach(t => { if (recTagSet.has(t)) matched++; });
    const pct = bomTags.size > 0 ? (matched / bomTags.size * 100) : 0;

    document.querySelectorAll('.spool-kpi-bom').forEach(el => el.innerHTML = `${bomTags.size} <span class="unit">Tags</span>`);
    document.querySelectorAll('.spool-kpi-bom-sub').forEach(el => el.textContent = `${bomTags.size} Tags`);
    document.querySelectorAll('.spool-kpi-progress').forEach(el => el.innerHTML = `${pct.toFixed(1)} <span class="unit">%</span>`);
    document.querySelectorAll('.spool-kpi-prog-sub').forEach(el => el.textContent = `${matched} / ${bomTags.size} Tags matched`);
}

// --- Spool Receiving ---
let _srData = null;
let _srPage = 1;
let _spoolBomTags = null;

async function initSpoolReceiving() {
    if (_srData) { _initSrFilters(); renderSpoolReceiving(); return; }
    if (!supabaseClient) return;
    const [recRes, bomRes] = await Promise.all([
        supabaseClient
            .from('spool_receiving')
            .select('*')
            .order('pkg_seq', { ascending: true })
            .order('id',      { ascending: true })
            .limit(10000),
        supabaseClient
            .from('spool_bom')
            .select('tag_no')
            .limit(2000)
    ]);
    if (recRes.error) {
        const tb = document.getElementById('srTbody');
        if (tb) tb.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#c00;padding:40px;">Error: ${recRes.error.message}</td></tr>`;
        return;
    }
    _srData = recRes.data || [];
    _spoolBomTags = new Set((bomRes.data || []).map(r => (r.tag_no || '').trim()).filter(Boolean));
    _initSrFilters();
    renderSpoolReceiving();
}
```

- [ ] **Step 2: 브라우저 콘솔에서 값 확인**

Run: `python app.py`, 앱 열고 TAG Item → Spool 탭 클릭 후 DevTools 콘솔에서:

```javascript
_spoolBomTags.size
```

Expected: `529` (또는 그 근사값, `spool_bom` 행 수와 일치). 에러 없이 반환되어야 함.

- [ ] **Step 3: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Spool 탭 KPI 3종 계산 로직 추가 (spool_bom/spool_receiving Tag 매칭)"
```

---

### Task 3: Spool 탭 KPI 값이 화면에 정상 표시되는지 검증

**Files:** 없음 (검증 전용)

**Interfaces:**
- Consumes: Task 1의 DOM 클래스, Task 2의 `updateSpoolKpis()`/`initSpoolReceiving()`.

- [ ] **Step 1: 브라우저에서 3개 카드 값 확인**

Run: `python app.py`, 앱 열고 TAG Item → Spool 탭 클릭. 2초 대기 후 DevTools 콘솔:

```javascript
({
  progress: document.querySelector('.spool-kpi-progress').textContent,
  progSub:  document.querySelector('.spool-kpi-prog-sub').textContent,
  bom:      document.querySelector('.spool-kpi-bom').textContent,
  bomSub:   document.querySelector('.spool-kpi-bom-sub').textContent,
  received: document.querySelector('.spool-kpi-received').textContent,
  recSub:   document.querySelector('.spool-kpi-rec-sub').textContent,
})
```

Expected: `progress`는 `"72.8 %"` 부근(385/529≈72.8%, 실제 DB 상태에 따라 소폭 다를 수 있음 — "—"가 아니면 정상), `bom`은 `"529 Tags"`, `received`는 `"574 EA"`. 콘솔 에러 없음.

- [ ] **Step 2: Commit**

이 태스크는 코드 변경이 없으므로 커밋하지 않는다. 값이 기대와 다르면(예: `progress`가 "— %") Task 2로 돌아가 확인한다.

---

### Task 4: Dashboard KPI 그리드에 Spool 카드 추가 (HTML)

**Files:**
- Modify: `templates/index.html:100` (grid-template-columns)
- Modify: `templates/index.html:109` (Overall sub-text)
- Modify: `templates/index.html:167-177` (Support 카드 뒤에 Spool 카드 삽입)

**Interfaces:**
- Produces: DOM 요소 `#kpi-spool-pct`, `#kpi-spool-sub` — Task 5에서 이 id들을 채우는 JS를 작성한다.

- [ ] **Step 1: 그리드 컬럼 수 변경**

`templates/index.html:100`에서:

```html
                 <div class="kpi-grid" style="grid-template-columns:repeat(7,1fr);">
```

다음으로 교체:

```html
                 <div class="kpi-grid" style="grid-template-columns:repeat(8,1fr);">
```

- [ ] **Step 2: Overall 카드 sub-text 갱신**

`templates/index.html:109`에서:

```html
                             <div class="kpi-desc" id="kpi-overall-sub" style="margin-top:2px;">Pipe/Fitting/Valve/Speciality/Others/Support</div>
```

다음으로 교체:

```html
                             <div class="kpi-desc" id="kpi-overall-sub" style="margin-top:2px;">Pipe/Fitting/Valve/Speciality/Others/Support/Spool</div>
```

- [ ] **Step 3: Support 카드 뒤에 Spool 카드 삽입**

`templates/index.html`의 Support 카드(167-177행)는 현재:

```html
                     <div class="kpi-card">
                         <div class="kpi-info" style="flex:1;">
                             <div class="kpi-title" style="display:flex;align-items:center;gap:5px;">
                                 <i class="fas fa-tools" style="color:#2e7d32;font-size:10px;"></i> Support
                                 <span style="font-size:10px;color:#aaa;font-weight:400;">(EA)</span>
                             </div>
                             <div class="kpi-value" id="kpi-sup-pct">—</div>
                             <div style="font-size:10px;color:#888;margin-top:1px;">On-Site PKG / BOM</div>
                             <div class="kpi-desc" id="kpi-sup-sub" style="margin-top:2px;">— EA / — EA</div>
                         </div>
                     </div>
                 </div>
```

마지막 `</div>`(kpi-grid를 닫는 태그) 앞에 Spool 카드를 삽입해 다음과 같이 만든다:

```html
                     <div class="kpi-card">
                         <div class="kpi-info" style="flex:1;">
                             <div class="kpi-title" style="display:flex;align-items:center;gap:5px;">
                                 <i class="fas fa-tools" style="color:#2e7d32;font-size:10px;"></i> Support
                                 <span style="font-size:10px;color:#aaa;font-weight:400;">(EA)</span>
                             </div>
                             <div class="kpi-value" id="kpi-sup-pct">—</div>
                             <div style="font-size:10px;color:#888;margin-top:1px;">On-Site PKG / BOM</div>
                             <div class="kpi-desc" id="kpi-sup-sub" style="margin-top:2px;">— EA / — EA</div>
                         </div>
                     </div>
                     <div class="kpi-card">
                         <div class="kpi-info" style="flex:1;">
                             <div class="kpi-title" style="display:flex;align-items:center;gap:5px;">
                                 <i class="fas fa-circle-notch" style="color:#5d4037;font-size:10px;"></i> Spool
                                 <span style="font-size:10px;color:#aaa;font-weight:400;">(EA)</span>
                             </div>
                             <div class="kpi-value" id="kpi-spool-pct">—</div>
                             <div style="font-size:10px;color:#888;margin-top:1px;">Received / BOM</div>
                             <div class="kpi-desc" id="kpi-spool-sub" style="margin-top:2px;">— EA / — EA</div>
                         </div>
                     </div>
                 </div>
```

- [ ] **Step 4: 렌더링 확인**

Run: `python app.py`, Dashboard 탭 열기.
Expected: KPI 카드 8개(Overall/Pipe/Fitting/Valve/Speciality/Others/Support/Spool) 한 줄에 표시, Spool 카드 값은 아직 "—"(Task 5 전까지 정상), 콘솔 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add templates/index.html
git commit -m "feat: Dashboard KPI 그리드에 Spool 카드 추가 (마크업만)"
```

---

### Task 5: Dashboard `updateCategoryCharts`에 Spool 계산 추가 (JS)

**Files:**
- Modify: `static/js/app.js:818-828` (Promise.all 쿼리 목록)
- Modify: `static/js/app.js:835` (죽은 코드 `spoolRecCount` 제거, Spool 매칭 계산으로 교체)
- Modify: `static/js/app.js:905-915` (`pctSup` 다음에 `pctSpool` 추가, Overall 평균 계산 갱신)

**Interfaces:**
- Consumes: Task 4의 `#kpi-spool-pct`/`#kpi-spool-sub`, 기존 `setCatKpi(pctId, subId, bom, rec, unit)`(app.js:889, 반환값 pct number).
- Produces: 없음 (Dashboard 렌더링 완성)

- [ ] **Step 1: Promise.all 쿼리 교체**

`static/js/app.js`에서 현재(818-828행):

```javascript
function updateCategoryCharts() {
    if (!supabaseClient) return;

    // Fetch category summary + Valve/Speciality tag-based receiving + Spool counts + Support
    Promise.all([
        supabaseClient.from('v_category_readiness').select('*'),
        supabaseClient.from('receiving').select('category, qty, tag, full_description, pkg_no').not('tag', 'is', null).in('category', ['Valve', 'Speciality']).limit(10000),
        supabaseClient.from('spool_receiving').select('id', { count: 'exact', head: true }),
        supabaseClient.from('v_support_kpi').select('total_bom, total_received').single(),
        supabaseClient.from('bom').select('tag', { count: 'exact', head: true }).eq('category', 'Speciality'),
    ]).then(([catRes, tagRecRes, spoolRecRes, suppKpiRes, splTagCountRes]) => {
```

다음으로 교체:

```javascript
function updateCategoryCharts() {
    if (!supabaseClient) return;

    // Fetch category summary + Valve/Speciality tag-based receiving + Spool BOM/Received tag 목록 + Support
    Promise.all([
        supabaseClient.from('v_category_readiness').select('*'),
        supabaseClient.from('receiving').select('category, qty, tag, full_description, pkg_no').not('tag', 'is', null).in('category', ['Valve', 'Speciality']).limit(10000),
        supabaseClient.from('spool_bom').select('tag_no').limit(2000),
        supabaseClient.from('spool_receiving').select('tag_no').limit(2000),
        supabaseClient.from('v_support_kpi').select('total_bom, total_received').single(),
        supabaseClient.from('bom').select('tag', { count: 'exact', head: true }).eq('category', 'Speciality'),
    ]).then(([catRes, tagRecRes, spoolBomRes, spoolRecRes, suppKpiRes, splTagCountRes]) => {
```

- [ ] **Step 2: 죽은 코드 제거 + Spool 매칭 계산 추가**

`static/js/app.js`에서 현재(835행 부근):

```javascript
        const spoolRecCount = spoolRecRes.count || 0;
```

다음으로 교체:

```javascript
        // Spool: spool_bom/spool_receiving 모두 Tag 목록만 가져와 클라이언트에서 매칭
        // (두 테이블은 서로 다른 시점 데이터라 완전히 겹치지 않음 — project_spool_bom_reintroduction 메모리 참고)
        const spoolBomTagSet = new Set((spoolBomRes.data || []).map(r => (r.tag_no || '').trim()).filter(Boolean));
        const spoolRecTagSet = new Set((spoolRecRes.data || []).map(r => (r.tag_no || '').trim()).filter(Boolean));
        let spoolMatched = 0;
        spoolBomTagSet.forEach(t => { if (spoolRecTagSet.has(t)) spoolMatched++; });
```

- [ ] **Step 3: Spool KPI 카드 계산 + Overall 평균에 반영**

`static/js/app.js`에서 현재(905-915행 부근):

```javascript
        // Support: v_support_kpi 뷰에서 집계값 직접 사용
        const supportBom = parseFloat(suppKpiRes.data?.total_bom || 0);
        const supportRec = parseFloat(suppKpiRes.data?.total_received || 0);
        const pctSup = setCatKpi('kpi-sup-pct', 'kpi-sup-sub', supportBom, supportRec, 'EA');

        // Overall — 6개 카테고리(Pipe/Fitting/Valve/Speciality/Others/Support) 진행률 단순 평균
        // (단위가 서로 달라 수량 합산 대신 %를 평균 — 카드별 표시값과 일관성 유지)
        const overallPct = (pctPipe + pctFit + pctValve + pctSpc + pctOth + pctSup) / 6;
        const overallColor = overallPct >= 90 ? '#66bb6a' : '#42a5f5';
        const elOverall = document.getElementById('kpi-overall-pct');
        if (elOverall) { elOverall.textContent = overallPct.toFixed(1) + '%'; elOverall.style.color = overallColor; }
```

다음으로 교체:

```javascript
        // Support: v_support_kpi 뷰에서 집계값 직접 사용
        const supportBom = parseFloat(suppKpiRes.data?.total_bom || 0);
        const supportRec = parseFloat(suppKpiRes.data?.total_received || 0);
        const pctSup = setCatKpi('kpi-sup-pct', 'kpi-sup-sub', supportBom, supportRec, 'EA');

        // Spool: Tag 매칭 개수를 "받은 수량"으로 취급 (Valve/Speciality와 동일한 방식)
        const pctSpool = setCatKpi('kpi-spool-pct', 'kpi-spool-sub', spoolBomTagSet.size, spoolMatched, 'EA');

        // Overall — 7개 카테고리(Pipe/Fitting/Valve/Speciality/Others/Support/Spool) 진행률 단순 평균
        // (단위가 서로 달라 수량 합산 대신 %를 평균 — 카드별 표시값과 일관성 유지)
        const overallPct = (pctPipe + pctFit + pctValve + pctSpc + pctOth + pctSup + pctSpool) / 7;
        const overallColor = overallPct >= 90 ? '#66bb6a' : '#42a5f5';
        const elOverall = document.getElementById('kpi-overall-pct');
        if (elOverall) { elOverall.textContent = overallPct.toFixed(1) + '%'; elOverall.style.color = overallColor; }
```

- [ ] **Step 4: 브라우저에서 확인**

Run: `python app.py`, Dashboard 탭 열고 2초 대기 후 DevTools 콘솔:

```javascript
({
  spoolPct: document.getElementById('kpi-spool-pct').textContent,
  spoolSub: document.getElementById('kpi-spool-sub').textContent,
  overallPct: document.getElementById('kpi-overall-pct').textContent,
})
```

Expected: `spoolPct`가 `"72.8%"` 부근(더 이상 "—" 아님), `spoolSub`가 `"385 / 529 EA"` 형식, `overallPct`도 "—"가 아닌 값. 콘솔 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Dashboard Spool KPI 계산 추가, Overall 평균을 7개 카테고리로 갱신"
```

---

### Task 6: 전체 회귀 스모크 테스트

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 사이드바 전체 순회**

Run: `python app.py`, 앱 열고 사이드바 전체 항목(Dashboard, Material Finding, BOM, Piping/Fitting/Others, Valve/Speciality/Spool/Support, Material Status의 Stock/Shortage/Surplus/Data Health, Material Summary, Shipping) 순서대로 클릭.
Expected: 콘솔 에러 없음(Data Health 탭 등 이전 기능도 회귀 없이 정상 동작), Spool 탭 KPI 3개·Dashboard Spool 카드 모두 값 표시됨.

- [ ] **Step 2: 문제 있으면 수정 후 커밋 (문제 없으면 이 태스크는 커밋하지 않음)**

```bash
git add -A
git commit -m "fix: Spool UI 복원 후 발견된 회귀 수정"
```
