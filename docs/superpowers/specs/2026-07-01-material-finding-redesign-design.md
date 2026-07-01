# Material Finding 탭 재설계

## 배경

현재 Material Finding 탭은 "ISO Drawing 검색 → BOM/Support 자재 목록 확인 → MR Table에 담기 → Material Issue Slip 생성"이라는 4단계 흐름으로 되어 있다. 이 흐름은 다음과 같은 비효율이 있다.

- ISO Drawing으로만 검색 가능하고, Support Tag No나 Item(Valve/Speciality)으로 바로 찾을 방법이 없다.
- Support 자재는 검색은 되지만 Receiving/Stock 컬럼이 하드코딩된 `-`로 항상 비어 있어 실제로 쓸모가 없다.
- Material Issue Slip 발행은 현장에서 이미 Shipping/Custom Clearance 탭의 PKG 단위 Issue Date 입력과 개념이 중복된다.

또한 코드 조사 결과, **Shipping 탭의 PKG Issue Date 필드는 이미 존재하지만 Stock 계산에는 전혀 반영되지 않고 있다** — Stock의 Issued 수량은 오직 Material Issue Slip 확정 시 `issued` 테이블에 쓰여지는 레코드만 참조한다. 이번 재설계는 이 불일치를 해소하는 것을 포함한다.

## 목표

1. Material Finding을 불출 처리 도구가 아닌 **자재 조회(Lookup) 전용 도구**로 전환한다.
2. ISO Drawing / Support Tag No / Item(Valve·Speciality) 세 가지 키로 자재를 찾을 수 있게 한다.
3. 불출 관리는 Shipping 탭의 PKG Issue Date로 일원화하고, Stock 계산이 이를 실제로 반영하도록 고친다.

## 범위 밖 (Out of scope)

- Shipping 탭 UI 자체의 재설계 (Issue Date 입력 필드는 이미 존재하므로 그대로 사용)
- `issued` Supabase 테이블 삭제 (데이터 보존, 단순히 참조를 중단)
- Support/Spool/Valve 데이터 소스(Supabase 테이블) 스키마 변경

## 현재 아키텍처 확인 사항 (구현 시 참고)

- 모든 PKG(Piping/Fitting/Others 벌크 입고, Spool, Support, Valve/Speciality)는 **하나의 공유 `pl_updates` 테이블**에 `pkg_no` 키로 status/on_site/issue_date/custom_clear/purpose/remark를 저장한다 (`static/js/app.js` `_plUpdatesCache`, `savePlUpdates()`). Support의 `package_no`도 동일 키 공간을 공유한다.
- `isReceivingActive(plNo)`는 PKG status가 Preparing/Shipping이 아니면(On-Site) true — "입고 완료"의 기준으로 이미 쓰이고 있다. 이번 설계의 "Issued" 판정도 같은 패턴(`pl_updates[pkgNo].issue_date`의 존재 여부)으로 만든다.
- `db.issued`(현재 Issued 개념)를 참조하는 곳 전수 조사 결과:
  - **Material Stock 탭**의 Issued/Stock 컬럼 및 Export Excel — 실사용 중, 수정 필요
  - Dashboard KPI 카드, ISO Readiness 도넛차트, Material Shortage/Surplus — **BOM vs Received 기준**이라 Issued를 아예 안 씀. 영향 없음
  - "MR History / ISO Progress" 리포트 코드(`app.js` 약 4090~4190행)와 `showReceivingDetail()` 팝업(약 4238행) — **HTML 어디에도 연결되지 않은 죽은 코드**. 이번에 함께 제거

## 설계

### 1. 탭 재편 — 제거되는 것

- Step 3 "Pending MR Table (For Issue Slip)" 패널 전체
- "Add To MR" 버튼 2개 (`btnAddToMr`, `btnSuppAddToMr`)와 관련 로직
- "Confirm & Generate Material Issue Slip" 버튼(`btnGenerateIssueSlip`), 인쇄 미리보기 모달(`printModal`, `btnConfirmPrint` 등)
- `db.mrTable`, `sessionMrNo` 상태 및 `renderMrTable()` 등 관련 함수
- `issued` 테이블에 insert하던 코드 (Confirm Print 핸들러 내부)
- 죽은 코드: MR History/ISO Progress 리포트 함수, `showReceivingDetail()` 팝업

### 2. 검색 모드 3종

상단에 모드 전환 UI ([ISO Drawing] / [Support Tag No] / [Item]). 모드별 입력 필드는 다르지만 결과는 항상 아래 공통 컬럼 형식을 따른다.

**공통 결과 테이블**: `Item/Tag | Category | Description | Size | Unit | BOM Qty | Received Qty | Stock Qty | Packing List (PKG No)`

**Packing List 컬럼 형식** (기존 Stock 탭의 다중 PKG 표시 관례 재사용):
```
PGU-DE-0373 (12 EA) — 미불출
PGU-DE-0533 (8 EA) — 불출 2026-06-15
```
PKG No를 클릭하면 기존 `openPackingListModal(pkgNo, packing)`을 재사용해 상세 내역을 보여준다 (신규 코드 최소화).

