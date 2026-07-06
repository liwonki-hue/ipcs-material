# Support Bulk Materials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Bulk Materials" section to the existing Support tab that shows received quantity (with BOM quantity as reference only, no %) for Support BOM rows that have no real Support Tag, grouped by Item+Matl+Size.

**Architecture:** Pure client-side addition — one new HTML panel inside the existing `#recTagSupport` tab, and one new JS function that queries `support_bom`/`support_receiving` with a `support_tag IS NULL OR ...` filter, aggregates in JS by Item+Matl+Size_or_Type, and renders a table reusing the existing `renderPkgListCell`/`isPkgIssued` helpers. No backend/Flask changes. A separate, DB-side task corrects `v_support_kpi` to exclude this Bulk set from the Dashboard's Support % — that task is blocked on the user retrieving the view's current SQL (anon key cannot read `pg_catalog`).

**Tech Stack:** Vanilla JS (`static/js/app.js`), Jinja/HTML (`templates/index.html`), Supabase JS client (`supabaseClient`), PostgREST filters.

## Global Constraints

- ipcs-material 모듈만 수정 (다른 모듈 손대지 않음)
- UI 텍스트는 영문 (코드 주석은 한글) — [feedback_ui_english_only.md]
- Bulk 식별 규칙(고정값, 스펙에서 확정됨): BOM은 `support_bom`에서 `support_tag IS NULL OR support_tag = 'BULK'`; Received는 `support_receiving`에서 `support_tag IS NULL OR support_tag IN ('BULK', '-')`
- 집계 키: Item + Matl + Size_or_Type (System 제외)
- 이 기능은 GENERAL 시트 유래 항목만 대상 — CRITICAL의 `{System} #n-BULK-{seq}` 항목은 건드리지 않음(이미 정상 동작)
- 이 저장소에는 JS 단위테스트 프레임워크가 없음 — 검증은 로컬 Flask 서버 기동 후 Playwright(MCP) 브라우저 확인으로 한다 (기존 `scratch/verify_mode_b.py` 방식과 동일한 정신)

---

### Task 1: Bulk Materials 패널 HTML 추가

**Files:**
- Modify: `templates/index.html:1101-1103` (기존 `<div id="srecPagination"></div>` 다음, `</div><!-- end recTagSupport -->` 이전에 새 패널 삽입)

**Interfaces:**
- Produces: DOM 요소 `#srecBulkTbody` (tbody) — Task 2의 JS가 여기에 렌더링

- [ ] **Step 1: 기존 파일에서 정확한 삽입 위치 확인**

`templates/index.html`의 1101~1103행이 현재 다음과 같은지 확인한다:

```html
                            <div id="srecPagination"></div>
                        </div>
                    </div><!-- end recTagSupport -->
```

- [ ] **Step 2: 새 패널 삽입**

`<div id="srecPagination"></div>` 바로 다음, `</div><!-- end recTagSupport -->` 바로 앞에 아래 블록을 삽입한다 (즉 1102행 `</div>` 앞):

```html
                        <div class="panel data-panel" style="margin-top:20px;">
                            <div class="panel-header"><h3>Bulk Materials (No Support Tag)</h3></div>
                            <p style="font-size:11px;color:#888;margin:0 0 10px;padding:0 15px;">
                                Structural bulk stock (Channel, H-Beam, Angle, Plate, Anchor Bolt, etc.) not tied to a specific Support Tag.
                                BOM Qty is shown for reference only — no % or shortage/surplus indicator.
                            </p>
                            <div class="table-responsive">
                                <table class="data-table" id="srecBulkTable" style="font-size:0.82em;">
                                    <thead>
                                        <tr>
                                            <th style="text-align:center;min-width:150px;">ITEM</th>
                                            <th style="text-align:center;">MATL</th>
                                            <th style="text-align:center;min-width:120px;">SIZE OR TYPE</th>
                                            <th style="text-align:center;">BOM QTY</th>
                                            <th style="text-align:center;">RECEIVED QTY</th>
                                            <th style="text-align:left;min-width:220px;">PKG DETAILS</th>
                                        </tr>
                                    </thead>
                                    <tbody id="srecBulkTbody"></tbody>
                                </table>
                            </div>
                        </div>
```

