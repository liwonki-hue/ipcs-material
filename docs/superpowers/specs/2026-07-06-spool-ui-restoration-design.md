# Spool BOM/Receiving UI 복원 설계

## 배경

Spool BOM/Spool Receiving 기능은 `dc9b83a`(2026-06-01)에서 탭·KPI·대시보드까지 구현됐으나 `aacaaac`(2026-06-26)에서 "Support BOM / Spool BOM 탭 및 데이터 완전 삭제"로 UI가 통째로 제거됐다. DB의 `spool_bom`/`spool_receiving` 테이블 자체는 삭제되지 않고 남아있었고, 2026-07-06에 `spool_bom`을 ipcs-control `joint_master` 기반 신규 데이터(529행, mat1/mat2/rating 포함)로 전체 교체했다(`project_spool_bom_reintroduction` 메모리 참고). 이 문서는 그 데이터를 기반으로 한 UI 복원 범위를 정의한다.

**전제 데이터 상태**: `spool_bom` 529행(HP 276/LP 253), `spool_receiving` 574행(6/26 이전부터 유지된 그대로, 손대지 않음). 두 테이블의 tag_no는 385건만 겹침 — 서로 다른 시점 데이터라 완전히 일치하지 않는다. 이번 복원 범위에서는 이 불일치를 고치지 않고 있는 그대로 반영한다.

## 범위 결정 (사용자 확인 완료)

1. **KPI 카드는 3개만** — Overall Progress % / Total Spool BOM / Total Spool Received. 원래 있었던 Issued/Stock 카드는 복원하지 않는다(Spool 불출 추적 기능이 없어 항상 0으로 고정되는 죽은 값이었음).
2. **비교는 KPI % 까지만** — 미입고 Spool Tag 상세 목록/테이블은 만들지 않는다.
3. **Dashboard 통합은 Valve와 동일하게 KPI 카드 추가만** — Bulk Progress Bars(Pipe/Fitting/Others/Support)에는 추가하지 않는다. Valve가 제외된 이유("Tag당 QTY=1이라 부족/잉여 개념 희박")가 Spool에도 동일하게 적용되기 때문.

## 컴포넌트 1: Spool 탭 KPI 카드 확장 (`templates/index.html` `recTagSpool`, `static/js/app.js`)

- 현재 `spoolRecKpiGrid`에 카드 1개("Total Spool Received")만 있음 → 3개로 확장.
- 새 카드 순서: **Overall Progress % → Total Spool BOM → Total Spool Received**(기존 카드 위치 유지, 앞에 2개 추가).
- 데이터 흐름:
  - 탭 최초 진입(`initSpoolReceiving`) 시 `spool_bom`에서 `tag_no`만 조회해 캐싱(`_spoolBomTags`, Set).
  - 기존 `_srData`(spool_receiving, 이미 캐싱됨)에서 tag_no Set 추출.
  - `matched = _spoolBomTags`와 `_srData`의 tag_no Set 교집합 크기.
  - Overall Progress % = `matched / _spoolBomTags.size * 100`.
  - Total Spool BOM = `_spoolBomTags.size`, sub-text "Tags".
  - Total Spool Received = 기존 그대로 `_srData.length`(입고 로그 원본 건수, 매칭 여부 무관), sub-text는 기존처럼 PKG 개수 유지.
- `updateSpoolKpis()` 함수를 확장해 3개 카드 모두 갱신하도록 수정(현재는 `.spool-kpi-received`/`.spool-kpi-rec-sub`만 갱신).

## 컴포넌트 2: Dashboard KPI 카드 그리드에 Spool 추가 (`templates/index.html` 대시보드 섹션, `static/js/app.js` `updateCategoryCharts`)

- `templates/index.html:100`의 `grid-template-columns:repeat(7,1fr)` → `repeat(8,1fr)`.
- Support 카드(`kpi-sup-pct`) 뒤에 Spool 카드 추가: `kpi-spool-pct` / `kpi-spool-sub`, 아이콘은 기존 `rec_tag_spool` 사이드바와 통일(`fa-circle-notch`).
- `updateCategoryCharts()`(app.js:818) 안에서:
  - 이미 조회 중인 `spool_receiving` count(현재 죽은 코드, `spoolRecCount` 미사용)를 제거하고 대신 `spool_bom`과 `spool_receiving`의 `tag_no` 배열을 조회하는 것으로 교체(둘 다 수백 행 수준이라 전체 조회 비용 낮음).
  - Tag 교집합으로 matched 계산 → `setCatKpi('kpi-spool-pct', 'kpi-spool-sub', totalBom, matched, 'EA')` 호출 패턴 재사용(단, Received=matched 값을 넘겨야 함 — Valve/Speciality처럼 raw qty 합산이 아니라 Tag 매칭 카운트를 "받은 수량"으로 취급).
  - Overall 평균 계산(`overallPct = (...) / 6` → `/ 7`)에 `pctSpool` 추가, sub-text("Pipe/Fitting/Valve/Speciality/Others/Support")에 "/Spool" 추가.

## 데이터 정합성 관련 결정

- `spool_bom`↔`spool_receiving` tag_no 불일치(385/529 겹침)는 이번 작업에서 고치지 않는다 — 있는 그대로 매칭 비율을 보여준다. 사용자가 원할 경우 별도 작업으로 두 테이블 재정합.

## Out of scope

- Issued/Stock KPI 복원
- 미입고 Spool Tag 상세 테이블(Data Health 스타일)
- Bulk Progress Bars에 Spool 추가
- `spool_bom`/`spool_receiving` 데이터 정합화(태그 불일치 해소)
- Material Status(Stock/Shortage/Surplus) 탭에 Spool 반영 — 이번 범위 아님, Valve와 마찬가지로 "Tag당 QTY=1이라 부족/잉여 개념 희박" 원칙 적용

## 검증 계획

테스트 프레임워크가 없으므로(프로젝트 컨벤션), `python app.py` 실행 후 브라우저(Playwright MCP)로:
1. Spool 탭 → KPI 카드 3개 모두 숫자 표시(Loading 아님), Progress % ≈ 72.8%(385/529) 확인
2. Dashboard → 8번째 Spool KPI 카드 표시, Overall %가 7개 평균으로 재계산됨 확인
3. 사이드바 전체 순회 + Material Status 4개 탭 재확인 — 콘솔 에러 없음(회귀 없음)
