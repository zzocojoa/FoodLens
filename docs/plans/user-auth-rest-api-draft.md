# FoodLens 유저 인증 REST API 명세 초안 (CTO 실무 관점)

## 1) 문서 목적

- 모바일 앱(FoodLens)의 로그인/인증/세션 관리를 위한 서버 API 계약 초안을 정의한다.
  설명: 앱에서 "로그인 유지", "자동 로그인", "보안 로그아웃"이 안정적으로 동작하게 하는 약속 문서다.
- 초기 Render 환경에서 빠르게 출시 가능하면서, 추후 인프라 확장(DB/캐시/큐)에도 계약을 유지하도록 설계한다.
  설명: 지금은 작게 시작하되, 사용자가 많아져도 앱 코드를 크게 바꾸지 않도록 미리 기준을 잡는다.

## 2) 범위

- 이메일 기반 회원가입/로그인
  설명: 가장 기본적인 계정 생성/로그인 기능을 먼저 제공한다.
- Access/Refresh 토큰 기반 세션 관리
  설명: 앱을 껐다 켜도 다시 로그인하지 않게 해주는 핵심 방식이다.
- 로그아웃(단일 세션/전체 세션), 내 정보 조회
  설명: 현재 기기만 로그아웃하거나 모든 기기에서 일괄 로그아웃할 수 있게 한다.
- 비밀번호 재설정(이메일 OTP 또는 토큰 링크)
  설명: 비밀번호를 잊은 사용자도 계정을 안전하게 복구할 수 있다.
- 운영 메타(request_id, 에러 코드, rate limit)
  설명: 장애 추적, 악성 호출 차단, 고객 문의 대응을 위한 운영 정보다.

### 비범위(초안 단계)

- 소셜 로그인(OAuth) 상세 구현
  설명: Apple/Google 로그인은 다음 단계로 미룬다.
- MFA(TOTP/SMS) 강제 정책
  설명: 2단계 인증 강제는 운영 복잡도가 높아 후순위로 둔다.
- 관리자 콘솔 API
  설명: 관리자 기능은 일반 사용자 인증 API와 분리해 추후 설계한다.

## 3) 아키텍처 원칙

- 인증은 Stateless Access Token + Stateful Refresh Session 혼합 모델
  설명: 빠른 인증(Access)과 강제 종료 가능한 세션 관리(Refresh)를 동시에 가져간다.
- Access Token은 짧게(권장 15분), Refresh Token은 길게(권장 30일) + 회전(rotation)
  설명: 보안을 높이면서도 사용자 편의성을 유지하는 업계 표준 방식이다.
- 모든 인증 API는 공통 에러 스키마와 `request_id`를 반환
  설명: 어떤 실패든 같은 형태로 내려주면 앱/운영 대응이 쉬워진다.
- API/스키마 변경 시 Backward Compatibility 유지
  설명: 앱 업데이트가 늦은 사용자도 기존 기능이 깨지지 않게 한다.

## 4) 공통 규약

### Base URL

- `https://<api-host>/v1`
  설명: 모든 인증 API는 이 기본 주소 아래에 만든다.

### 공통 헤더

- 요청:
  설명: 앱이 서버에 요청할 때 같이 보내는 기본 메타 정보다.
  - `Content-Type: application/json`
    설명: 본문이 JSON 형식이라는 뜻이다.
  - `X-Request-Id: <optional-client-id>`
    설명: 장애 추적용 요청 식별자다(없으면 서버가 생성).
  - `X-App-Version: <semver>`
    설명: 어떤 앱 버전에서 오류가 나는지 빠르게 확인할 수 있다.
  - `X-Platform: ios|android|web`
    설명: 플랫폼별 이슈를 구분하기 위한 값이다.
- 응답:
  설명: 서버가 돌려주는 공통 메타다.
  - `X-Request-Id: <server-generated-or-echoed>`
    설명: 서버 로그와 1:1 매칭하기 위한 키다.

### 인증 헤더

- `Authorization: Bearer <access_token>`
  설명: 로그인된 사용자인지 서버가 확인하는 표준 방식이다.

### 시간/포맷

- 모든 시간은 ISO8601 UTC (`2026-02-14T17:45:12Z`)
  설명: 국가/기기 설정이 달라도 시간 해석이 동일해진다.
- 모든 ID는 문자열 UUID v4 권장
  설명: 충돌 위험이 낮고 시스템 간 교환이 쉽다.

## 5) 데이터 모델 (요약)

### User

- `id: string`
  설명: 사용자 고유 식별자다.
