# 다국어 결과 표시 구현 계획 (P1)

작성일: 2026-02-13  
범위: Food Lens 앱 전반(UI 문구 + 분석 결과 표시 언어 일관화)

## 목표
- 사용자 언어 설정 기반으로 앱 텍스트와 분석 결과를 일관되게 제공한다.
- 핵심 플로우(홈 → 스캔 → 결과 → 히스토리)에서 언어 혼재를 제거한다.
- 안전/경고 문구의 이해도를 높여 여행 중 의사결정 오류를 줄인다.

---

## Phase 1. 언어 정책/스키마 확정

### Task 1-1. 언어 우선순위 정책 정의
- **taskID**: `I18N-P1-T001`
- 내용:
  - 우선순위 확정: `user setting > device locale > default(en)`
  - 지원 언어 코드 표준화(BCP-47 기준)
  - 기존 코드와 표준 코드 매핑 규칙 정의
  - fallback 정책 문서화(키 누락 시 default)
- 표준 코드(저장/전송 기준):
  - `auto` (기존 `GPS`)
  - `ko-KR` (기존 `KR`)
  - `en-US` (기존 `US`)
  - `ja-JP` (기존 `JP`)
  - `zh-Hans` (기존 `CN`)
  - `th-TH` (기존 `TH`)
  - `vi-VN` (기존 `VN`)
- 호환성 규칙:
  - 앱 내부/서버 전송/리소스 키 기준 코드는 위 표준 코드로 통일
  - 기존 저장 데이터의 레거시 코드(`GPS/KR/US/JP/CN/TH/VN`)는 읽을 때 표준 코드로 변환
  - 쓰기 시에는 항상 표준 코드만 저장
- 산출물:
  - 정책 문서 섹션
  - `features/i18n/constants.ts`의 canonical locale 목록
  - 레거시 코드 변환 매퍼(`legacy -> canonical`)
- 완료 기준:
  - 팀 합의된 우선순위/코드 체계 확정
  - 레거시 사용자 데이터 읽기 호환 검증 완료

### Task 1-2. 사용자 설정 필드 정규화
- **taskID**: `I18N-P1-T002`
- 내용:
  - `language` / `targetLanguage` 필드 의미 분리 및 매핑 규칙 확정
  - 사용자 프로필 저장/조회 시 단일 source of truth 정의
- 필드 표준(권장):
  - `language`: 앱 UI 표시 언어 (BCP-47, 예: `ko-KR`, `en-US`, `auto`)
  - `targetLanguage`: 분석 결과 텍스트 요청 언어 (BCP-47, nullable)
- 저장/조회 규칙:
  - 앱 로딩 시:
    - `language`가 있으면 UI 언어는 `language` 사용
    - `language`가 없고 `targetLanguage`만 있으면 `language = targetLanguage`로 보정
    - 둘 다 없으면 `language = auto`
  - 분석 요청 시:
    - `targetLanguage`가 있으면 해당 값 전달
    - `targetLanguage`가 없으면 `language` 사용 (`auto`면 device locale 기반 해석)
  - 설정 저장 시:
    - 사용자가 언어를 명시 선택하면 `language`와 `targetLanguage`를 동일 값으로 저장
    - 사용자가 자동 선택이면 `language = auto`, `targetLanguage = null`
- 레거시 마이그레이션 규칙:
  - 기존 `targetLanguage`가 레거시 코드(`KR/US/JP/CN/TH/VN/GPS`)면 `T001` 매퍼로 표준화
  - 기존 `language`가 누락되어 있으면 변환된 `targetLanguage`로 `language` 채움
  - 기존 `language`가 존재하면 `language` 우선, `targetLanguage`는 필요 시 동기화
- 산출물:
  - 필드 매핑 표, 마이그레이션 규칙
  - `normalizeLanguageSettings(profile)` 유틸 스펙
- 완료 기준:
  - 앱/서비스에서 동일한 언어 필드 사용
  - 기존 사용자 데이터 로드 시 언어 값 누락/혼재 케이스 0

---

## Phase 2. i18n 인프라 구축

### Task 2-1. i18n 모듈 골격 생성
- **taskID**: `I18N-P1-T003`
- 내용:
  - `features/i18n/` 생성
  - `types.ts`, `constants.ts`, `services/languageService.ts`, `hooks/useI18n.ts` 추가
- 산출물:
  - 기본 훅 API: `t(key)`, `locale`, `setLocale`
- 완료 기준:
  - 앱 어디서든 `t()` 호출 가능

### Task 2-2. 리소스 파일 구조 도입
- **taskID**: `I18N-P1-T004`
- 내용:
  - `features/i18n/resources/en.json`, `ko.json` 초기 도입
  - 키 네이밍 규칙(화면.영역.의미) 수립
- 산출물:
  - 공통/화면별 키셋 초안
- 완료 기준:
  - 핵심 공통 키(버튼, 에러, 오프라인, 로딩) 정의 완료

### Task 2-3. 키 누락 검증 도구 추가
- **taskID**: `I18N-P1-T005`
- 내용:
  - 리소스 키 정합성 검사 스크립트(언어 간 키 diff)
  - CI에서 경고 또는 실패 처리 규칙 정의