- [ ] **Step 3: 저장 후 HTML 유효성 눈으로 확인**

수정된 1077~1120행 근처를 다시 읽어서 `<div>`/`</div>` 짝이 맞는지, `recTagSupport`가 여전히 정확히 하나만 닫히는지 확인한다.

- [ ] **Step 4: Commit**

```bash
git add templates/index.html
git commit -m "feat: Support 탭에 Bulk Materials 패널 UI 추가"
```

---

### Task 2: Bulk Materials 렌더링 함수 구현

**Files:**
- Modify: `static/js/app.js:3562` (`renderActiveReceivingTab` 내 `support` 분기)
- Modify: `static/js/app.js` (새 함수는 `renderSupportReceivingTable` 함수 뒤, 3739행 부근에 추가)

**Interfaces:**
- Consumes: `supabaseClient` (전역, 이미 초기화됨), `isPkgIssued(plNo)` (`static/js/app.js:5278`), `_plUpdatesCache` (전역)
- Produces: `renderSupportBulkTable()` — 전역 함수, `#srecBulkTbody`를 채움. 내부 헬퍼 `renderBulkPkgCell(pkgMap)`는 이 함수 안에서만 쓰는 지역 함수(기존 `renderPkgListCell`은 시그니처가 달라 재사용하지 않음).

- [ ] **Step 1: `renderActiveReceivingTab`에 새 함수 호출 추가**

`static/js/app.js:3562` 현재 코드:

```javascript
        else if (_recActiveTagTab === 'support') renderSupportReceivingTable();
```

다음으로 교체:

```javascript
        else if (_recActiveTagTab === 'support') { renderSupportReceivingTable(); renderSupportBulkTable(); }
```

- [ ] **Step 2: `renderSupportBulkTable` 함수 추가**

`static/js/app.js`에서 `window._srecGoPage = function(p) { currentSrecPage = p; renderSupportReceivingTable(); };` (3738행) 바로 뒤에 아래 함수를 추가한다:

