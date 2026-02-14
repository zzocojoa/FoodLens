# FoodLens Project Architecture & Overview

본 문서는 FoodLens 프로젝트의 구조와 아키텍처 설계를 분석한 온보딩 가이드입니다.

## 1. 프로젝트 아키텍처 개요

본 프로젝트는 **Feature-Based (Vertical Slicing) 아키텍처**를 따르고 있습니다. 기능별로 폴더를 격리하여 유지보수성과 확장성을 높였으며, 공유 인프라(Services)는 중앙에서 관리하는 구조입니다.

## 2. Directory Tree (Full System Map)

```tree
FoodLens-project/
├── FoodLens/                   # Mobile Application (Expo/React Native)
│   ├── app/                    # Expo Router 파이 기반 라우팅 레이어
│   │   ├── (tabs)/             # 메인 탭 네비게이션 (홈, 검색, 프로필 등)
│   │   ├── scan/               # 카메라 및 스캔 기능 진입점
│   │   ├── _layout.tsx         # 전역 레이아웃 및 Provider 설정
│   │   └── result.tsx          # 분석 결과 화면 라우팅
│   ├── features/               # 도메인 주도 기능 모듈 (핵심 비즈니스 로직)
│   │   ├── scanCamera/         # 카메라 제어, 바코드 스캔, 갤러리 연동 엔진
│   │   ├── result/             # 분석 데이터 렌더링 및 편집 로직
│   │   ├── home/               # 대시보드 및 최근 스캔 내역 요약
│   │   ├── history/            # 전체 스캔 기록 관리 및 필터링
│   │   ├── profile/            # 사용자 정보 및 알러지 정보 설정
│   │   ├── allergies/          # 알러지 성분 데이터 및 매칭 로직
│   │   ├── i18n/               # 다국어 리소스 및 번역 서비스
│   │   ├── emojiPicker/        # 음식 아이콘 선택기
│   │   └── tripStats/          # 여행지별 식사 통계 및 분석
│   ├── services/               # 공공 인프라 및 공유 서비스 레이어
│   │   ├── aiCore/             # 백엔드 API 통신 및 데이터 매핑 (endpoints, mappers)
│   │   ├── analysis/           # 분석 데이터 영구 저장 처리 (hooks, storage)
│   │   ├── imageStorage.ts     # 로컬 파일 시스템 이미지 관리 (Atomic Save 기반)
│   │   ├── storage.ts          # MMKV 기반 고성능 로컬 데이터베이스
│   │   ├── dataStore.ts        # 분석 프로세스 중 인메모리 데이터 전송 관리
│   │   ├── userService.ts      # 사용자 프로필 및 상태 관리
│   │   └── haptics.ts          # 햅틱 피드백 유틸리티
│   ├── components/             # 재사용 가능한 UI 컴포넌트 (# 디자인 시스템 공통)
│   │   ├── result/             # 결과 화면 전용 컴포넌트군
│   │   ├── historyList/        # 히스토리 목록 UI 컴포넌트군
│   │   └── ui/                 # Button, Card 등 저수준 공통 UI
│   ├── assets/                 # 이미지, 아이콘, Lottie 애니메이션 리소스
│   ├── hooks/                  # 전역 공통 훅 (Navigation, NetworkStatus 등)
│   ├── utils/                  # 범용 데이터 처리 유틸리티 (Date, Location 등)
│   ├── android/ & ios/         # 플랫폼별 네이티브 프로젝트 설정 및 설정 파일
│   └── scripts/                # 번역 체크 및 프로젝트 환경 설정용 스크립트
│
├── backend/                    # Python API Server (FastAPI)
│   ├── modules/                # 비즈니스 로직 모듈
│   │   ├── analyst_core/       # Gemini AI 프롬프트 설계 및 분석 수행부
│   │   ├── nutrition_core/     # 영양 성분 데이터 가공 및 표준화
│   │   ├── barcode/            # 바코드를 통한 전세계 상품 DB 연동 서비스
│   │   ├── smart_router.py     # 이미지 분류에 따른 최적 분석 경로 결정
│   │   └── server_bootstrap.py # 서비스 초기화 및 서버 런타임 설정
│   ├── scripts/                # 서버용 보조 스크립트 (이미지 처리 등)
│   ├── server.py               # API 서버 엔트리 포인트
│   └── requirements.txt        # 서버 의존성 라이브러리 목록
│
└── docs/                       # 프로젝트 기술 문서 및 레퍼런스
    ├── plans/                  # 기능 구현 및 배포 계획서
    ├── refactoring/            # 코드 품질 개선 및 리팩토링 목표 문서
    └── architecture-overview.md# [현재 문서] 시스템 구조 및 아키텍처 지도
```

## 3. 주요 패턴 및 핵심 구성 요소

### 아키텍처 패턴

- **Feature-based Clustering**: `features/` 폴더 내에 해당 도메인의 UI, Hooks, Services를 모아두어 코드 응집도를 높였습니다.
- **Service Layer Pattern**: 특정 기능에 종속되지 않는 공통 로직(파일 저장, 데이터베이스, AI 통신)은 중앙 `services/` 레이어에 위치합니다.

### 핵심 로직 위치

- **API 通信 및 데이터 모델**: `FoodLens/services/aiCore/endpoints.ts` (API 호출), `FoodLens/services/dataStore.ts` (분석 중 데이터 임시 보관).
- **이미지 처리 및 AI 분석**: `backend/modules/analyst_core/` (Gemini 프롬프트 및 처리), `FoodLens/services/imageStorage.ts` (클라이언트 이미지 영구 저장).
- **UI 및 화면 흐름**: `FoodLens/app/` 하위의 파일들이 실제 화면 경로(Expo Router)를 결정합니다.

## 4. Data Flow (구조적 관점)

1. **Capture**: `features/scanCamera`에서 이미지를 캡처하고 `imageStorage`를 통해 임시 저장합니다.
2. **Request**: `services/aiCore`를 통해 이미지를 백엔드(`backend/server.py`)로 전달합니다.
3. **Process**: 백엔드의 `analyst_core`가 Google Cloud AI와 연동하여 분석 결과를 JSON으로 반환합니다.
4. **Persist**: 클라이언트는 결과를 받은 후 `analysisService`를 사용하여 영구적 이미지 저장 및 히스토리 데이터 기록(MMKV)을 완료합니다.
5. **Render**: `features/result` 가 `useAnalysisData` 훅을 통해 데이터를 구독하고 UI를 렌더링합니다.

## 5. Installation/Run Path Standard

- Project root: `FoodLens-project/`
- Setup: `bash backend/setup.sh`
- Virtual env: `source .venv/bin/activate`
- Run backend: `python -m backend.server`
- Docker build context/file: `docker build -f backend/Dockerfile .`

---

_Last Updated: 2026-02-14_
