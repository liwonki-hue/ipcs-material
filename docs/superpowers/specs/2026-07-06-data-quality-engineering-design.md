# Data Quality & Engineering Improvements 설계

> 배경: 프로그램의 기본 틀(BOM/Receiving/Material Status/Finding 등)은 완성 단계에 들어섰고, 앞으로는 "데이터 정합성 확인 + 추가 데이터 입력"을 통해 정확도를 높이는 단계로 넘어간다. 이 문서는 그 다음 단계를 더 안전하고 빠르게 만들기 위한 4가지 엔지니어링 개선 사항을 다룬다(우선순위 5번 "Spool 매칭 키 결정"은 이번 범위에서 제외).

적용 순서: 1(Data Health 화면) → 2(매칭 규칙 통합 + 단위 테스트) → 3(안전 재적재 스크립트) → 4(RLS 헬스체크, 1번 화면에 통합)

---

## 1. Data Health 화면

### 배경
지금까지 "몇 %가 매칭됐는지", "몇 건이 미매칭인지" 같은 수치는 세션마다 SQL을 직접 돌려 확인하고 메모리에만 남겨왔다(Valve BOM↔Receiving 81.9% 매칭, Support GENERAL 1,960건 미매칭 등). 프로그램 밖에만 존재하는 지식이라 사용자가 직접 확인할 방법이 없었다.

### 배치
- 사이드바 **Material Status** 섹션에 새 탭 "Data Health" 추가 (Stock / Shortage / Surplus / Material Summary와 같은 레벨)

### 레이아웃
- 요약 카드 4개(+ 4번 항목에서 추가되는 System Health 카드 1개, 총 5개) → 카드 클릭 시 아래에 상세 테이블 아코디언으로 펼침
- 각 상세 테이블에는 기존 탭들과 동일하게 Export(Excel) 버튼 포함

### 카드 구성

| 카드 | 지표 | 데이터 소스 | 상세 리스트 컬럼 |
|---|---|---|---|
| ① Valve/Speciality Tag 매칭 | BOM Tag 중 Receiving 없는 건수/비율 | `db.bom` + `db.receiving` (이미 클라이언트에 로드됨, 신규 쿼리 불필요) | Tag, Category, Item, System, ISO |
| ② Support 미매칭(도면 DB 없음) | System/ISO DWG NO. 공란인 Support Tag 건수 | `support_bom` 신규 쿼리 (`system.is.null,iso_dwg_no.is.null`) | Support Tag, Item, Size, Sheet(CRITICAL/GENERAL/SB) |
| ③ 통짜 Tag 잔존(회귀 감시) | 알려진 placeholder 패턴(`Tool`/`COMMISSIONING`/`Steam Blow Tool`/`Hydro Test Tool`/`HP TBS D-TUBE`/`LP TBS D-TUBE` 등) 재검사 건수 | `db.receiving` (이미 로드됨) | Tag, Category, PKG NO, Description |
| ④ NEW-MAT 미등록 | MatCode에 `NEW-MAT` 포함된 건수 | `db.bom` (이미 로드됨) | MatCode, Category, Description, Qty |

카드 ③은 2026-07-02에 이미 한 차례 수정 완료된 문제이므로, 정상 상태라면 0건이 떠야 한다. 새 데이터가 들어올 때마다 같은 문제가 재발하지 않는지 감시하는 역할이다.

### 데이터 로딩
- ①③④는 페이지 진입 시 이미 로드돼 있는 `db.bom`/`db.receiving`을 그대로 재사용 — 추가 네트워크 요청 없음
- ②는 `support_bom` 테이블에 대한 단일 쿼리 1회 (탭 진입 시)

---

## 2. 매칭 규칙 통합 + 단위 테스트

### 배경
오늘 실제로 발견된 문제: Pipe MatCode 접두어(PIS/PIW)를 SMLS/WELDED로 구분하는 로직이 Receiving 리스트 렌더링(원래 위치)과 Shortage/Surplus(`_enrichRow`, 오늘 추가)에 각각 따로 들어가 있었다. `ITEM_PREFIX_MAP`(item→prefix)과 `extractItemFromMatCode`의 내부 MAP(prefix→item)도 서로 반대 방향으로 손으로 관리되는 중복 데이터다. 이런 구조에서는 새 예외 규칙이 생길 때마다 여러 곳에 나눠 적용해야 하고, 하나를 빠뜨리면 오늘 같은 버그가 반복된다.

### 리팩토링
- 순수 파싱 함수 5개 + 데이터 테이블 1개를 `static/js/app.js`에서 분리해 새 파일 `static/js/matching.js`로 이동:
  - `extractItemFromMatCode`
  - `extractSizeFromMatCode`
  - `extractSizeLengthFromMatCode`
  - `extractDnSizeFromDesc`
  - `extractItemFromDesc`
  - `ITEM_PREFIX_MAP`
- 이 함수들은 외부 상태(`db`, `window.parseSpecialityDesc` 등)에 의존하지 않는 순수 함수라 분리 가능함을 확인함
- `ITEM_PREFIX_MAP`(item→prefix)과 `extractItemFromMatCode`의 내부 MAP(prefix→item)을 하나의 canonical 테이블에서 파생하도록 통합 — 두 방향을 손으로 따로 유지하지 않음
- 신규 함수 `extractItemDisplayFromMatCode(matCode)` 추가: PIS→'PIPE SMLS', PIW→'PIPE WELDED', 그 외에는 `extractItemFromMatCode`와 동일값 반환. 지금 2곳(Receiving 리스트, Shortage/Surplus `_enrichRow`)에 중복된 3항연산자 블록을 이 함수 호출 하나로 교체
- `matching.js`는 `templates/index.html`에서 `app.js`보다 먼저 로드되는 일반 `<script>` — 클래식 스크립트는 같은 문서 내에서 top-level `const`/`function`을 공유하므로 app.js 쪽 코드 변경 없이 그대로 참조 가능
- 파일 맨 아래에 `if (typeof module !== 'undefined') module.exports = {...}` 형태의 조건부 export를 추가해 브라우저 동작에 영향 없이 Node에서도 `require` 가능하게 함

