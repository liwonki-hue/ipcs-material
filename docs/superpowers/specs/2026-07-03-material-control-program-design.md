# Material Control 프로그램 개발 현황 (진행 중)

> 이 문서는 "develope" 명령어로 재개되는 **Material Control 프로그램 전체**의 누적 설계 문서다. 아래 원칙(0번)은 Piping/Fitting/Others/Support/Spool/Valve/Speciality 전 카테고리에 적용되는 것이고, 그 뒤(1번부터)는 이 원칙을 **Valve에 처음 적용한 사례**를 다룬다. 다른 카테고리에 같은 원칙을 적용할 때도 이 구조를 따른다. 새 세션에서 이어받을 때는 이 문서 전체를 먼저 읽고, 마지막 "현재 상태 / 다음 할 일" 섹션부터 확인한다.

## 0. 전체 원칙 — 재고/부족자재 관리는 고유 코드가 있는 항목만 대상

이건 Valve만의 문제가 아니라 **Material Control 프로그램 전체에 적용되는 원칙**이다.

설계-구매-Packing List-입고 각 단계가 **동일한 코드를 공유하지 않고 Description(자유 서술)으로만 식별 가능**한 경우가 많다. 이 때문에 자재관리는 Joint Master(용접 조인트)나 Drawing Master(도면)보다 Data Matching·추적이 훨씬 어렵다 — 저것들은 고유 번호 체계가 이미 확립되어 있지만 자재는 그렇지 않다.

| 카테고리 | 고유 코드 유무 | 매칭 키 |
|---|---|---|
| Piping/Fitting/Others | Tag 없음 | 자체 **MatCode Master** (`ITEM-MATL-SIZE-SCH-ET` 형식) |
| Support | 대부분 Bulk Item(Tag 없음) | MatCode 또는 별도 처리 (Piping과 유사한 문제) |
| Valve/Speciality | Tag(기기번호) 있음 | **Tag 자체**를 매칭 키로 사용 |
| Spool | Tag(Spool No) 있음 | **Spool No 자체**를 매칭 키로 사용 (2026-07-06 확정, "Spool 적용 사례" 참고) |

**원칙: 매칭은 항상 Tag(또는 MatCode) 같은 고유 코드로만 하고, Description은 표시용으로만 쓴다.** Description은 단계마다 달라도 문제없어야 한다. 코드가 없는 자재(부속품/소모품/공구 등)는 **재고/부족자재 관리 대상이 아니라 참고 정보**로만 다룬다 — 이 구분(관리 대상 vs 참고 정보)도 카테고리 공통 원칙이다.

새 카테고리를 다룰 때마다 먼저 확인할 것: "이 자재가 설계-구매-Packing List 간 공유하는 고유 코드가 있는가?" 있으면 그 코드로 매칭(Valve처럼), 없으면 MatCode류 자체 코드 체계가 필요한지 판단.

---

## Valve 적용 사례 (진행 중)

아래는 위 0번 원칙을 Valve/Speciality 카테고리에 처음 적용한 구체적 작업 기록이다.

### 1. 발견된 문제와 이미 완료된 수정 (2026-07-02)

`receiving` 테이블에서 Valve/Speciality 부속품이 `tag='Tool'`/`'COMMISSIONING'`/`'Steam Blow Tool'`/`'Hydro Test Tool'`/`'HP TBS D-TUBE'`/`'LP TBS D-TUBE'` 같은 통짜 문자열로, 또는 Speciality는 아예 `tag=NULL`로 뭉쳐있었다. Material Finding Mode C(Item 검색, `app.js` `btnFilterItem`)가 `tag`로 그룹핑하다 보니 서로 무관한 수백 개 품목이 한 행으로 합쳐지는 실사용 버그로 이어졌다.

**수정 완료**: `receiving`에 `parent_tag` 컬럼 추가, Valve 783건 + Speciality 334건을 `{parent_tag}-{일련번호}` 형태의 유니크 tag로 재생성. 실제 밸브 Tag가 본체+부속품 여러 행을 정상 공유하는 경우(예: `B1-NV-30201A`)는 건드리지 않음. 상세: `project_valve_bucket_tag_fix.md` (메모리).

**교훈**: anon key로 UPDATE(PATCH) 실행 시 RLS UPDATE 정책이 없으면 HTTP 200이지만 실제로는 0행 변경됨 — `Prefer: return=representation`으로 항상 검증할 것.

### 2. Valve (Receiving) 신규 등록 포맷 (설계 완료, 사용자가 파일 작성 중)

파일: `Raw File/Valve (Receiving)_Format_Template.xlsx` (5개 시트)

### 핵심 원칙
- **재고/부족자재 관리는 Tag가 있는 것만 대상.** Tag 없는 부속품/소모품/공구/예비 완제품 밸브는 관리 대상이 아니라 설치 시 참고 정보일 뿐.
- 식별자(Tag)는 물리적 대상이 같을 때만 공란 규칙 적용, 속성(Valve Type 등)은 반복 채움 — Excel 필터/피벗이 바로 되도록.
- PARENT TAG 자리에 PKG NO를 대신 넣지 않는다 (이미 별도 컬럼이라 중복이고 Tag 연결이라는 오해를 줌). 특정 Tag를 알 수 없으면 그냥 공란.
- `COMPONENT CLASS`(Body/Spare/Tool/Spare Valve) 구분은 결국 전부 제거함 — 재고관리 관점에서 "Tag 유무"만 의미가 있고 나머지는 다 똑같이 "비관리 대상"이라 세분화가 무의미했음 (Body/Spare Valve 구분도 TAG NO 유무와 100% 중복이라 제거).
- "밸브 몸통 정보"(Type/조작방식/ISO/Line No)와 "부속품 목록"을 시트 2개로 분리해 반복 입력을 없앰 (한 Tag에 부속품이 100건 넘게 붙는 경우도 있음 — 예: `B1/B2-PCV-27081/2`가 116건).

### 시트 1: `Valves` — Tag 있는 밸브만 (관리 대상 전체)
`PKG, PKG NO, CATEGORY, TAG NO, VALVE TYPE, OPERATION TYPE, ISO DWG NO, LINE NO, MAT, SIZE, RATING, UNIT, QTY, STATUS`

- `VALVE TYPE`: 실제 밸브 종류(Gate/Globe/Ball/Check/Butterfly/Safety Valve 등). **"MOV"는 밸브 종류가 아니라 액추에이터 방식**이므로 여기 쓰지 않음.
- `OPERATION TYPE`: MOV/AOV/Manual/Manual+Gear 등.
- `ISO DWG NO`/`LINE NO`: 이 밸브가 설치되는 배관 정보. **현재 원본에 없는 정보라 공란으로 시작, 추후 입력 예정.**

### 시트 2: `Untagged Items` — Tag 없는 모든 것 (비관리, 참고용)
`PKG, PKG NO, TAG NO (참조), SEQ NO, DESCRIPTION, MAT, SIZE, UNIT, QTY, STATUS`

