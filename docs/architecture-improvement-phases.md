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
  - `P2`: 미진행
  - `P3`: 미진행
  - `P4`: 미진행
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
- 백엔드-프론트 계약 문서(OpenAPI/JSON Schema) 자동 추출 파이프라인
- `/lookup/barcode` 데이터 본문(`data`) 세부 필드 계약의 엄격 모델링

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
