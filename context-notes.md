# Context Notes — 전체 코드 점검 개선 적용 (2026-09-27)

- 사용자 결정(2026-09-27): 1절 ② 쓰기 권한 보호(서버 경유·비밀번호·RLS 정리)는 **보류**. BOM Upload는 **제거**(BOM 적재는 그동안 전부 스크립트로 해왔음). Overall %는 **BOM 항목 수 가중**. Heat No·MTR은 원본 데이터가 없어 **보류**.
- 현재 RLS: bom/receiving/support_*/spool_*/vendor/pl_updates/issuance/expediting_log 모두 public(anon) 쓰기 허용. 권한 보호를 보류했으므로 새 기능도 같은 방식(anon)으로 저장한다. 권한 변경은 하지 않는다.
- 실측(2026-09-27): Valve CL150 ilike 조회 1,030행 중 410행이 CL1500. Valve Rating 실제 값은 CL150/300/600/900/1500/3000 — 고정 목록에 900·3000 누락, CL3000은 CL300 부분일치에도 섞임.
- 실측: pl_updates 971행 중 Issue Date < On-Site Date 81건. 데이터 자체는 정답을 모르므로 수정하지 않고, 저장 시 검증만 추가.
- 실측: receiving.purpose는 거의 NULL, 'Temporary'는 Others 10행(111EA)뿐. 입고 집계 공용 기준 = 현장 도착(Preparing/Shipping 아님) + purpose≠Temporary.
- 실측: Valve 입고 Tag — B0~B2 규칙 2,964 / BOM Tag 매칭 2,961. Dashboard도 Speciality·Summary처럼 BOM Tag 매칭으로 통일.
- Overall은 카테고리별 %를 100에서 잘라 가중 평균(초과입고가 다른 카테고리 부족을 메우지 않도록). 결과 97.7% → 93.9%. Valve 입고 2,605 → 2,608(BOM Tag 매칭), Others 8,277 → 8,166(Temporary 111 제외).
- MIV는 Stock/Issued 집계에 넣지 않음 — 기존 PKG Issue Date 기준과 합치면 모든 화면 수치가 바뀌므로 사용자 결정 전까지 Material Finding의 MIV Qty 컬럼에만 반영. BOM 잔량 초과 불출은 차단.
- OS&D는 pl_updates.osd(텍스트 1칸)만 추가하고 비고는 Remark 사용(osd_note 컬럼은 만들었다가 중복이라 즉시 삭제).
- expediting_log INSERT가 401 — anon에 id 시퀀스 USAGE 권한 없음. GRANT(권한 변경) 대신 max(id)+1 직접 채번(receiving.id와 같은 방식).
- v_iso_stage_status는 rec_agg(프로젝트 전체 입고)를 ISO마다 LEAST(total_rec, qty)로 중복 인정 → 과대 표시. Material-Ready ISO Export는 SYSTEM_PRIORITY → ISO 이름 순 배분으로 별도 계산(약 11초, bom 4.7만행 순차 조회).
- 브라우저 검증 중 넣은 테스트 데이터(issuance MIV 'TEST-CLAUDE-DELETE' 1행, expediting_log id=1, PGU-DE-0524-BOP-PIP-004 osd/updated_at)는 모두 원복 확인.

## 후속 (2026-09-27, 사용자 지시 "1. Expediting 신규 입력 보류 2. MIV 반영 3. Issue Date를 On-Site Date로 수정 4. 도넛 차트 ISO 수정")
- 1번 해석: GRANT(권한 변경) 보류, 현재 max(id)+1 직접 채번 유지 — 코드 변경 없음.
- 2번: Issued = 자재별 max(PKG Issue Date 기준, MIV 합계). 합산하면 같은 불출이 두 번 빠지므로 max. `_mivTotals`를 초기 동기화·MIV 저장 후 로드. Finding 라인도 issued = max(PKG 배분분, 라인 MIV).
- 3번: 81건 전부 PGU-DE-0524, issue 03-27 → on_site 03-31로 정정(백업 JSON).
- 4번: v_iso_stage_status 재정의(윈도 함수 누적합으로 배분). REST 조회 약 2초. 첫 로드 때 bom_agg/bom_iso_list/bom_desc가 57014 타임아웃 후 재시도 성공한 적 1회 — 직전 페이지 쿼리와 겹친 것으로 보이며, 이후 두 번 재로드 시 경고 0.
