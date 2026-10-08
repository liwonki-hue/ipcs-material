# Checklist — 전체 코드 점검 개선 1~4절 적용 (2026-09-27)

Plan: 2026-09-27 전체 점검 보고서의 개선안을 적용. 사용자 결정 — 1절 ② 쓰기 권한 보호는 보류, BOM Upload는 제거, Overall %는 BOM 항목 수 가중, Heat No·MTR은 보류.

## 1절 (로직, 높음)
- [x] ① BOM Upload 기능 제거 (버튼·모달·삭제/삽입 코드)
- [x] ③ Valve Rating 필터 정확 일치 (CL150≠CL1500, CL300≠CL3000) + Rating/Item 목록을 데이터에서 추출
- [x] ④ Shipping 저장 시 날짜 검증 (Issue Date ≥ On-Site Date, Issue는 On-Site 상태에서만) — 값이 바뀐 PKG만
- [x] ⑤ Shipping 저장 시 바뀐 칸만 전송 (동시 편집 덮어쓰기 방지)

## 2절 (로직, 중간)
- [x] 입고 집계 기준 통일 (Dashboard/Summary/Shortage 공용 함수, Valve는 BOM Tag 매칭)
- [x] Overall % = BOM 항목 수 가중 평균
- [x] 상태 없는 PKG → Data Health 카드로 노출 (규칙 자체는 유지)
- [x] Shortage 자동 갱신 60초 → 5분 + 화면 숨김 시 건너뜀
- [x] 검색어의 쉼표·괄호가 조회를 깨지 않도록 처리

## 3절 (메뉴·화면)
- [x] 동작 안 하는 Add New Material 폼 제거
- [x] Valve Item 필터를 데이터에서 추출 (PLUG/SAFETY/CONTROL 포함)
- [x] Spool 진행률 계산식 통일 (Tag 매칭 기준)
- [x] 사용자 입력값(Remark/Item 등) HTML 이스케이프

## 4절 (범위 확장)
- [x] ISO 단위 불출 기록(MIV) — issuance 테이블에 tag/miv_no 컬럼 추가, Material Finding에서 기록·표시
- [x] 자재 확보 ISO 목록 Excel Export (Overview ISO Readiness)
- [x] OS&D — pl_updates에 osd 컬럼 추가, Shipping에서 입력·필터·Export
- [x] Shortage에 Expediting(우선순위/목표일/상태) 연결 + 최우선 필요 System 표시
- [ ] (보류) Heat No·MTR 추적 — 원본 데이터 없음

## 마무리
- [x] node --check + 로컬 브라우저 확인
- [x] 설계 문서(docs/superpowers/specs/2026-07-03-material-control-program-design.md) 갱신
- [x] semantic commit (push는 finish 때 — 아직 안 함)

## ISO PDF → BOM Excel 추출 (2026-10-03)
- [x] ipcs-drawing DB에서 VOID 제외 최신 Revision ISO 3,973장 목록 확보 (`scratch/iso_latest.json`)
- [x] Cloudinary PDF 접근 방식 확인 (file_link 공개 URL, 사용자 승인)
- [x] BOM 행이 텍스트 레이어가 아님을 확인 → OCR(rapidocr, `scratch/ocrenv`) 채택
- [ ] 전체 PDF 다운로드 (`scratch/iso_pdf/`)
- [ ] OCR 파서 작성 + 샘플 30장 검증
- [ ] 설명→MatCode/Mat1/Mat2/Rating 매핑 (기존 bom 테이블 기준 사전)
- [ ] 전체 실행 → Excel 산출 (+ 기존 bom 합계 대조, OCR 저신뢰 행 표시)
- [x] 전체 PDF 다운로드 (3,973장, `scratch/iso_pdf/`)
- [x] 벡터 재렌더링 인식 파서 작성(`scratch/vecread.py`) + 샘플 40장 검증(ISO 단위 Pipe·EA 합계 일치 29/40)
- [x] 설명→MatCode/Mat1/Mat2/Rating 매핑 + Excel 빌더(`scratch/build_excel.py`)
- [x] 전체 추출 실행(3,973장, 6,645초, 오류 0) → `ISO_PDF_BOM_Extract_261003.xlsx` 생성
