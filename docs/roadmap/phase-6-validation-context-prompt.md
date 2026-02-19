# Phase 6 검증 컨텍스트 프롬프트

```text
아래 기준으로 FoodLens의 Phase 6 완료 여부를 “검증 전용”으로 점검해줘.
구현 작업은 하지 말고, 검증/리포트만 수행해.

[기준 문서]
- docs/roadmap/context_prompt_roadmap_execution.md
- docs/roadmap/master-plan.md
- docs/roadmap/phase-6-release-gate-execution.md
- docs/contracts/api-contracts.md
- docs/roadmap/skills-execution-priority-phase-1-6.md

[검증 입력]
CURRENT_PHASE: Phase 6
TASK_SCOPE: 릴리스 게이트 자동화 및 운영 검증
OUT_OF_SCOPE: 신규 기능 개발
DONE_CRITERIA:
- 타입/린트/계약/회귀/스모크 게이트 동작
- CI 실패 시 머지/배포 차단
- staged rollout(1%->5%->20%->100%) 규칙 적용
- feature flag 기반 긴급 OFF 경로 확인
- 릴리스 리허설/롤백 리허설 결과 존재
- 런북/담당자/알림 경로 명확
CONSTRAINTS:
- 코드 수정 없이 검증 우선
- Gate 실패 항목은 우선순위와 차단 영향도 포함

[검증 절차]
1) CI 파이프라인/브랜치 보호/릴리스 절차 점검
2) 아래 스킬 기준 대조
   - $foodlens-release-gate-automation
   - $foodlens-mobile-e2e-release-gate
   - $foodlens-ci-policy-enforcement
   - $foodlens-feature-flag-rollout-control
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
- 모든 DONE_CRITERIA Pass: “Phase 6 완료”
- 하나라도 Fail: “Phase 6 미완료”
```