- `email: string`
  설명: 로그인 ID이자 알림/복구 연락 수단이다.
- `name: string | null`
  설명: 프로필 표시 이름이다(없을 수 있음).
- `locale: string` (예: `ko-KR`)
  설명: 앱 언어/표기 기준이다.
- `country: string | null` (ISO-3166-1 alpha-2)
  설명: 국가별 정책/법규 적용에 사용된다.
- `created_at: string`
  설명: 계정 생성 시각이다.
- `updated_at: string`
  설명: 최근 수정 시각이다.
- `email_verified_at: string | null`
  설명: 이메일 본인 인증 완료 시각이다.
- `status: "active" | "suspended" | "deleted"`
  설명: 계정 상태(정상/정지/삭제)를 나타낸다.

### Session (Refresh Token 단위)

- `session_id: string`
  설명: 로그인 세션 고유 ID다.
- `user_id: string`
  설명: 어떤 사용자 세션인지 연결한다.
- `refresh_token_hash: string` (원문 저장 금지)
  설명: 토큰 원문 유출 위험을 줄이기 위해 해시만 저장한다.
- `device_id: string | null`
  설명: 어느 기기에서 로그인했는지 식별한다.
- `platform: string | null`
  설명: iOS/Android 구분용이다.
- `ip: string | null`
  설명: 보안 감사 및 이상 행위 탐지에 사용한다.
- `user_agent: string | null`
  설명: 앱/디바이스 식별 보조 정보다.
- `created_at: string`
  설명: 세션 시작 시각이다.
- `expires_at: string`
  설명: 세션 만료 시각이다.
- `revoked_at: string | null`
  설명: 강제 로그아웃 등으로 무효화된 시각이다.

## 6) 에러 표준

```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Invalid email or password.",
    "details": null
  },
  "request_id": "a1b2c3d4"
}
```

### 표준 코드(예시)

- `AUTH_INVALID_CREDENTIALS`
  설명: 이메일 또는 비밀번호가 틀린 경우다.
- `AUTH_TOKEN_EXPIRED`
  설명: 토큰 유효기간이 지났다.
- `AUTH_TOKEN_INVALID`
  설명: 위조/손상 등으로 토큰 검증에 실패했다.
- `AUTH_REFRESH_REUSED`
  설명: 이미 사용된 refresh token이 재사용됐다(탈취 의심).
- `AUTH_EMAIL_NOT_VERIFIED`
  설명: 이메일 인증이 필요하다.
- `AUTH_RATE_LIMITED`
  설명: 짧은 시간에 너무 많은 요청을 보냈다.
- `AUTH_FORBIDDEN`
  설명: 권한이 없어 접근할 수 없다.
- `AUTH_INTERNAL_ERROR`
  설명: 서버 내부 오류다.

## 7) 엔드포인트 명세

## 7.1 회원가입

- `POST /v1/auth/signup`
  설명: 새 계정을 만들고 첫 세션을 발급한다.

요청:

```json
{
  "email": "user@example.com",
  "password": "Plain#Password123",
  "name": "홍길동",
  "locale": "ko-KR"
}
```

응답(201):

```json
{
  "user": {
    "id": "usr_123",
    "email": "user@example.com",
    "name": "홍길동",
    "locale": "ko-KR",
    "email_verified_at": null
  },
  "tokens": {
    "access_token": "jwt...",
    "expires_in": 900,
    "refresh_token": "rft..."
  },
  "request_id": "req_123"
}
```

정책:

- 이메일 중복 시 409
  설명: 이미 가입된 이메일이면 중복 생성하지 않는다.
- 비밀번호는 Argon2id/bcrypt로 해시 저장
  설명: 원문 비밀번호를 DB에 절대 저장하지 않는다.

## 7.2 로그인

- `POST /v1/auth/login`
  설명: 기존 계정으로 로그인하고 토큰을 발급한다.

요청:

```json
{
  "email": "user@example.com",
  "password": "Plain#Password123",
  "device_id": "ios-device-uuid",
  "platform": "ios"
}
```

응답(200): signup과 동일한 토큰 구조

## 7.3 토큰 재발급(회전)

- `POST /v1/auth/refresh`
  설명: access token 만료 시 refresh token으로 새 토큰을 발급한다.

요청:

```json
{
  "refresh_token": "rft..."
}
```

응답(200):

```json
{
  "tokens": {
    "access_token": "jwt...",
    "expires_in": 900,
    "refresh_token": "new_rft..."
  },
  "request_id": "req_124"
}
```

정책:

