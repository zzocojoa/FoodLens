# FoodLens API 계약 기준서 (비개발자 이해형)

## 1) 이 문서는 왜 필요한가?

- 앱과 서버가 서로 다른 형식을 쓰면 저장, 로그인, 분석 결과 표시가 깨질 수 있습니다.
- 이 문서는 **현재 실제로 운영 중인 API 약속**을 고정하는 문서입니다.
- 문서와 구현이 다르면 구현/배포 기준으로 문서를 즉시 갱신해야 합니다.

## 2) 공통 규칙

- 주요 응답은 가능하면 다음 메타를 포함합니다.
  - `request_id`: 요청 추적 번호
  - `used_model`: 실제 사용한 AI 모델명
  - `prompt_version`: 사용한 프롬프트 버전
  - `latency_ms`: 동기 API 전체 지연시간
  - `latency_ms_by_stage`: 비동기 분석 단계별 지연시간
- 실패 응답은 사람이 이해 가능한 메시지와 코드(`detail.message`, `detail.code`)를 제공합니다.
- 하위 호환 원칙:
  - 기존 필드 삭제 금지
  - 신규 필드 추가 허용

## 3) 현재 핵심 API 계약 (요약)

### A. 헬스 체크

- Endpoint: `GET /`
- 목적:
  - 서비스 기동 여부 확인
  - 배포 직후 smoke / health check 진입점

### B. 라벨 분석

- Endpoint: `POST /analyze/label`
- 입력:
  - `file` (이미지)
  - `allergy_info` (선택)
  - `locale`
- 출력(핵심):
  - `foodName`, `foodName_en`, `foodName_ko`
  - `safetyStatus`
  - `ingredients[]`
  - `nutrition`
  - `raw_result`, `raw_result_en`, `raw_result_ko`
  - `request_id`, `prompt_version`, `used_model`, `latency_ms`
  - `label_diagnostics`: 라벨 추출/평가 상태. 알레르기 프로필이 비어 있어 평가 호출을 생략한 정상 케이스는 `assess_skipped=true`, `assess_skip_reason=allergy_profile_none`, `assess_finish_reason=null`, `latency_ms.assess=0`으로 표현합니다.

### C. 음식 사진 분석

- Endpoint: `POST /analyze`
- 입력:
  - 음식 이미지
  - 사용자 알레르기/로케일 컨텍스트
- 출력(핵심):
  - 음식명, 성분 추정, 안전도, 요약
  - `request_id`, `used_model`, `prompt_version`, `latency_ms`

### D. 스마트 분석

- Endpoint: `POST /analyze/smart`
- 입력:
  - 음식 이미지
  - 알레르기/로케일 컨텍스트
- 출력(핵심):
  - 분석 전략에 따라 적절한 결과 payload
  - `request_id`, `used_model`, `prompt_version`, `latency_ms`

### E. 바코드 조회

- Endpoint: `POST /lookup/barcode`
- 입력:
  - `barcode`
  - `locale`, `allergy_info`
- 출력(핵심):
  - 상품명/성분/안전도/요약
  - `request_id`, `latency_ms`
  - 알레르기 분석이 실제 수행된 경우 `used_model`, `prompt_version`

### F. 비동기 분석 작업

- Endpoint:
  - `POST /analyze/jobs`
  - `GET /analyze/jobs/{job_id}`
- 인증/소유권:
  - 로그인 사용자의 job은 같은 사용자의 bearer token으로만 조회할 수 있습니다.
  - 소유자가 없는 기존 anonymous job은 기존 호환성을 위해 `job_id` poll을 유지합니다.
- 출력(핵심):
  - `job_id`, `request_id`, `status`, `accepted_at`, `updated_at`, `poll_after_ms`
  - 완료 시 결과 payload
  - 가능하면 `used_model`, `prompt_version`, `latency_ms_by_stage`, `fallback_reason`
