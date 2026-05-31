# OAuth Security Operations Runbook

이 문서는 Google/Kakao OAuth state/PKCE 보강 이후 운영자가 배포 전후에 확인해야 하는 dry-run 검증 범위를 정리한다.

## 안전 원칙

- 기본 검증은 live provider, provider callback, token exchange, webhook, credential 검증을 호출하지 않는다.
- URL, DSN, token, OAuth `state`, `nonce`, `code_verifier`, `code_challenge`, `callback_verifier`, `app_proof_challenge` 값은 로그나 터미널 출력에 남기지 않는다.
- staging/live에서 수동 smoke를 수행하더라도 provider redirect를 따라가지 않는다. 확인 범위는 FoodLens `/auth/{provider}/start`와 `/auth/{provider}/logout/start`의 `302 Location` 헤더까지다.
- OAuth callback과 `POST /auth/{provider}` code exchange는 mock/stub 테스트에서만 검증한다.

## 로컬 Dry-Run 명령

```bash
bash -n backend/scripts/ci_auth_live_provider_smoke.sh
AUTH_PROVIDER_SMOKE_MODE=dry-run bash backend/scripts/ci_auth_live_provider_smoke.sh
python3 backend/scripts/ci_auth_state_backend_smoke.py
```

staging, production 배포 전에는 persisted state backend 요구사항을 명시한다.

```bash
RENDER_FOODLENS_API_INSTANCE_COUNT=1 python3 backend/scripts/ci_auth_state_backend_smoke.py \
  --expected-backend postgres \
  --require-shared-state \
  --require-single-render-instance
```

이 명령은 DB 연결을 열지 않고 환경변수 형태와 코드상 로그 필드만 확인한다. `--require-single-render-instance`는 atomic OAuth state consume이 배포된 revision에서 live-concurrency 검증을 마치기 전까지 쓰는 rollout guard다. 사용할 때는 Render Dashboard에서 `foodlens-api` service의 instance count를 먼저 확인한 뒤 값을 넣는다. CI에서 다른 이름을 쓰는 경우 `FOODLENS_API_INSTANCE_COUNT` 또는 `RENDER_SERVICE_INSTANCE_COUNT`도 사용할 수 있다.

```bash
FOODLENS_API_INSTANCE_COUNT=1 python3 backend/scripts/ci_auth_state_backend_smoke.py \
  --expected-backend postgres \
  --require-shared-state \
  --require-single-render-instance
```

instance count 값은 secret이 아니지만 운영 상태값이므로 스크립트는 숫자 또는 `unset`/`invalid`만 출력한다.

## Auth State Backend 운영 확인

운영 환경은 다음 조건을 만족해야 한다.

- `AUTH_STATE_BACKEND=postgres`
- `DATABASE_URL` 설정됨
- `AUTH_TOKEN_HASH_SECRET` 설정됨

주의사항:

- `DATABASE_URL`은 로그에 전체 값이 출력되면 안 된다. 스크립트는 `postgresql://[REDACTED_DATABASE_URL]` 형식으로만 표시한다.
- `AUTH_TOKEN_HASH_SECRET`은 값이 아니라 `set` 또는 `unset` 상태만 표시한다.
- `AUTH_TOKEN_HASH_SECRET`은 배포 사이에 안정적으로 유지되어야 한다. 값이 바뀌면 기존 access/refresh token digest 검증이 깨질 수 있다.
- `AUTH_STATE_BACKEND=memory`는 단일 프로세스 로컬 개발 전용이다. scale-out 환경에서는 OAuth pending state가 프로세스별로 분리되어 callback/POST 검증이 실패할 수 있다.
- `AUTH_STATE_BACKEND=postgres`는 OAuth pending state를 `auth_runtime_state_oauth_pending_states` 전용 table에 저장하고, POST consume 시 row-level conditional update로 같은 state의 동시 재사용을 막는다. live DB 호출 없는 검증에서는 SQL shape와 mock/fake connection 테스트까지만 확인한다.

Render 운영 확인:

- Render Dashboard에서 `foodlens-api` service를 연다.
- Settings 또는 Scaling 화면에서 instance count가 `1`인지 확인한다.
- atomic OAuth state consume이 배포된 revision에서 live-concurrency 검증을 마치기 전에는 배포 전 smoke에서 `RENDER_FOODLENS_API_INSTANCE_COUNT=1`과 `--require-single-render-instance`를 함께 사용한다.
- live-concurrency 검증 전 instance count가 `2` 이상이면 배포를 중단하고, 검증이 끝날 때까지 `1`로 되돌린다.

## App/Universal Links 배포 게이트

운영 OAuth app return callback은 [`OAuth App Link Domain Checklist`](./oauth-app-link-domain-checklist.md)를 기준으로 승인한다.

