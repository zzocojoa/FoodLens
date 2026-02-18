# FoodLens User Authentication REST API Specification (CTO-Spec)

본 문서는 FoodLens 서비스의 보안, 확장성 및 운영 안정성을 담보하기 위한 **기술 총괄(CTO) 실무 관점**의 유저 인증 API 명세서입니다. 단순한 기능 정의를 넘어 실제 운영 환경에서의 보안 가드레일과 모바일 연동 최적화를 목표로 합니다.

---

## 1. 아키텍처 설계 원칙 (Engineering Principles)

- **Stateless Authentication (JWT)**: 모든 인증 상태는 클라이언트가 보유하며, 서버는 수평적 확장이 용이하도록 상태를 저장하지 않는 JWT(JSON Web Token) 방식을 채택합니다.
- **Stateful Session Management (Refresh Token)**: 보안 제어권을 위해 Refresh Token은 Redis 또는 DB에 세션 정보를 기록하여 강제 로그아웃 및 계정 일시 정지 기능을 보장합니다.
- **Security Hardening**:
  - **Token Rotation**: Refresh Token 사용 시마다 새로운 토큰을 발급하여 토큰 탈취에 의한 부당 사용을 방지합니다.
  - **Argon2id Hash**: 비밀번호는 업계 최고 수준의 Argon2id 알고리즘을 사용하여 해싱 저장합니다.
- **Traceability**: 모든 응답에 `X-Request-Id`를 포함하여 앱과 서버 간의 투명한 디버깅 환경을 제공합니다.

---

## 2. 공통 시스템 규약 (System Protocol)

### 2.1 Base URL

`https://api.foodlens.app/v1`

### 2.2 표준 에러 응답 (Error Standard)

모든 에러는 일정한 스키마를 따르며, 모바일 앱에서 자동화된 처리가 가능하도록 에러 코드를 제공합니다.

```json
{
  "error": {
    "code": "AUTH_TOKEN_EXPIRED",
    "message": "인증 토큰이 만료되었습니다.",
    "trace_id": "req-9a2b..."
  }
}
```

---

## 3. 인증 가드레일 (Security Guardrails)

| 항목               | 정책                            | 설명                                            |
| :----------------- | :------------------------------ | :---------------------------------------------- |
| **Header**         | `Authorization: Bearer <token>` | 모든 인증 필요 API의 기본 헤더                  |
| **Rate Limit**     | 5 attempts / min per IP         | 무차별 대입 공격(Brute-force) 방지              |
| **Token Validity** | Access: 15m / Refresh: 30d      | 보안성과 사용자 편의성(자동 로그인)의 균형      |
| **Compliance**     | PII Masking                     | 로그/응답 상의 민감 정보(이메일 등) 노출 최소화 |

---

## 4. API 엔드포인트 세부 명세 (Endpoints)

### 4.1 회원가입 (Sign-up)

신규 유저를 생성하고 보안 프로필(알레르기 등) 초기화를 위한 세션을 발급합니다.

- **POST** `/auth/register`
- **Payload**:
  ```json
  {
    "email": "user@example.com",
    "password": "StrongPassword123!",
    "display_name": "홍길동",
    "meta": { "locale": "ko-KR", "timezone": "Asia/Seoul" }
  }
  ```

### 4.2 로그인 (Sign-in)

인증 후 Access/Refresh 토큰 듀얼 세트를 발급합니다.

- **POST** `/auth/login`
- **Payload**:
  ```json
  {
    "email": "user@example.com",
    "password": "StrongPassword123!",
    "device_info": {
      "id": "ios-uuid...",
      "platform": "ios",
      "version": "1.0.0"
    }
  }
  ```

### 4.3 토큰 갱신 (Token Rotation)

Access Token 만료 시 Refresh Token을 사용하여 재발급합니다. 이때 기존 Refresh Token은 폐기(Revoke)됩니다.

- **POST** `/auth/refresh`
- **Payload**: `{ "refresh_token": "rt-..." }`
- **Response**: 새로운 Access/Refresh 토큰 세트 반환.

### 4.4 로그아웃 및 세션 취소 (Revocation)

현재 기기 또는 모든 기기에서의 강제 로그아웃을 지원합니다.

- **POST** `/auth/logout` (Current Session)
- **POST** `/auth/logout-all` (Security Breach Recovery)

---

## 5. 모바일 연동 최적화 가이드 (Implementation Note)

1.  **토큰 보관**: `Access Token`은 메모리 또는 세션 스토리지에, `Refresh Token`은 반드시 OS의 보안 저장소(Keychain / SecureStore)에 보관하십시오.
2.  **401 인터셉터**: 모바일 네트워크 라이브러리(Axios 등)에서 401 에러 발생 시 최우선적으로 `/auth/refresh`를 호출하여 재요청하는 인터셉터 패턴을 구현하십시오.
3.  **Haptic Feedback**: 로그인 실패 시 즉각적이고 부드러운 햅틱 피드백을 주어 UX 완성도를 높이십시오.

---

**Last Updated**: 2026-02-15
**Drafted by**: CTO (Technical Strategy Team)
