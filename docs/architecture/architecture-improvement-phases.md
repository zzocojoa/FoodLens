# Architecture Improvement Phases

## File Name
- `docs/architecture-improvement-phases.md`

## Scope
- 대상: `Critical Issues & Risks`, `Specific Recommendations`
- 목표: 구조 리스크를 단계적으로 제거하고, 확장 시 회귀 비용을 줄이는 것

## Progress Update
- Date: 2026-02-14
- Status:
  - `P1`: 완료
  - `P2`: 완료
  - `P3`: 완료
  - `P4`: 완료
  - `P5`: 미진행

## Phase 1: Contract Stabilization (P1)
### Goals
- 프론트(`services/aiCore`)와 백엔드(`backend/modules/analyst_core`) 사이 응답 계약 고정
- 필드 변경 시 런타임 회귀를 컴파일/테스트 단계에서 조기 탐지

### Actions
- `backend/schemas/` 또는 `backend/modules/contracts/` 신설
- 프론트에 `FoodLens/services/aiCore/contracts.ts` 추가
- 핵심 응답 스키마 정의:
  - `foodName(_ko/_en)`
  - `ingredients[].name(_ko/_en)`
  - `raw_result(_ko/_en)`
  - `translationCard`
- JSON schema snapshot 테스트 추가

### Deliverables
- 공통 응답 타입/스키마 파일
- 파서/매퍼 단위 테스트
- 스키마 변경 체크리스트 문서

### Exit Criteria
- 스키마 변경 시 테스트 실패로 즉시 감지
- 프론트-백엔드 필드 불일치 케이스 0건

### P1 Implementation Result (Completed)
- Backend:
  - `backend/modules/contracts/analysis_response.py` 추가
  - `backend/modules/contracts/__init__.py` 추가
  - `backend/server.py`의 `/analyze`, `/analyze/label`, `/analyze/smart`에 `response_model=AnalysisResponseContract` 적용
- Frontend:
  - `FoodLens/services/aiCore/contracts.ts` 추가
  - `FoodLens/services/aiCore/internal/analyzeUpload.ts`에 분석 응답 계약 검증 추가
  - `FoodLens/services/aiCore/internal/barcodeLookup.ts`에 바코드 응답 계약 검증 추가
- Contract Snapshot Tests:
  - `backend/tests/contracts/test_analysis_contract_snapshot.py`
  - `backend/tests/contracts/test_barcode_contract_snapshot.py`
  - `backend/tests/fixtures/*.snapshot.json` 추가
  - `FoodLens/services/aiCore/__tests__/contracts.test.ts` 추가
- CI:
  - `.github/workflows/contracts.yml` 추가 (backend contracts + frontend contracts)
- Validation:
  - `FoodLens`: `npx tsc --noEmit --pretty false` 통과
  - `backend`: `python3 -m py_compile ...` 통과
  - 로컬 환경에서 `pydantic` 미설치/네트워크 제한으로 backend contract test 실행은 CI 기준으로 검증

### P1 Not Implemented Yet
- 없음 (완료)

---

## Phase 2: Backend Boundary Clarification (P2)
### Goals
- `analyst.py`, `analyst_core`, `analyst_runtime` 책임 경계 명확화
- 실행 컨텍스트(import path) 리스크 제거

### Actions
- `backend/modules/analyst.py`를 thin facade로 축소
- 역할 고정:
  - `analyst_core`: 프롬프트/규칙/파싱/도메인 순수 로직
  - `analyst_runtime`: 오케스트레이션/호출 흐름
- `smart_router.py` 재배치:
  - 후보: `backend/modules/analyst_runtime/router.py`
- 엔트리포인트 실행 규약 정리(`python -m backend.server` 등)

### Deliverables
- 모듈 책임 매트릭스
- 리팩토링된 import graph
- 배포/실행 가이드 업데이트

### Exit Criteria
- `ModuleNotFoundError`류 import 이슈 재현 0건
- 라우팅/오케스트레이션 코드가 단일 계층에 집중

### P2 Implementation Result (Completed)
- Runtime canonicalization:
  - `FoodAnalyst` 구현을 `backend/modules/analyst_runtime/food_analyst.py`로 이동
  - `SmartRouter` 구현을 `backend/modules/analyst_runtime/router.py`로 이동
  - 라우터 유틸 구현을 `backend/modules/analyst_runtime/router_utils.py`로 이동
- Thin facade 적용:
  - `backend/modules/analyst.py` → `FoodAnalyst` 재노출 전용 호환 facade
  - `backend/modules/smart_router.py` → `SmartRouter` 재노출 전용 호환 facade
  - `backend/modules/smart_router_utils.py` → runtime 유틸 재노출 facade
- Bootstrap boundary 정리:
  - `backend/modules/server_bootstrap.py`가 runtime canonical 경로(`modules.analyst_runtime.*`)를 직접 사용
- Runtime package export 정리:
  - `backend/modules/analyst_runtime/__init__.py`에 `FoodAnalyst`, `SmartRouter` 명시 export
- 책임 매트릭스 고정:
  - `analyst_core`: 프롬프트/스키마/응답 파싱/정규화
  - `analyst_runtime`: Vertex 호출/재시도/라우팅 오케스트레이션
  - `modules/analyst.py`, `modules/smart_router.py`: 레거시 호환 facade

