# Valve/Speciality Spare 탭 신설 설계

## 배경

Valve/Speciality Receiving 데이터 안에는 실제 설치 대상 BOM Tag와 매칭되지 않는 "예비 밸브/기기 본체"(spare) 행이 섞여 있다. 이 행들은 원본 Packing List에서 BOM Tag가 없어 앱 임포트 시 `parent_tag` + `-SPARE-{seq}` 형태(또는 `SPARE 1`, `SPARE 2` 같은 대표 태그)로 유니크한 tag 값이 부여됐다. 현재는 Valve Receiving 탭(`#recTagValve`)에 일반 태그 있는 행들과 뒤섞여 표시되고 있어, 실제 설치용 자재 현황 파악을 방해한다.

DB 조사 결과(2026-07-06): `receiving` 테이블에서 `category IN ('Valve','Speciality')` 이면서 `tag ILIKE '%SPARE%'` 인 행은 137건(전부 category='Valve', Speciality는 현재 0건이나 향후 발생 가능). 이 137건에는 실제 예비 밸브/기기 본체(예: `GLOBE VALVE`, `CHECK VALVE`, `FORGING MANUAL VALVE`, `Pressure Safety Valve`)와, 그 예비품에 딸린 Accessory/Fitting 부속품(예: `FLANGE GASKET`, `FLANGE NUT`, `FLANGE BOLT`)이 함께 섞여 있다.

## 분류 규칙 (사용자 확인 완료)

- **Spare 탭 대상 조건**: `category IN ('Valve', 'Speciality')` AND `tag`에 `SPARE` 문자열 포함 (대소문자 무관) AND `full_description`이 기존 `ACCESSORY_RE` 정규식에 매칭되지 **않음**.
- **Accessory 제외 조건**: 위 태그 조건을 만족해도 `full_description`이 기존 `ACCESSORY_RE`(app.js:891, FLANGE/GASKET/NUT/BOLT/SCREW 등 30여 개 키워드)에 매칭되면 Spare가 아닌 Accessory/Fitting으로 간주해 **Spare 탭에서 제외**하고 기존 Valve/Speciality 탭에 그대로 남긴다.
- 현재 데이터 기준 검증 결과: 137건 중 **120건 Spare**, **17건 Accessory**(전부 category='Valve'). 이 결과로 진행하기로 확정.
- 탐지는 저장 컬럼이 아니라 **런타임 필터**로 수행한다(예: `receiving.purpose` 컬럼에 별도 값을 백필하지 않음 — 사용자가 Tag 문자열 패턴 방식을 선택함). 향후 새 데이터가 임포트되어도 tag에 `SPARE`가 포함되면 자동으로 이 규칙이 적용된다.

## UI 구조

- 사이드바 TAG ITEM (Receiving) 그룹: `Valve → Speciality → Spool → Support → Spare` 순서로 5번째 항목 추가(`data-target="rec_tag_spare"`, 아이콘은 `fa-box-archive`).
- 화면 구조는 Valve 탭(`#recTagValve`)을 그대로 복제한다.
  - 필터 패널: Search / PKG / PKG NO / Operation Type / Item / Mat 1 / Mat 2 / Size / Status + Export Excel 버튼 (Valve와 동일 구성 유지)
  - 테이블 컬럼: PKG / PKG NO / TAG NO / Operation Type / Valve Type / Item / Mat 1 / Mat 2 / Size / Rating / Unit / Qty / Status / Purpose (Valve와 동일)
- **유일한 표시 차이**: TAG NO 컬럼에 실제 합성 태그(`PGU-DE-0542-BOP-VLV-002-SPARE-04` 등) 대신 고정 텍스트 **"Spare"**를 표시한다. 나머지 컬럼은 원래 데이터 그대로 표시.
- Material Status(Stock/Material Summary) 섹션에는 대응 탭을 추가하지 않는다 — Spare는 BOM에 없는 항목이라 "BOM 대비 입고율" 개념이 성립하지 않으므로, TAG ITEM (Receiving) 목록 화면 전용으로 범위를 한정한다.

