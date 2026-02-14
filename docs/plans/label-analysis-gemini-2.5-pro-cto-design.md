# Label Analysis Redesign (Gemini 2.5 Pro)

## 1. 목적
- 라벨 분석 기능을 `Gemini 2.5 Pro` 기반의 운영 가능한 제품 파이프라인으로 재설계한다.
- 목표는 정확도, 안전성(알러지), 관측성, 비용 통제를 동시에 만족하는 것이다.

## 2. 제품 요구사항
- 입력: 영양성분표/원재료표 이미지(카메라, 갤러리).
- 출력: 구조화된 성분/영양 정보, 알러지 위험도, 근거, 신뢰도.
- 원칙: 확신이 낮으면 `SAFE` 단정 금지(`UNKNOWN` 또는 `CAUTION`).

## 3. 아키텍처 원칙
- Label 파이프라인을 독립 경로로 분리: `/analyze/label` 전용.
- 단계별 실패 원인을 분리 가능해야 함:
  1. ingest
  2. quality gate
  3. Gemini extract
  4. normalize
  5. allergy match
  6. policy
- 응답 스키마(계약) 고정 + 프롬프트 버전 관리.

## 4. 파이프라인 설계
### 4.1 Ingest
- 카메라/갤러리 입력 수집.
- EXIF orientation 정규화.
- 해상도/포맷 표준화.

### 4.2 Quality Gate
- blur, contrast, text-density, glare 지표 계산.
- 임계치 미달 시 Gemini 호출 전 실패 반환(재촬영 유도).
- 비용 절감과 오탐 방지 목적.

### 4.3 Gemini 2.5 Pro 호출 (2-pass 권장)
- Pass A (Extraction):
  - OCR+구조화 추출(JSON strict).
  - 출력: ingredients, nutrition, allergen statement 후보.
- Pass B (Risk Assessment):
  - 사용자 알러지 프로필을 포함해 위험 평가.
  - 출력: safetyStatus, matched terms, coach message.
- 장점: “추출 실패”와 “판정 실패”를 분리해 디버깅/개선 가능.

### 4.4 Normalize
- 성분명 표준화(동의어/언어 표기 통합).
- 중복 제거 및 포맷 정규화.

### 4.5 Allergy Match + Policy
- exact + synonym 매칭.
- confidence 기반 정책:
  - high confidence + no match: SAFE
  - low confidence or ambiguous: CAUTION/UNKNOWN
  - matched allergen: DANGER

## 5. API 계약 제안
### Endpoint
- `POST /analyze/label`

### Request
- `image`
- `locale`
- `allergy_profile`
- `prompt_version`

### Response (고정 계약)
- `status: ok | partial | failed`
- `request_id`
- `qualityScore`
- `extracted`
  - `ingredients[]`
  - `nutrition{}`
  - `raw_text`
- `allergenAssessment`
  - `safetyStatus`
  - `allergenMatches[]`
  - `evidence[]`
- `confidence`
- `warnings[]`

## 6. 데이터/캐시 전략
- 캐시 키:
  - `image_hash + prompt_version + locale + allergy_profile_hash`
- 사용자 알러지 변경 시 자동 재평가 가능.
- 원본 이미지 저장은 TTL 및 opt-in 정책 적용.

## 7. 관측성 (운영 필수)
- End-to-end `request_id`.
- 단계별 latency 로그:
  - `preprocess_ms`
  - `gemini_extract_ms`
  - `gemini_assess_ms`
  - `normalize_ms`
  - `total_ms`
- KPI:
  - parse success rate
  - critical allergen miss rate
  - unknown/caution ratio
  - p50/p95 latency
  - cost per request

## 8. 장애/재시도 정책
- timeout 분리:
  - 네트워크 timeout
  - 모델 timeout
- retry는 idempotent 단계에만 제한 적용.
- fallback:
  - partial 결과 + 안전 경고 + 재촬영 CTA.

## 9. 보안/컴플라이언스
- 민감정보 최소 저장 원칙.
- 의료 조언 아님 고지.
- 실패 원인 메시지 표준화(사용자 친화 + 운영 코드 포함).

## 10. 롤아웃 전략
1. Shadow mode: 기존 경로와 병행 비교.
2. 10% canary: 실패율/latency/오탐 검증.
3. 점진 확대: 25% -> 50% -> 100%.
4. 주간 품질 리뷰: 실패 샘플 기반 prompt/parser 개선.

