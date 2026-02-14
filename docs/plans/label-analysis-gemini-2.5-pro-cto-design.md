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

