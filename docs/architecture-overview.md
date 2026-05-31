# FoodLens Architecture Overview

본 문서는 CI 문서 거버넌스(`architecture-overview-check`) 기준 문서입니다.

## 1. Architecture Summary

- Mobile App
  - Expo Router + React Native (`/FoodLens`)
  - Google / Kakao / Email auth UI, 분석 결과, 히스토리, 푸드 패스포트, Support & Policies
- Backend API
  - FastAPI (`/backend`)
  - 인증, 분석, 바코드 조회, 미디어 업로드/렌더, 삭제 요청 처리
- Runtime Stores
  - Postgres 기반 auth state, analysis jobs, nutrition cache, retention, deletion queue
- Media Path
  - 업로드: `POST /me/media/upload`
  - 표시: signed `GET /media/render/{asset_id}`
- Delivery / Release Gate
  - Render 배포
  - GitHub Actions release gate / store evidence / postdeploy smoke / rollback rehearsal

## 2. Directory Tree (Full System Map)

```tree
FoodLens-project/
├── FoodLens/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── services/
│   ├── scripts/
│   ├── assets/
│   └── package.json
├── backend/
│   ├── server.py
│   ├── modules/
│   ├── scripts/
│   ├── tests/
│   └── requirements.txt
├── docs/
│   ├── contracts/
│   ├── privacy-policy/
│   ├── roadmap/
│   ├── terms-of-service/
│   └── walkthroughs/
├── .github/workflows/
└── render.yaml
```

## 3. Runtime Boundaries

- 인증/세션
  - `/auth/*`는 백엔드가 소유하고, 모바일은 access/refresh token을 secure storage에 저장합니다.
  - 운영 OAuth app return은 verified Universal Links/App Links HTTPS callback을 사용하고, `foodlens://` custom scheme은 개발 build에서만 명시 allowlist로 허용합니다.
  - 계정 소유권은 항상 `user_id` 기준입니다.
- 개인화/동기화
  - `/me/profile`, `/me/allergies`, `/me/settings`, `/me/history`가 서버 source of truth입니다.
  - 모바일 로컬 저장소는 캐시/오프라인 보조 계층입니다.
- 분석
  - 동기 분석: `/analyze`, `/analyze/label`, `/analyze/smart`, `/lookup/barcode`
  - 비동기 분석: `/analyze/jobs`, `/analyze/jobs/{job_id}`
- 미디어
  - 업로드 자산은 storage backend에 저장되고, 앱은 signed render URL로만 서버 자산을 다시 읽습니다.
- 삭제/retention
  - Delete My Data / Delete Account 요청은 별도 queue/status store를 통해 처리됩니다.
  - 모바일은 삭제 완료 후 secure session, SafeStorage(MMKV/AsyncStorage), 분석 backup, pending analysis, AI/barcode cache, Phase2 sync queue, managed image directory를 로컬에서 함께 지웁니다.
  - 로그아웃은 먼저 백엔드 revoke를 성공시킨 뒤 동일한 강한 로컬 footprint wipe를 완료하고 로그인 화면으로 이동합니다. revoke 실패 시 로컬 세션을 보존해 재시도할 수 있어야 합니다.
  - 로컬 wipe 실패 시 삭제 완료 화면이 성공처럼 진행되지 않고, 사용자가 기기 정리 실패를 볼 수 있어야 합니다.
  - AI/barcode cache key와 cache-hit 로그에는 raw barcode 또는 allergy context를 남기지 않습니다.

## 4. Deployment Topology

- 백엔드는 Render web service(`foodlens-api`)에서 Docker 기반으로 동작합니다.
- 주요 운영 env는 `render.yaml`에 선언되어 있습니다.
- auth state, analysis jobs, retention, deletion은 Postgres backend를 사용합니다.
- 미디어는 GCS backend를 사용하며, public direct URL 대신 signed render endpoint를 거칩니다.

## 5. Installation/Run Path Standard

- Setup: `bash backend/setup.sh`
- Virtual env: `source .venv/bin/activate`
- Run backend: `python -m backend.server`
- Mobile app run:
  - `cd FoodLens && npm install`
  - `npm run ios:release:device:logs`
  - `npm run android:release:device:logs`

## 6. Verification Entry Points

- 제품/문서 인덱스: `docs/README.md`
- API 계약: `docs/contracts/api-contracts.md`
- OpenAPI 스냅샷: `backend/contracts/openapi.json`
- Android/iOS 실기기 빌드:
  - `FoodLens/scripts/run-android-device-release-with-logs.sh`
  - `FoodLens/scripts/run-ios-device-release-with-logs.sh`
- Release Gate workflow:
  - `.github/workflows/phase6-mobile-store-evidence.yml`
  - `.github/workflows/phase6-postdeploy-smoke.yml`
