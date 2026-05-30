# Media Render Signing Secret Operations Runbook

이 문서는 signed media render URL 보안을 위해 `MEDIA_RENDER_SIGNING_SECRET`을 설정, 검증, 교체할 때 따라야 하는 운영 절차를 정리한다.

## 안전 원칙

- `MEDIA_RENDER_SIGNING_SECRET` 값은 저장소, PR, 로그, 터미널 출력에 남기지 않는다.
- 운영/staging/Render 배포 환경에서는 `MEDIA_RENDER_SIGNING_SECRET`이 없거나 약하면 서버 startup이 실패해야 한다.
- `MEDIA_RENDER_SIGNING_SECRET`은 `AUTH_STATE_KEY`와 다른 값이어야 한다.
- `OPENAPI_EXPORT_ONLY=1`은 OpenAPI export 전용이며 운영/staging 서비스에 설정하지 않는다.
- signed media render URL의 `exp`는 서버가 허용하는 TTL 창을 넘을 수 없다. 서명이 맞아도 너무 먼 미래 만료 시간은 거부한다.
- live storage, GCS, provider credential 검증은 이 runbook의 기본 검증 범위가 아니다.

## 비개발자 운영자 결정 기준

현재 Render Dashboard에 강한 `MEDIA_RENDER_SIGNING_SECRET`이 설정되어 있다면 서비스 동작을 위해 password manager 보관을 즉시 해야 하는 것은 아니다. 다만 조직에서 운영 secret을 중앙 관리해야 하는 정책이 있거나, 담당자 변경에 대비해야 한다면 password manager에 별도로 보관한다.

보관 방식을 고를 때는 다음 기준을 따른다.

- Render만 사용: 지금 추가 작업은 없다. Render Dashboard가 유일한 보관 위치가 된다.
- Password manager도 사용: password manager에서 새 secret을 생성한 뒤 Render의 모든 관련 service에 같은 값을 넣고 재배포한다.

어느 방식을 선택해도 secret 원문을 PR, 채팅, 메모장, 스크린샷, 터미널 출력에 남기지 않는다.

## Secret 생성 기준

운영/staging secret은 최소 32 bytes 이상의 랜덤 값이어야 한다. 다음 값은 사용할 수 없다.

- `change-me`
- `default`
- `dev`
- `development`
- `foodlens-media-dev-secret`
- `password`
- `secret`
- `test`
- `unit-test-secret`

권장 생성 방식:

```bash
openssl rand -base64 48 | tr '+/' '-_' | tr -d '='
```

출력값은 한 번만 확인하고 password manager 또는 Render Dashboard secret field에 직접 저장한다.

## Render Dashboard 설정

각 Render service에서 다음을 확인한다.

- `MEDIA_RENDER_SIGNING_SECRET`이 설정되어 있다.
- `MEDIA_RENDER_SIGNING_SECRET`은 `sync:false`로 Dashboard-managed secret이어야 한다.
- `MEDIA_RENDER_SIGNING_SECRET`은 32 bytes 이상이며 known weak/default 값이 아니다.
- `MEDIA_RENDER_SIGNING_SECRET`은 `AUTH_STATE_KEY`와 다르다.
- `OPENAPI_EXPORT_ONLY=0`
- `SENTRY_ENVIRONMENT=production` 또는 staging 서비스에서는 `staging`
- `MEDIA_RENDER_SIGN_BUCKET_SECONDS=3600`

## 로컬 검증

저장소에 secret 값을 넣지 않고 다음 검증을 실행한다.

```bash
bash backend/scripts/ci_render_blueprint_gate.sh
.venv/bin/python -m unittest backend.tests.runtime.test_phase4_operational_config
.venv/bin/python -m unittest backend.tests.runtime.test_media_render_runtime
```

Render API key가 있는 운영자만 live env parity 검사를 실행한다. 이 명령은 env 값을 출력하지 않고 key 상태와 value match 여부만 표시한다.

```bash
python .github/scripts/validate_render_live_env.py --blueprint render.yaml
```

실패 시 출력의 `service`, `key`, `present`, `empty`, `weak_secret`, `auth_state_key_reuse`, `matches_blueprint`만 보고 Dashboard 설정을 수정한다. `MEDIA_RENDER_SIGNING_SECRET`처럼 `sync:false`인 secret은 값 비교가 아니라 `present=false`, `empty=true`, `weak_secret=true`, `auth_state_key_reuse=true` 여부를 본다. secret 원문을 터미널에 붙여 넣지 않는다.

## 교체 절차

1. 새 `MEDIA_RENDER_SIGNING_SECRET`을 생성한다.
2. Render Dashboard에서 staging service 값을 먼저 교체한다.
3. staging 배포가 startup 단계에서 성공하는지 확인한다.
4. signed media render URL smoke는 값 노출 없이 status code와 cache/header shape만 확인한다.
5. production service 값을 교체한다.
6. production 배포 직후 `/health/ready`와 media render 접근 제어 경로를 확인한다.

교체 직후 기존 signed URL은 새 secret으로 검증되지 않을 수 있다. 현재 URL TTL과 `MEDIA_RENDER_SIGN_BUCKET_SECONDS`를 기준으로 사용자 영향 시간을 계산한 뒤 교체 시간을 정한다.

너무 먼 미래의 `exp`를 가진 signed URL은 서명이 맞아도 거부된다. 이 제한은 잘못 생성된 장기 URL이나 내부 secret 사고가 장기 접근권으로 이어지는 것을 막기 위한 방어선이다.

## 실패 시 대응

- startup 실패와 함께 `MEDIA_RENDER_SIGNING_SECRET` 관련 오류가 나면 Dashboard secret 설정 여부와 값 길이를 확인한다.
- `OPENAPI_EXPORT_ONLY=1`이 운영/staging에 설정되어 있으면 즉시 `0`으로 되돌린다.
- `weak_secret=true`가 나오면 새 랜덤 secret으로 교체한다.
- `auth_state_key_reuse=true`가 나오면 `MEDIA_RENDER_SIGNING_SECRET`을 `AUTH_STATE_KEY`와 다른 새 랜덤 secret으로 교체한다.
- `matches_blueprint=false`가 나오면 `render.yaml`의 literal env 값과 Dashboard 값을 맞춘다.
- secret 값이 로그나 PR에 노출되었다면 즉시 secret을 교체하고 노출 위치를 삭제한다.
