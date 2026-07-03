# ipcs-material 프로젝트 지침

이 파일은 이 프로젝트(`ipcs-material`) 작업 시 자동으로 로드된다. 사용자의 전역 `~/.claude/CLAUDE.md` 지침(start/finish/최적화 등)과 함께 적용된다.

## "develope" 명령어 — Material Control 프로그램 개발 재개

사용자가 "develope"(또는 "개발 재개")라고 입력하면 아래 순서로 지금까지의 설계/결정 사항을 전부 불러온 뒤 이어서 개발한다.

**주의**: 이 명령어는 Valve 하나만이 아니라 **Material Control 프로그램 전체**(Piping/Fitting/Others/Support/Spool/Valve/Speciality)의 개발을 재개하는 것이다. 아래 문서의 "0. 전체 원칙" 섹션은 모든 카테고리에 적용되는 공통 원칙이고, 그 뒤는 지금까지 진행된 개별 카테고리 적용 사례(현재는 Valve)다.

1. **`docs/superpowers/specs/2026-07-03-material-control-program-design.md`를 전체 읽는다.** 이 문서가 Material Control 프로그램 개발의 누적 설계 문서이며, "0. 전체 원칙"은 공통, 그 아래는 카테고리별 적용 사례 섹션이다. 각 사례 섹션 끝의 "현재 상태 / 다음 할 일"에 최신 진행 상황이 있다.
2. 관련 메모리를 확인한다 — `project_valve_bucket_tag_fix`, `project_material_matching_challenge`, `project_matcode_rules`, `project_bom_not_mto_cleanup`, `project_pgu_de_0072_recovery`.
3. 현재 진행 중인 카테고리(Valve)의 원본 파일이 갱신되어 있으면 다시 읽어서 사용자가 실제로 어디까지 채웠는지 확인한다 (예: `Raw File/Valve (Receiving)_Format_Template.xlsx`).
4. 위 내용을 바탕으로 "지금까지 진행 상황 요약 + 다음 할 일"을 먼저 사용자에게 보고한 뒤, 승인된 다음 단계를 이어서 진행한다.

**중요**: 이 프로젝트의 Material Control 설계는 계속 진행 중(develop)인 작업이다. 설계 문서를 매번 다시 만들지 말고, 위 문서를 갱신하는 방식으로 누적한다 — 새로운 결정/변경 사항이 생기면 해당 문서의 관련 섹션(공통 원칙이면 "0. 전체 원칙", 특정 카테고리 얘기면 그 카테고리 섹션)과 "현재 상태 / 다음 할 일"을 직접 수정할 것. 새 카테고리(Support, Spool 등) 작업을 시작하면 이 문서에 그 카테고리를 위한 새 섹션을 추가할 것.
