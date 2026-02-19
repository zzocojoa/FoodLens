# Phase 2 검증 컨텍스트 프롬프트

```text
아래 기준으로 FoodLens의 Phase 2 완료 여부를 “검증 전용”으로 점검해줘.
구현 작업은 하지 말고, 검증/리포트만 수행해.

[기준 문서]
- docs/roadmap/context_prompt_roadmap_execution.md
- docs/roadmap/master-plan.md
- docs/roadmap/phase-2-cloud-db-execution.md
- docs/contracts/api-contracts.md
- docs/roadmap/skills-execution-priority-phase-1-6.md

[검증 입력]
CURRENT_PHASE: Phase 2
TASK_SCOPE: 클라우드 DB 전환 및 복원성 검증
OUT_OF_SCOPE: Phase 3~6 구현 작업
DONE_CRITERIA:
- `/me/profile`, `/me/allergies`, `/me/history`, `/me/settings` API 동작
- 사용자 데이터 서버 원본 저장 확인
- 로컬은 캐시 역할로 동작
- 앱 삭제/재설치 + 로그인 시 데이터 복원
- 계정 전환 시 데이터 섞임 0
- request_id/user_id 기반 추적 가능
CONSTRAINTS:
- 코드 수정 없이 검증 우선
- 타입/린트/계약/테스트 실패는 즉시 보고
- 근거 없는 추정 금지

[검증 절차]
1) API/저장소/마이그레이션 경로 점검
2) 아래 스킬 기준 대조
   - $foodlens-offline-first-sync
   - $foodlens-render-blueprint-validation
3) DoD 항목 Pass/Fail 판정
4) 미충족 항목은 원인/영향/최소 수정안 제시

[출력 형식]
PHASE_CHECK
CHANGES
VALIDATION
EVIDENCE
RISKS
NEXT_ACTIONS

[판정 규칙]
- 모든 DONE_CRITERIA Pass: “Phase 2 완료”
- 하나라도 Fail: “Phase 2 미완료”
```

