# Render DB 저장 데이터 인벤토리

## 1) 목적

- Render PostgreSQL에 현재 실제로 저장되는 데이터를 코드 기준으로 명확히 정리합니다.
- Phase 2/5 증적 및 운영 점검 시 "어떤 데이터가 DB에 남는지"를 빠르게 확인하기 위한 문서입니다.

## 2) 적용 범위

- 백엔드 Auth/Session 런타임 상태 저장 경로
- 인증 rate limit 이벤트 저장 경로
- 분석 API rate limit 이벤트 저장 경로
- 비동기 분석 작업 `analysis_jobs` 저장 경로
- 분석 영양 캐시 저장 경로
- AI 비용 가드레일 사용량/예약 저장 경로
- media retention 및 삭제 큐/상태 저장 경로
- `/me/profile`, `/me/allergies`, `/me/settings`, `/me/history` 쓰기 경로
- `/auth/logout` 세션/토큰 상태 변경 경로

## 3) 저장 테이블 구조

### Auth runtime state

- 기본 테이블: `auth_runtime_state`
- 컬럼:
  - `state_key` (`TEXT`, PK)
  - `state_json` (`JSONB`, NOT NULL)
  - `updated_at` (`TIMESTAMPTZ`, NOT NULL, default `NOW()`)
- 저장 방식:
  - `state_key` 기준 upsert (`INSERT ... ON CONFLICT ... DO UPDATE`)
  - 즉, 다수 정규화 테이블이 아니라 단일 JSONB 스냅샷 저장 방식
  - 같은 테이블에는 `state_key=analysis_job_worker_heartbeat` 형태의 worker heartbeat 스냅샷도 저장될 수 있다. 이 heartbeat에는 process role, pid, worker count/id, heartbeat timestamp만 저장하며 사용자 식별자나 분석 입력은 저장하지 않는다.

### Auth rate limit events

- 기본 테이블: `auth_rate_limit_events`
- 컬럼:
  - `id` (`BIGSERIAL`, PK)
  - `endpoint` (`TEXT`, NOT NULL)
  - `subject` (`TEXT`, NOT NULL)
  - `event_ts` (`TIMESTAMPTZ`, NOT NULL)
- 인덱스:
  - `auth_rate_limit_events_endpoint_subject_ts_idx` (`endpoint`, `subject`, `event_ts`)
  - `auth_rate_limit_events_event_ts_idx` (`event_ts`)
- 저장 방식:
  - 인증 요청 평가 시 `endpoint`와 hashed `subject` 기준으로 sliding window 이벤트를 insert한다.
  - `subject`는 `<scope>:<hmac_sha256(scope:value)>` 형식이다. HMAC key는 `AUTH_RATE_LIMIT_HASH_SECRET`, `DATABASE_URL`, non-default `AUTH_STATE_KEY` 순서로 선택한다. `scope`는 `ip`, `email`, `device` 중 하나이며 원본 client IP, 이메일, device id는 저장하지 않는다.
  - 평가마다 `DELETE FROM auth_rate_limit_events WHERE event_ts <= ...`로 window 밖 이벤트를 제거한다.

### Analysis API rate limit events

- 기본 테이블: `analysis_rate_limit_events`
- 컬럼/인덱스:
  - `PostgresSlidingWindowRateLimiter`가 `auth_rate_limit_events`와 같은 `id`, `endpoint`, `subject`, `event_ts` 구조 및 endpoint/subject/time index를 자동 생성한다.
- 저장 방식:
  - 분석 요청 평가 시 `endpoint`와 hashed `subject` 기준으로 sliding window 이벤트를 insert한다.
  - `subject`는 `<scope>:<hmac_sha256(scope:value)>` 형식이다. HMAC key는 `AUTH_RATE_LIMIT_HASH_SECRET`, `DATABASE_URL`, non-default `AUTH_STATE_KEY` 순서로 선택한다.
  - 비인증 요청은 `ip`와 선택적 `device` subject를 함께 평가한다.
  - 인증 요청은 `user` subject를 우선 포함하고 `ip`, 선택적 `device` subject도 함께 평가한다.
  - 원본 client IP, device id, user id, access token은 저장하지 않는다.
  - 평가마다 `DELETE FROM analysis_rate_limit_events WHERE event_ts <= ...`로 window 밖 이벤트를 제거한다.

