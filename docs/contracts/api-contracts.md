# FoodLens API 계약 기준서 (비개발자 이해형)

## 1) 이 문서는 왜 필요한가?
- 앱과 서버가 서로 다른 형식을 쓰면, 갑자기 화면이 깨지거나 저장이 실패합니다.
- 이 문서는 "서로 약속한 데이터 형식"을 고정하는 문서입니다.
- 한쪽에서 바꿀 때 반드시 이 문서를 같이 업데이트해야 합니다.

## 2) 공통 규칙
- 모든 응답은 가능하면 다음 메타를 포함합니다.
  - `request_id`: 요청 추적 번호 (문제 추적용)
  - `used_model`: 실제 사용한 AI 모델명 (분석 API)
  - `prompt_version`: 적용 프롬프트 버전 (분석 API)
- 실패 응답도 사람이 이해 가능한 메시지를 제공합니다.
- 하위 호환(Backward Compatibility) 원칙:
  - 기존 필드 삭제 금지
  - 필드 추가는 허용 (기존 앱이 무시 가능해야 함)

## 3) 현재 핵심 API 계약 (요약)

### A. 라벨 분석
- Endpoint: `POST /analyze/label`
- 입력:
  - `file` (이미지)
  - `allergy_info` (선택)
  - `locale` (예: ko-KR, en-US)
- 출력(핵심):
  - `foodName`, `foodName_en`, `foodName_ko`
  - `safetyStatus` (`SAFE|CAUTION|DANGER`)
  - `ingredients[]`
  - `nutrition`
  - `raw_result`, `raw_result_en`, `raw_result_ko`
  - `request_id`, `prompt_version`, `used_model`
- 비개발자 설명:
  - 이 API는 "제품 라벨 사진을 읽고", 성분/영양/알레르기 위험을 정리해 주는 기능입니다.

### B. 음식 사진 분석
- Endpoint: `POST /analyze`
- 입력:
  - 음식 이미지, 사용자 알레르기/로케일 컨텍스트
- 출력(핵심):
  - 음식명, 성분 추정, 안전도, 요약 문장
- 비개발자 설명:
  - 일반 음식 사진 기반으로 위험도를 알려주는 기능입니다.

### C. 바코드 조회
- Endpoint: `POST /lookup/barcode`
- 입력:
  - barcode 문자열
  - locale, allergy context
- 출력(핵심):
  - 상품명/성분/안전도/요약
- 비개발자 설명:
  - 바코드 번호로 공공/사내 데이터와 AI를 조합해 결과를 반환합니다.

## 4) Phase 1 인증/세션 API 계약 (활성화)

### A. 인증(Auth)
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
- `POST /auth/email/login`
- `POST /auth/email/signup`
- `POST /auth/refresh`
- `POST /auth/logout`

필수 출력(공통):
- `access_token`, `refresh_token`, `expires_in`, `user`
- `request_id`

요청 요약:
- `POST /auth/email/signup`: `email`, `password`, `display_name?`, `locale?`, `device_id?`
- `POST /auth/email/login`: `email`, `password`, `device_id?`
- `POST /auth/google|kakao`: `code`, `state`, `redirect_uri?`, `provider_user_id?`, `email?`, `device_id?`
- `GET /auth/google|kakao/start`: `redirect_uri?`(앱 콜백), `state?`(없으면 서버 생성)
- `GET /auth/google|kakao/callback`: provider redirect 수신 후 앱 콜백 URI로 `code/state/error` 전달
- `GET /auth/google|kakao/logout/start`: provider 계정 로그아웃 브라우저 리다이렉트 시작
- `GET /auth/google|kakao/logout/callback`: provider 로그아웃 후 앱 콜백 URI로 완료/에러 전달
- `POST /auth/refresh`: `refresh_token`
- `POST /auth/logout`: `refresh_token?` + `Authorization: Bearer <access_token>`

에러 코드(핵심):
- `AUTH_INVALID_CREDENTIALS`
- `AUTH_TOKEN_EXPIRED`
- `AUTH_REFRESH_EXPIRED`
- `AUTH_REFRESH_REUSED` (재사용 탐지 시 세션 패밀리 전체 무효화)
- `AUTH_PROVIDER_CANCELLED`
- `AUTH_PROVIDER_INVALID_CODE`
- `AUTH_REDIRECT_URI_MISMATCH`

비개발자 설명:
- 로그인 성공 시 앱은 "사용자 본인 식별값(user_id)"을 받습니다.
- 이후 모든 저장/조회는 이 user_id 소유 데이터로만 처리해야 합니다.
- refresh token은 단일 사용(one-time)이며 재사용되면 보안 이벤트로 처리됩니다.

### B. 사용자 데이터(Profile/Settings/History)
- `GET /me/profile`, `PUT /me/profile`
- `GET /me/allergies`, `PUT /me/allergies`
- `GET /me/history`, `POST /me/history`
- `GET /me/settings`, `PUT /me/settings`

비개발자 설명:
- `me`는 "지금 로그인한 사용자"를 뜻합니다.
- 타인의 데이터는 접근할 수 없어야 합니다.

## 5) 버전/변경 정책
- 계약 버전 표기:
  - major.minor (예: `v1.2`)
- 변경 규칙:
  - 필드 추가: minor 증가
  - 필드 제거/의미 변경: major 증가
- 배포 규칙:
  - 앱 릴리스 전후 1개 이전 minor까지 서버가 호환하도록 운영

## 6) 운영에서 꼭 보는 지표
- 성공률: endpoint별 2xx 비율
- 실패코드: 4xx/5xx 비율
- 지연시간: p50/p95/p99
- AI 비용: 일/월 누적 비용, 429 발생률

## 7) 장애 대응 기본 룰
- 429(리소스 초과): 재시도 + 백오프, 필요 시 graceful fallback
- timeout: 재시도 정책 제한, 사용자에게 재시도 안내
- 계약 불일치: 즉시 롤백 또는 server-side compatibility patch

## 8) QA 체크리스트 (릴리스 전)
- 라벨/음식/바코드 응답에 필수 필드 누락이 없는가?
- `request_id`로 로그 추적이 가능한가?
- 로그인/로그아웃/계정전환 후 데이터 주인이 정확한가?
- 구버전 앱에서도 치명적 에러 없이 동작하는가?

---

문서 버전: v1.1  
소유: Backend Lead + Mobile Lead  
최종 수정: 2026-02-19
