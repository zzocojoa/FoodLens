# Phase 5 최소수집 및 제3자 연동 인벤토리

이 문서는 현재 저장소 기준으로 FoodLens가 실제로 수집·저장·전송하는 개인정보 범위를 확인하기 위한 증적이다.

## 1. 최소수집 원칙 기준

- 서비스 제공에 직접 필요한 계정 정보만 저장한다.
  - 이메일 로그인: `email`, `password_hash`, `display_name`, `locale`, `device_id`
  - 소셜 로그인: 공급자 식별자(`google`, `kakao`)와 공급자 사용자 식별자
  - 근거: [backend/modules/auth/service.py](../../backend/modules/auth/service.py), [FoodLens/services/auth/authApi.ts](../../FoodLens/services/auth/authApi.ts)
- 개인화 데이터는 서비스 기능 범위로 제한한다.
  - 프로필, 알러지, 설정, 히스토리, 미디어 자산 메타데이터
  - 근거: [backend/modules/auth/state_store.py](../../backend/modules/auth/state_store.py), [backend/modules/auth/service.py](../../backend/modules/auth/service.py), [backend/modules/media/service.py](../../backend/modules/media/service.py)
- 보존기간이 지난 데이터는 TTL로 자동 정리한다.
  - original `30일`, derived `90일`, log `14일`
  - 근거: [backend/modules/ops/data_retention.py](../../backend/modules/ops/data_retention.py), [render.yaml](../../render.yaml)
- 삭제 요청이 완료되면 계정 또는 사용자 데이터가 즉시 조회 불가 상태가 된다.
  - 근거: [backend/modules/ops/privacy_deletion.py](../../backend/modules/ops/privacy_deletion.py), [backend/server.py](../../backend/server.py)

## 2. 현재 저장소 기준 비수집 항목

- 광고 SDK 수집 데이터 및 광고 ID(IDFA/AAID 포함)
- 모바일 마케팅 attribution SDK 데이터
- 연락처, 주소록, 통화기록
- 백그라운드 위치 추적 데이터
- 결제 정보

현재 저장소 의존성과 코드 경로 기준으로 아래 SDK/도구는 탐지되지 않았다.

- Amplitude
- Mixpanel
- Segment
- AppsFlyer
- Firebase Analytics

근거: [FoodLens/package.json](../../FoodLens/package.json)

## 3. 제3자 연동 및 전송 범위

### 3-1. 인증 공급자

- Google OAuth
- Kakao OAuth

전송 목적:
- 로그인과 계정 식별

근거:
- [backend/modules/auth/service.py](../../backend/modules/auth/service.py)
- [FoodLens/services/auth/oauthProvider.ts](../../FoodLens/services/auth/oauthProvider.ts)

### 3-2. AI 분석 공급자

- Google Gemini / Vertex AI

전송 목적:
- 음식 이미지 분석
- 라벨/성분 기반 알러지 분석

전송 데이터:
- 업로드 이미지 또는 분석용 텍스트 프롬프트
- 사용자 알러지 정보
- locale

근거:
- [backend/modules/analyst_runtime/food_analyst.py](../../backend/modules/analyst_runtime/food_analyst.py)
- [backend/modules/analyst_runtime/generation.py](../../backend/modules/analyst_runtime/generation.py)

### 3-3. 오류 추적

- Sentry

전송 목적:
- 모바일/백엔드 오류 추적

전송 데이터:
- 오류 이벤트
- 디바이스 또는 사용자 식별자

근거:
- [FoodLens/services/sentry.ts](../../FoodLens/services/sentry.ts)
- [backend/modules/server_bootstrap.py](../../backend/modules/server_bootstrap.py)

### 3-4. 바코드 및 공개 식품 데이터

- Data.go.kr 식품안전나라 API
- OpenFoodFacts

전송 목적:
- 바코드 상품 조회
- 원재료/영양 정보 조회

전송 데이터:
- 바코드
- locale
- 사용자 알러지 정보가 후속 분석에 사용될 수 있음

근거:
- [backend/modules/barcode/service.py](../../backend/modules/barcode/service.py)
- [backend/modules/barcode/clients/datago_client.py](../../backend/modules/barcode/clients/datago_client.py)
- [backend/modules/barcode/clients/openfoodfacts_client.py](../../backend/modules/barcode/clients/openfoodfacts_client.py)

### 3-5. 미디어 저장소

- Google Cloud Storage

전송 목적:
- 원본 이미지 저장 및 삭제

전송 데이터:
- 업로드 이미지 파일
- 자산 메타데이터

근거:
- [backend/modules/media/service.py](../../backend/modules/media/service.py)

## 4. 운영 통제 기준

- 계정/데이터 삭제 API
  - `POST /me/deletion-requests`
  - `GET /me/deletion-requests/latest`
- 감사 로그는 `request_id`, `queue_id`, `user_id`, `target` 기준으로 추적한다.
- 민감정보 로그에는 raw email, 인증 코드, 비밀번호 재설정 코드가 남지 않아야 한다.

근거:
- [docs/contracts/api-contracts.md](../contracts/api-contracts.md)
- [backend/modules/ops/deletion_queue.py](../../backend/modules/ops/deletion_queue.py)
- [backend/modules/ops/privacy_deletion.py](../../backend/modules/ops/privacy_deletion.py)

## 5. 현재 상태 결론

- 현재 저장소 기준으로 FoodLens는 서비스 제공에 필요한 계정·개인화·분석 데이터만 유지하도록 설계되어 있다.
- 광고 SDK, 광고 ID, 마케팅 분석 SDK 기반의 추가 추적은 현재 저장소 의존성과 코드 경로에서 확인되지 않았다.
- 제3자 전송은 인증, AI 분석, 오류 추적, 바코드 조회, 미디어 저장 목적 범위로 제한된다.
