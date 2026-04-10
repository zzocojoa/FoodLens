# FoodLens

**해외 여행 중 낯선 음식 사진이나 식품 라벨을 바탕으로, 내 알레르기 기준으로 먹어도 되는지 빠르게 판단하도록 돕는 모바일 앱**

FoodLens는 음식 사진, 라벨, 바코드 입력을 바탕으로 음식 성분과 잠재적 알레르기 위험을 정리하고, 사용자 프로필에 저장된 알레르기/식이 제한 정보와 함께 보여줍니다. 핵심 목표는 "검색"이 아니라 **현장에서 30초 안에 보수적으로 안전한 의사결정을 돕는 것**입니다.

## 핵심 기능

- 음식 사진 분석: 일반 음식 사진을 바탕으로 재료와 주의 포인트를 추정합니다.
- 라벨 분석: 포장식품 라벨 이미지를 읽어 성분, 영양, 위험도를 정리합니다.
- 바코드 조회: 바코드가 지원되면 빠르게 상품 정보를 확인하고, 미지원 시 라벨 사진 분석으로 이어집니다.
- 개인화 안전 신호: 알레르기, 식이 제한, 여행자 카드 언어 설정을 반영해 `OK / AVOID / ASK` 중심 결과를 보여줍니다.
- 히스토리 및 푸드 패스포트: 저장한 결과를 다시 열어보고 삭제하거나 여행 기록으로 확인할 수 있습니다.
- Support & Policies: FAQ, 문의 메일, 개인정보처리방침, 이용약관, 계정/데이터 삭제 진입점을 제공합니다.

## 현재 기술 스택

- Mobile: Expo Router + React Native + TypeScript
- Mobile local state/cache: React Query, MMKV, Expo Secure Store
- Backend: FastAPI + Gemini 기반 분석 + 바코드 조회 연동
- Runtime stores: Postgres 기반 인증/세션, 분석 작업 큐, retention, deletion 상태 저장
- Media: Google Cloud Storage 업로드 + signed `/media/render/{asset_id}` URL
- Infra: Render, GitHub Actions release gate, Expo EAS Build/Submit, Sentry, AdMob
- Maps/UI: react-native-maps, FlashList, Skia, Lottie

## 문서 시작점

- 현재 문서 인덱스: [`/docs/README.md`](../docs/README.md)
- 제품 정의: [`/docs/product/project.md`](../docs/product/project.md)
- 사업 방향: [`/docs/product/business_plan.md`](../docs/product/business_plan.md)
- API 계약: [`/docs/contracts/api-contracts.md`](../docs/contracts/api-contracts.md)
- 아키텍처 요약: [`/docs/architecture-overview.md`](../docs/architecture-overview.md)
- 출시 게이트: [`/docs/roadmap/phase-6-release-gate-execution.md`](../docs/roadmap/phase-6-release-gate-execution.md)
- 법률 문서: [`/docs/privacy-policy/index.md`](../docs/privacy-policy/index.md), [`/docs/terms-of-service/index.md`](../docs/terms-of-service/index.md)

## 시작하기

### 1. 모바일 앱 실행

```bash
cd /Users/beatlefeed/Documents/FoodLens-project/FoodLens
npm install

# 디바이스/릴리스 확인
EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE=0 IOS_DEVICE_UDID=<YOUR_DEVICE_UDID> npm run ios:release:device:logs
EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE=0 npm run android:release:device:logs

# 일반 실행
npm run ios:dev
npx expo run:ios --device
npx expo run:android --device
npx expo start --dev-client --clear
```

### 2. Android AAB 빌드

```bash
cd /Users/beatlefeed/Documents/FoodLens-project/FoodLens
npx eas build --platform android --profile production
```

- 첫 Android 출시는 Play Console 내부 테스트에 수동 업로드하는 운영 원칙을 사용합니다.
- 최신 아이콘/스플래시 자산은 `app.config.js`와 `assets/images/*`를 기준으로 AAB에 반영됩니다.

### 3. 백엔드 로컬 디버깅

모바일 UI 검증이나 실기기 확인은 라이브 Render 백엔드를 기준으로 진행할 수 있습니다. 다만 **백엔드 개발, 계약 검증, 로컬 API 디버깅**은 여전히 로컬 실행 경로를 사용합니다.

```bash
cd /Users/beatlefeed/Documents/FoodLens-project
bash backend/setup.sh
source .venv/bin/activate
python -m backend.server
```

## 운영 메모

- Android release gate는 통과한 상태이며, 실제 Play Console 내부 테스트 업로드만 남아 있습니다.
- iOS는 앱 자산과 스플래시 수정은 반영됐지만, 스토어 배포는 Apple 배포 등록 이후 진행합니다.
- `docs/plans`, `docs/audit`, `docs/legacy` 아래 문서는 특정 시점의 계획/감사 기록일 수 있으므로 현재 구현 판단은 문서 인덱스에 있는 기준 문서와 코드 기준으로 확인합니다.