- 개인정보 삭제 또는 보존 기간 만료로 작업 payload가 scrub된 경우:
  - HTTP `410`
  - `detail.code="ANALYSIS_JOB_GONE"`
  - 클라이언트는 해당 job을 더 이상 poll 하지 않고 로컬 pending 상태를 종료해야 합니다.

비개발자 설명:

- 분석이 오래 걸릴 때 앱은 job을 만든 뒤 상태를 poll 하다가 완료 결과를 받습니다.

## 4) 인증 / 세션 API

### A. 활성화된 인증 엔드포인트

- `POST /auth/email/signup`
- `POST /auth/email/login`
- `POST /auth/email/verify`
- `POST /auth/email/verification/request`
- `POST /auth/email/password/reset/request`
- `POST /auth/email/password/reset/confirm`
- `POST /auth/google`
- `POST /auth/kakao`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /auth/kakao/start`
- `GET /auth/kakao/callback`
- `GET /auth/google/logout/start`
- `GET /auth/google/logout/callback`
- `GET /auth/kakao/logout/start`
- `GET /auth/kakao/logout/callback`
- `POST /auth/refresh`
- `POST /auth/logout`

### B. 공통 출력

- 인증 성공: `access_token`, `refresh_token`, `expires_in`, `user`, `request_id`
- 이메일 가입 직후(인증 대기):
  - `verification_required`
  - `verification_method`
  - `verification_channel`
  - `verification_expires_in`
- 비밀번호 재설정 요청:
  - `reset_requested`
  - `reset_method`
  - `reset_channel`
  - `reset_expires_in`
- 비밀번호 재설정 완료:
  - `password_reset`
  - `sessions_revoked`

### C. 요청 요약

- `POST /auth/email/signup`
  - `email`, `password`, `display_name?`, `locale?`, `device_id?`
- `POST /auth/email/login`
  - `email`, `password`, `device_id?`
- `POST /auth/email/verify`
  - `email`, `code`, `device_id?`
- `POST /auth/email/verification/request`
  - `email`
- `POST /auth/email/password/reset/request`
  - `email`
- `POST /auth/email/password/reset/confirm`
  - `email`, `code`, `new_password`
- `POST /auth/google|kakao`
  - `code`, `state`, `redirect_uri?`, `provider_user_id?`, `email?`, `locale?`, `device_id?`
- `POST /auth/refresh`
  - `refresh_token`
- `POST /auth/logout`
  - `refresh_token?` + `Authorization: Bearer <access_token>`

### D. 주요 에러 코드

- `AUTH_INVALID_CREDENTIALS`
- `AUTH_TOKEN_EXPIRED`
- `AUTH_REFRESH_EXPIRED`
- `AUTH_REFRESH_REUSED`
- `AUTH_PROVIDER_CANCELLED`
- `AUTH_PROVIDER_INVALID_CODE`
- `AUTH_REDIRECT_URI_MISMATCH`
- `AUTH_EMAIL_NOT_VERIFIED`
- `AUTH_EMAIL_VERIFICATION_INVALID`
- `AUTH_EMAIL_VERIFICATION_EXPIRED`
- `AUTH_EMAIL_VERIFICATION_LOCKED`
- `AUTH_EMAIL_VERIFICATION_DELIVERY_FAILED`
- `AUTH_PASSWORD_RESET_INVALID`
- `AUTH_PASSWORD_RESET_EXPIRED`
- `AUTH_PASSWORD_RESET_LOCKED`
- `AUTH_PASSWORD_RESET_DELIVERY_FAILED`
- `AUTH_RATE_LIMITED`
- `AUTH_RATE_LIMIT_STORAGE_UNAVAILABLE`

### E. 인증 Rate Limit 계약

- 대상:
  - `POST /auth/email/signup`
  - `POST /auth/email/login`
  - `POST /auth/email/verification/request`
  - `POST /auth/email/password/reset/request`
  - `POST /auth/google`
  - `POST /auth/kakao`
  - `GET /auth/google/start`
  - `GET /auth/kakao/start`
  - `GET /auth/google/callback`
  - `GET /auth/kakao/callback`
- 운영 환경 변수:
  - `AUTH_RATE_LIMIT_ENABLED`
  - `AUTH_RATE_LIMIT_BACKEND`: `auto`, `memory`, `postgres`
  - `AUTH_RATE_LIMIT_TABLE`: Postgres backend table name
  - `AUTH_RATE_LIMIT_WINDOW_SECONDS`
  - `AUTH_RATE_LIMIT_LOGIN_PER_MIN`
  - `AUTH_RATE_LIMIT_SIGNUP_PER_MIN`
  - `AUTH_RATE_LIMIT_VERIFICATION_REQUEST_PER_MIN`
  - `AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_PER_MIN`
  - `AUTH_RATE_LIMIT_OAUTH_LOGIN_PER_MIN`
  - `AUTH_RATE_LIMIT_OAUTH_START_PER_MIN`
  - `AUTH_RATE_LIMIT_OAUTH_CALLBACK_PER_MIN`
  - `AUTH_RATE_LIMIT_HASH_SECRET`: 선택값. 있으면 subject HMAC key로 우선 사용한다.
- Render 운영 기본값:
  - `AUTH_RATE_LIMIT_BACKEND=postgres`
  - `AUTH_RATE_LIMIT_TABLE=auth_rate_limit_events`
  - Postgres backend는 `DATABASE_URL`을 사용해 같은 DB 이벤트 테이블 기준으로 제한을 평가한다.
  - 이 항목은 저장/계약 기준이며, Render branch 배포 또는 scale-out counter 공유 검증 완료 증적은 아니다.
- 저장 데이터:
  - `auth_rate_limit_events.subject`에는 `<scope>:<hmac_sha256(scope:value)>` 형식만 저장한다. HMAC key는 `AUTH_RATE_LIMIT_HASH_SECRET`, `DATABASE_URL`, non-default `AUTH_STATE_KEY` 순서로 선택한다. `scope`는 `ip`, `email`, `device` 중 하나이며 원본 client IP, 이메일, device id는 저장하지 않는다.
  - OAuth provider route는 이메일이 없으면 endpoint별 provider scope와 `ip`, 선택적 `device` subject만 사용한다.
  - 이벤트는 sliding window 계산용 단기 운영 데이터이며, 요청 평가마다 `DELETE FROM auth_rate_limit_events WHERE event_ts <= ...`로 만료분을 제거한다.
- 운영 권한:
  - 최초 자동 생성 경로는 `CREATE TABLE`, `CREATE INDEX`, sequence 사용 권한이 필요하다.
  - 테이블을 사전 생성한 least-privilege 운영 계정은 `SELECT`, `INSERT`, `DELETE`와 sequence `USAGE`가 필요하다.
- 운영 알림:
  - Postgres 지연 또는 connection pressure 의심 시 Render Logs에서 `[AuthRateLimit] slow evaluation` 경고를 확인한다.
  - storage unavailable 로그가 발생하면 DB 연결/권한/connection limit을 먼저 확인한다.
- 롤백:
  - `AUTH_RATE_LIMIT_BACKEND=memory`: process-local limiter로 되돌린다.
  - `AUTH_RATE_LIMIT_ENABLED=0`: 임시 긴급 차단 해제 전용이며 brute-force 보호를 끈다. 정상 롤백은 `AUTH_RATE_LIMIT_BACKEND=memory`를 사용한다.
- 제한 초과 응답:
  - HTTP Status: `429`
  - Header: `Retry-After: <seconds>`
  - `detail.code`: `AUTH_RATE_LIMITED`
  - `detail.message`: `Too many authentication attempts. Please retry shortly.`
  - `detail.request_id`
  - `detail.retry_after_seconds`
  - `detail.retry_scope`: 제한이 걸린 인증 endpoint
  - `detail.retryable_by_client`: `true`
- Postgres backend 장애 응답:
  - HTTP Status: `503`
  - Header: `Retry-After: 5`
  - `detail.code`: `AUTH_RATE_LIMIT_STORAGE_UNAVAILABLE`
  - `detail.message`: `Authentication rate limiting is temporarily unavailable. Please retry shortly.`
  - `detail.request_id`
  - `detail.retry_after_seconds`: `5`
  - `detail.retry_scope`: 제한 평가 대상 인증 endpoint
  - `detail.retryable_by_client`: `true`
- 인증 코드 잠금 응답:
  - 대상: `POST /auth/email/verify`, `POST /auth/email/password/reset/confirm`
  - HTTP Status: `429`
  - Header: `Retry-After: <seconds>`
  - `detail.code`: `AUTH_EMAIL_VERIFICATION_LOCKED` 또는 `AUTH_PASSWORD_RESET_LOCKED`
  - `detail.retry_scope`: 잠금 에러 코드
  - `detail.retryable_by_client`: `false`

### F. 분석 API Rate Limit 계약

- 대상:
  - `POST /analyze`
  - `POST /analyze/label`
  - `POST /analyze/smart`
  - `POST /analyze/jobs`
  - `GET /analyze/jobs/{job_id}`
  - `POST /lookup/barcode`
- 운영 환경 변수:
  - `ANALYSIS_RATE_LIMIT_ENABLED`
  - `ANALYSIS_RATE_LIMIT_BACKEND`: `auto`, `memory`, `postgres`
  - `ANALYSIS_RATE_LIMIT_TABLE`: Postgres backend table name
  - endpoint별 `ANALYSIS_RATE_LIMIT_*_PER_MIN`
- Render 운영 기본값:
  - `ANALYSIS_RATE_LIMIT_BACKEND=postgres`
  - `ANALYSIS_RATE_LIMIT_TABLE=analysis_rate_limit_events`
- 저장 데이터:
  - `analysis_rate_limit_events.subject`에는 `<scope>:<hmac_sha256(scope:value)>` 형식만 저장한다.
  - 비인증 요청은 `ip`와 선택적 `device` subject를 함께 평가한다.
  - 인증 요청은 `user` subject를 우선 포함하고 `ip`, 선택적 `device` subject도 함께 평가한다.
  - 원본 client IP, device id, user id, access token은 저장하지 않는다.
- 제한 초과 응답:
  - HTTP Status: `429`
  - Header: `Retry-After: <seconds>`
  - `detail.code`: `API_RATE_LIMITED`
  - `detail.retry_after_seconds`
  - `detail.retry_scope`: 제한이 걸린 분석 endpoint
  - `detail.retryable_by_client`: `true`
- Postgres backend 장애 응답:
  - HTTP Status: `503`
  - Header: `Retry-After: 5`
  - `detail.code`: `API_RATE_LIMIT_STORAGE_UNAVAILABLE`
  - `detail.retry_after_seconds`: `5`
  - `detail.retry_scope`: 제한 평가 대상 분석 endpoint
  - `detail.retryable_by_client`: `true`

## 5) 사용자 데이터 API

### A. Profile / Allergies / Settings

- `GET /me/profile`
- `PUT /me/profile`
- `GET /me/allergies`
- `PUT /me/allergies`
- `GET /me/settings`
- `PUT /me/settings`

`PUT /me/profile` 주요 입력:

- `display_name`
- `profile_image_url`
- `profile_image_asset_id`
- `gender`
- `birth_year`
- `disliked_ingredients`
- `locale`
- `timezone`
- `current_trip_start`
- `current_trip_location`
- `current_trip_coordinates`
- `expected_updated_at`

`profile_image_asset_id`는 요청 사용자 본인이 소유한 `scope=profile` media asset만 허용합니다. `history` scope 자산이나 다른 사용자의 자산은 프로필 이미지로 참조할 수 없습니다.

`PUT /me/settings` 주요 입력:

- `language`
- `target_language`
- `auto_play_audio`
- `selected_emoji`
- `client_state`
- `expected_updated_at`

### B. History

- `GET /me/history`
- `POST /me/history`
- `PATCH /me/history/{history_item_id}`
- `PATCH /me/history/{history_item_id}/image`
- `DELETE /me/history/{history_item_id}`

설명:

- `POST /me/history`는 새 기록을 추가합니다.
- `PATCH /me/history/{history_item_id}`는 `timestamp` 및 버전 충돌 제어(`expected_updated_at`)를 처리합니다.
- `PATCH /me/history/{history_item_id}/image`는 서버에 업로드된 `image_asset_id`를 연결합니다.

### C. Media

- `POST /me/media/upload` (multipart: `file`, `scope=profile|history`, `linked_entry_id?`)
- `DELETE /me/media/{asset_id}`
- `GET /media/render/{asset_id}?w=<preset>&q=<50~85>&fmt=auto`

설명:

- 서버 자산은 signed render URL로 다시 읽습니다.
- media cleanup은 bearer token 사용자 본인이 소유한 `asset_id`에만 허용하며, 원본 object, retention record, profile/history 참조, render cache를 정리합니다.
- `/me/history` 응답의 `entry.image_render_url`, `/me/profile` 응답의 `profile_image_render_url`이 앱과 smoke에서 사용하는 정규 경로입니다.
- bare filename, 로컬 파일 경로, 임시 device URI는 서버 측 원격 미디어 참조로 취급하지 않습니다.

### D. 삭제 요청

- `GET /me/deletion-requests/latest`
- `POST /me/deletion-requests`

입력:

- `target` = `account | data`

출력:

- `deletion_request { queue_id, request_id, target, status, created_at, updated_at, reason, error, retry_count, next_attempt_at }`

상태값:

- `pending -> in_progress -> done | failed`

## 6) 충돌 / 동기화 규칙

- `PUT /me/profile`, `PUT /me/allergies`, `PUT /me/settings`, `PATCH /me/history/{history_item_id}`는 `expected_updated_at`를 지원합니다.
- 서버 최신값과 충돌하면 `409 PHASE2_CONFLICT`를 반환할 수 있습니다.
- 충돌 응답 detail에는 다음이 포함될 수 있습니다.
  - `entity`
  - `expected_updated_at`
  - `server_updated_at`
  - `server_payload`

## 7) 운영에서 꼭 보는 지표

- endpoint별 성공률 / 4xx / 5xx
- p50 / p95 / p99 지연시간
- AI 비용
- 429 비율
- 분석 job submit / poll 실패율
- signed media render 성공률

## 8) 장애 대응 기본 룰

- `429`: `Retry-After`를 따르고 백오프
- `503`: 큐 또는 store 일시 장애 가능성 확인
- 계약 불일치: 롤백 또는 server-side compatibility patch

### 429 표준 에러 계약

- HTTP Status: `429`
- Header: `Retry-After: <seconds>`
- Body:
  - `detail.message`
  - `detail.code`
  - `detail.request_id`
  - `detail.retry_after_seconds`

## 9) QA / Release Gate 체크리스트

- 분석/인증 응답에 필수 필드 누락이 없는가?
- `request_id`로 로그 추적이 가능한가?
- 계정 전환 후 데이터 소유자가 정확한가?
- `/me/profile`, `/me/history`가 signed media render URL을 정상 반환하는가?
- post-deploy smoke가 실행 시점 로그인으로 동적 토큰/미디어 URL을 확보하는가?

---

문서 버전: v1.8
소유: Backend Lead + Mobile Lead  
최종 수정: 2026-05-16
