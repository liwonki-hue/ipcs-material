# Valve Material Control 개발 현황 (진행 중)

> 이 문서는 "develope" 명령어로 재개되는 Valve/자재관리 개발 작업의 누적 설계 문서다. 새 세션에서 이어받을 때는 이 문서 전체를 먼저 읽고, 마지막 "현재 상태 / 다음 할 일" 섹션부터 확인한다.

## 1. 배경 — 자재관리가 어려운 근본 이유

설계-구매-Packing List-입고 각 단계가 **동일한 코드를 공유하지 않고 Description(자유 서술)으로만 식별 가능**한 경우가 많다. 이 때문에 자재관리는 Joint Master(용접 조인트)나 Drawing Master(도면)보다 Data Matching·추적이 훨씬 어렵다 — 저것들은 고유 번호 체계가 이미 확립되어 있지만 자재는 그렇지 않다.

- Piping/Fitting/Others/Support(Bulk Item): Tag가 없어 자체 **MatCode Master**(`ITEM-MATL-SIZE-SCH-ET` 형식)를 만들어 매칭 키로 사용 중
- Valve/Speciality: Tag(기기번호)가 원래 존재하므로 MatCode 대신 **Tag 자체를 매칭 키**로 사용
- **원칙: 매칭은 항상 Tag(또는 MatCode) 같은 고유 코드로만 하고, Description은 표시용으로만 쓴다.** Description은 단계마다 달라도 문제없어야 한다.

## 2. 발견된 문제와 이미 완료된 수정 (2026-07-02)

`receiving` 테이블에서 Valve/Speciality 부속품이 `tag='Tool'`/`'COMMISSIONING'`/`'Steam Blow Tool'`/`'Hydro Test Tool'`/`'HP TBS D-TUBE'`/`'LP TBS D-TUBE'` 같은 통짜 문자열로, 또는 Speciality는 아예 `tag=NULL`로 뭉쳐있었다. Material Finding Mode C(Item 검색, `app.js` `btnFilterItem`)가 `tag`로 그룹핑하다 보니 서로 무관한 수백 개 품목이 한 행으로 합쳐지는 실사용 버그로 이어졌다.

**수정 완료**: `receiving`에 `parent_tag` 컬럼 추가, Valve 783건 + Speciality 334건을 `{parent_tag}-{일련번호}` 형태의 유니크 tag로 재생성. 실제 밸브 Tag가 본체+부속품 여러 행을 정상 공유하는 경우(예: `B1-NV-30201A`)는 건드리지 않음. 상세: `project_valve_bucket_tag_fix.md` (메모리).

**교훈**: anon key로 UPDATE(PATCH) 실행 시 RLS UPDATE 정책이 없으면 HTTP 200이지만 실제로는 0행 변경됨 — `Prefer: return=representation`으로 항상 검증할 것.

## 3. Valve (Receiving) 신규 등록 포맷 (설계 완료, 사용자가 파일 작성 중)

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
- `원본 확인 필요`: 원본 데이터 자체의 이상 사례 기록 (아래 4번 참고)
- `프로그램 활용 및 효과`: 이 포맷이 실제 프로그램 기능과 어떻게 연결되는지 정리

## 4. 원본 데이터에서 발견한 이슈 (사용자 확인 필요, 아직 미해결)

`PGU-DE-0363`(Control Valve)에서 동일 TAG NO가 서로 다른 Size/Rating으로 2개 패키지에 등록됨:
- `B1-LCV-34083`, `B2-LCV-34083`, `B0-PCV-37017` → 예: `B0-PCV-37017`이 CV-001(4"/CL150)과 CV-002(3"/CL600)에 서로 다른 규격으로 등장.
- 같은 밸브가 두 번 실린 게 아니라 서로 다른 실물에 같은 Tag가 잘못 붙었을 가능성. 원본 재확인 필요. 템플릿에는 일단 CV-001 값만 반영해둠.

## 5. Material Finding "설치 시 필요 부속품/공구" 조회 (신규 기능, 미착수)

Item 검색(Mode C)에서 Tag를 조회하면 BOM/입고/재고 아래에 서브 섹션 추가:
- 1단계(정확): `Untagged Items`에서 `TAG NO (참조)`가 일치하는 행
- 2단계(느슨, 참고용): 같은 `PKG NO`에 속한 나머지 항목 (특정 Tag로 못 붙는 공용 품목)

## 6. 전체 실행 순서 (사용자 승인됨, 2026-07-03)

1. **[진행 중, 사용자 작업]** `Valves`/`Untagged Items` 포맷으로 새 Valve (Receiving) 파일 완성
2. 완성되면 `receiving` 테이블에 재적재 (Tag 유니크성 보장 — 3번 항목의 검증된 방식 재사용)
3. 설계팀 Valve List BOM 확보 → `bom` 테이블에 category='Valve'로 등록 (Tag 키로 매칭)
4. Pipe/Fitting/Others처럼 Valve도 BOM 대비 입고/재고/부족자재 계산 가능해짐
5. Material Finding Item 검색에 "설치 시 필요 부속품/공구" 서브 섹션 추가 (위 5번)
6. Dashboard에 Valve KPI 카드 추가 검토

## 현재 상태 / 다음 할 일 (마지막 갱신: 2026-07-03)

- [x] 통짜/NULL tag 버그 수정 및 검증 완료 (DB 반영됨, 1,117건)
- [x] Valve (Receiving) 신규 포맷 설계 완료, Excel 템플릿 작성 (`Raw File/Valve (Receiving)_Format_Template.xlsx`)
- [ ] **사용자가 새 포맷으로 실제 Valve (Receiving) 파일 작성 중 — 완성 대기**
- [ ] `B0-PCV-37017` 등 중복 Tag 의심 건 원본 재확인 (사용자)
- [ ] 파일 완성 후: `receiving` 테이블 재적재 스크립트 작성 및 실행
- [ ] 설계팀 Valve List BOM 확보 및 `bom` 테이블 등록
- [ ] Material Finding "설치 시 필요 부속품/공구" 서브 섹션 구현
- [ ] Dashboard Valve KPI 카드 추가 검토

## 관련 메모리
- `project_valve_bucket_tag_fix.md` — 통짜/NULL tag 수정 상세 내역, RLS 함정
- `project_material_matching_challenge.md` — MatCode Master 존재 이유, 자재관리가 어려운 근본 배경
- `project_matcode_rules.md` — Valve matcode 할당 규칙 (TAG 있는 항목만)
- `project_pgu_de_0072_recovery.md` — PGU-DE-0072 197건 복구 완료 확인됨 (2026-07-02)
