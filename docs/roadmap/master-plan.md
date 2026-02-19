# FoodLens Master Plan (CTO 실무 정리본)

## 1) 이 문서의 목적

- 지금처럼 기능을 여기저기 먼저 붙이면, 나중에 로그인/DB 전환 때 비용이 크게 늘어납니다.
- 이 문서는 "무엇을 먼저 고정하고, 무엇을 나중에 개발할지"를 한 번에 정리한 기준 문서입니다.
- 비개발자/개발자 모두 이 문서를 기준으로 우선순위를 맞춥니다.

## 2) 현재 상태 한 줄 요약

- 앱은 현재 "기기 로컬 저장 중심"으로 동작하고, 일부 기능은 이미 서버 기반 분석(라벨/음식/바코드)을 사용합니다.
- 즉, 분석 API는 서버 중심인데, 사용자 데이터(프로필/히스토리 등)는 아직 로컬 중심입니다.

## 3) 최종 목표 (사업 관점)

- 사용자는 Google/Kakao/Email 계정으로 로그인한다.
- 사용자의 프로필/알레르기/히스토리/설정은 클라우드 DB에 안전하게 저장된다.
- 기기를 바꿔도 로그인하면 데이터가 복구된다.
- AI 분석 기능은 장애/비용/트래픽 증가 상황에서도 안정적으로 동작한다.

## 4) 반드시 먼저 고정할 3가지 (Architectural Pillars)

- **Identity & Security First**:
  - "누가 만든 데이터인지"를 `user_id` 기준으로 고정
  - Refresh Token Rotation 및 보안 스토리지(Keychain/Keystore) 필수 적용
- **Offline-First Data Ownership**:
  - 원본 데이터는 서버 DB, 로컬은 "신뢰할 수 있는 캐시(Single Source of Truth is Server)" 역할로 고정
  - 네트워크 단절 시에도 읽기/쓰기 가능, 연결 시 자동 동기화 구조
- **API Contract & Versioning**:
  - 모바일-백엔드 요청/응답 형식을 버전 포함 계약으로 고정
  - 하위 호환성(Backward Compatibility) 없는 변경 금지

## 5) 실행 단계 (순서 고정)

### Phase 0. 기준선 고정 (1~2일)

- 목표: 중구난방 개발 중지, 한 문서 기준으로 정렬
- 작업:
  - 본 문서(master-plan)와 API 계약 문서(api-contracts)를 기준선으로 확정
  - 신규 기능은 "Phase 번호 + 티켓 번호" 없으면 개발 금지
- 완료 기준 (DoD):
  - PR 템플릿에 "계약 변경/롤백 방법/테스트 결과" 필수화
  - 팀 합의 완료

### Phase 1. 로그인/세션 체계 확정 (약 1주)

- 상세 실행표(누가/언제/무엇): [Phase 1 실행표](./phase-1-login-session-execution.md)
- 목표: 임시 사용자 흐름 제거, 실사용 user_id 체계로 통일
- 작업:
  - Google/Kakao/Email 로그인 API 연결
  - 액세스/리프레시 토큰 수명 및 갱신 정책 확정
  - 앱의 현재 사용자 식별을 auth 결과 기준으로만 사용
  - Phase 2 착수 전, 클라우드/DB 선택안 확정: [Cloud Decision Record](./cloud-decision-record.md)
- 완료 기준:
  - 로그인/로그아웃/계정 전환에서 데이터 섞임 0건
  - 온보딩 완료 여부도 user_id 단위로 일치

### Phase 2. 사용자 데이터 DB 전환 (1~2주)

- 상세 실행표(누가/언제/무엇): [Phase 2 실행표](./phase-2-cloud-db-execution.md)
- 목표: 로컬 원본 저장 구조를 서버 원본 구조로 전환
- 작업:
  - 서버 DB 스키마: users, profiles, allergies, scans, history, settings
  - 모바일 로컬 저장은 캐시로 축소
  - 서버 실패 시 재시도/복구 흐름 정의
- 완료 기준:
  - 기기 변경 후 로그인 시 데이터 복원 100%
  - 앱 삭제 후 재설치 + 로그인 복원 성공

### Phase 3. 동기화/충돌 정책 (약 1주)

- 상세 실행표(누가/언제/무엇): [Phase 3 실행표](./phase-3-sync-conflict-execution.md)
- 목표: 오프라인/온라인 전환 시 데이터 일관성 확보
- 작업:
  - sync queue 도입
  - 중복 저장 방지용 idempotency key 적용
  - 충돌 정책 명시 (예: 서버 최신 우선)
- 완료 기준:
  - 네트워크 단절 테스트 후 데이터 중복/유실 0건

### Phase 4. AI 분석 운영 안정화 (약 1주)

- 상세 실행표(누가/언제/무엇): [Phase 4 실행표](./phase-4-ai-ops-execution.md)
- 목표: 라벨/음식/바코드 분석을 운영 기준으로 안정화
- 작업:
  - request_id 추적 강화
  - timeout/retry/429 대응 표준화
  - 비용 가드레일(70/85/100%)과 롤아웃 정책(10/25/50/100%) 고정
