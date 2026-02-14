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

### 1. 백엔드 서버 실행

```bash
cd /Users/beatlefeed/Documents/FoodLens-project
bash backend/setup.sh
source .venv/bin/activate
python -m backend.server
```

### 2. 모바일 앱 실행

```bash
cd FoodLens
npm install
npm run ios:dev # iOS 시뮬레이터 실행
npx expo run:ios --device
npx expo run:ios --configuration Release --device # iOS 7일간 사용가능
# 또는
npx expo start # Expo Go 실행
npx expo start --tunnel
npx expo start --tunnel --go

npx expo prebuild --clean
```

---

## 🌍 외부 사용 (배포)

밖에서 혼자 사용하기 위한 상세 가이드는 아래 문서를 참고하세요:

- [배포 전략 가이드(Korean)](file:///Users/beatlefeed/.gemini/antigravity/brain/7965f449-8d91-4265-bf73-2410d3d65c4d/deployment_strategy.md)
- [로컬 서버 복구 가이드(Korean)](file:///Users/beatlefeed/.gemini/antigravity/brain/7965f449-8d91-4265-bf73-2410d3d65c4d/server_restoration_guide.md)
- [iOS 개인 기기 무료 설치 가이드(Korean)](file:///Users/beatlefeed/Documents/FoodLens-project/FoodLens/.agent/workflows/free-ios-deployment.md)

---

## 📜 라이선스

개인 학습 및 테스트 목적으로 제작된 프로젝트입니다.
