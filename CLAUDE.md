# ipcs-material 프로젝트 지침

이 파일은 이 프로젝트(`ipcs-material`) 작업 시 자동으로 로드된다. 사용자의 전역 `~/.claude/CLAUDE.md` 지침(start/finish/최적화 등)과 함께 적용된다.

## "develope" 명령어 — Material Control 개발 재개

사용자가 "develope"(또는 "개발 재개")라고 입력하면 아래 순서로 지금까지의 설계/결정 사항을 전부 불러온 뒤 이어서 개발한다.

1. **`docs/superpowers/specs/2026-07-03-valve-material-control-design.md`를 전체 읽는다.** 이 문서가 Valve/자재관리 개발의 누적 설계 문서이며, 문서 맨 아래 "현재 상태 / 다음 할 일" 섹션에 최신 진행 상황이 있다.
2. 관련 메모리를 확인한다 — `project_valve_bucket_tag_fix`, `project_material_matching_challenge`, `project_matcode_rules`, `project_bom_not_mto_cleanup`, `project_pgu_de_0072_recovery`.
3. `Raw File/Valve (Receiving)_Format_Template.xlsx`가 갱신되어 있으면 다시 읽어서 사용자가 실제로 어디까지 채웠는지 확인한다.
4. 위 내용을 바탕으로 "지금까지 진행 상황 요약 + 다음 할 일"을 먼저 사용자에게 보고한 뒤, 승인된 다음 단계(설계 문서의 "전체 실행 순서" 섹션)를 이어서 진행한다.

**중요**: 이 프로젝트의 자재관리 설계는 계속 진행 중(develop)인 작업이다. 설계 문서를 매번 다시 만들지 말고, 위 문서를 갱신하는 방식으로 누적한다 — 새로운 결정/변경 사항이 생기면 해당 문서의 관련 섹션과 "현재 상태 / 다음 할 일"을 직접 수정할 것.
