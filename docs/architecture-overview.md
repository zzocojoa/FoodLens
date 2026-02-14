# FoodLens Project Architecture & Overview

본 문서는 FoodLens 프로젝트의 구조와 아키텍처 설계를 분석한 온보딩 가이드입니다.

## 1. 프로젝트 아키텍처 개요

본 프로젝트는 **Feature-Based (Vertical Slicing) 아키텍처**를 따르고 있습니다. 기능별로 폴더를 격리하여 유지보수성과 확장성을 높였으며, 공유 인프라(Services)는 중앙에서 관리하는 구조입니다.

## 2. Directory Tree (Full System Map)

```tree
FoodLens-project/
├── FoodLens/                         # Mobile Application (Expo/React Native)
│   ├── app/                          # Expo Router 파일 기반 라우팅
│   │   ├── (tabs)/                   # 홈/히스토리 등 탭 진입 라우트
│   │   ├── scan/                     # 스캔 카메라 흐름 라우트
│   │   ├── _layout.tsx               # 전역 Provider/네비게이션 레이아웃
│   │   └── result.tsx                # 분석 결과 화면 라우트
│   ├── features/                     # 도메인 기능 모듈
│   │   ├── allergies/                # 알러지 설정/조회 기능
│   │   ├── camera/                   # 촬영 후 분석 요청 흐름
│   │   ├── emojiPicker/              # 사용자 이모지 선택 기능
│   │   ├── history/                  # 분석 이력 조회/필터링
│   │   ├── home/                     # 대시보드/최근 스캔 요약
│   │   ├── i18n/                     # 다국어 리소스/번역 도메인
│   │   ├── profile/                  # 사용자 프로필/설정
│   │   ├── result/                   # 결과 화면 렌더링/상호작용
│   │   ├── scanCamera/               # 바코드 스캔 전용 흐름
│   │   └── tripStats/                # 여행 통계/집계 기능
│   ├── components/                   # 재사용 UI/섹션 컴포넌트
│   │   ├── historyList/              # 히스토리 리스트 UI 묶음
│   │   ├── historyMap/               # 지도 기반 히스토리 UI
│   │   ├── result/                   # 결과 페이지 공통 UI 블록
│   │   ├── travelerAllergyCard/      # 여행자 알러지 카드 컴포넌트
│   │   └── ui/                       # 버튼/텍스트 등 저수준 공통 UI
│   ├── services/                     # 공유 인프라/도메인 서비스
│   │   ├── ai/                       # AI 응답 타입/도메인 인터페이스
│   │   ├── aiCore/                   # API 호출/계약 검증/매핑
│   │   ├── analysis/                 # 분석 결과 저장/로드 유틸
│   │   ├── contracts/                # 공통 타입/라우트 계약(resultRoute, analysisStore)
│   │   ├── i18n/                     # 언어 해석/문구 변환 서비스
│   │   ├── navigation/               # 공통 화면 이동 계층(resultEntryNavigation)
│   │   ├── permissions/              # 권한 요청/상태 처리 로직
│   │   ├── user/                     # 사용자 데이터 접근 계층
│   │   └── utils/                    # 서비스 공통 유틸
│   ├── hooks/                        # 공통 훅 모음
│   │   └── result/                   # 결과 화면 전용 훅
│   ├── contexts/                     # 전역 컨텍스트(theme 등)
│   ├── assets/                       # 이미지/애니메이션 에셋
│   ├── constants/                    # 상수 정의
│   ├── data/                         # 정적 데이터셋
│   ├── models/                       # 앱 모델 정의
│   ├── types/                        # 공통 TS 타입
│   ├── utils/                        # 범용 유틸리티
│   ├── scripts/                      # 개발 보조 스크립트
│   ├── android/                      # Android 네이티브 프로젝트
│   └── ios/                          # iOS 네이티브 프로젝트
│
├── backend/                          # Python API Server (FastAPI)
│   ├── server.py                     # FastAPI 엔트리포인트/라우트
│   ├── requirements.txt              # 서버 의존성 목록
│   ├── contracts/
│   │   └── openapi.json              # API 계약 스냅샷
│   ├── modules/
│   │   ├── analyst_core/             # 프롬프트/파싱/응답 정규화
│   │   ├── analyst_runtime/          # Vertex 호출/재시도/라우팅
│   │   ├── barcode/                  # 바코드 조회 서비스
│   │   ├── contracts/                # Pydantic API contract 모델
│   │   ├── nutrition_core/           # 영양 데이터 정규화 로직
│   │   ├── nutrition.py              # 영양 도메인 진입 모듈
│   │   ├── runtime_guardrails.py     # P4 공통 에러코드/로깅/오프로드
│   │   └── server_bootstrap.py       # 서비스 초기화/환경 로더
│   ├── scripts/                      # OpenAPI export 등 운영 스크립트
│   └── tests/                        # 계약/회귀 테스트
│       ├── contracts/                # API contract 테스트
│       └── fixtures/                 # snapshot fixture
│
└── docs/                             # 프로젝트 기술 문서
    ├── plans/                        # 단계별 구현/운영 계획
    ├── refactoring/                  # 리팩토링 결과/가이드
    ├── architecture-improvement-phases.md # P1~P5 단계 문서
    └── architecture-overview.md      # [현재 문서]
```