- `TAG NO (참조)`: 이 항목이 어느 Valves 행에 딸린 것인지. **특정 가능할 때만** 채움(예: Stem packing → 그 밸브 Tag). 특정 불가하면 공란 (여러 밸브 공용 Tool, 예비 완제품 밸브 등).
- `SEQ NO`: `TAG NO (참조)`가 채워진 행에서만 "그 Tag의 몇 번째 항목" 의미 (01, 02...). 참조가 공란이면 SEQ NO도 공란 — 붙일 대상이 없어 의미 없음.
- 예비 완제품 밸브(예: Tag 없이 통째로 예비 재고로 들어온 Ball Valve 53개)도 이 시트에 들어감 — Tag가 없으므로 관리 대상 아님.

### 그 외 시트
- `컬럼 설명`: 전체 컬럼 성격/작성 규칙 표
- `원본 확인 필요`: 원본 데이터 자체의 이상 사례 기록 (아래 3번 참고)
- `프로그램 활용 및 효과`: 이 포맷이 실제 프로그램 기능과 어떻게 연결되는지 정리

### 3. 원본 데이터에서 발견한 이슈 (사용자 확인 필요, 아직 미해결)

`PGU-DE-0363`(Control Valve)에서 동일 TAG NO가 서로 다른 Size/Rating으로 2개 패키지에 등록됨:
- `B1-LCV-34083`, `B2-LCV-34083`, `B0-PCV-37017` → 예: `B0-PCV-37017`이 CV-001(4"/CL150)과 CV-002(3"/CL600)에 서로 다른 규격으로 등장.
- 같은 밸브가 두 번 실린 게 아니라 서로 다른 실물에 같은 Tag가 잘못 붙었을 가능성. 원본 재확인 필요. 템플릿에는 일단 CV-001 값만 반영해둠.

### 4. Material Finding "설치 시 필요 부속품/공구" 조회 (신규 기능, 미착수)

Item 검색(Mode C)에서 Tag를 조회하면 BOM/입고/재고 아래에 서브 섹션 추가:
- 1단계(정확): `Untagged Items`에서 `TAG NO (참조)`가 일치하는 행
- 2단계(느슨, 참고용): 같은 `PKG NO`에 속한 나머지 항목 (특정 Tag로 못 붙는 공용 품목)

### 5. 전체 실행 순서 (사용자 승인됨, 2026-07-03)

1. **[진행 중, 사용자 작업]** `Valves`/`Untagged Items` 포맷으로 새 Valve (Receiving) 파일 완성
2. 완성되면 `receiving` 테이블에 재적재 (Tag 유니크성 보장 — 검증된 방식 재사용)
3. **[완료, 2026-07-05]** 설계팀 Valve List BOM 확보 → `bom` 테이블에 category='Valve'로 등록 (Tag 키로 매칭) — 상세: 아래 "6. Valve List BOM DB 등록 (완료, 2026-07-05)" 섹션
4. Pipe/Fitting/Others처럼 Valve도 BOM 대비 입고/재고/부족자재 계산 가능해짐 — **Stock 탭만 우선 적용됨(Shortage/Surplus는 제외, 아래 6번 참고)**
5. Material Finding Item 검색에 "설치 시 필요 부속품/공구" 서브 섹션 추가 (위 4번) — **미착수**
6. Dashboard에 Valve KPI 카드 추가 검토 — **미착수**

### 6. Valve List BOM DB 등록 (완료, 2026-07-05)

설계팀 Valve List(`Raw File/Valve List.xlsx`, 시트 `VALVELIST_BOP` — SYSTM/ISO DRAWING/LINE NO/TAG/OPERATION TYPE/VALVE TYPE/MAT 1/MAT 2/SIZE/RATING/END TYPE/QTY, 2,747행, TAG 100% 유니크·NULL 없음)를 `bom` 테이블에 category='Valve'로 등록. BOM 탭에는 Fitting 다음(Others 이전)에 VALVE 서브탭으로 배치. 스크립트: `scratch/insert_valve_bom.py`.

**핵심 결정 — Valve는 MatCode를 만들지 않는다 (사용자 지시, 2026-07-05):** `bom.mat_code`를 Valve 행에는 항상 NULL로 둔다. Valve/Speciality는 0번 원칙대로 Tag 자체가 고유 키이므로 별도 MatCode 코드 체계가 불필요 — 과거(2026-05-27 커밋 `c0bca9b`/`0d67c3e`)에는 `BAV-CS05-D030-C150-RF` 형식 MatCode를 생성해 `receiving.mat_code`에 남아있는 레거시가 있지만, 이번 등록부터는 이 방식을 쓰지 않는다. 대신:
- `mat1` = 재질 등급 분류(CS/SS/ALLOY (P91)/ALLOY (P22), Pipe/Fitting과 동일 관례) — MAT2 원본 값(A105/A216-WCB/A351-CF8/A182-F316L 등)으로부터 매핑.
- `mat2` = 원본 MAT 2 값 그대로.
- `full_description` = `"{VALVE TYPE} VALVE, {MAT2}, DN {mm}, CL{rating}, {SW/BW/RF/FF}"` 형식 — Item/Rating/Size 추출은 전부 이 문자열 기반 fallback으로 동작(아래 참고).

**MatCode가 없어서 생긴 로직 변경(app.js, "각종 Logic Update"):**
- BOM 탭 첫 컬럼: MatCode 없으면 Tag를 대신 표시(`b.mat_code || b.tag`), 헤더도 Valve 탭 활성화 시 "Tag"로 전환.
- `getRatingForMatCode()`에 `fullDescription` 폴백 인자 추가 — MatCode 세그먼트가 없으면 Description의 `CL\d+` 패턴에서 직접 추출.
- BOM 탭 Item/Rating 필터: Valve는 `mat_code ilike 'PREFIX-*'` 방식이 항상 무효(NULL이라)이므로 `full_description ilike` 방식으로 분기 처리. Item/Rating 드롭다운도 Valve는 고정 목록(GATE/GLOBE/CHECK/BUTTERFLY/BALL VALVE, CL150/300/600/1500) 사용 — MatCode 파싱 기반 동적 추출이 안 되기 때문.
- **Size 컬럼 추출 순서 주의**: Valve는 Line No가 밸브 자체 규격이 아니라 설치된 호스트 배관 사이즈일 수 있음(예: 6" 라인의 1" 드레인 밸브) — 그래서 Valve 행은 Line No보다 Description의 `DN xx` 표기를 먼저 사용하도록 순서를 바꿈. Pipe/Fitting/Others는 기존 순서(MatCode → Line No → Description) 그대로 유지.

**Material Status(Stock/Shortage/Surplus) 및 Material Summary 확장 범위 (사용자 확인, 2026-07-05):**
- Shortage/Surplus는 원래부터 `['Pipe','Fitting','Others']`로 하드코딩되어 있어 Valve를 제외해왔음 — **이번에도 그대로 유지, 확장 안 함** (Valve는 Tag당 QTY=1이라 "부족/잉여 수량" 개념 자체가 희박하다는 판단).
- **Stock 탭에만 Valve 서브탭 추가**(Piping/Others 옆). MatCode 기반 공용 로직(`renderStockTable`/`_buildBomMap` 등)은 재사용하지 않고, Tag 기준 전용 함수(`loadValveStockBom`/`renderValveStockTable`)를 새로 작성 — 컬럼: Tag/System/ISO Drawing/Line No/Item/Mat1/Mat2/Size/Rating/Received/Stock (BOM Qty·Issued·Unit 제외 — 전부 1개/미사용이라 의미 없음).
- **Material Summary도 동일한 방식으로 Valve 서브탭 추가**(Piping/Fitting/Others 옆), Stock Valve와 완전히 동일한 데이터 소스·컬럼 재사용(`renderMssValveTable`).
- 두 화면 모두 기존 MatCode 기반 테이블/필터 패널은 그대로 두고, Valve 탭 활성화 시에만 별도 패널(`#stockValvePanel`/`#mssValvePanel`)로 전환 표시 — 기존 Piping/Fitting/Others 로직은 전혀 건드리지 않음(회귀 없음, Playwright 스모크 테스트로 확인).

