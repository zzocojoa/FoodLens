# Phase 4 실행표: AI 분석 운영 안정화 (비개발자용)

이동: [Master Plan](./master-plan.md) | 이전: [Phase 3](./phase-3-sync-conflict-execution.md) | 다음: [Phase 5](./phase-5-privacy-security-deletion-execution.md)

## 1) 이 문서의 목적

- 라벨/음식/바코드 AI 분석을 "개발용 기능"에서 "운영 가능한 서비스"로 올리는 단계입니다.
- 장애, 느린 응답, 비용 급증 상황에서도 서비스가 버티도록 실무 기준을 정리합니다.

## 2) Phase 4 최종 목표 (다시 확인)

- 분석 API의 안정성, 속도, 비용을 운영 기준으로 관리
- 장애 시 사용자 영향 최소화 (fallback/재시도)
- 로그만으로 원인 추적 가능한 수준 확보

## 3) 역할 정의 (Who)

- PM/PO: SLA/SLO 목표 승인, 사용자 안내 정책 확정
- Backend Lead: timeout/retry/fallback/관측성 구현
- Mobile Lead: 에러 UX/재시도 UX/부분 결과 처리
- QA: 실패/지연/429 시나리오 검증
- DevOps: 모니터링/알림/비용 대시보드 운영

## 4) 주차별 실행표 (When / What)

### Week 1 (운영 기준선 확정)

- PM/PO
  - 목표값 승인:
    - 성공률
    - p95 지연시간
    - 월 비용 상한
- Backend Lead
  - 공통 정책 고정:
    - timeout
    - retry + backoff
    - 429 대응
    - fallback 응답 규칙
- Mobile Lead
  - 실패 UI 정책 확정 (재시도/안내 문구/부분 결과 표기)
- QA
  - 운영 실패 시나리오 테스트 설계
- 완료 체크
  - [ ] 운영 목표값 승인
  - [ ] 공통 실패 정책 문서화
  - [ ] 사용자 안내 정책 승인

### Week 2 (구현/계측)

- Backend Lead
  - 전 endpoint에 `request_id`, `used_model`, `prompt_version`, latency 단계 로그 적용
  - 429 전용 백오프/재시도 적용
  - **Model Optimization**: 프롬프트 최적화 및 경량 모델(Flash/Turbo) 우선 라우팅
  - 비용 가드레일(70/85/100) 정책 훅 적용 및 일일 쿼터 제한
- Mobile Lead
  - 실패 시 사용자 재시도 UX 적용
  - **On-device Caching**: 동일 바코드/이미지 해시 요청 시 로컬 캐시 우선 반환 (비용 절감)
  - fallback 응답 처리(치명 중단 방지)
  - 이미지 전송 최적화 (Resizing/Compression)로 Latency 감소
- DevOps
  - Render 로그/알림 세팅
  - 비용/에러율/지연 대시보드 설정
- 완료 체크
  - [ ] 샘플 요청에서 로그 추적 가능
  - [ ] 429 상황에서 정책대로 동작
  - [ ] 비용 가드레일 로그 확인

### Week 3 (운영 리허설/안정화)

- QA
  - 장애 리허설:
    - 타임아웃 유도
    - 429 유도
    - 모델 응답 불량 유도
  - 사용자 흐름 끊김 여부 점검
- Backend Lead + Mobile Lead
  - 상위 실패 패턴 보정
  - 메시지/코드 일관성 정리
- PM/PO
  - Go/No-Go 판단
- 완료 체크
  - [ ] 치명 중단 0건
  - [ ] 실패 시 복구 경로 명확
  - [ ] 운영 알림 정책 정상 동작

## 5) 비개발자용 "주간 점검 질문" (매주 15분)

- Q1. 이번 주 성공률/지연시간/비용은 목표 안에 들어왔나요?
- Q2. 오류가 나면 사용자는 무엇을 보게 되나요?
- Q3. 장애 원인을 로그로 바로 찾을 수 있나요?
- Q4. 비용 급증 시 자동 완화 정책이 동작하나요?

## 6) 수용 기준 (Definition of Done)

- 기능 기준:
  - `/analyze`, `/analyze/label`, `/lookup/barcode` 안정 동작
  - timeout/retry/429/fallback 정책 일관 적용
- 품질 기준:
  - request_id 기반 추적 가능
  - 운영 지표 대시보드 확인 가능
  - 장애 리허설 시 치명 중단 없음

## 7) 리스크와 대응 (쉽게 설명)

- 리스크 1: AI 공급자 429/쿼터 초과
  - 대응: 백오프 재시도 + fallback 정책 + 가드레일
- 리스크 2: 응답 지연으로 사용자 이탈
  - 대응: timeout + 사용자 재시도 UX + 단계별 지연 모니터링
- 리스크 3: 비용 급증
  - 대응: 70/85/100 임계치 정책 및 단계별 완화

## 8) 이번 단계에서 하지 않는 것 (범위 보호)