## 11. 구현 백로그 (우선순위)
### P0
- `/analyze/label` 계약 고정 및 request_id 로깅.
- Quality gate + 재촬영 UX.
- Gemini 2-pass 최소 버전.

### P1
- 성분 표준화 사전/동의어 확장.
- evidence span 저장.
- 캐시 키에 allergy hash 포함.

### P2
- A/B 프롬프트 실험.
- 비용 최적화(조건부 2-pass, early return).

## 12. 수용 기준 (Definition of Done)
- tsc/contract 테스트 통과.
- canary에서 p95/오탐률 목표 달성.
- 운영 대시보드에서 request_id 기반 단계 추적 가능.

### 12.1 정량 목표 (릴리스 게이트)
- `p95(total_ms) <= 8s` (canary 기준)
- `parse_success_rate >= 97%`
- `critical_allergen_miss_rate <= 0.5%`
- `unknown_or_caution_ratio <= 20%` (초기 2주 한시적으로 <= 30% 허용)
- `label_pipeline_5xx_rate < 1%`

위 기준 미충족 시 롤아웃 확대를 중단하고 원인 분석 후 재검증한다.

## 13. 현재 FOOD 구현 구조 (코드 점검 기준)
아래는 현재 "음식 사진(FOOD)" 분석의 실제 흐름이다.

1. 모드/게이트웨이
- `FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts`
- `mode` 기본값은 `FOOD`.
- 촬영 후 `processImage()`가 FOOD 분석 경로 진입점.

2. 촬영 트리거
- `FoodLens/features/scanCamera/hooks/useScanCaptureFlow.ts`
- `mode === 'FOOD'`일 때 `processImage(photo.uri, 'camera', exifDate)` 호출.

3. 공통 분석 실행
- `FoodLens/features/scanCamera/services/scanCameraAnalysisService.ts`
- `runAnalysisFlow(...)`에서:
  - 위치 결정
  - 오프라인 검증
  - 파일 유효성 검증
  - 분석 API 호출
  - 결과 저장/라우팅

4. API 호출
- `FoodLens/services/aiCore/endpoints.ts`
- FOOD는 `analyzeImage()` -> `/analyze` 호출.
- multipart 업로드는 `FoodLens/services/aiCore/internal/analyzeUpload.ts`에서 처리.

5. 저장/이동
- `FoodLens/features/scanCamera/utils/scanCameraGatewayHelpers.ts`
- `dataStore.setData(...)` 저장 후 `/result`로 이동.

### 13.1 현재 구조의 관찰 포인트
- FOOD/LABEL/SMART가 `runAnalysisFlow`를 공통 사용해 일관성은 높음.
- 하지만 모드별 전처리(품질 게이트/문서 검출)는 아직 분리되지 않음.
- 따라서 LABEL 품질 제어를 넣을 때 공통 플로우 확장보다 모드별 플러그인 구조가 바람직함.

### 13.2 갤러리 업로드 시 FOOD/LABEL 구분 동작
- 현재 구현 기준, 갤러리 업로드는 `processSmart -> analyzeSmart` 경로를 사용한다.
- 즉, 사용자가 갤러리에서 이미지를 선택하면 서버 측 smart 분류가 이미지 내용을 보고 FOOD/LABEL을 자동 판별한다.
- 정책적으로는 다음 2가지 중 하나를 명확히 선택해야 한다.
  1. **Auto-first (현재 방식)**: 갤러리는 항상 `analyzeSmart`.
  2. **Mode-respect**: 사용자가 LABEL 모드에서 갤러리 선택 시 `analyzeLabel` 직행, FOOD 모드면 `analyzeImage` 또는 `analyzeSmart`.

권고:
- 초기 안정화 단계에서는 Auto-first 유지.
- LABEL 정확도 요구가 높아지면 Mode-respect 옵션을 Feature Flag로 도입.

### 13.3 정책 확정 (현재 릴리스 기준)
- **정책: Auto-first 고정**
  - 갤러리 입력은 항상 `analyzeSmart`로 처리한다.
- **Mode-respect 전환 조건(2주 연속 충족 시 검토)**
  - smart 오분류율 > 3%
  - LABEL 모드 사용자 재시도율 > 25%
  - 라벨 인식 불만 주간 20건 이상

## 14. `backend/modules/analyst_core/prompts.py` 요청 구조 점검
점검 파일:
- `backend/modules/analyst_core/prompts.py`
- `backend/modules/analyst_runtime/food_analyst.py`