- iOS build에는 `EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL`에서 생성된 `applinks:<verified-app-link-domain>` Associated Domains entitlements가 포함되어야 한다.
- Android build에는 같은 host의 `https` App Links intent filter, `pathPrefix=/oauth/`, `autoVerify=true`가 포함되어야 한다.
- 운영 도메인은 `/.well-known/apple-app-site-association`과 `/.well-known/assetlinks.json`을 HTTPS 200으로 제공해야 하며 redirect를 사용하지 않는다.
- Google/Kakao provider console에는 backend callback URI만 등록한다. 앱 return URI인 `https://<verified-app-link-domain>/oauth/...`와 `foodlens://oauth/...`는 provider console에 등록하지 않는다.
- App/Universal Links 검증이 실패하면 운영 OAuth rollout을 중단한다. 운영에서 `foodlens://` custom scheme fallback을 열지 않는다.

Atomic OAuth state store 확인:

- pending OAuth state가 provider, app redirect URI, expires_at, consumed_at, nonce, PKCE verifier를 row 단위로 저장한다.
- consume은 `state`, `provider`, `consumed_at IS NULL`, `expires_at > now()` 조건을 하나의 atomic update로 처리한다.
- mock/fake connection 테스트는 live DB를 열지 않고 SQL shape와 service delegation만 검증한다.
- 다중 instance 배포 전에는 같은 state로 동시에 들어온 두 POST 중 하나만 session 발급까지 진행되는 live-concurrency 검증 증적을 남긴다.

## OAuth State Failure 알림 필드

백엔드 OAuth state 검증 실패 로그는 다음 구조화 필드를 기준으로 대시보드와 알림을 구성한다.

- `request_id`
- `provider`
- `failure_code`
- `state_age_bucket`

권장 알림 조건:

- `failure_code=AUTH_PROVIDER_INVALID_STATE` 급증: login CSRF, 잘못된 모바일 start URL, stale callback 가능성 확인
- `failure_code=AUTH_PROVIDER_STATE_EXPIRED` 급증: 모바일 중단/재시작, TTL 과소 설정, provider authorize 지연 확인
- `failure_code=AUTH_PROVIDER_STATE_REUSED` 발생: replayed callback 또는 중복 POST 가능성 확인
- `failure_code=AUTH_PROVIDER_ID_TOKEN_MISSING|AUTH_PROVIDER_ID_TOKEN_INVALID|AUTH_PROVIDER_ID_TOKEN_NONCE_MISSING|AUTH_PROVIDER_ID_TOKEN_SUBJECT_MISSING` 급증: Google token response 또는 ID token claim shape가 계약과 맞지 않는다. Google OAuth scope, client ID/audience, issuer/expiry 검증 실패, provider 응답 변경 여부를 확인하고 사용자는 새 OAuth flow로 재시도하게 한다.
- `failure_code=AUTH_PROVIDER_ID_TOKEN_NONCE_MISMATCH` 발생: Google ID token이 현재 pending OAuth state에서 생성한 nonce와 일치하지 않는다. 사용자는 새 OAuth flow로 재시도해야 하며, 운영자는 replayed callback, stale deep link, provider redirect 설정 drift를 확인한다.
- `failure_code=AUTH_PROVIDER_PENDING_NONCE_MISSING` 발생: Google pending OAuth state가 nonce 없이 저장되었다. 현재 backend revision, auth state backend 저장 schema, start route의 nonce persistence를 확인하고 rollout을 중지한다.
- `failure_code=AUTH_PROVIDER_ID_TOKEN_VERIFY_UNAVAILABLE` 급증: Google ID token verifier가 인증서/키 조회 또는 transport 단계에서 실패했다. egress, DNS, provider availability를 확인하고 클라이언트 재시도를 허용한다.
- `provider` 한쪽에만 집중: provider별 redirect 설정과 앱 start URL 확인
- `state_age_bucket=unknown` 집중: pending state 저장 실패 또는 client-supplied state 경로 확인

로그에는 OAuth `state`, provider token, Google ID token, decoded ID token claims, provider user id, email, `nonce`, `code_verifier`, `code_challenge`를 포함하지 않는다.

## Smoke 실행 범위

`backend/scripts/ci_auth_live_provider_smoke.sh --dry-run` 또는 `AUTH_PROVIDER_SMOKE_MODE=dry-run`:

- 네트워크 요청 없음
- start/logout route shape 확인
- encoded app redirect URI 포함 여부 확인
- dry-run smoke가 callback, token exchange, webhook, credential 검증을 수행하지 않음을 명시

live 모드:

- `AUTH_PUBLIC_BASE_URL` 필요
- `AUTH_OAUTH_REDIRECT_BASE_URL` 필요. 이 값은 검증된 Universal Links/App Links HTTPS origin이어야 한다.
- FoodLens backend에만 `GET /auth/google/start`, `GET /auth/kakao/start`, `GET /auth/google/logout/start`, `GET /auth/kakao/logout/start` 요청
- `curl` redirect follow 없음
- start/logout 요청의 app redirect URI는 `AUTH_OAUTH_REDIRECT_BASE_URL`에서 파생한 HTTPS `/oauth/...` callback만 사용한다. `foodlens://` custom scheme은 live smoke에서 사용하지 않는다.
- provider authorize URL의 host, generated state, Google/Kakao PKCE `code_challenge_method=S256`을 값 노출 없이 확인

live 모드는 운영자가 명시적으로 승인한 staging/prod smoke에서만 사용한다.