- 완료 기준:
  - 장애 시 fallback 동작이 문서대로 재현
  - 로그만으로 문제 재현 가능한 수준 확보

### Phase 5. 개인정보/보안/삭제 체계 (약 1주)

- 상세 실행표(누가/언제/무엇): [Phase 5 실행표](./phase-5-privacy-security-deletion-execution.md)
- 목표: 출시/운영에 필요한 최소 법무/보안 기준 충족
- 작업:
  - 보존기간(TTL) 정책 반영
  - user_id/request_id 삭제 큐 운영
  - 계정 삭제 요청 시 실제 데이터 삭제 경로 확정
- 완료 기준:
  - "내 데이터 삭제" 요청을 운영에서 처리 가능

### Phase 6. 출시 게이트 상시 운영 (지속)

- 상세 실행표(누가/언제/무엇): [Phase 6 실행표](./phase-6-release-gate-execution.md)
- 목표: 기능 추가보다 품질 우선 체계 유지
- 작업:
  - CI 게이트: 타입검사/계약테스트/회귀테스트
  - 릴리스 체크리스트 운영
- 완료 기준:
  - 릴리스 후보 2회 연속 치명 이슈 0건

## 6) 지금 바로 멈춰야 하는 개발 방식

- 문서/티켓 없이 즉시 기능 추가
- 로컬 저장을 원본 DB처럼 계속 확장
- API 응답 구조를 조용히 변경
- Render 환경변수 변경 후 문서 미반영

## 7) 비개발자용 진행 관리 방법

- 매주 확인 질문 4개:
  - 이번 주는 Phase 몇 번을 진행 중인가?
  - 완료 기준(DoD) 중 무엇이 끝났는가?
  - 다음 릴리스 리스크 1순위는 무엇인가?
  - 롤백 방법이 준비되어 있는가?

## 8) 다음 액션 (즉시 실행)

- Action 1: 현재 작업을 Phase 기준으로 재분류
- Action 2: 로그인/DB 전환에 직접 영향 없는 UI 실험은 임시 동결
- Action 3: Phase 1 상세 태스크(인증 공급자별) 분해 후 일정 확정

## 9) 문서 바로가기

- [Phase 1 실행표](./phase-1-login-session-execution.md)
- [Phase 2 실행표](./phase-2-cloud-db-execution.md)
- [Phase 3 실행표](./phase-3-sync-conflict-execution.md)
- [Phase 4 실행표](./phase-4-ai-ops-execution.md)
- [Phase 5 실행표](./phase-5-privacy-security-deletion-execution.md)
- [Phase 6 실행표](./phase-6-release-gate-execution.md)
- [스킬 실행 우선순위표 (Phase 1~6)](./skills-execution-priority-phase-1-6.md)
- [Cloud Decision Record](./cloud-decision-record.md)
- [API 계약 기준서](../contracts/api-contracts.md)

## 10) Phase별 권장 스킬

- Phase 1:
  - `.codex/skills/foodlens-auth-session-implementation/SKILL.md`
  - `.codex/skills/foodlens-oauth-provider-integration/SKILL.md`
  - `.codex/skills/foodlens-refresh-token-rotation-hardening/SKILL.md`
- Phase 2:
  - `.codex/skills/foodlens-offline-first-sync/SKILL.md`
  - `.codex/skills/foodlens-render-blueprint-validation/SKILL.md`
- Phase 3:
  - `.codex/skills/foodlens-sync-conflict-policy/SKILL.md`
  - `.codex/skills/foodlens-offline-first-sync/SKILL.md`
- Phase 4:
  - `.codex/skills/foodlens-api-rate-limit-cors-guard/SKILL.md`
  - `.codex/skills/foodlens-observability-otel-sentry/SKILL.md`
- Phase 5:
  - `.codex/skills/foodlens-deletion-ttl-orchestration/SKILL.md`
- Phase 6:
  - `.codex/skills/foodlens-release-gate-automation/SKILL.md`
  - `.codex/skills/foodlens-mobile-e2e-release-gate/SKILL.md`
  - `.codex/skills/foodlens-ci-policy-enforcement/SKILL.md`
  - `.codex/skills/foodlens-feature-flag-rollout-control/SKILL.md`

## 11) 실행 템플릿 요약 (운영 공통)

- 목적: 모든 작업 요청/응답 형식을 고정해 실행 품질 편차를 줄입니다.
- 상세 규칙 문서: `docs/roadmap/context_prompt_roadmap_execution.md`

입력 템플릿:
- `CURRENT_PHASE`
- `TASK_SCOPE`
- `OUT_OF_SCOPE`
- `DONE_CRITERIA`
- `CONSTRAINTS`

출력 템플릿:
- `PHASE_CHECK`
- `CHANGES`
- `VALIDATION`
- `RISKS`
- `NEXT_ACTIONS`

게이트 중단 규칙:
- 타입/린트/계약/회귀 테스트 중 하나라도 실패 시 즉시 중단 후 수정

정량 기준(기본값):
- Timeout: 15초
- Retry: 최대 3회
- 429 대응: 지수 백오프
- Staged Rollout: 1% -> 5% -> 20% -> 100%

---

문서 버전: v1.0  
소유: CTO/PM 공동  
최종 수정: 2026-02-19
