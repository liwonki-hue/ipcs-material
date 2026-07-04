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
| Spool | (추후 검토) | (추후 검토) |

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
3. 설계팀 Valve List BOM 확보 → `bom` 테이블에 category='Valve'로 등록 (Tag 키로 매칭)
4. Pipe/Fitting/Others처럼 Valve도 BOM 대비 입고/재고/부족자재 계산 가능해짐
5. Material Finding Item 검색에 "설치 시 필요 부속품/공구" 서브 섹션 추가 (위 4번)
6. Dashboard에 Valve KPI 카드 추가 검토

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

### 남은 일
- [ ] 원본 Excel의 ISO Drawing No. 공란 471행 처리 방침 확인 (원본 재확인 필요한 건인지, 무시 가능한 건인지) — Piping&Fitting 쪽 이슈, 이번 GSKT/STB 작업과 별개

### 관련 메모리
- `project_bom_not_mto_cleanup.md` — 이전 Not-MTO 정리 이력 (이번 작업으로 대체 완료)
- `project_stb_matcode_redesign.md` — STB matcode 재설계 이슈, 이번 새 Bolt&Gasket 시트의 실측 BoltSize/BoltLength로 재적재하며 사실상 해소됨(B16=ALLOY 포함 전체 4종 마감 라벨 확정)
- `project_lb_sb_bom_verification.md` — 이번 세션 전체 작업 상세 기록

## 현재 상태 / 다음 할 일 (Valve 적용 사례 기준, 마지막 갱신: 2026-07-03)

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