### 단위 테스트
- 프로젝트에 Node 빌드 도구가 전혀 없는 순수 Flask+정적 JS 구성이므로, 새 의존성 설치 없이 Node 18+ 내장 `node:test` + `assert`만 사용
- 새 디렉터리 `tests/matching.test.js`, 실행은 `node --test tests/`
- 최소한의 `package.json` 신설(`"scripts": {"test": "node --test tests/"}` 용도로만, 다른 의존성 없음)
- 테스트 케이스에 오늘 고친 PIS/PIW 회귀 케이스를 반드시 포함 (`extractItemDisplayFromMatCode('PIS-CS06-D060-S40-BW')` === `'PIPE SMLS'` 등)
- 그 외 각 함수별 기본 케이스(정상 입력, 빈 입력, 매칭 안 되는 접두어)

---

## 3. 안전 재적재 스크립트

### 배경
기존 재적재 스크립트(`scratch/reload_valve_receiving.py` 확인 결과)는 이미 "카테고리 전체 삭제 후 재적재 + 최종 COUNT 검증" 패턴을 쓰고 있지만, **삭제 전 백업이 없다.** `Prefer: return=representation`으로 삭제된 행을 받아오긴 하지만 화면에 건수만 출력하고 파일로 남기지 않아서, 삽입 단계에서 실패하면 복구 수단이 없다. Support BOM 작업 중 openpyxl in-place 저장으로 303건이 조용히 사라졌던 사고도 "백업 없이 데이터를 덮어쓰는" 같은 계열의 위험이다.

### 설계
- 새 파일 `scripts/supabase_reload.py` (scratch가 아닌 프로젝트 루트 — 매번 재사용할 목적이므로 영구 위치)
- 핵심 함수: `safe_reload(url, key, table, category_field, category_value, new_rows, backup_dir='scratch/backups')`
- 절차:
  1. **삭제 전** 해당 category의 기존 행 전체를 SELECT해서 `scratch/backups/{table}_{category_value}_{timestamp}.json`으로 저장 (읽기 전용 단계라 가장 안전한 시점에 백업)
  2. 백업 건수/qty 합계 vs `new_rows` 건수/qty 합계를 나란히 출력 (급격히 다르면 실행 전에 알아챌 수 있게)
  3. `--dry-run`이면 여기서 종료 (기존 스크립트들의 관례 유지)
  4. DELETE 실행(`Prefer: return=representation`) → 실제 삭제 건수가 1번 백업 건수와 일치하는지 확인, 불일치 시 경고 후 즉시 중단(아직 삽입 전이므로 안전)
  5. 배치 INSERT (기존 스크립트와 동일하게 500건 단위)
  6. 최종 COUNT 쿼리로 DB 행수가 `len(new_rows)`와 일치하는지 확인, 불일치 시 명확히 에러 출력
- 카테고리별 Excel 파싱(시트 구조, 컬럼 매핑, MAT1_GRADE 매핑 등 도메인 로직)은 지금처럼 `scratch/`에 개별 스크립트로 남기고, "삭제→재적재" 위험 구간만 이 헬퍼를 import해서 사용
- **기존에 이미 실행 완료된 스크립트들은 소급 수정하지 않음** — 앞으로 새로 작성하는 재적재 스크립트부터 이 헬퍼를 사용하는 것으로 범위 한정

---

## 4. RLS 헬스체크 (Data Health 탭에 통합)

### 배경
`receiving` 테이블 DELETE 정책 누락, `v_support_kpi` 뷰가 실은 엉뚱한 테이블(`support_receiving`만) 기준으로 계산되고 있던 문제 등, RLS/뷰 관련 버그는 전부 "오류 없이 조용히 잘못된 결과"를 내는 게 공통점이었고 발견은 항상 우연이었다.

### 범위 (이번 라운드)
- **RLS로 인한 0행 감지만** 다룬다. 뷰 의미 검증(v_support_kpi류 — 뷰가 올바른 소스 테이블을 집계하는지)은 뷰마다 로직이 달라 일반화가 어려우므로 이번 범위에서 제외하고 추후 별도 작업으로 미룬다.

### 설계
- 1번 Data Health 탭에 5번째 카드 **"System Health"** 추가
- 핵심 테이블 목록(`bom`, `receiving`, `matcode_master`, `support_bom`, `support_receiving`, `pl_updates`, `vendor`)에 대해 `select('*', { count: 'exact', head: true })`로 가벼운 행수만 조회
- 데이터가 있어야 정상인 테이블인데 0행이 나오면 RLS 정책 누락 의심으로 카드에 경고 표시 + 어떤 테이블이 0행인지 리스트업
- `head: true` count 쿼리라 가볍기 때문에 Data Health 탭 진입 시 항상 자동 실행 (별도 트리거 불필요)

---

## 관련 메모리
- `feedback_optimize_command.md` — "최적화" 6단계 프로세스, 이번 작업 완료 후 최적화 사이클에도 반영
- `project_valve_bucket_tag_fix.md` — RLS 정책 누락 사례(③ 카드의 배경)
- `project_support_bom_openpyxl_dataloss.md` — 백업 없이 데이터를 덮어써서 생긴 사고(3번의 배경)
- `project_v_support_kpi_semantics.md` — 뷰 의미 오류 사례(4번에서 이번 라운드는 제외했지만 다음 라운드의 근거)