### Analysis jobs

- 기본 테이블: `analysis_jobs`
- 저장 목적:
  - `/analyze/jobs` 비동기 분석 작업의 접수, 처리, polling 상태를 보존한다.
  - embedded worker가 꺼져 있고 별도 worker가 켜진 운영 환경에서 web/worker 간 작업 전달 저장소로 사용한다.
- 민감 가능 컬럼:
  - `user_id`, `idempotency_key`
  - `allergy_info`
  - `image_base64`, `image_sha256`
  - `result_json`
- 삭제/정리 정책:
  - 계정 삭제 또는 데이터 삭제 시 해당 사용자 `analysis_jobs`는 `USER_DATA_DELETED`로 scrub되어야 한다.
  - 오래된 anonymous/device/ip scoped 작업은 [analysis jobs privacy backfill runbook](./analysis-jobs-privacy-backfill-runbook.md)에 따라 dry-run 검토 후 scrub한다.
  - scrub은 행 삭제가 아니라 복구 가능한 민감 필드를 비우고 `error_code=USER_DATA_DELETED`로 표시하는 방식이다.

### Analysis nutrition cache

- 기본 테이블: `analysis_nutrition_cache`
- 컬럼:
  - `cache_key` (`TEXT`, PK): `<normalized ingredient>|<normalized origin>` 형식
  - `payload_json` (`JSONB`, NOT NULL): 영양 조회 결과
  - `updated_at` (`TIMESTAMPTZ`, NOT NULL)
- 저장 방식:
  - 음식 분석 결과의 ingredient name과 food origin 기준으로 영양 조회 결과를 캐시한다.
  - 사용자 식별자, 이미지, 알러지 정보, 요청 ID는 저장하지 않는다.

### AI cost guardrail state

- 기본 테이블:
  - `ai_monthly_usage`
  - `ai_monthly_usage_reservations`
- 저장 항목:
  - 월별 period key
  - 확정/예약 비용
  - 토큰 수, 요청 수, fallback/truncation count
  - request ID 기반 reservation key
- 저장 방식:
  - 분석 비용 예산 초과를 막기 위한 운영 집계 상태이다.
  - 사용자 식별자, 이미지, 알러지 정보, 분석 결과는 저장하지 않는다.

### Retention and deletion state

- 기본 테이블:
  - `retention_records`
  - `deletion_queue`
  - `deletion_statuses`
- 저장 항목:
  - `retention_records`: `record_id`, `data_class`, `created_at`, `user_id`, `request_id`, `storage_key`, `object_generation`
  - `deletion_queue`: `queue_id`, `created_at`, `target`, `user_id`, `request_id`, `reason`, `dequeued_at`
  - `deletion_statuses`: `queue_id`, `created_at`, `updated_at`, `status`, `target`, `user_id`, `request_id`, `reason`, `error`
- 저장 방식:
  - media 원본 TTL 삭제와 계정/데이터 삭제 요청 처리 상태를 보존한다.
  - 삭제 완료 후 `deletion_queue` 행은 제거되고, `deletion_statuses`는 최근 요청 상태 조회 및 운영 감사 목적으로 남는다.

## 4) `state_json` 내부 저장 항목(payload 키)

아래 키들이 Auth 런타임 스냅샷으로 저장됩니다.

- 사용자/식별:
  - `_users_by_id`
  - `_user_id_by_email`
  - `_provider_subject_to_user_id`
- 사용자 데이터(`/me/*`):
  - `_profiles_by_user_id`
  - `_allergies_by_user_id`
  - `_settings_by_user_id`
  - `_history_by_user_id`
  - `_history_idempotency_by_user_id`