### P2 Not Implemented Yet
- 없음 (완료)

---

## Phase 3: Frontend Coupling Reduction (P3)
### Goals
- `features/*` 간 강결합 축소
- 화면 간 데이터 전달을 계약 중심으로 통일

### Actions
- `models/` 또는 `services/contracts/`에 공유 타입 집중
- `features/home/history/result`의 암묵적 데이터 구조 의존 제거
- 내비게이션 파라미터/결과 모델을 공통 builder + type으로 고정

### Deliverables
- 공유 모델 레이어 정리
- feature 간 import 경로 가이드
- 타입 의존성 다이어그램

### Exit Criteria
- feature 간 직접 타입 참조 감소
- 화면 간 데이터 shape mismatch 회귀 0건

### P3 Implementation Result (Completed)
- 공통 라우트 계약 레이어 추가:
  - `FoodLens/services/contracts/resultRoute.ts`
  - `ResultRoute`/`ResultSearchParams`/`ResultSourceType`/`parseResultRouteFlags`/`buildResultRoute` 통합
- feature 간 결합 축소:
  - `home/camera/scanCamera/historyList`가 `features/result/services/*` 대신 `services/contracts/resultRoute`를 직접 사용
- 결과 화면 파라미터 해석 통일:
  - `useResultScreen`, `useAnalysisData`, `analysisDataService`, `useAutoSave`가 동일 파서(`parseResultRouteFlags`) 사용
  - `params['isNew']`, `params['isBarcode']` 등 문자열 비교 제거
- side-effect hook 입력 타입 정리:
  - `useNewResultHaptic` / `usePhotoLibraryAutoSave`가 boolean + `ResultSourceType` 계약 입력을 사용

### P3 Follow-up Implementation (2026-02-14)
- `dataStore` payload 공통 계약 타입 분리:
  - `FoodLens/services/contracts/analysisStore.ts` 추가
  - `dataStore` 내부 snapshot/backup/location/result 타입을 계약 타입으로 통일
- `home/history/result` navigation action 단일 계층 통합:
  - `FoodLens/services/navigation/resultEntryNavigation.ts` 추가
  - `navigateToStoredResult`에서 `dataStore.setData + buildResultRoute + push/replace` 공통 처리
  - `homeNavigationService` / `historyNavigationService`는 공통 계층 호출만 수행

### P3 Not Implemented Yet
- 없음 (완료)

---

## Phase 4: FastAPI Runtime & Performance Guardrails (P4)
### Goals
- 비동기 처리 컨벤션 명확화
- I/O vs CPU 작업 경계 분리로 안정성 강화

### Actions
- FastAPI async endpoint에서 CPU-bound 작업 분리(필요 시 threadpool)
- startup/bootstrap 단계 책임 분리
- 장애 상황 로깅/에러 코드 표준화

### Deliverables
- 런타임 가이드 문서
- 에러 코드/로깅 표준
- 주요 경로 부하 테스트 시나리오

### Exit Criteria
- 피크 구간 응답 저하율 감소
- 장애 분석 시 원인 추적 시간 단축

### P4 Implementation Result (Completed)
- async endpoint CPU-bound 분리:
  - `backend/server.py`에서 이미지 디코딩/동기 분석 메서드 호출을 `asyncio.to_thread` 경유로 오프로드
  - `/analyze`, `/analyze/label`, `/analyze/smart`, `/lookup/barcode`의 주요 동기 작업 분리
- startup/bootstrap 책임 분리:
  - import-time 서비스 초기화 제거, FastAPI `startup` 이벤트에서 초기화
  - `app.state`에 런타임 서비스(`analyst`, `barcode_service`, `smart_router`) 저장
  - `OPENAPI_EXPORT_ONLY=1` 모드에서 초기화 스킵 유지
- 장애 로깅/에러 코드 표준화:
  - `backend/modules/runtime_guardrails.py` 추가
  - `ErrorCode`, `EndpointErrorPolicy`, `request_id` 기반 로깅/HTTP 예외 변환 공통화
- P4 운영 문서 추가:
  - `docs/plans/p4-runtime-performance-guardrails.md`
  - 런타임 가이드 + 에러/로깅 표준 + 부하 테스트 시나리오 정의

### P4 Not Implemented Yet
- 실제 운영 API 키/쿼터 기반 부하 테스트 실행 결과치(p95/p99/error-rate) 수집
- 부하 테스트 임계치(SLO) 확정 및 CI 주기 실행 연동

---

## Phase 5: Architecture Doc Governance (P5)
### Goals
- 문서-실제 구조 drift 방지

### Actions
- `docs/architecture-overview.md` tree 검증 스크립트 도입
- PR 체크리스트에 구조 변경 시 문서 갱신 항목 추가

### Deliverables
- CI 문서 검증 스크립트
- PR 템플릿 체크 항목

### Exit Criteria
- 구조 변경 PR의 문서 누락 0건

---

## Priority Order
1. P1 (Contract Stabilization)
2. P2 (Backend Boundary Clarification)
3. P3 (Frontend Coupling Reduction)
4. P4 (Runtime & Performance Guardrails)
5. P5 (Doc Governance)