- 개인정보 삭제/TTL 자동화(Phase 5)
- 신규 인증 공급자 추가(Phase 1 범위)
- 대규모 DB 구조 재설계(Phase 2 범위)

## 9) 구현 기준 고정값 (2026-03-28)

- CORS: Allowlist + LAN regex 허용
  - `ANALYSIS_CORS_ALLOWED_ORIGINS`
  - `ANALYSIS_CORS_ALLOW_ORIGIN_REGEX`
- Rate limit 기본값
  - `/analyze`: 15 rpm
  - `/analyze/label`: 15 rpm
  - `/analyze/smart`: 15 rpm
  - `/lookup/barcode`: 30 rpm
- 429 계약
  - HTTP 429 + `Retry-After`
  - `detail.code`: `API_RATE_LIMITED | UPSTREAM_RATE_LIMITED`
  - `detail.request_id`, `detail.retry_after_seconds`
- Timeout/Retry
  - 서버 공통 생성 경로(`/analyze`, `/analyze/jobs`): `GEMINI_RETRY_TIMEOUT_SECONDS=15`, `GEMINI_RETRY_MAX_ATTEMPTS=3`
  - `/analyze/label`: 429 지수 백오프, 최대 3회
  - `/lookup/barcode`: `BARCODE_UPSTREAM_TIMEOUT_SECONDS=15`, `BARCODE_UPSTREAM_RETRY_COUNT=3`, `BARCODE_UPSTREAM_RETRY_BACKOFF_SECONDS=1.0`
  - 모바일: 각 HTTP 요청 기준 `15000ms`, 재시도 최대 3회
    - `ANALYSIS_TIMEOUT_MS=15000`
    - `ANALYSIS_SUBMIT_TIMEOUT_MS=15000`
    - `ANALYSIS_POLL_TIMEOUT_MS=15000`
    - `BARCODE_LOOKUP_TIMEOUT_MS=15000`
  - 429 재시도는 `Retry-After` 헤더 우선
  - `/analyze/jobs`는 submit/poll을 분리하고, poll 간격은 `poll_after_ms`를 따른다
- On-device cache
  - 이미지/바코드 모두 적용
  - TTL 24h (`EXPO_PUBLIC_AI_CACHE_TTL_SECONDS=86400`)
  - LRU 200 entries
- Cost guardrail
  - `LABEL_COST_GUARDRAIL_ENABLED=1`
  - `AI_COST_GUARDRAIL_ENABLED=1`
  - `AI_COST_GUARDRAIL_STORAGE_BACKEND=postgres`
  - `AI_COST_GUARDRAIL_USAGE_TABLE=ai_monthly_usage`
  - `AI_COST_GUARDRAIL_RESERVATION_TABLE=ai_monthly_usage_reservations`
  - `AI_MONTHLY_BUDGET_USD=10`
  - `LABEL_MONTHLY_BUDGET_USD=10`
  - `FOOD_ESTIMATED_COST_USD_PER_REQUEST=0.006`
  - `FOOD_ESTIMATED_TOKENS_PER_REQUEST=2500`
  - `SMART_ROUTER_ESTIMATED_COST_USD_PER_REQUEST=0.001`
  - `SMART_ROUTER_ESTIMATED_TOKENS_PER_REQUEST=300`
  - `LABEL_ESTIMATED_COST_USD_PER_REQUEST=0.02`
  - `LABEL_ESTIMATED_COST_USD_PER_REQUEST_FALLBACK=0.02`
  - `LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK=0.12`
  - `LABEL_PRO_FALLBACK_MIN_COST_MULTIPLIER=6`
  - `LABEL_ESTIMATED_TOKENS_PER_REQUEST=1500`
  - `LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE=0.012`
  - `LABEL_ESTIMATED_TOKENS_PER_REQUEST_DEGRADE=900`
  - `BARCODE_ALLERGEN_ESTIMATED_COST_USD_PER_REQUEST=0.001`
  - `BARCODE_ALLERGEN_ESTIMATED_TOKENS_PER_REQUEST=500`
  - Render live env parity check:
    - `python .github/scripts/validate_render_live_env.py --blueprint render.yaml`
    - 기본 검증 범위는 AI 모델명, label fallback, Pro fallback guardrail key로 제한한다.
    - 전체 `render.yaml` env drift audit가 필요할 때만 `--all-blueprint-env`를 추가한다.
    - 값 자체는 출력하지 않고 서비스명, key 이름, 존재 여부, blueprint 일치 여부만 확인한다.
    - Pro fallback 운영 key는 `foodlens-api`, `foodlens-worker`, `foodlens-retention-cron`에 모두 있어야 한다.
    - `GEMINI_LABEL_PRO_FALLBACK_ENABLED=0`을 유지하고, Pro fallback 비용 예약 key(`LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK`, `LABEL_PRO_FALLBACK_MIN_COST_MULTIPLIER`)가 세 서비스 live env에 모두 존재해야 한다.