#### 모드 A: ISO Drawing (기존 Step 1 확장)
- 입력: ISO Drawing 자동완성 검색 + System/Category/Item/Size 필터 (기존 유지)
- 결과: 해당 ISO의 Pipe/Fitting/Valve/Speciality/Others 전체 자재 (기존처럼 카테고리 통합, `db.bom` 기준)
- 하단에 그 ISO에 딸린 Support Tag 목록을 보조 표로 표시 (기존 Step 2 자리를 대체). 각 Support Tag 행을 클릭하면 모드 B로 드릴다운되어 해당 Tag의 상세를 보여준다.
- Support 행의 Received/Stock은 `support_receiving`을 `support_tag` 기준으로 집계해 실제 값을 채운다 (현재의 하드코딩된 `-` 버그 수정).

#### 모드 B: Support Tag No
- 입력: Support Tag No 자동완성 검색 (ISO 없이 단독 검색 가능). 자동완성 목록은 `support_bom.support_tag` 전체 distinct 값으로 구성.
- 결과: 해당 Tag의 모든 파트 — `support_bom`에서 Item/Matl/Size or Type/BOM Qty, `support_receiving`을 tag 기준 집계해 Received Qty, PKG No는 `support_receiving.package_no` + `pl_updates` 조인.

#### 모드 C: Item (Valve · Speciality)

> **[2026-07-01 개정]** 아래 내용은 `2026-07-01-tab-restructure-and-tag-override-design.md`의 "섹션 3"으로 대체되었다. Valve/Speciality는 BOM 없이 순수 Tag 기반으로 관리하므로 BOM Qty 비교를 하지 않으며, `db.receiving`을 Tag로 그룹핑하는 방식으로 데이터 소스가 바뀌고 BOM 미매칭 Tag에 대한 수동 ISO/Line No 지정 기능(`tag_overrides` 테이블)이 추가되었다. 최신 내용은 위 문서를 참조할 것.
>
> (이하는 개정 전 원안 — 참고용으로 보존)

- 입력: Category(Valve/Speciality) 드롭다운 → Item 드롭다운(기존 `getBomItemsForCat(cat)` 재사용) → System/Size 필터(선택) → 검색
- 결과: 조건에 맞는 모든 TAG NO, 각 행에 자동 조회된 ISO Drawing을 참고 컬럼으로 표시 (현장에서 ISO를 몰라도 검색 후 알 수 있음)
- 데이터 소스/필터링 로직은 이번 세션에서 이미 구현한 `_buildTagRecvExportRows()` 헬퍼(app.js, Valve/Speciality Export용)의 계산 방식을 재사용/응용한다.

### 3. Stock/Issued 계산 방식 변경

- `Issued 수량(matCode 또는 tag 단위) = Issue Date가 설정된 PKG들의 Received 수량 합`
- 공용 헬퍼 함수(가칭 `isPkgIssued(pkgNo)` → `pl_updates` 조회, `getIssuedQtyMap(filterFn)` → `db.receiving`/`support_receiving`을 이 기준으로 집계)를 추가하고, 기존 `db.issued` 기반 집계를 이걸로 교체한다.
- **Material Stock 탭**(`renderStockTable`)의 `issMap` 계산과 Export Excel의 동일 로직을 새 함수로 교체.
- Material Finding의 Stock Qty 컬럼도 동일 헬퍼를 사용해 모드 A/B/C 전부 일관된 계산을 하도록 한다.
- `issued` Supabase 테이블은 그대로 두되(삭제하지 않음) 더 이상 읽지도 쓰지도 않는다.

### 4. 에러 처리 / 엣지 케이스

- Issue Date가 없는 PKG(아직 미불출)는 Stock 계산에서 Issued 0으로 처리 — 현재 Received 로직과 동일한 패턴.
- Support Tag No 검색에서 존재하지 않는 태그 입력 시 "No data found" 메시지 (기존 다른 탭들의 빈 결과 처리 패턴과 동일하게).
- Item 모드에서 Category 미선택 상태로는 검색 비활성화 (Item 드롭다운이 Category에 종속되므로 자연스럽게 강제됨).
- 기존에 `db.mrTable`/`sessionMrNo`를 참조하던 다른 코드가 있는지 구현 단계에서 재확인 후 제거 (현재 조사로는 Material Finding 내부에서만 쓰임).

## 테스트 계획

- 기존에 사용한 Playwright 스크립트를 확장하여: 모드 전환 3종 각각 검색 → 결과 렌더 확인, PKG No 클릭 → 모달 오픈 확인.
- Material Stock 탭에서 특정 PKG의 Issue Date를 Shipping 탭에서 입력한 뒤, Stock 탭의 Issued/Stock 값이 즉시(또는 재조회 시) 변경되는지 수동/스크립트 검증.
- 회귀 확인: Dashboard KPI, Shortage/Surplus 탭 수치가 이번 변경 전후로 동일한지 확인 (Issued 미사용 확인차 스팟 체크).

## 미결정 사항 (구현 중 재확인)

- Support/Valve 자동완성 목록을 어느 시점에 구축할지(탭 최초 진입 시 vs 매 검색 시) — 구현 단계에서 기존 캐시(`db.bomTagMap`, `_supportShippingCache` 등) 재사용 가능 여부를 보고 결정.