- 산출물:
  - `scripts/i18n-check` (또는 동등 스크립트)
- 완료 기준:
  - 누락 키 자동 탐지 가능

---

## Phase 3. 핵심 사용자 플로우 적용

### Task 3-1. Result 화면 다국어 적용 (최우선)
- **taskID**: `I18N-P1-T006`
- 대상:
  - `features/result/screens/ResultScreen.tsx`
  - 결과 관련 컴포넌트/훅
- 내용:
  - 안전/경고/알레르기 문구, 빈 상태, 버튼 라벨 i18n 치환
  - 분석 결과 텍스트 fallback 전략 반영
- 완료 기준:
  - 결과 화면 하드코딩 문자열 제거(핵심 영역)

### Task 3-2. Scan/Camera 플로우 다국어 적용
- **taskID**: `I18N-P1-T007`
- 대상:
  - `features/scanCamera/*`, `features/camera/*`
- 내용:
  - 스캔 가이드 문구, 오류 경고(Alert), 오프라인 문구 i18n 치환
- 완료 기준:
  - 스캔 진입~분석 완료까지 사용자 노출 문구 다국어화

### Task 3-3. Home/History/Profile/TripStats 적용
- **taskID**: `I18N-P1-T008`
- 대상:
  - `features/home/*`, `features/history/*`, `features/profile/*`, `features/tripStats/*`
- 내용:
  - 섹션 타이틀, 빈 상태, CTA, 안내 문구 i18n 치환
- 완료 기준:
  - 핵심 화면의 문자열 언어 일관성 확보

---

## Phase 4. 서버 연계 및 결과 언어 정합성

### Task 4-1. 분석 요청에 locale 전달
- **taskID**: `I18N-P1-T009`
- 대상:
  - AI 요청 계층(`services/ai.ts` 및 backend 요청 경로)
- 내용:
  - 요청 payload에 `locale`(또는 동등 필드) 포함
  - 미지원 언어 fallback 처리
- 완료 기준:
  - 요청/응답 언어 정책이 코드로 고정

### Task 4-2. 서버 응답 fallback 정책 구현
- **taskID**: `I18N-P1-T010`
- 내용:
  - 서버가 단일 언어 응답 시 클라이언트 fallback 규칙 반영
  - 경고/요약 텍스트 표시 정책 문서화
- 클라이언트 fallback 우선순위(요약 텍스트):
  - `raw_result`
  - `coachMessage` / `summary` / `result_text` / `analysis_text` / `message` / `localized_summary`
  - `translationCard.text` (또는 `translation_card`/`ai_translation`의 text/message)
  - locale 기반 기본 문구(`ko-KR`/기타)
- 번역 카드 fallback 규칙:
  - 우선 키: `translationCard` → `translation_card` → `aiTranslation` → `ai_translation`
  - 언어 코드 키 fallback: `language` → `locale` → `lang` → `targetLanguage`
  - 텍스트 키 fallback: `text` → `message` → `translated_text`
- 완료 기준:
  - 사용자에게 빈/혼합 언어 응답 노출 최소화

---

## Phase 5. 품질 검증/출시 준비

### Task 5-1. locale 기반 포맷 정리
- **taskID**: `I18N-P1-T011`
- 내용:
  - 날짜/숫자/단위 표기 locale 반영
- 완료 기준:
  - 각 언어에서 포맷 자연스러움 확인

### Task 5-2. 다국어 회귀 테스트 시나리오 추가
- **taskID**: `I18N-P1-T012`
- 내용:
  - 핵심 플로우 언어 전환 테스트 케이스 작성
  - 키 누락/하드코딩 문자열 점검 체크리스트 운영
- 산출물:
  - `docs/plans/i18n-regression-scenarios.md` (EN/KO 수동 회귀 시나리오)
  - `scripts/i18n-hardcoded-check.js` (핵심 플로우 UI 문자열 하드코딩 탐지)
  - `package.json` 스크립트: `i18n:hardcoded-check`, `i18n:verify`
- 완료 기준:
  - EN/KO 기준 회귀 테스트 통과

### Task 5-3. 릴리즈 게이트 확정
- **taskID**: `I18N-P1-T013`
- 내용:
  - `tsc/lint` + i18n 키 정합성 + 수동 QA 통합 게이트
- 산출물:
  - `docs/plans/i18n-release-gate.md` (릴리즈 승인 기준/실패 처리 규칙)
  - `package.json` 스크립트: `i18n:release-gate`
- 완료 기준:
  - 배포 전 승인 기준 문서화 및 적용
  - `npm run i18n:release-gate` 통과

---

## DoD (Definition of Done)
- 핵심 플로우에서 사용자 노출 문자열 100% i18n 키 기반
- EN/KO 최소 2개 언어 실사용 가능
- 분석 결과 경고 문구 언어 불일치 케이스 대응
- 정적 검사/키 검사/회귀 시나리오 통과

## 리스크 및 대응
- 번역 품질 편차: 안전/경고 문구 우선 검수
- 키 누락: CI 키 정합성 검사로 차단
- 서버 응답 불일치: 요청 locale 및 fallback 정책 강제