## 3. 주요 패턴 및 핵심 구성 요소

### 아키텍처 패턴

- **Feature-based Clustering**: `features/` 폴더 내에 해당 도메인의 UI, Hooks, Services를 모아두어 코드 응집도를 높였습니다.
- **Service Layer Pattern**: 특정 기능에 종속되지 않는 공통 로직(파일 저장, 데이터베이스, AI 통신)은 중앙 `services/` 레이어에 위치합니다.

### 핵심 로직 위치

- **API 通信 및 데이터 모델**: `FoodLens/services/aiCore/endpoints.ts` (API 호출), `FoodLens/services/dataStore.ts` (분석 중 데이터 임시 보관).
- **이미지 처리 및 AI 분석**: `backend/modules/analyst_core/` (Gemini 프롬프트 및 처리), `FoodLens/services/imageStorage.ts` (클라이언트 이미지 영구 저장), `backend/modules/server_bootstrap.py` (업로드 이미지 EXIF orientation 정규화).
- **바코드 조회/캐시/추적**: `FoodLens/services/aiCore/internal/barcodeLookup.ts` (`X-Request-Id`/재시도/타임아웃 로깅), `FoodLens/services/aiCore/internal/barcodeCache.ts` (알러지 컨텍스트 기반 캐시 키), `backend/server.py` (`request_id` 단계별 elapsed 로깅).
- **UI 및 화면 흐름**: `FoodLens/app/` 하위의 파일들이 실제 화면 경로(Expo Router)를 결정합니다.
- **결과 주소 렌더링(i18n 순서 분기)**: `FoodLens/components/result/resultContent/utils/resultContentFormatters.ts` (KO/EN 주소 순서 및 구분자).

## 4. Data Flow (구조적 관점)

1. **Capture**: `features/scanCamera`에서 이미지를 캡처하고 `imageStorage`를 통해 임시 저장합니다.
2. **Request**: `services/aiCore`를 통해 이미지를 백엔드(`backend/server.py`)로 전달합니다.
3. **Process**: 백엔드의 `analyst_core`가 Google Cloud AI와 연동하여 분석 결과를 JSON으로 반환합니다.
4. **Persist**: 클라이언트는 결과를 받은 후 `analysisService`를 사용하여 영구적 이미지 저장 및 히스토리 데이터 기록(MMKV)을 완료합니다.
5. **Render**: `features/result` 가 `useAnalysisData` 훅을 통해 데이터를 구독하고 UI를 렌더링합니다.

추가 바코드 플로우:
1. **Lookup**: `scanCameraBarcodeService`가 캐시를 먼저 조회합니다.
2. **Cache Keying**: 캐시 키는 `barcode + allergy-context-hash`로 구성되어 사용자 알러지 변경 시 자동으로 캐시 분리됩니다.
3. **Server Trace**: 클라이언트 `X-Request-Id`가 서버 `request_id`와 연결되어 lookup source / allergen analysis 단계별 소요시간을 추적합니다.

## 5. Installation/Run Path Standard

- Project root: `FoodLens-project/`
- Setup: `bash backend/setup.sh`
- Virtual env: `source .venv/bin/activate`
- Run backend: `python -m backend.server`
- Docker build context/file: `docker build -f backend/Dockerfile .`

---

_Last Updated: 2026-02-14 (updated)_ 