- Observability 메타
  - `/analyze`, `/analyze/label`, `/analyze/smart`: `request_id`, `used_model`, `prompt_version`, `latency_ms`
  - `/analyze/jobs/{job_id}`: `request_id`, `used_model`, `prompt_version`, `latency_ms_by_stage`, `fallback_reason`
  - `/lookup/barcode`: `request_id`, `latency_ms`, 그리고 알러지 분석 수행 시 `used_model`, `prompt_version`

## 10) Phase 4 완료 증적 체크

- [ ] Render 로그에 request_id 기반 시작/완료/오류 추적 가능
- [x] 429 유도 시 `Retry-After`와 표준 detail 응답 확인 (Render Live 기준)
- [x] Render blueprint에 timeout/retry/cost guardrail/barcode upstream env가 선언됨
- [ ] Render live env checker로 Pro fallback guardrail key와 `GEMINI_LABEL_PRO_FALLBACK_ENABLED=0` 적용 확인
- [x] `/analyze`, `/analyze/smart`, `/lookup/barcode` 응답의 `request_id` 확인
- [x] `/analyze`, `/analyze/label`, `/lookup/barcode` 응답의 `latency_ms` 확인
- [x] `/lookup/barcode` 알러지 분석 응답의 `used_model`, `prompt_version` 확인
- [x] label 공급자 429가 API 429로 통일되는지 확인
- [x] 모바일 로그에 `cache_hit=true` 확인 (단위 테스트 로그)
- [x] 백엔드/모바일 테스트 PASS 로그 첨부

### 10-1) 검증 실행 결과 (2026-03-28)

- Backend validation suite A: PASS (40 tests)
  - 실행 명령:
    - `AUTH_STATE_BACKEND=memory python -m unittest backend.tests.runtime.test_analysis_retry_policy backend.tests.runtime.test_analysis_observability backend.tests.runtime.test_label_429_policy backend.tests.runtime.test_cost_guardrail backend.tests.runtime.test_barcode_clients_resilience backend.tests.runtime.test_phase4_operational_config backend.tests.contracts.test_analysis_contract_snapshot backend.tests.contracts.test_barcode_contract_snapshot backend.tests.runtime.test_analysis_jobs backend.tests.runtime.test_analyze_max_tokens_retry`
  - 확인 포인트:
    - 서버 retry 상한(3회) + timeout(15초) 정책
    - 429 표준 응답(`Retry-After`, `UPSTREAM_RATE_LIMITED`)
    - cost guardrail 활성 상태와 degrade/fallback 동작
    - barcode upstream timeout/retry/backoff 정책
    - `/analyze`, `/lookup/barcode`, `/analyze/jobs` 응답 메타(`request_id`, `used_model`, `prompt_version`, `latency_ms*`)
- Backend validation suite B: PASS (9 tests)
  - 실행 명령:
    - `AUTH_STATE_BACKEND=memory python -m unittest backend.tests.runtime.test_api_edge_guard`
  - 확인 포인트:
    - CORS allowlist / LAN regex
    - endpoint별 rate limit 기본값
    - inflight admission 기본값
- Mobile aiCore suite: PASS (7 suites, 35 tests)
  - 실행 명령:
    - `npm test -- aiCore --runInBand`
  - 확인 포인트:
    - 429 `Retry-After` 우선 재시도
    - `/analyze`, `/analyze/jobs`, `/lookup/barcode` 15초/3회 기준
    - on-device cache hit 로그
    - request_id / prompt_version / used_model / latency 메타 보존
- Render runtime rehearsal (burst 429): PASS
  - 실행 일시:
    - `2026-03-28 23:31 KST`
  - 대상 endpoint:
    - `/lookup/barcode`
  - 실행 방식:
    - 동일 barcode 요청 `40건`을 동시 burst로 전송
  - 결과:
    - `200 = 6건`
    - `429 = 34건`
  - 확인 응답:
    - HTTP `429`
    - header `Retry-After: 48`
    - body `detail.code=API_RATE_LIMITED`
    - body `detail.request_id=e745d231f78f`
    - body `detail.retry_after_seconds=48`
  - 복구 확인:
    - `60초` 대기 후 동일 요청 재시도 시 `200 OK`
  - 산출물:
    - `/tmp/phase4_rehearsal/statuses_parallel.tsv`
    - `/tmp/phase4_rehearsal/headers_429.txt`
    - `/tmp/phase4_rehearsal/body_429.json`
    - `/tmp/phase4_rehearsal/headers_recovery.txt`
    - `/tmp/phase4_rehearsal/body_recovery.json`
  - 남은 후속:
    - Render Live Logs에서 동일 시각 `request_id` 상관 로그 캡처를 추가하면 운영 증적이 더 강해진다

---

문서 버전: v1.2  
연결 문서: [Master Plan](./master-plan.md), [Phase 3 실행표](./phase-3-sync-conflict-execution.md), [API 계약 기준서](../contracts/api-contracts.md)  
최종 수정: 2026-03-28
