# 사이드바/탭 구조 재편 + Valve·Speciality Tag 수동 ISO 지정

## 배경

ipcs-material의 현재 사이드바는 13개 최상위 탭이 성격이 다른 섹션(Master Data, Bulk Item, TAG Item, Finding, Reports, Logistics)에 흩어져 있고, 서로 비슷한 성격의 탭(BOM 대비 수량 비교를 하는 Stock/Shortage/Surplus, Tag 기반 추적을 하는 Support/Spool/Valve/Speciality)이 다른 섹션에 나뉘어 있어 논리적 연결이 약하다. 이번 작업은 같은 대화 세션에서 이미 설계·계획을 마친 "Material Finding 탭 재설계"(`2026-07-01-material-finding-redesign-design.md`)와는 별개로, **탭 구조 자체의 재편**과 **Valve/Speciality의 BOM 미매칭 Tag를 위한 수동 ISO/Line No 입력 기능**을 다룬다.

## 목표

1. 사이드바 최상위 탭 수를 줄이고, 성격이 같은 탭은 기존 BOM 탭의 서브탭 패턴으로 통합한다.
2. 사용 빈도가 가장 높은 Material Finding을 사이드바 상단으로 옮긴다.
3. Support를 개념적으로 맞는 "TAG Item" 섹션으로 재분류한다.
4. Valve/Speciality는 BOM 수량 비교 없이 순수 Tag 기반으로 입고/Stock을 확인하도록 하고, BOM에 없는 Tag는 수동으로 ISO Drawing/Line No를 지정할 수 있게 한다.

## 범위 밖 (Out of scope)

- Material Finding의 검색 로직/UI 자체(Mode A, Mode B)는 기존 설계서·계획서를 그대로 따른다 — **단, Mode C(Item 검색)는 본 문서의 섹션 3 내용으로 대체된다.**
- 전반적인 UI 시각 디자인(색상, 폰트, 간격 등 "컴팩트화")은 별도 라운드에서 다룬다.
- Support Tag의 BOM 미매칭 처리는 이번 범위에 포함하지 않는다 (Valve/Speciality만 대상, 사용자가 명시적으로 지정한 범위).

## 설계

### 1. 새 사이드바 구조

```
DASHBOARD
  Integrated Dashboard

FINDING                          ← Dashboard 바로 아래로 이동 (사용 빈도 최우선)
  Material Finding

BOM                               ← "Master Data" 섹션 삭제, BOM 단독 승격
  서브탭: PIPING / FITTING / OTHERS / MATCODE MASTER

BULK ITEM (RECEIVING)
  Piping / Fitting / Others        ← Support 제외

TAG ITEM (RECEIVING)
  Support / Spool / Valve / Speciality   ← Support 합류

MATERIAL STATUS                   ← "Reports" 3개 탭 통합, 섹션명 변경
  서브탭: STOCK / SHORTAGE / SURPLUS

LOGISTICS
  Shipping / Custom Clearance
```

최상위 사이드바 항목이 13개에서 9개로 줄어든다. 데이터 소스나 렌더링 로직은 변경하지 않고 순수 네비게이션/그룹핑만 재구성한다.

### 2. 서브탭 통합 구현 방식

기존 BOM 탭이 이미 갖고 있는 서브탭 패턴(`.bom-tab-btn`, `_bomActiveTab` 전역 상태, 클릭 시 공유 컨테이너 안에서 표시 내용만 전환)을 그대로 재사용한다.

- **BOM + MatCode Master**: BOM 탭의 서브탭 바에 "MATCODE MASTER" 버튼을 4번째로 추가한다. BOM의 필터 패널+테이블 영역과 MatCode Master의 필터 패널+테이블 영역은 서로 다른 필터 체계(검색어/카테고리/아이템/사이즈 등 필드 자체는 비슷하지만 데이터 소스가 다름)를 쓰므로, 필터 패널을 공유하지 않고 두 개의 독립된 블록을 두고 서브탭 클릭 시 통째로 보이기/숨기기 처리한다. 사이드바의 "MatCode Master" 항목과 "Master Data" 섹션 타이틀은 삭제한다.
- **Material Status (Stock/Shortage/Surplus 통합)**: 동일한 패턴으로 STOCK/SHORTAGE/SURPLUS 3개 서브탭을 만든다. 각각 현재의 독립된 `<section>` 내용(필터 패널+테이블)을 그대로 이식하고, 서브탭 전환 시 통째로 표시/숨김 처리한다. 사이드바의 "Reports" 섹션 타이틀을 "Material Status"로 바꾸고 3개 항목을 1개로 축소한다.
- **TAG Item 재편**: `rec_tag_support`의 소속 섹션을 `sec:'bulk'`에서 `sec:'tag'`로 변경한다. 기존 `switchReceivingTab(sec, tab)`/`REC_TAB_MAP` 로직이 이미 `sec` 값으로 Bulk/Tag 2개 컨테이너(`recSecBulk`/`recSecTag`)를 구분하고 있으므로, Support의 HTML 블록을 `recSecTag` 컨테이너 안으로 옮기고 사이드바 nav-item 위치만 재배치하면 된다. 데이터 소스(`support_bom`, `support_receiving`)나 렌더링 함수는 변경하지 않는다.