- 세션/토큰:
  - `_sessions`
  - `_session_ids_by_family`
  - `_access_tokens`: access token 원문이 아니라 `AUTH_TOKEN_HASH_SECRET` 기반 HMAC digest와 세션 메타데이터만 저장한다.
  - `_refresh_tokens`: refresh token 원문이 아니라 `AUTH_TOKEN_HASH_SECRET` 기반 HMAC digest, rotation 상태, replacement digest만 저장한다.
  - `_access_tokens_by_session`: 세션별 access token digest index
  - `_refresh_tokens_by_session`: 세션별 refresh token digest index
- 인증 보조:
  - `_email_verifications_by_user_id`
  - `_password_resets_by_user_id`

## 5) `/me/*` 엔드포인트별 저장 필드

- `PUT /me/profile`
  - 입력: `display_name`, `locale`, `timezone`
  - 저장 대상: 프로필 + 사용자(`_profiles_by_user_id`, `_users_by_id` 일부 필드 동기화)

- `PUT /me/allergies`
  - 입력: `allergies[]`, `dietary_restrictions[]`, `severity_map{}`
  - 저장 대상: `_allergies_by_user_id`

- `PUT /me/settings`
  - 입력: `language`, `target_language`, `auto_play_audio`, `selected_emoji`
  - 저장 대상: `_settings_by_user_id`

- `POST /me/history`
  - 입력: `entry(JSON)`, `idempotency_key`
  - 저장 대상: `_history_by_user_id`, `_history_idempotency_by_user_id`
  - 서버 생성/보존: `id(history_id)`, `created_at`, `updated_at`

## 6) `/auth/logout` 저장 영향

- `POST /auth/logout`은 세션 및 토큰 상태를 갱신합니다.
  - 세션 revoke (`revoked_at`, `revoked_reason`)
  - access token revoke
  - refresh token 상태 변경(`active` -> `revoked` 등)
- 위 변경은 동일하게 `state_json` 스냅샷에 영속화됩니다.

## 7) 현재 저장되지 않는 항목 및 주의점(중요)

- 동기 `/analyze` 응답 자체는 DB에 자동 저장되지 않습니다.
- 분석 결과가 DB에 남으려면 클라이언트가 `POST /me/history`로 `entry`를 별도 전송해야 합니다.
- 단, 비동기 `/analyze/jobs` 경로는 운영 작업 처리를 위해 `analysis_jobs`에 이미지/알러지/결과 필드를 저장할 수 있으므로 위 삭제/정리 정책 대상입니다.
- Render Live Logs는 DB 저장 데이터가 아니라 로그 스트림입니다.
- 인증 및 분석 rate limit 테이블에는 원본 client IP, 이메일, device id, user id, access token, refresh token, 인증 코드가 저장되지 않습니다.
- 분석 영양 캐시와 비용 가드레일 테이블에는 사용자 식별자, 이미지, 알러지 정보, 분석 결과가 저장되지 않습니다.

## 8) 근거 코드

- Auth state store:
  - `backend/modules/auth/state_store.py`
- Auth snapshot payload/build/restore:
  - `backend/modules/auth/service.py`
- API 요청 스키마 및 `/me/*`, `/auth/logout`, `/analyze` 라우트:
  - `backend/server.py`
- Auth rate limit backend:
  - `backend/modules/ops/api_edge_guard.py`
- Analysis jobs store:
  - `backend/modules/analysis_jobs.py`
- Analysis jobs privacy backfill:
  - `backend/scripts/backfill_analysis_jobs_privacy.py`
- Nutrition cache store:
  - `backend/modules/analysis_jobs.py`
- Cost guardrail store:
  - `backend/modules/ops/cost_guardrail.py`
- Retention/deletion stores:
  - `backend/modules/ops/data_retention.py`
  - `backend/modules/ops/deletion_queue.py`

## 9) 운영 확인 포인트