### 남은 일 (Valve, 2026-07-05 기준)
- [ ] Material Finding Item 검색에 "설치 시 필요 부속품/공구" 서브 섹션 (Untagged Items 연동, 미착수)
- [ ] Dashboard Valve KPI 카드 추가 검토 (미착수)
- [ ] 926개 System/ISO Drawing 공란 Tag — 향후 데이터 업로드 예정(사용자 확인, 이번 라운드는 BOM DB 등록 + Tag 매칭 연결까지만 범위)

## 7. Valve (Receiving) 재적재 (완료, 2026-07-05)

`Raw File/Valve (Receiving).xlsx`(Valve 시트 2,715행 + Untagged Items 시트 1,180행)로 `receiving` 테이블 category='Valve'를 **전체 교체**. 스크립트: `scratch/reload_valve_receiving.py`.

### 배경 — 이 파일은 새 데이터가 아니라 기존 DB의 재분류
사용자 확인: 이 파일은 기존 `receiving`의 Valve 데이터를 새 Valves/Untagged Items 포맷으로 사용자가 직접 재분류한 것. 따라서 등록 전 기존 DB와 대조 검증을 거쳤다.

### 대조 결과 및 사용자 결정
- **패키지 커버리지**: DB는 15개 문서(PGU-DE-xxxx), 새 파일은 14개(0364/0521 없음, 0540은 새로 추가됨) → **사용자 확인: 새 파일 기준 전체 교체, 0364/0521도 함께 삭제**.
- **수량 불일치**: 일부 패키지(특히 `PGU-DE-0536-BOP-BFV-*` 계열)는 DB 수량이 새 파일보다 15~17배 많았음(예: BFV-007 DB=988 vs 파일=63) → **사용자 확인: 새 파일 수량이 맞고, DB의 큰 수량은 과거 오류로 부풀려진 것**.
- 최종: 기존 3,629행 전량 삭제, 새 파일 기준 3,892행(Valve 2,712행[3개 순수 artifact 행 제외] + Untagged 1,180행)으로 교체. Qty 합계 6,982.

### Tag 유니크화 (project_valve_bucket_tag_fix와 동일 원칙 재적용)
새 파일에도 과거와 같은 유형의 통짜/중복 Tag가 재발견됨(`SPARE`, `HP TBS D-TUBE`, `LP TBS D-TUBE` 같은 리터럴, `B0-PCV-37017`/`B1-LCV-34083` 같이 서로 다른 PKG에 동일 Tag가 다른 규격으로 중복 기재된 경우, `PGU-DE-390` 계열의 동일 Tag 2~3회 반복). 전부 `parent_tag=원래 TAG NO, tag={parent_tag}-{일련번호:02d}` 방식으로 유니크화(원래 값은 `parent_tag`에 보존되어 추적 가능). Untagged Items의 `TAG NO (참조)`가 있으면 그 Tag를, 없으면 PKG NO를 parent_tag로 사용.

### RLS 함정 재확인 — receiving에 DELETE 정책이 없었음
`receiving` 테이블에 **DELETE RLS 정책이 없어** 기존 3,629행 삭제 요청이 200 OK를 반환하고도 실제로는 0행 삭제됨 (UPDATE 정책 부재와 같은 유형의 함정, [[project_valve_bucket_tag_fix]] 참고). 신규 3,892행을 먼저 넣어버려 일시적으로 7,521행(중복) 상태가 됐던 것을 발견 → 사용자가 Supabase SQL Editor에서 `scratch/add_receiving_delete_policy.sql` 실행 후 기존 3,629행만 재삭제하여 정리 완료. **앞으로 receiving을 DELETE하는 스크립트는 반드시 `Prefer: return=representation`으로 실제 삭제 행 수를 확인할 것 — status 200/204만으로 성공을 판단하지 말 것.**

### 기타 함정 — receiving.id는 auto-increment가 아님
`receiving.id`가 NOT NULL이고 자동 채번되지 않아, insert 시 반드시 현재 최대 id를 조회해 명시적으로 채번해야 함(`bom`/`vendor` 테이블은 auto-increment라 이 문제가 없었음 — 테이블마다 다르므로 매번 확인 필요).

### 검증 결과
- 최종 3,892행, Tag 100% 유니크(중복 0건) 확인.
- BOM(Valve, 2,747 Tag) ↔ 새 Receiving(3,892 Tag) 매칭: 2,249개 일치(81.9%, 기존 낡은 데이터 기준 72.8%보다 개선). BOM에 없는 Tag는 MOV/CV/PSV/BYPASS 등 Manual Valve List(BOM) 범위 밖의 밸브 종류라 정상.
- Material Status Stock(Valve), Receiving TAG Item(Valve) 탭 Playwright 확인, 콘솔 에러 0건.

## 8. Valve Receiving 화면 개편 (완료, 2026-07-05 같은 날 이어서)

사용자 요청: Category 컬럼 제거, Tag No 다음에 Operation Type/Valve Type 컬럼 추가(같은 Gate Valve라도 MOV/Manual은 설치 구역이 다름), Mat을 Mat1/Mat2로 분리, Size/Rating 등은 Tag가 BOM과 일치하면 BOM 데이터로 채움(원본 입력값이 틀린 경우 BOM 우선).

### DB 스키마 변경
`receiving`에 `op_type, valve_type, mat1, mat2, size, rating` 컬럼 추가(`scratch/add_receiving_valve_columns.sql`, 사용자가 Supabase SQL Editor에서 실행). 기존에는 이 정보들을 `full_description` 텍스트 하나에 뭉쳐서 저장했었는데(0705 1차 재적재 때), 그 텍스트 포맷이 Receiving 화면의 파싱 정규식과 안 맞아 Type/Mat/Size/Rating이 전부 "-"로 보이는 회귀가 있었음 — 이번에 구조적 컬럼으로 전환하며 근본 해결.