### 3. Valve/Speciality: BOM Qty 제거 + 미매칭 Tag 수동 ISO 지정

**배경**: Valve/Speciality는 "별도 BOM 없이 순수 Tag로 입고/불출/Stock을 확인"하는 것이 목적이다. 기존에 설계해 둔 Material Finding Mode C(Item 검색)는 `bom_detail`에서 BOM Qty를 가져오는 방식이었는데, 이는 위 목적과 맞지 않고 BOM에 없는(미매칭) Tag는 애초에 검색 결과에 나타나지도 않는 문제가 있었다. 아래 내용으로 **기존 계획서의 Task 7(Mode C)을 대체**한다.

**Mode C 데이터 소스 변경**: `bom_detail` 쿼리 대신 이미 로드되어 있는 `db.receiving`을 category(Valve/Speciality)로 필터링하고 `tag`로 그룹핑한다. BOM 매칭 여부와 무관하게 입고 기록이 있는 모든 Tag가 검색 결과에 나온다.

**Mode C 결과 컬럼** (BOM Qty 삭제): `Tag No | ISO Drawing | Category | Description | Unit | Received Qty | Stock Qty | Packing List (PKG No)`

- ISO Drawing 컬럼 값의 우선순위: ① `bom_detail`에 해당 tag가 있으면 그 `iso_dwg_no`, ② 없으면 신규 `tag_overrides` 테이블의 수동 입력값, ③ 둘 다 없으면 빈 값 + **"ISO 지정" 버튼**을 표시한다.
- Description 컬럼도 동일 우선순위: `bom_detail.full_description` → 없으면 `db.receiving`의 원본 입고 설명(`r.desc`).

**신규 `tag_overrides` 테이블** (Supabase): `tag`(PK, text), `iso_dwg_no`(text), `line_no`(text, nullable), `updated_at`(timestamptz). 소수의 예외 케이스만 다루는 가벼운 보조 테이블이며, 마스터 데이터인 `bom_detail`은 건드리지 않는다.

**인라인 ISO 지정 UI**: "ISO 지정" 버튼을 클릭하면 그 행 안에 ISO Drawing 검색 입력(기존 ISO 자동완성 데이터리스트 재사용) + Line No 텍스트 입력 + 저장 버튼이 나타난다. 저장 시 `tag_overrides`에 upsert하고, 해당 행을 즉시 재렌더링하여 "수동 지정됨" 배지와 함께 값을 보여준다. 이 지정값은 이후 같은 Tag를 다시 검색할 때마다 재사용된다 (앱 재시작/새로고침 후에도 유지).

## 에러 처리 / 엣지 케이스

- 같은 Tag가 `bom_detail`과 `tag_overrides` 양쪽에 다 있으면 `bom_detail`(마스터 데이터)을 우선한다 — 수동 입력은 어디까지나 미매칭 예외를 메우기 위한 것이다.
- Tag No에 대소문자/공백 차이가 있을 수 있으므로, 기존 `db.bomTagMap` 조회 관례와 동일하게 조회 시 `.toUpperCase().trim()`으로 정규화한다.
- "ISO 지정" 저장 시 ISO Drawing이 실제 `bom`/`bom_detail`에 존재하지 않는 값이어도 저장은 허용한다 (오탈자 검증은 하지 않음 — 현장 사용자가 직접 확인하고 입력하는 값으로 신뢰).

## 관련 문서 갱신

이 설계가 승인되면 다음 기존 문서도 함께 갱신한다 (Mode C 내용 불일치 방지).

- `docs/superpowers/specs/2026-07-01-material-finding-redesign-design.md` — Mode C 섹션을 위 "섹션 3" 내용으로 교체
- `docs/superpowers/plans/2026-07-01-material-finding-redesign.md` — Task 7을 위 내용에 맞게 재작성

## 테스트 계획

- Playwright로 새 사이드바 9개 최상위 항목 클릭 → 각 서브탭 전환이 콘솔 에러 없이 동작하는지 확인 (이번 세션에서 이미 쓴 전체 스윕 스크립트 패턴 재사용).
- BOM 탭에서 MATCODE MASTER 서브탭 클릭 → 기존 MatCode Master 기능(검색/필터/Export)이 그대로 동작하는지 확인.
- MATERIAL STATUS 탭에서 STOCK/SHORTAGE/SURPLUS 서브탭 전환 → 각 탭의 기존 기능이 그대로 동작하는지 확인.
- Valve/Speciality Mode C에서: ① BOM 매칭된 Tag가 ISO Drawing과 함께 나오는지, ② 미매칭 Tag가 "ISO 지정" 버튼과 함께 나오는지, ③ 지정 후 저장→재검색 시 값이 유지되는지 확인.