```javascript
// Support Tag가 없는 Bulk 구조재(Channel/H-Beam/Angle/Plate 등)를 Item+Matl+Size 단위로 집계해
// BOM 수량(참고용)과 Received 수량을 함께 보여준다. Tag 매칭이 불가능한 항목이라 %는 계산하지 않는다.
async function renderSupportBulkTable() {
    const tbody = document.getElementById('srecBulkTbody');
    if (!tbody) return;
    if (!supabaseClient) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:#888;">Loading...</td></tr>';

    const [bomRes, recRes] = await Promise.all([
        supabaseClient.from('support_bom')
            .select('item,matl,size_or_type,qty')
            .or('support_tag.is.null,support_tag.eq.BULK')
            .limit(2000),
        supabaseClient.from('support_receiving')
            .select('item,matl,size_or_type,qty,package_no,system')
            .or('support_tag.is.null,support_tag.eq.BULK,support_tag.eq.-')
            .limit(2000),
    ]);

    if (bomRes.error || recRes.error) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:red;text-align:center;">Error: ${(bomRes.error || recRes.error).message}</td></tr>`;
        return;
    }

    const keyOf = r => `${r.item || '-'}::${r.matl || '-'}::${r.size_or_type || '-'}`;

    const bomAgg = {}; // key -> { qty }
    (bomRes.data || []).forEach(r => {
        const k = keyOf(r);
        if (!bomAgg[k]) bomAgg[k] = { qty: 0 };
        bomAgg[k].qty += parseFloat(r.qty) || 0;
    });

    // pkgMap: pkgNo -> { qty, system } — System은 renderBulkPkgCell에서 참고 정보로만 노출
    const recAgg = {}; // key -> { qty, pkgMap: { pkgNo: {qty, system} } }
    (recRes.data || []).forEach(r => {
        const k = keyOf(r);
        if (!recAgg[k]) recAgg[k] = { qty: 0, pkgMap: {} };
        const q = parseFloat(r.qty) || 0;
        recAgg[k].qty += q;
        if (r.package_no) {
            const entry = recAgg[k].pkgMap[r.package_no] || { qty: 0, system: r.system };
            entry.qty += q;
            recAgg[k].pkgMap[r.package_no] = entry;
        }
    });

    // renderPkgListCell({pkgNo: qty})과 같은 톤이지만, System을 참고용으로 괄호에 덧붙인다
    function renderBulkPkgCell(pkgMap) {
        const entries = Object.entries(pkgMap);
        if (entries.length === 0) return '-';
        return entries.sort((a, b) => a[0].localeCompare(b[0])).map(([pkgNo, info]) => {
            const done = isPkgIssued(pkgNo);
            const qtyStr = info.qty % 1 === 0 ? info.qty : info.qty.toFixed(2);
            const label = done ? `Issued ${(_plUpdatesCache[pkgNo] || {}).issue_date || ''}` : 'Not Issued';
            const sys = info.system ? `, ${info.system}` : '';
            return `<div>${pkgNo} (${qtyStr} EA${sys}) — <span style="color:${done ? '#2e7d32' : '#999'};">${label}</span></div>`;
        }).join('');
    }

    // key가 "item::matl::size" 형태라 문자열 정렬만으로 Item 우선 정렬이 됨
    const allKeys = [...new Set([...Object.keys(bomAgg), ...Object.keys(recAgg)])].sort();

    if (allKeys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;padding:16px;">No bulk materials found.</td></tr>';
        return;
    }

    tbody.innerHTML = allKeys.map(k => {
        const [kItem, kMatl, kSize] = k.split('::');
        const b = bomAgg[k];
        const rec = recAgg[k];
        const bomQty = b ? b.qty : 0;
        const recQty = rec ? rec.qty : 0;
        const pkgCell = rec ? renderBulkPkgCell(rec.pkgMap) : '-';
        return `<tr>
            <td style="text-align:center;">${kItem}</td>
            <td style="text-align:center;">${kMatl}</td>
            <td style="text-align:center;">${kSize}</td>
            <td style="text-align:center;">${bomQty || '-'}</td>
            <td style="text-align:center;">${recQty || '-'}</td>
            <td style="text-align:left;font-size:11px;line-height:1.6;">${pkgCell}</td>
        </tr>`;
    }).join('');
}
```

주의: `item`/`matl`/`size_or_type`가 BOM에는 없고 Received에만 있는 조합(또는 반대)이 있을 수 있으므로, 표시값은 `bomAgg`/`recAgg`의 필드 대신 집계 키(`k.split('::')`) 자체에서 뽑는다 — `keyOf()`가 이미 `item || '-'` 형태로 정규화해 두었으므로 항상 값이 있다.

- [ ] **Step 3: 로컬 서버 기동**

```bash
python app.py
```

포트 5200에서 뜨는지 확인 (`curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5200/` → `200`).

- [ ] **Step 4: Playwright(MCP)로 Support 탭 → Bulk Materials 섹션 확인**

브라우저에서 `http://127.0.0.1:5200/` 접속 → 사이드바 TAG Item 섹션의 "Support" 클릭 → 페이지 하단에 "Bulk Materials (No Support Tag)" 섹션이 로딩되는지 확인. 콘솔 에러(`page.on('pageerror', ...)`)가 없는지 확인.

**기대값** (구현 전 미리 계산해 둔 검증 기준값, `scratch/` 스크립트로 직접 쿼리해서 확인한 값):
- 전체 행 수(고유 Item+Matl+Size 조합): 약 120개
- BOM Qty 합계(전체 행): 31,963
- Received Qty 합계(전체 행): 8,873
- 샘플: `CHANNEL / A36 / C100x50x5/7.5` 행 → BOM Qty = 35, Received Qty = 94

