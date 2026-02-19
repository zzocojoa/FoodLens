# Phase 4 검증 컨텍스트 프롬프트

```text
아래 기준으로 FoodLens의 Phase 4 완료 여부를 “검증 전용”으로 점검해줘.
구현 작업은 하지 말고, 검증/리포트만 수행해.

[기준 문서]
- docs/roadmap/context_prompt_roadmap_execution.md
- docs/roadmap/master-plan.md
- docs/roadmap/phase-4-ai-ops-execution.md
- docs/contracts/api-contracts.md
- docs/roadmap/skills-execution-priority-phase-1-6.md

[검증 입력]
CURRENT_PHASE: Phase 4
TASK_SCOPE: AI 운영 안정화/비용/관측성 검증
OUT_OF_SCOPE: Phase 5~6 구현 작업
DONE_CRITERIA:
- `/analyze`, `/analyze/label`, `/lookup/barcode` 안정 동작
- Timeout 15초, Retry 최대 3회, 429 백오프 정책 확인
- 비용 가드레일 정책 동작
- request_id/used_model/prompt_version/latency 추적 가능
- 장애 시 graceful fallback 확인
CONSTRAINTS:
- 코드 수정 없이 검증 우선
- 근거 없는 추정 금지

[검증 절차]
1) API 정책/로그/에러 핸들링 경로 점검
2) 아래 스킬 기준 대조
   - $foodlens-api-rate-limit-cors-guard
   - $foodlens-observability-otel-sentry
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
- 모든 DONE_CRITERIA Pass: “Phase 4 완료”
- 하나라도 Fail: “Phase 4 미완료”
```

