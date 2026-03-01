# 스킬 실행 우선순위표 (Phase 1~6)

## 목적

- Phase별로 어떤 스킬을 어떤 순서로 호출할지 고정합니다.
- 우선순위 외 스킬 사용 시에는 "왜 필요한지"를 작업 로그에 남깁니다.

## 공통 규칙

- `P0`: 해당 Phase에서 기본적으로 반드시 검토/적용할 스킬
- `P1`: 작업 성격에 따라 적용하는 보조 스킬
- 외부 스킬(Vercel)은 내부 FoodLens 스킬을 대체하지 않고 보완 용도로만 사용

## Phase별 우선순위

### Phase 1

- `P0`
  1. `$foodlens-auth-session-implementation`
  2. `$foodlens-oauth-provider-integration`
  3. `$foodlens-refresh-token-rotation-hardening`
- `P1`
  - 없음

### Phase 2

- `P0`
  1. `$foodlens-offline-first-sync`
  2. `$foodlens-render-blueprint-validation`
- `P1`
  - `vercel-react-native-skills` (RN UI/성능 최적화가 포함될 때)

### Phase 3

- `P0`
  1. `$foodlens-sync-conflict-policy`
  2. `$foodlens-offline-first-sync`
- `P1`
  1. `vercel-react-native-skills`
  2. `vercel-composition-patterns`
  3. `vercel-react-best-practices` (RN에 유효한 규칙만 선별 적용)
- 조건부
  - `web-design-guidelines` (웹 표면/운영 UI 리뷰 작업일 때만)

### Phase 4

- `P0`
  1. `$foodlens-api-rate-limit-cors-guard`
  2. `$foodlens-observability-otel-sentry`
- `P1`
  - `vercel-react-best-practices` (웹 대시보드/웹뷰 포함 시)

### Phase 5

- `P0`
  1. `$foodlens-deletion-ttl-orchestration`
- `P1`
  - 없음

### Phase 6

- `P0`
  1. `$foodlens-release-gate-automation`
  2. `$foodlens-mobile-e2e-release-gate`
  3. `$foodlens-ci-policy-enforcement`
  4. `$foodlens-feature-flag-rollout-control`
- `P1`
  - `vercel-react-native-skills` (릴리즈 직전 RN 성능 회귀 점검 시)

## 참고 문서

- `docs/roadmap/master-plan.md`
- `docs/roadmap/context_prompt_roadmap_execution.md`
- `docs/roadmap/phase-3-vercel-agent-skills-analysis.md`