- Refresh Token Rotation 필수
  설명: 새 토큰을 줄 때 이전 refresh token은 즉시 폐기한다.
- 재사용 탐지 시 해당 사용자 세션 전체 revoke(권장)
  설명: 탈취 가능성이 있으므로 강제 로그아웃으로 피해를 최소화한다.

## 7.4 로그아웃(현재 세션)

- `POST /v1/auth/logout` (Bearer 필요)
  설명: 현재 로그인 세션만 종료한다.

요청:

```json
{
  "refresh_token": "rft..."
}
```

응답(200):

```json
{
  "ok": true,
  "request_id": "req_125"
}
```

## 7.5 전체 로그아웃(모든 디바이스)

- `POST /v1/auth/logout-all` (Bearer 필요)
  설명: 사용자의 모든 기기 세션을 한 번에 종료한다.

응답(200):

```json
{
  "revoked_sessions": 4,
  "request_id": "req_126"
}
```

## 7.6 내 프로필 조회

- `GET /v1/users/me` (Bearer 필요)
  설명: 현재 로그인 사용자의 계정 정보를 조회한다.

응답(200):

```json
{
  "user": {
    "id": "usr_123",
    "email": "user@example.com",
    "name": "홍길동",
    "locale": "ko-KR",
    "country": "KR",
    "email_verified_at": "2026-02-14T10:00:00Z"
  },
  "request_id": "req_127"
}
```

## 7.7 내 프로필 수정

- `PATCH /v1/users/me` (Bearer 필요)
  설명: 이름/언어/국가 등 프로필 일부를 변경한다.

요청(부분 수정):

```json
{
  "name": "길동",
  "locale": "en-US",
  "country": "US"
}
```

응답(200): `GET /users/me`와 동일 형태

## 7.8 비밀번호 변경

- `POST /v1/auth/password/change` (Bearer 필요)
  설명: 로그인 상태에서 현재 비밀번호를 새 비밀번호로 변경한다.

요청:

```json
{
  "current_password": "Old#Pass123",
  "new_password": "New#Pass456"
}
```

응답(200):

```json
{
  "ok": true,
  "request_id": "req_128"
}
```

## 7.9 비밀번호 재설정 요청

- `POST /v1/auth/password/reset/request`
  설명: 비밀번호를 잊은 사용자가 재설정 절차를 시작한다.

요청:

```json
{
  "email": "user@example.com"
}
```

응답(200): 계정 유무와 무관하게 동일 응답(계정 존재 노출 방지)

```json
{
  "ok": true,
  "request_id": "req_129"
}
```

## 7.10 비밀번호 재설정 확인

- `POST /v1/auth/password/reset/confirm`
  설명: 이메일로 받은 토큰으로 새 비밀번호를 확정한다.

요청:

```json
{
  "token": "reset-token",
  "new_password": "New#Pass456"
}
```

응답(200):

```json
{
  "ok": true,
  "request_id": "req_130"
}
```

## 8) 보안/운영 가드레일

- 비밀번호 정책: 최소 길이 + 복잡도 + 유출 비밀번호 차단(권장)
  설명: 쉬운 비밀번호를 막아 계정 탈취 위험을 낮춘다.
- 로그인/재설정 rate limit:
  설명: 무차별 대입 공격을 줄이기 위해 요청 횟수를 제한한다.
  - 로그인: IP+email 기준 분당 N회
    설명: 동일 사용자 대상으로 반복 시도를 제한한다.
  - reset request: email 기준 시간당 N회
    설명: 비밀번호 재설정 메일 남용을 방지한다.
- 토큰:
  설명: 토큰 자체의 안전한 발급/검증 기준이다.
  - Access JWT: `iss`, `sub`, `aud`, `exp`, `iat`, `jti`
    설명: 누가, 누구에게, 언제까지 유효한지 검증 가능한 표준 클레임이다.
  - Refresh는 DB 해시 저장, 원문 미저장
    설명: DB 유출 시에도 토큰 원문이 바로 악용되지 않게 한다.
- 감사 로그:
  설명: 보안 사고 시 원인 추적을 가능하게 한다.
  - 로그인 성공/실패, refresh, logout, password 변경
    설명: 주요 인증 이벤트를 빠짐없이 남긴다.
  - `request_id`, `user_id`, `ip`, `device_id` 포함
    설명: 고객 문의/이상 행위 분석에 필요한 최소 키다.
- 개인정보:
  설명: 개인정보 보호법/내부 정책 준수를 위한 최소 기준이다.
  - PII 최소 저장, 삭제 요청 시 세션/토큰 즉시 무효화
    설명: 필요 이상의 개인정보를 저장하지 않고, 삭제 요청에 즉시 대응한다.