### `reload_valve_receiving.py` 2차 개정 로직
- Valve 시트의 Operation Type(MOV/BYPASS/PSV/CV/MANUAL)/Valve Type(원본 설명, 예: "FLEXIBLE WEDGE GATE VALVE")을 그대로 `op_type`/`valve_type` 컬럼에 저장.
- Mat은 `mat1`(재질 등급, Pipe/Fitting과 동일한 CS/SS/ALLOY 분류)/`mat2`(원본 규격)로 분리.
- **BOM 우선 원칙**: `bom`(category='Valve')에서 tag→{mat1, mat2, size(DN→inch 환산), rating(CL### 추출)} 참조맵을 먼저 만들고, receiving 행의 원래 Tag(일련번호 접미사 붙이기 전의 raw tag)가 이 맵에 있으면 Mat1/Mat2/Size/Rating을 **BOM 값으로 덮어씀** — 2,712행 중 2,295건이 BOM 값으로 보정됨(원본 파일엔 SIZE가 자주 비어있었는데 BOM에서 채워짐). BOM에 없는 Tag(MOV/CV/PSV/BYPASS 등 Manual Valve List 범위 밖)는 원본 파일 값 그대로 사용.

### UI 변경
- `#valTable` 컬럼: `PKG | PKG NO | TAG NO | OPERATION TYPE | VALVE TYPE | ITEM | MAT 1 | MAT 2 | SIZE | RATING | UNIT | QTY | STATUS | PURPOSE` (Category 제거, ITEM은 Valve Type에서 정규화 추출한 값으로 유지 — 필터 드롭다운용).
- Operation Type 필터 드롭다운 추가(`valOpTypeFilter`).
- **공용 `_renderRecvCore`(MatCode 기준 공통 렌더러)를 사용하지 않고 Valve 전용 렌더 함수(`renderTagValveTable` 재작성)로 분리** — Valve는 MatCode가 없어 공용 로직의 `effMat` 기반 파싱이 전부 무효했기 때문. Item/Size/Operation Type 필터 옵션도 `valveType`/`size`/`opType` 직접 필드 기반으로 재구성(기존엔 `bomTagMap`+MatCode 파싱 방식이라 Valve에서 제대로 동작하지 않았음). Piping/Fitting/Others/Speciality/Support가 쓰는 `_renderRecvCore`는 손대지 않음(회귀 없음, Playwright로 Speciality 탭 확인).

### 검증
- BOM 매칭 Tag(`B0-MV-40466`) 검색 시 Size='1"'/Rating='CL600'/Mat1='SS'/Mat2='A182-F304' 정상 표시(원본 파일엔 Size가 비어있었으나 BOM에서 채워짐).
- Operation Type 필터(All/BYPASS/CV/MANUAL/MOV/PSV) 정상 동작.
- Speciality Receiving, Material Status Stock(Valve), Material Summary(Valve) 탭 회귀 없음, 콘솔 에러 0건.

### 6. 다른 카테고리로의 확장 (추후)

Valve 사례가 안정화되면, 같은 0번 원칙을 Support(Bulk Item 문제)와 Spool에도 적용할지 검토. Piping/Fitting/Others는 이미 MatCode Master로 이 원칙이 적용되어 있음.

---

## Piping/Others BOM 검증 및 Vendor 탭 분리 (진행 중, 2026-07-04 시작)

### 배경
`Raw File/LB BOM_260420.xls`(Large Bore) / `SB BOM_260420.xls`(Small Bore)가 새로 재업로드됨. 이전([[project_bom_not_mto_cleanup]])과 파일 구조가 달라짐 — LB/SB가 더 이상 "전체/부분집합" 관계가 아니라 **Bore 기준으로 완전히 양분된 두 파일**(LB=15,132행, SB=30,400행, Piping&Fitting 12컬럼 동일).

### 핵심 도메인 규칙 (사용자 확인, 2026-07-04)
1. **Large/Small Bore 기준**: Line No 맨 앞 사이즈 표기 기준 **2" 초과=Large Bore, 2" 이하=Small Bore** (앱의 `getBoreFromLineNo`와 동일 기준).
2. **HP STEAM SYSTEM / LP STEAM SYSTEM은 Spool로 공급되는 자재라 BOM DB 관리 대상이 아님.** LB BOM 원본에는 존재하지만 `bom` 테이블에는 의도적으로 제외.
3. `bom` 테이블에서는 System을 현장 관리 코드인 `HP`/`LP`로 저장 (Excel의 풀네임 `HP STEAM SYSTEM`이 아님).
4. **분류는 반드시 SYSTEM 컬럼 기준으로만 할 것 — ISO Drawing/Line No에 포함된 코드 세그먼트로 시스템을 추측하면 안 됨.** 예: Line No의 `ST` 코드는 시스템이 아니라 "Vent Line" 타입이고, Vent/Drain은 여러 System에 걸쳐 공용으로 쓰임. (실제로 이 원칙을 어기고 ISO코드 세그먼트로 분류했다가 194개 "누락 ISO"가 HS/ST/LS/AS 4개 그룹으로 잘못 나뉘었는데, SYSTEM 컬럼 기준으로 다시 보니 실제로는 HP STEAM(72)/STEAM BLOWING(62)/LP STEAM(60) 3개뿐이었음.)
5. **Sampling System은 전량 Small Bore.**
6. `BWF`(Feedwater 배관 계열)는 실제 배관이 여러 System과 물리적으로 연결돼 있어서, 다른 System 자재의 Line No 안에 `BWF` 세그먼트가 섞여 나타나는 경우가 있음 — 이것도 ISO코드만으로 시스템을 판단하면 안 되는 이유 중 하나.

### 완료된 작업 (2026-07-04)
- **Task 1 (Piping&Fitting 대조)**: ISO+단위 기준 7,445개 조합 중 7,443개 수량 정확히 일치, DB에만 있고 Excel에 없는 항목 0건. 차이 194개 ISO는 전부 HP/LP Steam + Steam Blowing 계열로 확인(오류 아님). 원본 Excel 자체에 ISO Drawing No.가 빈 칸인 행 471건 발견(설계팀 원본 결함, 별도 확인 필요).
- **`bom` 테이블 정리**: `system='HP'` 2,519건 + `system='LP'` 2,026건(총 4,545건) 삭제 완료 — 기존 삭제 작업이 축약 코드(HP/LP)가 아닌 풀네임 문자열 기준으로 실행되어 누락됐던 것. `system='SS'`(1,826건, Line No에 `BWF` 세그먼트 포함)는 Steam과 무관해 보여 이번엔 건드리지 않음 — 삭제 전 세션 스크래치패드에 JSON 백업 저장(세션 종료 시 소실, 필요시 같은 방식으로 재계산 가능).
- **Task 2 (Bolt&Gasket 대조)**: 새 파일은 LB/SB 둘 다 `Not MTO` 컬럼 보유(이전엔 SB만 있어 절반은 판단 불가였음). DB Others(GSKT/STB) 4,554행을 ISO+종류 기준 대조 결과 — 632개 조합은 이미 깨끗(추적 대상만), 442개는 타사공급만 있는데 아직 Others에 남아있음(Vendor 이동 대상), 346개는 추적+타사공급이 섞여 있어(Mixed) ISO 단위로는 분리 불가.
  - Mixed 346개 중 94개 조합에서 **동일 행이 2~3회 중복 삽입된 데이터 버그 발견** (예: `CCP-W-B129-PI-140-LC-031-2`의 `GSKT-SW304-2"-CL150`이 3번 반복). 재적재 시 자동 해소 예정.
- **PMC-Class 매핑**: Line No의 PMC 코드는 **FLANGE 아이템의 THICK/SIZE 컬럼에 CLASS가 함께 표기됨**(예: PMC=`DB1`인 FLANGE 행 THICK=`CL600 X S-40`). Gasket은 Flange에 맞춰 설치되므로 같은 PMC의 FLANGE 아이템에서 CLASS를 그대로 가져오면 됨(사용자 확인, 2026-07-04). 이 방법으로 Bolt&Gasket 실사용 PMC 12종 중 **9종 자동 추출 성공**(GB1=CL150, GK1=CL150, FB1=CL300, DB1=CL600, BB1=CL1500, FB2=CL300, BA1=CL1500, GM1=CL150, FN1=CL300, 일치율 대부분 100%에 근접). **FK1/GL1/FM1 3종은 자동 추출 불가**(해당 PMC를 쓰는 FLANGE 아이템 자체가 없음 — 전부 SW/BW 배관이라 Gasket이 Valve/기기 플랜지에 물리는 것으로 추정) → `Raw File/PMC_Class_Mapping_Request.xlsx`를 9종 확인용 + 3종 입력요청용으로 재생성해 요청함.

### Bolt&Gasket 시스템 예외 규칙 (사용자 확인, 2026-07-04 — HP/LP Steam 삭제 규칙과 다름 주의)
Piping&Fitting(배관재 자체)과 달리, **Bolt&Gasket(개스킷/볼트)은 Spool 제외 대상에서 빠진다** — "Spool은 Bolt&Gasket을 포함하지 않기 때문"(현장에서 플랜지 체결 시 별도로 조달·설치). 따라서:
- **HP STEAM SYSTEM / LP STEAM SYSTEM의 Bolt&Gasket은 포함**(제외하지 않음) — Piping&Fitting은 제외하지만 Bolt&Gasket은 포함하는 것으로 카테고리별 규칙이 다르다.
- **STEAM BLOWING SYSTEM만 Bolt&Gasket도 제외**(가배관이라 아예 대상 아님).

### 완료 (2026-07-04) — Others(GSKT/STB) 재적재 + Vendor 분리 + UI 구현
- CLASS 매핑 확정: GB1/GK1/GM1/GL1/FM1=CL150, FB1/FB2/FN1/FK1=CL300, DB1=CL600, BA1/BB1=CL1500. STB 마감 라벨: B7=HDG, B8=SS304, B8M=SS316, **B16=ALLOY**(F91 합금강 플랜지에 물리는 고온용 합금볼트 확인됨, 기존 DB에 선례 없어 신규 지정).
- Bolt&Gasket 4,127행(Steam Blowing 63건만 제외) 파싱 완료, 경고 0건 — **추적 대상 1,806행 → `bom`**, **타사공급 2,321행 → 신규 `vendor` 테이블**.
- ISO가 Piping&Fitting에 없어 System을 못 정했던 4건(`CCP-W-B128-PI-140-SV-191-1`)은 사용자가 별도 Drawing Registry에서 조회해 `system='AS'`로 확정.
- 기존 `bom`의 GSKT/STB/Insulation Kit 4,503건(중복 버그 포함) 삭제 후 재적재 완료, 백업은 세션 스크래치패드에 JSON으로 보관.
- `vendor` 테이블 신설(`scratch/create_vendor_table.sql`, RLS Public Select/Insert/Delete) 및 데이터 적재 완료.
- **Vendor 탭 UI 구현 완료**: 사이드바 BOM 섹션에 "Vendor" 메뉴 추가(`vendor_items` 섹션), BOM > Others 탭과 동일한 포맷(Search/System/Item/Mat1/Size 필터 + MatCode/System/ISO/Line No/Item/Mat1/Mat2/Size/Description/Unit/Qty 테이블, Export 지원). `renderVendorTable()`/`initVendorFilters()` (app.js). 전 탭 스모크 테스트 통과, 콘솔 에러 없음.

### 완료 (2026-07-05) — Pipe/Fitting BOM Mat1/Mat2 재구성
BOM 화면에서 Material 정보가 MAT1(재질 등급)/MAT2(실제 규격)로 명확히 분리되도록 재구성.
- **이전**: `mat1`에 `A106-B`처럼 실제 규격 스펙이 들어가 있어 "재질 등급"과 "규격"이 뒤섞여 있었음.
- **이후**: `mat1`=재질 등급(`CS`/`SS`/`ALLOY (P91)`/`ALLOY (P22)`), `mat2`=실제 규격(`A106-B`, `A234-WPB` 등).
- 분류 로직: MatCode의 MATL 세그먼트(2번째 하이픈 토큰) 기준 — `CS*`→CS, `SS*`→SS, `AS{n}`→`ALLOY (P{n})`, 예외로 `A53B`→CS/`S04L`→SS 고정 매핑. `mat2`는 `full_description`의 두 번째 콤마 구간에서 추출(예: `PIPE SMLS, A106-B, DN150, S-40, BE` → `A106-B`), 해당 구간이 없는 9건은 같은 MATL 세그먼트 내 최빈값으로 대체.
- Pipe+Fitting 39,272행 전체를 백업→삭제→재적재 방식으로 마이그레이션(수량 합계 전후 정확히 일치 확인). `bom` 테이블에 `id` 컬럼이 없어 행 단위 PATCH가 불가능 — 카테고리 단위 삭제+재적재가 유일한 방법임을 재확인.
- `refreshBomItemFilter()`(app.js)가 기존엔 `'Others'` 카테고리에서만 Mat1/Mat2 드롭다운을 채웠는데, 전 카테고리(`cat` 변수 기준)로 확장 — Pipe/Fitting 탭에서도 Mat1/Mat2 필터가 정상 작동하게 됨. Others 자체 Mat1 값(`S/S (304)`, `HDG` 등)과 Size 필터(길이 포함)는 회귀 없음(Playwright로 확인).
- `#bomTable` 컬럼폭: `table-layout:fixed` + `<colgroup>` 명시 적용, System -10px / Mat1 +5px / Mat2 +5px.
- 전 탭(Dashboard/BOM 5개 서브탭/Receiving 전체/Material Status/Shipping) 스모크 테스트 통과, 콘솔 에러 0건.

### 남은 일
- [ ] 원본 Excel의 ISO Drawing No. 공란 471행 처리 방침 확인 (원본 재확인 필요한 건인지, 무시 가능한 건인지) — Piping&Fitting 쪽 이슈, 이번 GSKT/STB 작업과 별개
- [ ] `Raw File/PMC_Class_Mapping_Request.xlsx` — FK1/GL1/FM1은 사용자 확답으로 이미 해소(FK1=CL300, FM1=CL150, GL1=GM1 오타로 CL150) — 파일 자체는 정리/삭제 검토 가능

### 관련 메모리
- `project_bom_not_mto_cleanup.md` — 이전 Not-MTO 정리 이력 (이번 작업으로 대체 완료)
- `project_stb_matcode_redesign.md` — STB matcode 재설계 이슈, 이번 새 Bolt&Gasket 시트의 실측 BoltSize/BoltLength로 재적재하며 사실상 해소됨(B16=ALLOY 포함 전체 4종 마감 라벨 확정)
- `project_lb_sb_bom_verification.md` — 이번 세션 전체 작업 상세 기록

---

## Material Summary 탭 신설 (Material Status 섹션, 2026-07-05 설계 승인)

### 배경
사용자가 "Material Status" 섹션(사이드바 `Material Status` → `#material_status`, 기존 STOCK/SHORTAGE/SURPLUS 탭 보유)에 BOM 탭 테이블 구조를 참고한 새 탭을 요청. 등록된 모든 자재를 System/ISO/Line/Item/Mat1/Mat2/Size/Unit/BOM Qty/Received/Issued/Stock 컬럼으로 보여주되 MatCode·Description·Packing List 정보는 제외.

### 범위 확인 (브레인스토밍으로 확정)
- 처음엔 "전체 카테고리(Valve/Spool/Support/Speciality 포함)"로 요청했으나, 각 카테고리 실제 스키마 확인 결과 구조가 서로 달라 그대로 통합하면 빈 칸이 많이 생기는 문제 발견.
  - Support: System/Line No 대신 Support Tag, Mat1/Mat2 대신 단일 Matl.
  - Valve/Speciality: Mat1/Mat2 분리 없음, BOM Qty/Issued Qty 자체를 추적하지 않음(Received/Stock만 존재).
  - Spool: ISO Drawing/Line No/Mat1/Mat2/BOM Qty/Issued Qty 개념 자체가 없음(입고 실적만 관리).
- **최종 확정 범위: Piping/Fitting/Others만** (BOM 탭 `#bomTable`이 다루는 것과 동일한 3개 카테고리, `bom_detail` 테이블 기준 약 39,272행). Valve/Spool/Support/Speciality는 이번 범위에서 제외.

### 계산 방식 확정
- Received/Issued/Stock은 **MatCode 전체(프로젝트 전체 재고) 기준**으로 계산 — 특정 BOM 라인에 실제 배분된 양이 아니라, 그 MatCode가 프로젝트 전체에서 얼마나 입고/불출/재고 상태인지를 참고용으로 보여줌.
- Material Finding(ISO Drawing 모드)의 라인별 FIFO 배분 방식은 **채택하지 않음** — 코드 주석에도 명시되어 있듯 ISO 한 장을 특정했을 때만 저렴하고, 전체 자재(39,272행)를 대상으로 하면 계산 비용이 너무 커짐.
- 재사용 로직: 기존 STOCK 탭의 `buildRecvMaps`(`isReceivingActive && isKpiReceiving` 필터, `forcedCats=['Pipe','Fitting','Others']`)와 `getIssuedQtyMap`을 그대로 재사용. 신규 SQL 뷰나 백엔드 API 불필요.

### UI/데이터 설계
- 탭 위치: Material Status 섹션 탭바에 `MATERIAL SUMMARY`를 신규 추가(STOCK/SHORTAGE/SURPLUS와 동일 레벨).
- 서브탭: BOM 탭과 동일하게 **Piping / Fitting / Others** 3분할(STOCK 탭의 Piping/Others 2분할과는 다름 — 데이터 원본이 3개로 나뉘어 있는 BOM 탭 패턴을 따름).
- 필터: Search(ISO/Line/Description), System, Item, Mat1, Mat2, Size 드롭다운 + Search/Clear/Export 버튼. PKG/PKG NO/DOC 필터는 제외.
- 컬럼(12개, MatCode·Description 제외): `System | ISO Drawing | Line No. | Item | Mat 1 | Mat 2 | Size | Unit | BOM Qty | Received | Issued | Stock`.
- 데이터 조회: BOM 탭의 `renderBomTable()`과 동일하게 `bom_detail`을 `range()` 서버사이드 페이지네이션으로 조회(System/Item/Mat1/Mat2/Size/Search 필터 동일 적용), 현재 페이지 행들의 MatCode를 Received/Issued 맵에서 조회해 붙임.
- Export: 기존 탭들과 동일하게 Export Excel 버튼 포함(현재 필터 조건 전체 결과 내보내기).

### 남은 일
- [ ] 구현 (신규 탭 HTML + `renderMaterialSummaryTable()` 등 app.js 로직)
- [ ] 스모크 테스트: Piping/Fitting/Others 서브탭 전환, 필터, 페이지네이션, Export 확인

## 현재 상태 / 다음 할 일 (Valve 적용 사례 기준, 마지막 갱신: 2026-07-05)

- [x] 통짜/NULL tag 버그 수정 및 검증 완료 (DB 반영됨, 1,117건)
- [x] Valve (Receiving) 신규 포맷 설계 완료, Excel 템플릿 작성 (`Raw File/Valve (Receiving)_Format_Template.xlsx`)
- [x] **사용자가 새 포맷(`Raw File/Valve (Receiving).xlsx`, Valve/Untagged Items 2시트)으로 파일 작성 완료 → `receiving` 테이블 category='Valve' 전체 재적재 완료 (2026-07-05, 3,892행). 상세: 아래 "7. Valve (Receiving) 재적재" 섹션**
- [x] `B0-PCV-37017`/`B1-LCV-34083` 등 중복 Tag 건 — 원본 재확인 대신 `parent_tag`+일련번호로 유니크화하여 데이터는 보존(재확인이 필요하면 `parent_tag` 컬럼으로 원래 Tag 추적 가능)
- [x] **설계팀 Valve List BOM(`Raw File/Valve List.xlsx`) 확보 및 `bom` 테이블 등록 완료 (2026-07-05, 2,747행, MatCode 없이 Tag 키만 사용)**
- [x] **BOM 탭에 VALVE 서브탭 추가 완료 (Fitting 다음, Others 이전)**
- [x] **Material Status Stock 탭 + Material Summary에 Valve(Tag 기준) 서브탭 추가 완료 — Shortage/Surplus는 범위 제외로 확정**
- [ ] Material Finding "설치 시 필요 부속품/공구" 서브 섹션 구현 (미착수)
- [ ] Dashboard Valve KPI 카드 추가 검토 (미착수)
- [ ] 926개 System/ISO Drawing 공란 Tag 후속 데이터 업로드 (사용자 예정)

## 관련 메모리
- `project_valve_bucket_tag_fix.md` — 통짜/NULL tag 수정 상세 내역, RLS 함정
- `project_material_matching_challenge.md` — MatCode Master 존재 이유, 자재관리가 어려운 근본 배경, Valve List BOM 등록 완료 반영
- `project_matcode_rules.md` — Valve matcode 할당 규칙 (TAG 있는 항목만, 단 신규 BOM 등록부터는 MatCode 자체를 생성하지 않는 것으로 정책 변경 — 2026-07-05)
- `project_pgu_de_0072_recovery.md` — PGU-DE-0072 197건 복구 완료 확인됨 (2026-07-02)
- `project_valve_bom_registration.md` — Valve List BOM DB 등록 + BOM/Material Summary/Material Status Tag 매칭 연결 작업 상세 (2026-07-05)

## Support 적용 사례 (진행 중, 2026-07-06 시작)

### 배경
`Raw File/Support BOM.xlsx`(CRITICAL/GENERAL/SB 3개 시트, 총 14,084행)에 SYSTEM/ISO DWG NO.가 공란이었음.
같은 사용자의 다른 모듈인 **ipcs-drawing 프로그램**(`C:\Users\PCLOVE\Downloads\ipcs-drawing`, 별도 Supabase 프로젝트 `wsvqeoufppcoeclbfbgz`, `drawing.support_master`/`support_latest` 테이블, 21,190건)을 **조회 전용**으로 참조해 SUPPORT TAG NO. 기준 매칭 후 채움. ipcs-material 모듈만 수정, ipcs-drawing 쪽은 손대지 않음.

### 매칭 결과
- CRITICAL: 3,389/3,447 (98.3%) 매칭, SYSTEM+ISO DWG NO. 채움
- GENERAL: 7,024/10,418 (67.4%) 매칭 — 기존에 ISO DWG NO.가 이미 있었기 때문에, **사용자 지시로 "도면(drawing DB) 기준"으로 전체 덮어씀**(기존 값과 DB 값이 다른 235건 포함)
- SB: 211/219 (96.3%) 매칭
- 미매칭(고유 태그 기준: GENERAL 1,960개, SB 2개)은 drawing DB에 아직 없는 support tag — 공란 유지. 도면팀 확인 필요.

### 중요 발견 — openpyxl 저장 버그 (데이터 유실 → 복구 완료)
`Raw File/Support BOM.xlsx`를 openpyxl로 `load_workbook()` → `save()` 방식으로 **두 번** 수정하는 과정에서, SUPPORT TAG NO.가 placeholder 값(`BULK`, `-`, 공란)인 행이 저장 시 통째로 사라지는 버그를 발견함 (CRITICAL 58행 + GENERAL 245행 = 303행 유실). 원인은 특정되지 않았으나(최소 재현 코드로는 재현 안 됨, 이 특정 파일에서만 발생), 매 저장마다 진행 전/후 원본과 태그 Counter를 diff해서 확인하는 습관으로 발견함. 최초 원본 백업(`Support BOM_backup_20260706_054643.xlsx`)에서 새 Workbook을 만들어 값만 복사하는 방식(`scratch/rebuild_support_bom_clean.py`)으로 무손실 재작성해 복구함.
**교훈: 이 파일(혹은 유사 구조의 대용량 xlsx)을 openpyxl로 in-place 수정할 때는 저장 전/후 행 수·태그 Counter를 반드시 diff 검증할 것.**

### support_bom 테이블 재적재 (완료, 2026-07-06)
- 기존 14,183행 전체 DELETE 후, 복구된 파일 기준 14,084행(3,447+10,418+219) 재적재 완료 (`scratch/import_support_bom_v2.py`)
- 컬럼 매핑은 기존 스크립트(2026-07-02, `scratch/import_support_bom.py`, 이제 삭제됨)와 동일: system/iso_dwg_no/support_tag/type/part_no/id_no/item/matl/size_or_type/length_mm/qty
- UI 반영 확인 완료: Dashboard Support KPI(`v_support_kpi` 뷰 — BOM 70,491 EA / Received 32,312 EA / 45.8%), Material Finding Mode B(Support Tag 검색, `fetchAndRenderSupportRows`)에서 새 SYSTEM/ISO DWG NO. 정상 표시
- Material Finding Mode A(ISO Drawing 검색)는 해당 ISO에 일반 BOM(Pipe/Fitting 등)이 하나도 없으면 Support 섹션까지 조회하지 않고 조기 종료하는 기존 설계라(내가 만든 변경 아님), Support 전용 ISO는 Mode A로 확인 불가 — Mode B로 확인해야 함.

### Bulk Materials 관리 설계 (설계 완료, 2026-07-06, 구현 대기)

**배경**: GENERAL 시트에는 개별 Support Tag에 귀속되지 않는 Bulk 구조재(Channel/H-Beam/Angle/Plate/Anchor Bolt 등)가 246행 있음. SUPPORT TAG NO.가 `BULK`/`-`/공란으로 동일/의미없는 값이 반복돼 실제 Tag 매칭이 불가능함 (CRITICAL의 `HP #1-BULK-001`류는 그룹별 고유 Tag가 있어 기존 Tag 매칭 로직이 이미 정상 동작 — 이 설계 범위 아님). 소요량 산정이 어려운 자재라 "BOM 대비 %"가 아니라 **입고 물량을 참고용으로 집계**하는 방식으로 관리하기로 사용자와 합의.

**데이터 식별 규칙**: 같은 Item 이름(CHANNEL/ANCHOR BOLT/EYE NUT 등)이 실제 Tag가 붙은 다른 Support 항목에서도 광범위하게 재사용되므로(예: GUIDE PLATE는 실제 Tag로 2,245건 존재), Item+Size만으로 조인하면 안 됨 — 반드시 양쪽 다 "Tag 없음"으로 표시된 행만 걸러서 그 안에서 Item+Matl+Size로 집계해야 함.
- BOM(`support_bom`): `support_tag IS NULL OR support_tag = 'BULK'` (246행)
- Received(`support_receiving`): `support_tag IS NULL OR support_tag IN ('BULK', '-')` (295행) — 입력 관행이 두 가지 섞여 있음: ①`support_tag='BULK'/'-'`(83건, System 값 있음), ②`support_tag=NULL`+`system='BULK'`(212건, System 자리에 'BULK' 리터럴). 둘 다 합쳐서 집계.
- 집계 키: Item + Matl + Size_or_Type (System은 BOM 쪽에 아예 없어서 제외)

**UI**: 기존 "Support" 탭(`support_receiving` 기반 화면) 안에 "Bulk Materials" 섹션 추가. 컬럼: Item / Matl / Size·Type / BOM Qty(참고용, %·색상 없음) / Received Qty / PKG 내역(`renderPkgListCell` 재사용, System은 참고 정보로만 노출). Item 오름차순 정렬, 필터는 미구현(246개 조합 정도라 스크롤로 충분).

**Dashboard 영향**: `v_support_kpi` 뷰가 위 Bulk 항목(BOM 246행/Received 295행)을 제외하고 Tag성 항목만으로 재계산하도록 변경 필요 — 뷰 원본 SQL을 못 찾아서(과거 세션에 Supabase SQL Editor에서 직접 작성 추정) 재정의 시 이 규칙 반영해야 함. 지금 45.8%보다 다소 오를 수 있음.

**Out of scope**: CRITICAL의 `{System} #n-BULK-{seq}` 항목(이미 정상), SB 시트(Bulk 없음), Bulk 소요량 재산정/부족경고/FIFO.

### 현재 상태 / 다음 할 일 (Support 적용 사례 기준, 마지막 갱신: 2026-07-06)
- [x] SYSTEM/ISO DWG NO. 채움 (ipcs-drawing DB 매칭)
- [x] GENERAL 시트 ISO DWG NO. 도면 기준 전체 정합화 (235건 교정)
- [x] openpyxl 저장 데이터 유실 버그 발견 및 복구
- [x] support_bom 테이블 전체 재적재, UI(Dashboard/Material Finding) 반영 확인
- [x] Bulk Materials 관리 설계 확정 (Item+Matl+Size 집계, KPI 제외)
- [x] `v_support_kpi` 뷰 재정의 완료 (Bulk 제외, 2026-07-06) — **뷰가 실은 `support_bom`이 아니라 `support_receiving`만으로 계산되고 있었음이 확인됨**(total_bom=전체 입고량, total_received=package_no 배정량). Dashboard Support KPI가 45.8%(70,491/32,312)→38.1%(61,618/23,457)로 변경. 상세: `scratch/v_support_kpi_bulk_exclusion.sql`, `docs/superpowers/plans/2026-07-06-support-bulk-materials.md` Task 3
- [x] Support 탭에 Bulk Materials 섹션 UI 구현 완료 (2026-07-06, Subagent-Driven Development로 진행, 최종 리뷰 Ready to merge — 계획: `docs/superpowers/plans/2026-07-06-support-bulk-materials.md`)
- [ ] 미매칭 태그(GENERAL 1,960개 + SB 2개) 도면팀 확인 요청 (사용자 예정)

## Spool 적용 사례 (2026-07-06 시작, DB 등록만 완료 — UI 미착수)

### 배경
Spool BOM 기능은 최초 `dc9b83a`(2026-06-01)에서 탭·KPI·대시보드까지 구현됐었으나 `aacaaac`(2026-06-26)에서 "Support BOM / Spool BOM 탭 및 데이터 완전 삭제"로 UI가 통째로 삭제됨. 다만 Supabase `spool_bom`/`spool_receiving` 테이블 자체는 지워지지 않고 574행이 고아 상태(app.js 참조 0건)로 남아있었음. 0번 원칙 표에서도 Spool은 "추후 검토"로 미정 상태였음.

2026-07-06 사용자가 같은 사용자의 다른 모듈 **ipcs-control**(`C:\Users\PCLOVE\Downloads\ipcs-control`, 같은 Supabase 프로젝트 `ognhvfvlboqblueuldlm`이지만 `construction` 스키마, `joint_master` 테이블)의 System=HP/LP 조인트 5,616건에서 Spool No 529개(HP 276/LP 253)를 추출해 `Raw File/Spool BOM.xlsx`의 SYSTM/ISO DRAWING/LINE NO/SPOOL TAG/MAT1을 채우고, 사용자가 ITEM("HP SPOOL"/"LP SPOOL")/MAT2/SIZE/RATING/QTY(항상 1)를 직접 채워 완성하며 이 결정을 뒤집음.

**Spool 데이터 모델의 특성**: joint_master는 조인트(용접 이음부) 단위 기록이라 ITEM/SIZE/RATING/QTY 개념이 없고, 하나의 Spool 안에도 사이즈가 제각각(메인+브랜치)이라 SIZE를 단일값으로 못 채움 — 그래서 **1행 = 1 Spool(제작 조립체 단위), QTY는 항상 1**로 설계함. Piping/Fitting처럼 개별 자재로 분해하지 않음(0번 원칙표의 "고유 코드 매칭" 자체는 Spool No로 성립하되, MatCode 같은 자재 단위 분해는 하지 않는 것이 Spool의 특징).

### DB 재등록 (완료, 2026-07-06)
- 기존 고아 테이블 `spool_bom`(574행, mat1/mat2/rating 컬럼 없음)과 신규 Excel(529행)을 Tag 기준 비교 → 겹침 385건, DB에만 189건, Excel에만 144건(서로 다른 소스, 출처 불명의 기존 574행 vs joint_master 파생 529행) → 사용자가 **전체 교체** 결정.
- `.env`의 `SUPABASE_DB_URL`(direct Postgres, anon key 아님)을 `psycopg2`로 연결해 `ALTER TABLE spool_bom ADD COLUMN mat1/mat2/rating` 실행(anon key로는 DDL 불가) → 기존 574행 DELETE(사전 로컬 백업) → 신규 529행 INSERT, REST API로 카운트 검증(529행) 완료.
- **UI(Spool 탭 KPI/BOM vs Received 비교/대시보드 통합)는 아직 미착수** — 사용자가 "DB 등록만 먼저" 진행하기로 결정. 복원 시 6/26 삭제 전 `dc9b83a` 커밋 구조(공유 KPI 카드 5개, ISO/Tag/Size 필터, 페이지네이션) 참고 가능.

### UI 복원 완료 (2026-07-06, Subagent-Driven Development로 진행)

설계: `docs/superpowers/specs/2026-07-06-spool-ui-restoration-design.md`, 계획: `docs/superpowers/plans/2026-07-06-spool-ui-restoration.md` (6 Task, 전부 task-reviewer 승인 + 최종 whole-branch 리뷰 "Ready to merge: Yes").

- Spool 탭(`recTagSpool`) KPI 카드를 1개→3개로 확장: Overall Progress %(Tag 매칭 385/529≈72.8%) / Total Spool BOM(529 Tags) / Total Spool Received(574건, 기존 그대로). `spool_bom`/`spool_receiving`의 tag_no를 Set으로 매칭 — 두 테이블의 385/529 불일치는 그대로 반영(수정 안 함).
- Dashboard KPI 그리드를 7카드→8카드로 확장(Spool 추가), Overall 평균을 6개→7개 카테고리 평균으로 재계산. `updateCategoryCharts()` 안의 죽은 코드(조회만 하고 안 쓰던 `spoolRecCount`)를 실제 계산으로 교체.
- Issued/Stock KPI·미입고 Tag 상세 목록은 범위 밖으로 확정.
- **후속 변경(2026-07-06, 같은 날)**: 사용자가 대시보드를 직접 보고 "Bulk Progress Bars에도 Spool 추가" 요청 — 확인해보니 Valve/Speciality는 이미 막대그래프에 포함되어 있었음(과거 메모리 기록 "Valve 미포함"이 틀렸던 것으로 판명, 정정함). 같은 기준으로 Spool도 추가. 동시에 Dashboard 상단 KPI 카드 8개(카테고리별 %)가 막대그래프와 완전히 중복이라는 지적을 받아, KPI를 Overall/Categories On Track(≥90% 카테고리 수)/Items Pending(Pipe·Fitting 부족 Item+Size 개수)/ISO Critical(도넛차트와 동일 기준)로 재구성 — 4카드, 카테고리별 %는 막대그래프에서만 확인.
- 잔여 사항(Minor, 블로커 아님): Dashboard `updateCategoryCharts()`의 `spool_bom`/`spool_receiving` fetch 실패 시 에러가 콘솔에도 안 뜸(기존 다른 카테고리 fetch들과 동일한 패턴이라 회귀 아님) — 향후 강화 여지.
- **`57014 statement timeout` 수정 완료(2026-07-06, 같은 날 후속)**: `bom_desc`/`bom_iso_list`/`bom_detail`/`v_iso_stage_status`/`v_category_readiness` 등 조회가 간헐적으로 timeout에 걸려도 재시도 없이 실패 처리되던 문제(Items Pending Receipt가 빈 상태로 보이는 증상의 원인). `fetchIsoBoreMap()`에 이미 있던 "최대 3회 재시도" 패턴을 `fetchWithRetry()`로 공용화해 `fetchAllRows()`/`syncFromSupabase()`/`updateCategoryCharts()`/`updateDashboard()`의 관련 쿼리 전체에 적용. 원인 조사 중 이 세션에서 여러 subagent가 Playwright로 브라우저를 열었다가 정리 안 하고 끝나 chrome 프로세스가 30개+ 누적된 것도 발견 — DB 커넥션 경합의 한 요인으로 추정(직접 증명은 아님).

## 관련 메모리 (Spool)
- `project_spool_bom_reintroduction.md` — Spool BOM 삭제 이력, 재등록 경위, 현재 상태
- `project_ipcs_control_joint_master.md` — ipcs-control 접속 정보, joint_master 스키마, Spool No 추출 로직