화면에 표시된 합계(각 컬럼을 눈으로 합산하거나, 브라우저 콘솔에서 `Array.from(document.querySelectorAll('#srecBulkTbody tr td:nth-child(4)')).reduce((a,td)=>a+(parseFloat(td.textContent)||0),0)` 실행)가 위 기대값과 일치하는지 확인한다. 어긋나면 Step 2의 집계 로직을 다시 점검한다.

- [ ] **Step 5: Commit**

```bash
git add static/js/app.js
git commit -m "feat: Support 탭에 Bulk Materials(Tag 없는 벌크 자재) 집계 렌더링 추가"
```

---

### Task 3: `v_support_kpi` 뷰 수정 (Dashboard Support % 에서 Bulk 제외) — 완료 (2026-07-06)

**배경:** 사용자가 Supabase SQL Editor에서 `SELECT pg_get_viewdef('public.v_support_kpi'::regclass, true);`를 실행해 실제 정의를 확인해줬다. 결과, 이 뷰는 **`support_bom`을 전혀 참조하지 않고 `support_receiving`만으로 계산**되고 있었다:

```sql
SELECT COALESCE(sum(qty), 0::bigint) AS total_bom,
    COALESCE(sum(
        CASE
            WHEN package_no IS NOT NULL THEN qty
            ELSE 0
        END), 0::bigint) AS total_received
   FROM support_receiving;
```

즉 `total_bom`은 실제로는 "support_receiving 전체 입고 수량 합계"(BOM 수요가 아님), `total_received`는 "그중 package_no가 배정된 수량"이다. 이름과 Dashboard 라벨("BOM"/"On-Site PKG")이 실제 계산과 다르지만, 이번 범위는 Bulk 제외에 한정하고 이 명칭 문제 자체는 건드리지 않기로 함.

- [x] **Step 1: 사용자에게 현재 뷰 정의 요청** — 완료, 사용자가 위 SQL 결과 공유함

- [x] **Step 2: Bulk 제외 조건 추가** — 뷰가 `support_receiving`만 참조하므로, 그 테이블에 `support_tag IS NOT NULL AND support_tag NOT IN ('BULK', '-')` 조건을 추가:

```sql
CREATE OR REPLACE VIEW public.v_support_kpi AS
SELECT
    COALESCE(sum(qty), 0::bigint) AS total_bom,
    COALESCE(sum(
        CASE
            WHEN package_no IS NOT NULL THEN qty
            ELSE 0
        END), 0::bigint) AS total_received
FROM support_receiving
WHERE support_tag IS NOT NULL
  AND support_tag NOT IN ('BULK', '-');
```

- [x] **Step 3: 사용자가 Supabase SQL Editor에서 실행 완료**

- [x] **Step 4: REST로 재확인** — `{"total_bom": 61618, "total_received": 23457}` (사전 예측치와 정확히 일치)

- [x] **Step 5: Playwright로 Dashboard 재확인** — Support KPI 카드가 `38.1%`, `23,457 / 61,618 EA`로 표시됨을 확인 (기존 45.8%, 70,491/32,312에서 변경)

- [x] **Step 6: Commit** — `scratch/v_support_kpi_bulk_exclusion.sql`에 실행한 SQL과 전/후 수치 기록, 커밋 완료

---

## Self-Review 메모
- Task 1/2는 스펙의 "UI: 기존 Support 탭 내 새 섹션", "BOM Qty 참고용 + Received Qty + PKG 목록(System 참고 표시 포함)"을 그대로 구현함.
- Task 3는 스펙의 "Dashboard 영향: v_support_kpi에서 Bulk 제외"를 다루지만, 뷰 정의를 코드베이스에서 확인할 수 없어 순수 코드 작업으로 끝낼 수 없음 — 사용자 입력이 필요한 유일한 태스크로 명시함.
