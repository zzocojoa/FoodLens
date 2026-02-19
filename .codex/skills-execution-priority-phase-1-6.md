# FoodLens 스킬 실행 우선순위 (Phase 1~6)

본 문서는 FoodLens에서 생성된 13개 스킬을 Phase 1~6 순서로 정렬하고,
각 스킬의 첫 실행 프롬프트와 비개발자용 설명을 함께 제공합니다.

## 1) 실행 우선순위 표

| 우선순위 | Phase | 스킬 | 비개발자 설명 | 첫 실행 프롬프트 |
|---|---|---|---|---|
| 1 | Phase 1 | `foodlens-auth-session-implementation` | 로그인/로그아웃/세션복구의 "뼈대"를 먼저 고정합니다. 계정이 섞이는 사고를 막는 핵심입니다. | `Use $foodlens-auth-session-implementation to implement Phase 1 auth endpoints, secure token storage, and refresh rotation.` |
| 2 | Phase 1 | `foodlens-oauth-provider-integration` | Google/Kakao/Email 로그인 버튼이 실제로 동작하게 연결합니다. | `Use $foodlens-oauth-provider-integration to implement and validate Google, Kakao, and Email auth provider flows for Phase 1.` |
| 3 | Phase 1 | `foodlens-refresh-token-rotation-hardening` | 로그인 유지 토큰(리프레시 토큰) 보안을 강화해 탈취/재사용 공격을 막습니다. | `Use $foodlens-refresh-token-rotation-hardening to enforce single-use refresh tokens, replay detection, and safe session invalidation.` |
| 4 | Phase 2 | `foodlens-offline-first-sync` | 휴대폰 로컬 저장 중심에서 "서버 원본 + 로컬 캐시" 구조로 바꾸는 핵심 단계입니다. | `Use $foodlens-offline-first-sync to implement Phase 2-3 cache-first sync queue, idempotency, and conflict handling.` |
| 5 | Phase 2 | `foodlens-render-blueprint-validation` | 배포 설정(`render.yaml`, 환경변수)이 꼬여서 장애 나는 것을 사전에 차단합니다. | `Use $foodlens-render-blueprint-validation to validate render.yaml, environment consistency, and rollback-safe Render deployment configuration.` |
| 6 | Phase 3 | `foodlens-sync-conflict-policy` | 오프라인/온라인 전환 시 중복 저장, 덮어쓰기 충돌을 정책적으로 해결합니다. | `Use $foodlens-sync-conflict-policy to implement Phase 3 LWW conflict handling, manual merge paths, and idempotent write safety.` |
| 7 | Phase 4 | `foodlens-api-rate-limit-cors-guard` | 트래픽 과다/비정상 호출을 막아 API 안정성을 올립니다(429, CORS). | `Use $foodlens-api-rate-limit-cors-guard to apply backend CORS policy, per-client rate limits, and consistent 429 responses.` |
| 8 | Phase 4 | `foodlens-observability-otel-sentry` | 장애가 나도 "왜 실패했는지" 빠르게 찾게 해주는 추적/모니터링 체계를 만듭니다. | `Use $foodlens-observability-otel-sentry to instrument request tracing, latency metrics, and error reporting for backend and mobile.` |
| 9 | Phase 5 | `foodlens-deletion-ttl-orchestration` | 계정 삭제 요청을 실제로 처리하고, 보관기간 지난 데이터를 자동 삭제합니다. | `Use $foodlens-deletion-ttl-orchestration to implement Phase 5 account deletion flow, queue consumers, TTL cleanup, and audit logs.` |
| 10 | Phase 6 | `foodlens-release-gate-automation` | 릴리스 전에 반드시 통과해야 하는 품질 게이트를 자동화합니다. | `Use $foodlens-release-gate-automation to enforce Phase 6 CI gates, staged rollout checks, and rollback readiness.` |
| 11 | Phase 6 | `foodlens-mobile-e2e-release-gate` | 로그인 -> 스캔 -> 결과 -> 히스토리 핵심 사용자 흐름을 자동 테스트로 막아줍니다. | `Use $foodlens-mobile-e2e-release-gate to automate release-blocking mobile E2E tests for login, scan, result, and history flows.` |
| 12 | Phase 6 | `foodlens-ci-policy-enforcement` | 테스트 실패 코드가 머지되지 않도록 저장소 정책을 강제합니다. | `Use $foodlens-ci-policy-enforcement to enforce mandatory CI checks and merge blocking policy for quality and contract safety.` |
| 13 | Phase 6 | `foodlens-feature-flag-rollout-control` | 1% -> 5% -> 20% -> 100% 점진 배포와 긴급 OFF(킬스위치)로 출시 리스크를 줄입니다. | `Use $foodlens-feature-flag-rollout-control to run staged rollout gates, KPI checks, and emergency feature kill-switch actions.` |

## 2) 비개발자용 요약

- Phase 1 (우선순위 1~3): 안전한 로그인 체계 만들기
- Phase 2~3 (우선순위 4~6): 데이터 유실 없이 동기화/복구 체계 확립
- Phase 4~5 (우선순위 7~9): 운영 안정성과 개인정보 삭제 의무 충족
- Phase 6 (우선순위 10~13): 릴리스 실패를 자동으로 막는 게이트 구축

## 3) 권장 실행 방식

- 규칙 1: Phase를 건너뛰지 않고 순서대로 실행합니다.
- 규칙 2: 각 스킬 완료 후 반드시 해당 Phase의 DoD(완료 기준)를 체크합니다.
- 규칙 3: 릴리스 전에는 Phase 6 스킬(게이트/정책/롤아웃)을 반드시 통과시킵니다.

---

작성일: 2026-02-19
기준 문서:
- `docs/roadmap/master-plan.md`
- `docs/roadmap/phase-1-login-session-execution.md`
- `docs/roadmap/phase-2-cloud-db-execution.md`
- `docs/roadmap/phase-3-sync-conflict-execution.md`
- `docs/roadmap/phase-4-ai-ops-execution.md`
- `docs/roadmap/phase-5-privacy-security-deletion-execution.md`
- `docs/roadmap/phase-6-release-gate-execution.md`
