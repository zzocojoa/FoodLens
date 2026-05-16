# Render DB 저장 데이터 인벤토리 (Auth/Auth Rate Limit 기준)

## 1) 목적

- Render PostgreSQL에 현재 실제로 저장되는 데이터를 코드 기준으로 명확히 정리합니다.
- Phase 2 증적/운영 점검 시 "어떤 데이터가 DB에 남는지"를 빠르게 확인하기 위한 문서입니다.

## 2) 적용 범위

- 백엔드 Auth/Session 런타임 상태 저장 경로
- 인증 rate limit 이벤트 저장 경로
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
  - `_access_tokens`
  - `_refresh_tokens`
  - `_access_tokens_by_session`
  - `_refresh_tokens_by_session`
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

## 7) 현재 저장되지 않는 항목(중요)

- `/analyze` 응답 자체는 DB에 자동 저장되지 않습니다.
- 분석 결과가 DB에 남으려면 클라이언트가 `POST /me/history`로 `entry`를 별도 전송해야 합니다.
- Render Live Logs는 DB 저장 데이터가 아니라 로그 스트림입니다.
- 인증 rate limit 테이블에는 원본 client IP, 이메일, device id, access token, refresh token, 인증 코드가 저장되지 않습니다.

## 8) 근거 코드

- Auth state store:
  - `backend/modules/auth/state_store.py`
- Auth snapshot payload/build/restore:
  - `backend/modules/auth/service.py`
- API 요청 스키마 및 `/me/*`, `/auth/logout`, `/analyze` 라우트:
  - `backend/server.py`
- Auth rate limit backend:
  - `backend/modules/ops/api_edge_guard.py`

## 9) 운영 확인 포인트

- 백엔드 시작 로그에서 상태 백엔드 확인:
  - `[Auth] state backend initialized backend=postgres`
- 환경변수:
  - `DATABASE_URL` 설정
  - `AUTH_STATE_BACKEND=postgres` (명시 권장)
  - `AUTH_RATE_LIMIT_BACKEND=postgres`
  - `AUTH_RATE_LIMIT_TABLE=auth_rate_limit_events`
- 권한:
  - 자동 테이블 생성 운영이면 앱 DB 계정에 schema `CREATE`, table/index 생성, sequence 사용 권한이 필요합니다.
  - 사전 생성 후 least-privilege 운영이면 앱 DB 계정에 `auth_rate_limit_events` `SELECT`, `INSERT`, `DELETE`와 sequence `USAGE` 권한이 필요합니다.
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
```
