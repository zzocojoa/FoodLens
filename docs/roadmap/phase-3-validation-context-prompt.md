# Phase 3 검증 컨텍스트 프롬프트

```text
아래 기준으로 FoodLens의 Phase 3 완료 여부를 “검증 전용”으로 점검해줘.
구현 작업은 하지 말고, 검증/리포트만 수행해.

[기준 문서]
- docs/roadmap/context_prompt_roadmap_execution.md
- docs/roadmap/master-plan.md
- docs/roadmap/phase-3-sync-conflict-execution.md
- docs/contracts/api-contracts.md
- docs/roadmap/skills-execution-priority-phase-1-6.md

[검증 입력]
CURRENT_PHASE: Phase 3
TASK_SCOPE: 동기화/충돌 정책 및 idempotency 검증
OUT_OF_SCOPE: Phase 4~6 구현 작업
DONE_CRITERIA:
- sync queue 상태 모델(pending/sending/failed/synced) 동작
- idempotency key 기반 중복 저장 방지
- LWW 기본 정책 적용
- 중요 데이터 충돌 시 manual merge 경로 확인
- 오프라인->온라인 복귀에서 데이터 유실/중복 0
- request_id/user_id 추적 가능
CONSTRAINTS:
- 코드 수정 없이 검증 우선
- 실패 원인과 재현 경로를 명확히 제시

[검증 절차]
1) queue/retry/conflict 관련 코드 및 테스트 점검
2) 아래 스킬 기준 대조
   - $foodlens-sync-conflict-policy
   - $foodlens-offline-first-sync
3) DoD 항목 Pass/Fail 판정
4) 미충족 항목 보완안 제시

[출력 형식]
PHASE_CHECK
CHANGES
VALIDATION
EVIDENCE
RISKS
NEXT_ACTIONS

[판정 규칙]
- 모든 DONE_CRITERIA Pass: “Phase 3 완료”
- 하나라도 Fail: “Phase 3 미완료”
```