### 14.1 Prompt 템플릿 구조
1. `ANALYSIS_PROMPT_TEMPLATE`
- 입력 컨텍스트: `{allergy_info}`, `{iso_current_country}`
- 출력 요구: 음식명/성분 bbox/안전상태/번역 필드 등 JSON

2. `LABEL_PROMPT_TEMPLATE`
- 입력 컨텍스트: `{allergy_info}`
- 출력 요구: nutrition + ingredients + safetyStatus 중심 JSON

3. `BARCODE_PROMPT_TEMPLATE`
- 입력 컨텍스트: `{normalized_allergens}`, `{ingredients_str}`
- 텍스트 전용 알러지 판정 JSON

### 14.2 현재 코드와의 불일치/리스크
1. 모델 정책 불일치
- 문서 목표는 Gemini 2.5 Pro인데,
- `analyze_label_json()`는 현재 하드코딩으로 `gemini-2.0-flash` 사용.
- 또한 `result["used_model"] = "gemini-2.0-flash-ocr"`로 고정 표기.

2. LABEL 프롬프트 컨텍스트 부족
- LABEL 템플릿은 `locale`/`iso_current_country`를 프롬프트 입력으로 직접 사용하지 않음.
- 다국어/지역 맥락 제어가 FOOD 대비 약함.

3. 응답 계약 표현 불명확
- LABEL 템플릿은 `raw_result_en/raw_result_ko/raw_result`를 요구하지만
- 실제 운영에서 strict schema와 템플릿 필드의 일치 검증이 필요.

### 14.3 즉시 반영 권고 (P0)
1. `analyze_label_json()` 모델 선택을 환경변수 기반으로 통일
- 예: `GEMINI_LABEL_MODEL_NAME` 기본값을 `gemini-2.5-pro`로 설정.

2. LABEL prompt 빌더 확장
- `build_label_prompt(allergy_info, locale, iso_current_country)`로 확장.

3. Prompt/Schema 동기화 테스트 추가
- 템플릿 출력 요구 필드와 `build_label_response_schema()` 계약 정합성 테스트.

4. 결과 메타 표준화
- `used_model`, `prompt_version`, `request_id`를 LABEL 응답에 공통 포함.

5. 갤러리 분기 정책 명시
- `analyzeSmart` 자동 분류를 기본 정책으로 문서화하거나,
- 모드 우선 분기(`LABEL -> analyzeLabel`)를 도입할 경우 라우팅 계약을 명확히 고정.

6. CI Gate 강제
- 다음 조건 미충족 시 merge 차단:
  - Prompt/Schema 계약 테스트 통과
  - 라벨 회귀 샘플 테스트 통과(최소 20건)
  - `/analyze/label` contract test 통과
- 권장 게이트 명령:
  - `bash backend/scripts/ci_label_contract_gate.sh`

### 14.4 관측성 메타 (Step 5 반영)
- `/analyze/label` 응답 메타:
  - `request_id`
  - `prompt_version`
  - `used_model`
- `/analyze/label` 단계별 서버 로그(ms):
  - `preprocess`
  - `extract`
  - `assess` (v1은 0, 향후 2-pass 시 실제 값 사용)
  - `total`

## 15. 운영 가드레일 (비용/보안)
### 15.1 비용 가드레일
- 요청당 비용 상한(soft): `$0.03`
- 월 예산 임계치:
  - 70%: 경고 알림
  - 85%: 저우선순위 요청에서 2-pass -> 1-pass 강등
  - 100%: fallback 모드(`partial + caution`) 전환
- `cost_per_request`, `tokens_per_request` 일 단위 집계.

### 15.2 데이터 보존/삭제 정책
- 원본 이미지: 기본 비저장, 디버그 opt-in 샘플만 저장(TTL 30일)
- 파생 텍스트(OCR/정규화): TTL 90일
- 요청 로그(request_id, latency, status): TTL 180일
- 사용자 삭제 요청 시 request_id/user_id 연계 비동기 삭제 큐 실행
## 16. 구현 우선순위 업데이트
P0 항목을 다음과 같이 구체화한다.
- 라벨 모델을 `gemini-2.5-pro` 기준으로 환경변수/코드 경로 통일.
- LABEL prompt 입력 파라미터를 FOOD 수준으로 확장(locale, iso).
- prompt-schema 계약 테스트 도입.
- 단계별 latency/모델/프롬프트 버전 로깅 강제.