## 9) 모바일 연동 계약

- 모바일 보관:
  설명: 토큰 저장 위치에 따라 보안 수준이 크게 달라진다.
  - `access_token`: 메모리 우선(필요시 secure storage)
    설명: 앱 종료 시 자동 소멸되게 하여 노출 위험을 줄인다.
  - `refresh_token`: SecureStore/Keychain
    설명: 장기 토큰은 OS 보안 저장소에 넣어야 안전하다.
- 401 처리:
  설명: 토큰 만료 시 사용자 경험을 부드럽게 만드는 규칙이다.
  - 1회 자동 refresh 시도 후 재요청
    설명: 대부분의 만료는 사용자 개입 없이 복구된다.
  - refresh 실패 시 로컬 세션 제거 + 로그인 화면 이동
    설명: 더 이상 유효하지 않으면 즉시 재인증으로 전환한다.
- Backward Compatibility:
  설명: 앱/서버 버전이 달라도 서비스가 깨지지 않도록 하는 약속이다.
  - 신규 필드 추가는 허용
    설명: 기존 앱은 모르는 필드를 무시하면 된다.
  - 기존 필드 rename/remove는 `/v2`에서만 수행
    설명: 파괴적 변경은 버전 분리로만 진행한다.

## 10) DB/인프라 권장안 (초기→확장)

- 초기(현재 Render):
  설명: 빠르게 운영 시작 가능한 최소 구성이다.
  - App: Render Web Service(FastAPI)
    설명: API 서버를 호스팅한다.
  - DB: Render PostgreSQL
    설명: 사용자/세션 데이터를 영구 저장한다.
  - Cache: 선택(초기 미사용 가능)
    설명: 초기 트래픽이 낮으면 캐시는 나중에 붙여도 된다.
- 확장:
  설명: 사용자 증가 시 성능/안정성을 높이는 구성이다.
  - Redis(세션/레이트리밋)
    설명: 빠른 조회와 요청 제한 처리에 유리하다.
  - Queue(이메일/감사 로그 비동기)
    설명: 느린 작업을 분리해 API 응답 지연을 줄인다.
  - Secret Manager + KMS
    설명: 민감 키를 코드 밖에서 안전하게 관리한다.

## 11) 단계별 구현 로드맵

- Phase 1 (필수):
  설명: 서비스 오픈에 꼭 필요한 최소 인증 기능이다.
  - signup/login/refresh/logout/me
    설명: 회원가입부터 로그인 유지까지 기본 흐름 완성.
  - 토큰 회전, 공통 에러 스키마, rate limit
    설명: 보안/운영 안정성의 핵심 기반.
- Phase 2:
  설명: 계정 복구와 신뢰도 강화를 위한 단계다.
  - password reset/change, logout-all
    설명: 계정 분실/탈취 대응력을 높인다.
  - 이메일 검증
    설명: 가짜 계정/오입력 이메일 문제를 줄인다.
- Phase 3:
  설명: 확장성과 편의성을 높이는 고도화 단계다.
  - 소셜 로그인, MFA, 디바이스 세션 관리 UI
    설명: 로그인 편의성과 보안 수준을 동시에 강화한다.

## 12) OpenAPI 체크리스트

- 모든 auth endpoint에 request/response schema 명시
  설명: 서버-앱 계약을 자동 검증 가능하게 한다.
- 200/201/400/401/403/409/429/500 응답 정의
  설명: 성공/실패 케이스를 사전에 모두 문서화한다.
- `request_id` 응답 필드/헤더 일관성 확인
  설명: 운영 추적 일관성을 보장한다.
- 계약 테스트(스냅샷)로 drift 방지
  설명: 코드 변경으로 계약이 깨지면 CI에서 즉시 감지한다.

## 13) 미결정 항목 (결정 필요)

- JWT 발급 주체(내부 서명 vs 외부 IdP)
  설명: 인증 책임을 자체 운영할지 외부 서비스에 맡길지 결정해야 한다.
- refresh token 유효기간(14/30/60일)
  설명: 보안성과 편의성의 균형 포인트를 정해야 한다.
- 이메일 검증 강제 시점(회원가입 직후 vs 특정 기능 진입 시)
  설명: 가입 전환율과 보안 수준 사이의 제품 정책 결정이다.
- 소셜 로그인 우선순위(Apple/Google)
  설명: 타깃 사용자와 플랫폼 정책에 맞춘 우선순위 선정이 필요하다.
