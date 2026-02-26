# FoodLens Architecture Overview

본 문서는 CI 문서 거버넌스(`architecture-overview-check`) 기준 문서입니다.

## 1. Architecture Summary

- Mobile: Expo/React Native (`/FoodLens`)
- Backend: FastAPI (`/backend`)
- Docs/Contracts: `/docs`, `/backend/contracts`

## 2. Directory Tree (Full System Map)

```tree
FoodLens-project/
├── FoodLens/
│   ├── app/
│   ├── features/
│   ├── services/
│   ├── scripts/
│   ├── android/
│   ├── ios/
│   └── package.json
├── backend/
│   ├── server.py
│   ├── modules/
│   ├── tests/
│   ├── scripts/
│   └── requirements.txt
├── docs/
│   ├── contracts/
│   ├── roadmap/
│   ├── scripts/
│   └── architecture/
└── render.yaml
```

## 3. Runtime Boundaries

- 인증/세션은 백엔드 `/auth/*` 및 모바일 secure storage 경로를 통해 관리합니다.
- 사용자 데이터 소유권은 `user_id` 기준으로 서버에 귀속됩니다.
- 모바일 로컬 저장소는 캐시/오프라인 보조 계층으로 동작합니다.

## 4. Verification Entry Points

- API 계약: `docs/contracts/api-contracts.md`
- OpenAPI 스냅샷: `backend/contracts/openapi.json`
- 컷오버 리허설: `backend/scripts/phase2_cutover_rehearsal.sh`

## 5. Installation/Run Path Standard

- Project root: `FoodLens-project/`
- Setup: `bash backend/setup.sh`
- Virtual env: `source .venv/bin/activate`
- Run backend: `python -m backend.server`