- 백엔드 시작 로그에서 상태 백엔드 확인:
  - `[Auth] state backend initialized backend=postgres`
- 환경변수:
  - `DATABASE_URL` 설정
  - `AUTH_STATE_BACKEND=postgres` (명시 권장)
  - `AUTH_TOKEN_HASH_SECRET` (Render Dashboard 관리 secret, 빈 값 불가)
  - `AUTH_RATE_LIMIT_BACKEND=postgres`
  - `AUTH_RATE_LIMIT_TABLE=auth_rate_limit_events`
  - `ANALYSIS_RATE_LIMIT_BACKEND=postgres`
  - `ANALYSIS_RATE_LIMIT_TABLE=analysis_rate_limit_events`
  - `ANALYSIS_JOB_BACKEND=postgres`
  - `ANALYSIS_JOB_TABLE=analysis_jobs`
  - `ANALYSIS_NUTRITION_CACHE_BACKEND=postgres`
  - `ANALYSIS_NUTRITION_CACHE_TABLE=analysis_nutrition_cache`
  - `AI_COST_GUARDRAIL_STORAGE_BACKEND=postgres`
  - `AI_COST_GUARDRAIL_USAGE_TABLE=ai_monthly_usage`
  - `AI_COST_GUARDRAIL_RESERVATION_TABLE=ai_monthly_usage_reservations`
  - `RETENTION_STORE_BACKEND=postgres`
  - `RETENTION_STORE_TABLE=retention_records`
  - `ANALYSIS_JOBS_TTL_SCRUB_ENABLED`
  - `ANALYSIS_JOBS_TTL_SCRUB_DRY_RUN`
  - `ANALYSIS_JOBS_TTL_SCRUB_DAYS`
  - `ANALYSIS_JOBS_TTL_SCRUB_BATCH_SIZE`
  - `DELETION_QUEUE_BACKEND=postgres`
  - `DELETION_QUEUE_TABLE=deletion_queue`
  - `DELETION_STATUS_TABLE=deletion_statuses`
- TTL scrub rollout:
  - [Analysis Jobs TTL Scrub Rollout](analysis-jobs-ttl-scrub-rollout.md)에 따라 `render.yaml`과 Render live env parity를 먼저 확인한다.
  - live env 누락 확인에는 `python .github/scripts/validate_render_live_env.py --blueprint render.yaml --presence-only`를 사용한다.
- 권한:
  - 자동 테이블 생성 운영이면 앱 DB 계정에 schema `CREATE`, table/index 생성, sequence 사용 권한이 필요합니다.
  - 사전 생성 후 least-privilege 운영이면 앱 DB 계정에 각 코드 경로가 실제 사용하는 `SELECT`, `INSERT`, `UPDATE`, `DELETE` 권한과 필요한 sequence `USAGE` 권한이 필요합니다.
- 장기 cleanup:
  - 정상 auth traffic이 있으면 요청 평가 경로가 만료 이벤트를 제거합니다.
  - 장시간 traffic이 없으면 만료 이벤트가 다음 auth 요청까지 남을 수 있으므로, 운영 점검에서 아래 SQL로 잔여분을 확인합니다.
  - `INTERVAL`은 운영 `AUTH_RATE_LIMIT_WINDOW_SECONDS`보다 짧게 잡지 않습니다. 아래 예시는 기본 60초 window보다 긴 10분 기준입니다.

```sql
SELECT count(*) AS expired_auth_rate_limit_events
FROM auth_rate_limit_events
WHERE event_ts <= NOW() - INTERVAL '10 minutes';

DELETE FROM auth_rate_limit_events
WHERE event_ts <= NOW() - INTERVAL '10 minutes';

SELECT count(*) AS expired_analysis_rate_limit_events
FROM analysis_rate_limit_events
WHERE event_ts <= NOW() - INTERVAL '10 minutes';

DELETE FROM analysis_rate_limit_events
WHERE event_ts <= NOW() - INTERVAL '10 minutes';
```
