# Phase 1 검증 컨텍스트 프롬프트

아래 프롬프트를 AI에 그대로 제공해 Phase 1 완료 여부를 검증합니다.

```text
아래 기준으로 FoodLens의 Phase 1 완료 여부를 “검증 전용”으로 점검해줘.
구현 작업은 하지 말고, 검증/리포트만 수행해.

[기준 문서]
- docs/roadmap/context_prompt_roadmap_execution.md
- docs/roadmap/master-plan.md
- docs/roadmap/phase-1-login-session-execution.md
- docs/contracts/api-contracts.md
- docs/roadmap/skills-execution-priority-phase-1-6.md

[검증 입력]
CURRENT_PHASE: Phase 1
TASK_SCOPE: 로그인/세션 체계 완료 검증
OUT_OF_SCOPE: Phase 2~6 구현 작업
DONE_CRITERIA:
- Google/Kakao/Email 로그인 플로우 동작
- refresh token rotation 동작 (재사용 감지 포함)
- secure storage 사용 (AsyncStorage/UserDefaults 토큰 저장 금지)
- 로그아웃/계정 전환 시 데이터 섞임 0
- 앱 재실행 시 세션 자동 복구
- request_id/user_id 기반 추적 가능
CONSTRAINTS:
- 코드 수정 없이 검증 우선
- 타입/린트/계약/테스트 실패는 즉시 보고
- 근거 없는 추정 금지 (파일/라인/테스트 결과로 증명)

[검증 절차]
1) Phase 1 관련 코드/설정/테스트를 전수 확인
2) 아래 스킬 기준도 함께 대조
   - $foodlens-auth-session-implementation
   - $foodlens-oauth-provider-integration
   - $foodlens-refresh-token-rotation-hardening
3) DoD 충족 여부를 항목별 Pass/Fail로 판정
4) 미충족 항목은 “원인 + 영향도 + 최소 수정안” 제시

[출력 형식]
PHASE_CHECK:
- 현재 점검 Phase가 Phase 1인지 확인 결과

CHANGES:
- (검증 작업이므로 코드 변경 없음이면 “없음” 명시)

VALIDATION:
- DoD 체크리스트 (각 항목 Pass/Fail)
- 실행한 검증 명령(타입/린트/테스트/계약)
- 실패 로그 핵심 요약

EVIDENCE:
- 근거 파일 경로와 라인
- 예: backend/server.py:216, FoodLens/app/_layout.tsx:51

RISKS:
- 남은 리스크 (심각도: High/Medium/Low)

NEXT_ACTIONS:
- Phase 1 종료를 위해 필요한 상위 1~3개 액션
- 각 액션에 담당 영역(backend/mobile/devops) 표시

[판정 규칙]
- 모든 DONE_CRITERIA가 Pass면 “Phase 1 완료”
- 하나라도 Fail이면 “Phase 1 미완료”
```

