# 🍛 FoodLens-project (푸드렌즈 프로젝트)

**AI 기반 실시간 음식 성분 분석 및 여행자 알러지 케어 솔루션**

Food Lens는 해외 여행 중 낯선 음식을 만났을 때, 카메라 촬영 한 번으로 정확한 성분 분석과 알러지 위험도를 알려주는 스마트 가이드입니다.

---

## ✨ 주요 기능

- **실시간 AI 음식 분석**: Gemini AI를 활용해 이미지 속 음식의 이름, 주재료, 예상 칼로리를 즉시 분석합니다.
- **여행자 맞춤형 알러지 카드**: 현재 위치한 국가의 언어로 번역된 알러지 주의 카드를 생성하여 현지 식당에서 안전하게 소통할 수 있도록 돕습니다.
- **푸드 패스포트 (Food Passport)**: 내가 먹은 음식을 세계 지도 위에 기록하고, 국가별 식습관 통계를 시각적으로 확인합니다.
- **제로 플리커(Zero-Flicker) 경험**: 최적화된 카메라 로직으로 깜빡임 없는 빠른 분석 시작 속도를 제공합니다.
- **스마트 히스토리 관리**: 스와이프 삭제, 일괄 삭제 등 직관적인 사용자 경험을 제공합니다.

---

## 🛠️ 기술 스택

- **Frontend**: React Native (Expo)
- **Backend**: Python (FastAPI / Gemini API)
- **Database**: Firebase Firestore
- **Maps**: Mapbox GL
- **Design**: Modern Glassmorphism & High-End UX

---

## 🚀 시작하기

> **📢 개발 환경 접속 안내 (Render 연동)**
> 현재 프론트엔드 앱은 라이브 프로덕션(Render) 서버와 자동 통신하도록 구성되어 있습니다.
> 클라이언트(앱) 개발이나 UI/UX 테스트를 진행할 때는 **Docker 컨테이너나 로컬 Python 백엔드를 구동할 필요가 전혀 없습니다.**
> 과거 로컬 환경 구동 시 쓰였던 백엔드 구동 방법은 이 문서 최하단의 "[선택] 로컬 전용 백엔드 디버깅" 섹션으로 이동되었습니다.

### 2. 모바일 앱 실행

```bash
cd FoodLens
npm install
npm run ios:dev # iOS 시뮬레이터 실행
npx expo run:ios --device
npx expo run:android --device
npx expo run:ios --configuration Release --device
npm run android:release:device:logs
# 또는
npx expo start # Expo Go 실행
npx expo start --tunnel
npx expo start --tunnel --go

npx expo prebuild --clean

npx expo start --dev-client --clear

# 로그 기록용
npm run ios:device:logs
npm run ios:release:device:logs
npx expo run:ios --configuration Release --no-bundler -d 00008140-000E5DAE1ABB001C


npm run android:device:logs
npm run android:release:device:logs
```

- 로컬 release 설치는 canonical worktree인 `/Users/beatlefeed/Documents/FoodLens-project/FoodLens` 기준으로만 허용됩니다.
- 다른 worktree는 자동으로 별도 package id를 쓰며, 예외적으로 non-canonical release를 강행할 때만 `FOODLENS_ALLOW_NONCANONICAL_RELEASE=1`을 명시합니다.

```
cd /Users/beatlefeed/Documents/FoodLens-project/FoodLens
EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE=0 IOS_DEVICE_UDID=00008140-000E5DAE1ABB001C npm run ios:release:device:logs
EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE=0 npm run android:release:device:logs
```

### 1. Expo EAS Build를 이용한 방식 (추천)

Expo 서버에서 빌드하여 AAB 파일을 생성합니다. 환경 설정이 가장 깔끔하며, 결과물 링크를 제공해 줍니다.

```bash
# production 프로필로 안드로이드 빌드 시작
eas build --platform android --profile production
```

- **특징**: 서버에서 빌드되므로 내 컴퓨터의 리소스를 쓰지 않으며, 빌드가 완료되면 `.aab` 파일을 다운로드할 수 있는 URL을 줍니다.

---
