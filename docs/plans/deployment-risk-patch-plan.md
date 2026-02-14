# Deployment Risk Patch Plan

- Date: 2026-02-14
- Scope: 배포 후 사용자 영향도가 높은 리스크에 대한 파일별 수정안 + 커밋 단위 실행 계획

## 0) Progress

- [x] Commit A 완료 (2026-02-14)
- [x] Commit B 완료 (2026-02-14)
- [x] Commit C 완료 (2026-02-14)
- [x] Commit D 완료 (2026-02-14)
- [x] Commit E 완료 (2026-02-14)
- [x] Commit F 완료 (2026-02-14)
- [x] Commit G 완료 (2026-02-14)
- [x] Commit H 완료 (2026-02-14)

## 1) Patch Priority

1. 보안/개인정보 로그 제거
2. Android 권한 최소화
3. iOS ATS 설정 일관화
4. 바코드 네트워크 timeout/abort
5. barcode API 에러 HTTP status 정규화
6. AI 응답 파싱 디버그 로그 가드
7. 백엔드 의존성 슬림화
8. 지도 클러스터링 기본 활성화

---

## 2) Commit Unit Plan (File-by-File)

### Commit A: `security: remove sensitive runtime logs`

- Files
  - `backend/modules/server_bootstrap.py`
  - `backend/modules/analyst_runtime/food_analyst.py`
  - `FoodLens/services/aiCore/internal/barcodeLookup.ts`
- Patch
  - `GCP_SERVICE_ACCOUNT_JSON` 원문/부분 문자열/길이 로그 삭제
  - 자격증명 파싱 실패 시 raw content 출력 제거
  - 사용자 알러지 문자열 직접 로그 제거
  - 남겨야 하는 로그는 `request_id`, 상태코드, 단계명만 유지
- Guardrail
  - 운영 로그에 secret/health profile 텍스트가 남지 않아야 함

### Commit B: `chore(android): reduce dangerous and unused permissions`

- Files
  - `FoodLens/android/app/src/main/AndroidManifest.xml`
- Patch
  - 제거 후보
    - `android.permission.SYSTEM_ALERT_WINDOW`
    - `android.permission.RECORD_AUDIO`
    - `android.permission.READ_MEDIA_AUDIO`
    - `android.permission.READ_MEDIA_VIDEO`
    - `android.permission.WRITE_EXTERNAL_STORAGE` (API 29+ 정책 기준)
  - `android:requestLegacyExternalStorage="true"` 제거
  - 실제 사용 기능(카메라/이미지 선택/위치)에 필요한 최소 권한만 유지
- Guardrail
  - 앱 기능 회귀 없이 권한 프롬프트 수 축소
  - Play Console 정책 리스크 감소

### Commit C: `chore(ios): enforce ATS strict mode from app config`

- Files
  - `FoodLens/app.config.js`
- Patch
  - `NSAllowsArbitraryLoads: true` 제거 또는 `false`로 고정
  - 필요한 경우 특정 도메인만 예외 허용(`NSExceptionDomains`)로 축소
- Guardrail
  - `app.config.js`와 실제 `Info.plist` 결과가 일치해야 함

### Commit D: `feat(network): add timeout/retry parity for barcode lookup`

- Files
  - `FoodLens/services/aiCore/internal/barcodeLookup.ts`
  - `FoodLens/services/aiCore/internal/retryUtils.ts` (필요 시)
- Patch
  - `fetch`에 `AbortController` 기반 timeout 추가
  - 네트워크 오류/timeout 메시지 표준화
  - 필요 시 재시도(최대 2~3회, 지수 백오프) 적용
- Guardrail
  - 이미지 분석 업로드와 동일한 실패 UX 수준 확보

### Commit E: `fix(api): return proper status on barcode lookup failures`

- Files
  - `backend/server.py`
  - (선택) `backend/modules/runtime_guardrails.py`
- Patch
  - `/lookup/barcode` 예외 시 200 JSON 반환 대신 `HTTPException` 사용
  - 에러 응답에 `code`, `request_id` 유지
  - `Product not found`는 정상 200(`found=false, message`) 유지
- Guardrail
  - 모니터링/알림에서 실제 서버 오류가 정확히 집계되어야 함

### Commit F: `chore(logging): gate parser debug logs by env flag`

- Files
  - `backend/modules/analyst_core/response_utils.py`
  - (선택) `backend/modules/server_bootstrap.py`
- Patch
  - `[PARSE DEBUG]` 전량 출력 로직을 환경변수 기반으로 비활성 기본값 설정
    - 예: `FOODLENS_PARSE_DEBUG=1`일 때만 출력
  - 기본 운영 모드에서 raw AI 응답 전문 로그 금지
- Guardrail
  - 운영 로그 비용/민감정보 노출 리스크 완화

### Commit G: `build(backend): split runtime requirements from dev/data stack`

- Files
  - `backend/requirements.txt`
  - `backend/requirements-dev.txt` (신규)
  - `backend/Dockerfile`
- Patch
  - API 런타임 불필요 패키지(Streamlit/Altair/BigQuery 등) 분리
  - Dockerfile은 런타임 requirements만 설치
- Guardrail
  - 이미지 크기, cold start 시간, 메모리 사용량 감소

### Commit H: `perf(map): enable marker clustering by default`

- Files
  - `FoodLens/components/historyMap/constants.ts`
- Patch
  - `ENABLE_MAP_CLUSTERING = true`로 전환
  - 성능 임계치에 맞춰 `CLUSTER_RADIUS`, `MAX_RENDER_MARKERS` 재조정
- Guardrail
  - 히스토리 데이터 증가 시 지도 프레임 안정성 개선

---

## 3) Recommended Execution Order

1. Commit A
2. Commit B
3. Commit C
4. Commit D
5. Commit E
6. Commit F
7. Commit H
8. Commit G

이 순서는 사용자 보안/정책 리스크를 먼저 제거하고, 이후 안정성/성능 개선을 반영하는 순서다.

---

## 4) Validation Checklist Per Commit

- Mobile
  - `cd FoodLens && npx tsc --noEmit --pretty false`
  - 카메라 촬영/갤러리 업로드/바코드 스캔 실기기 확인
  - Android/iOS 권한 팝업 시점 회귀 확인
- Backend
  - `python3 -m py_compile backend/server.py backend/modules/*.py backend/modules/*/*.py`
  - `/analyze`, `/analyze/smart`, `/lookup/barcode` smoke test
- Docs/Architecture
  - `python3 docs/scripts/validate_architecture_overview.py`
  - `python3 docs/scripts/validate_entrypoint_standard.py`

---

## 5) Done Definition

- 운영 로그에서 secret/개인 알러지 문자열 노출 0건
- 스토어 정책 위반 가능 권한 제거 완료
- 바코드 API 네트워크 timeout 미정지 이슈 0건
- 서버 장애가 HTTP status/모니터링에 정확히 반영
- 대용량 히스토리 지도 렌더링 성능 회귀 없음
