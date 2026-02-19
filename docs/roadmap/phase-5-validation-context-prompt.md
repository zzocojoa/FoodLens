# Phase 5 검증 컨텍스트 프롬프트

```text
아래 기준으로 FoodLens의 Phase 5 완료 여부를 “검증 전용”으로 점검해줘.
구현 작업은 하지 말고, 검증/리포트만 수행해.

[기준 문서]
- docs/roadmap/context_prompt_roadmap_execution.md
- docs/roadmap/master-plan.md
- docs/roadmap/phase-5-privacy-security-deletion-execution.md
- docs/contracts/api-contracts.md
- docs/roadmap/skills-execution-priority-phase-1-6.md

[검증 입력]
CURRENT_PHASE: Phase 5
TASK_SCOPE: 개인정보/보안/삭제 체계 검증
OUT_OF_SCOPE: Phase 6 구현 작업
DONE_CRITERIA:
- 데이터 최소수집 원칙 반영
- TTL 만료 데이터 자동 정리
- 계정/데이터 삭제 요청 처리 경로 동작
- 삭제 후 조회 불가 보장
- 감사 로그 추적 가능
- 민감정보 로그 잔존 0
CONSTRAINTS:
- 코드 수정 없이 검증 우선
- 실패 시 영향도와 법무 리스크를 함께 제시

[검증 절차]
1) 삭제 API/큐/배치/TTL 경로 점검
2) 아래 스킬 기준 대조
   - $foodlens-deletion-ttl-orchestration
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
- 모든 DONE_CRITERIA Pass: “Phase 5 완료”
- 하나라도 Fail: “Phase 5 미완료”
```