## 기존 Valve/Speciality 탭과의 관계

- Spare로 분류된 120건은 기존 Valve Receiving 탭(`#recTagValve`)에서 **제외**한다(중복 표시 방지). Speciality 탭도 동일 규칙 적용(현재 대상 0건이나 로직은 공유).
- Accessory로 분류된 17건은 기존 탭에 그대로 남는다 — 이번 변경으로 동작이 바뀌지 않는다.
- Stock/Material Summary(`buildTagRecvMaps`)는 원래부터 BOM Tag 기준으로만 집계하므로 이 137건(BOM에 없는 합성 태그)은 애초에 집계 대상이 아니었다 — 이번 변경으로 인한 수치 영향 없음.
- Dashboard KPI(`updateCategoryCharts`)의 Valve/Speciality 합계도 BOM Tag 매칭 기준이라 영향 없음(사전 확인 필요, 아래 검증 계획 참고).

## 구현 컴포넌트 (구현 계획 단계에서 상세화)

1. **공용 정규식 추출**: `ACCESSORY_RE`를 `updateCategoryCharts()` 지역 변수(app.js:891)에서 모듈 top-level 상수로 승격해, Spare 필터링 로직과 공유.
2. **Spare 판별 헬퍼**: `isSpareRow(r)` 같은 공용 함수 추가 — `(r.category==='Valve'||r.category==='Speciality') && /SPARE/i.test(r.tag) && !ACCESSORY_RE.test(r.desc)`.
3. **기존 렌더러 수정**: `renderTagValveTable()`(app.js:3941) 및 `renderTagSpecialityTable()`/`_renderRecvCore` 경로에 `isSpareRow(r)` 인 행 제외 필터 추가.
4. **신규 렌더러**: `renderTagSpareTable()` — Valve 렌더러 구조를 복제하되 카테고리 필터를 Valve+Speciality로, 대상 조건은 `isSpareRow(r)`, TAG NO 표시만 고정 문자열 `"Spare"`로 대체.
5. **탭 배선**: `REC_TAB_MAP`에 `rec_tag_spare: { sec: 'tag', tab: 'spare' }` 추가, `initReceivingTabs`/`switchReceivingTab`의 tag 탭 목록에 `recTagSpare` 포함, `renderActiveReceivingTab()`에 `'spare' → renderTagSpareTable()` 분기 추가.
6. **HTML**: `templates/index.html`에 `#recTagSpare` 패널(Valve 패널 마크업 복제, id/필터 id만 신규 접두어로 교체) + 사이드바 nav-item 추가.
7. **Export**: 기존 `_exportTagRecvRows` 패턴 재사용해 Export Excel 버튼 배선.

## Out of scope

- Material Status(Stock/Material Summary)에 Spare 탭 추가
- Dashboard KPI/Bulk Progress Bars에 Spare 반영
- `receiving.purpose` 컬럼 백필/활용
- 137건 외 과거 데이터의 소급 정합성 검증(예: Speciality에 향후 유사 패턴이 실제로 나타났을 때의 별도 검증)

## 검증 계획

테스트 프레임워크가 없으므로(프로젝트 컨벤션), `python app.py` 실행 후 브라우저(Playwright MCP)로:
1. Spare 탭 클릭 → 총 120행 표시, TAG NO 컬럼이 전부 "Spare"로 표시되는지 확인
2. Valve 탭 → 기존 대비 120행 감소(합성 SPARE 태그 행 사라짐), Accessory 17건은 여전히 표시되는지 확인
3. Dashboard/Material Status의 Valve/Speciality 관련 수치가 변경 전후 동일한지 확인(회귀 없음)
4. 사이드바 전체 섹션 재클릭 — 콘솔 에러 없음 확인
