# DRY & Logic Optimization Targets (Full Scan)

Date: 2026-02-14
Scope: `FoodLens/` 전체(총 399 files)

## 목적
- 기능 변경 없이(Functional Equivalence) 중복 로직을 제거하고 유지보수성을 개선할 수 있는 파일 대상을 전수 조사한다.
- 사이드이펙트(권한 요청, Alert, 저장, 로그, 네비게이션) 누락 위험이 높은 경로를 우선순위로 정렬한다.

## 조사 방법
- 코드베이스 전수 검색(`rg`)으로 아래 패턴을 수집
  - 권한/Alert/설정 이동
  - 분석 플로우 실행(`runAnalysisFlow`, `analyze*`)
  - 이미지 저장/영구화/갤러리 저장
  - i18n 로컬라이즈 fallback(`foodName_ko/en`, `raw_result_ko/en`)
  - 결과 복원/바코드 분기(`fromStore`, `isBarcode`)

## 핵심 결론
- 중복이 가장 큰 축은 `카메라/스캔 분석 실행 흐름`, `권한+Alert 처리`, `이미지 저장 흐름`, `로컬라이즈 fallback`이다.
- 아래 파일군을 우선 리팩토링 대상으로 선정한다.

## 진행 업데이트 (2026-02-14)
- 상태: `P0-1` 완료, `P0-2` 완료, `P1-3` 완료, `P1-4` 완료, `P2-5` 완료, `P2-6` 완료, `P3-1` 완료, `P3-2` 완료, `P3-3` 완료, `P3-4` 완료
- 다음 계획: 후속 회귀 점검 및 잔여 대형 파일 분해 후보 재선정
- 완료 파일:
  - `FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts`
  - `FoodLens/features/camera/hooks/useCameraGateway.ts`
  - `FoodLens/features/camera/services/cameraAnalysisService.ts`
  - `FoodLens/features/scanCamera/services/scanCameraAnalysisService.ts`
- 적용 내용:
  - `useScanCameraGateway`:
    - `runAnalysisFlow` 공통 호출부를 `runFlow`로 추출
    - `processImage`, `processLabel`, `processSmart`의 중복 파라미터 블록 통합
    - `handleGallery`의 불필요 분기(`mode === 'LABEL'` 양쪽 동일 호출) 제거
  - `cameraAnalysisService`:
    - 시작 단계, 위치 해석, 오프라인 처리, 진행률 핸들러를 선언적 내부 함수로 분리
  - `useCameraGateway`:
    - 에러 처리 분기에서 재시도 서버 알림/일반 실패 알림 로직을 선언적 함수로 분리
    - 동일 Alert 구성 로직의 중복 제거
  - `scanCameraAnalysisService`:
    - 위치 해석/오프라인 처리 단계 로직을 내부 공통 함수로 추출
- 기능 동등성 보존 근거:
  - analyzer별 입력 파라미터(URI/timestamp/location/validation/fallbackAddress) 유지
  - 기존 offline 메시지/에러 핸들러/상태 업데이트(set* 함수) 동일 경로 유지
  - 초기/진행/완료 스텝 전이 및 cancel guard 유지
  - `npx tsc --noEmit` 통과

### P0-2 1차 반영
- 완료 파일:
  - `FoodLens/services/ui/permissionDialogs.ts` (신규)
  - `FoodLens/features/result/hooks/useResultSideEffects.ts`
  - `FoodLens/hooks/usePermissionGuard.ts` (삭제)
- 적용 내용:
  - 권한 거부 후 설정 이동 Alert를 `showOpenSettingsAlert`로 공통화
  - Result의 사진 권한 거부 UX를 공통 다이얼로그로 전환
  - 코드베이스 내 미사용 권한 유틸(`usePermissionGuard`) 제거
- 안전 근거:
  - Result 권한 거부 시 노출 메시지/버튼 의미 동일
  - 설정 이동 동작(`Linking.openSettings`) 동일
  - `npx tsc --noEmit` 통과

### P0-2 2차 반영
- 완료 파일:
  - `FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts`
  - `FoodLens/components/profileSheet/utils/profileSheetStateUtils.ts`
  - `FoodLens/components/profileSheet/hooks/useProfileSheetState.ts`
  - `FoodLens/features/i18n/resources/en.json`
  - `FoodLens/features/i18n/resources/ko.json`
- 적용 내용:
  - Scan 카메라 권한 거부 시 공통 다이얼로그(`showOpenSettingsAlert`)로 통일
  - ProfileSheet 카메라 권한 거부 Alert를 공통 다이얼로그로 통일
  - 권한/오류 하드코딩 문구를 i18n 키 기반으로 치환
    - `profile.permission.cameraRequiredTitle`
    - `profile.permission.cameraRequiredMessage`
    - `profile.alert.imagePickFailed`
- 안전 근거:
  - 권한 요청 시점(기존 `requestCameraPermissionsAsync`) 동일
  - 거부 시 행동(취소/설정 이동) 의미 동일
  - 다국어 키 추가 후 fallback 문자열 보존
  - `npx tsc --noEmit` 통과

### P0-2 3차 반영 (정리 마감)
- 완료 파일:
  - `FoodLens/services/ui/permissionDialogs.ts`
  - `FoodLens/features/camera/screens/CameraScreen.tsx`
  - `FoodLens/components/historyMap/hooks/useHistoryMapEffects.ts`
- 적용 내용:
  - 공통 설정 이동 함수 `openAppSettings` 추가
  - 남아있던 inline `Linking.openSettings()` 호출을 공통 함수로 치환
    - Camera 권한 게이트
    - History Map 설정 이동
- 안전 근거:
  - 설정 이동 동작은 동일(`Linking.openSettings`)하며 호출 위치만 공통화
  - 런타임 권한 요청 시점/비즈니스 로직 변화 없음
  - `npx tsc --noEmit` 통과

### P1-3 1차 반영
- 완료 파일:
  - `FoodLens/services/imageStorage.ts`
  - `FoodLens/features/scanCamera/utils/scanCameraGatewayHelpers.ts`
  - `FoodLens/components/profileSheet/utils/profileSheetStateUtils.ts`
- 적용 내용:
  - 영구 저장 null-check + throw 중복을 공통 함수로 통합
    - `saveImagePermanentlyOrThrow(cacheUri, errorMessage)` 추가
  - Scan 결과 저장 경로에서 공통 함수 사용
  - Profile 이미지 영구 저장 경로에서 공통 함수 사용
- 안전 근거:
  - 저장 실패 시 예외 발생/중단 정책 동일
  - 기존 에러 메시지 문자열 유지
  - 저장 성공 시 반환값(파일명) 및 후속 데이터 저장 경로 동일
  - `npx tsc --noEmit` 통과

### P1-3 미반영 (다음 단계)

### P1-3 2차 반영 (완료)
- 완료 파일:
  - `FoodLens/features/result/services/photoLibraryService.ts`
- 적용 내용:
  - 권한 확인, 저장 대상 URI 결정(EXIF 포함), 저장 후 진단 로그, 임시 파일 정리를 단계 함수로 분리
    - `ensureMediaLibraryPermission`
    - `resolveUriToSave`
    - `saveAssetWithDiagnostics`
    - `cleanupTempFileIfNeeded`
  - `saveImageToLibrary`는 orchestration 중심으로 단순화
- 안전 근거:
  - 기존 권한 확인/로그 문자열/결과 상태(`saved|denied|error`) 유지
  - EXIF 주입 실패 시 원본 저장 fallback 유지
  - 성공/실패 모두 임시 파일 정리 보장(기존 대비 강화)
  - `npx tsc --noEmit` 통과

### P1-4 반영 (완료)
- 완료 파일:
  - `FoodLens/hooks/result/analysisDataService.ts`
  - `FoodLens/hooks/result/useAnalysisData.ts`
  - `FoodLens/hooks/result/analysisDataUtils.ts`
- 적용 내용:
  - `analysisDataService`:
    - `fromStore/isRestoring/isBarcode` 분기 반환 중복을 `buildLoadedAnalysisData`로 통합
    - 복원 실패 기본 반환값을 `EMPTY_LOADED_ANALYSIS_DATA` 상수화
  - `useAnalysisData`:
    - `fromStore === 'true'` 중복 조건을 `fromStoreMode` 플래그로 통일
  - `analysisDataUtils`:
    - 빈 이미지 결과 중복을 `EMPTY_IMAGE_RESOLUTION` 상수로 통합
- 안전 근거:
  - 기존 분기 조건/입력/출력 구조 유지
  - barcode 정규화 및 이미지 resolve 우선순위 유지
  - timestamp 동기화 조건 유지
  - `npx tsc --noEmit` 통과

### P2-5 반영 (완료)
- 완료 파일:
  - `FoodLens/services/i18n/nameResolver.ts` (신규)
  - `FoodLens/features/home/utils/localizedFoodName.ts`
  - `FoodLens/components/result/resultContent/utils/localizedNames.ts`
  - `FoodLens/hooks/historyDataUtils.ts` (공통 resolver 소비 경로로 간접 반영)
- 적용 내용:
  - `ko/en/fallback` 우선순위 규칙을 공통 순수 함수로 통합
    - `resolveLocalizedText`
    - `resolveLocalizedOptionalText`
    - `isKoreanLocale`
    - `getOptionalString`
  - Home의 `raw_data` fallback 추출 로직을 공통 유틸 함수 기반으로 변경
  - Result의 food/ingredient/summary 로컬라이즈 로직을 공통 resolver로 치환
- 안전 근거:
  - 한국어 우선순위(`ko -> en -> fallback`) 유지
  - 비한국어 우선순위(`en -> fallback -> ko`) 유지
  - 기본값(`Analyzed Food`, `Unknown`) 유지
  - `npx tsc --noEmit` 통과

### P2-6 반영 (1차 완료)
- 완료 파일:
  - `FoodLens/services/ui/uiAlerts.ts` (신규)
  - `FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts`
  - `FoodLens/features/camera/hooks/useCameraGateway.ts`
  - `FoodLens/components/profileSheet/hooks/useProfileSheetState.ts`
- 적용 내용:
  - 번역 키 기반 Alert 공통 헬퍼 `showTranslatedAlert` 추가
  - Scan/Camera/ProfileSheet 훅의 반복 `Alert.alert(t(...), t(...), buttons?)` 패턴을 공통 함수로 치환
  - 버튼 번역(`common.cancel`, `common.retry`, `scan.alert.takePhoto`)까지 공통 경로로 통합
- 안전 근거:
  - 기존 Alert 타이틀/메시지 키 및 fallback 문자열 유지
  - 버튼 순서/스타일(`cancel`) 및 onPress 동작 유지
  - 에러/오프라인 분기 조건 유지
  - `npx tsc --noEmit` 통과

### P2-6 2차 반영 (완료)
- 완료 파일:
  - `FoodLens/features/camera/hooks/useCameraGatewayInitialization.ts`
  - `FoodLens/features/camera/hooks/useCameraPermissionEffects.ts`
  - `FoodLens/features/home/hooks/useHomeDashboard.ts`
  - `FoodLens/features/profile/hooks/useProfileScreen.ts`
  - `FoodLens/features/tripStats/hooks/useTripStatsScreen.ts`
- 적용 내용:
  - 후속 5개 훅의 `Alert.alert(t(...), t(...))` 중복을 `showTranslatedAlert`로 치환
  - 기존 타이틀/메시지 i18n 키, fallback, 호출 타이밍(`setTimeout`, catch 분기 등) 유지
- 안전 근거:
  - 에러/권한/위치 실패 분기 조건 유지
  - 버튼/콜백 동작 변경 없음(후속 파일은 버튼 없는 alert 중심)
  - `npx tsc --noEmit` 통과

### P2-6 미반영
- 없음

### P3-1 반영 (완료)
- 완료 파일:
  - `FoodLens/services/auth/currentUser.ts` (신규)
  - `FoodLens/services/permissions/locationPermissionService.ts` (신규)
  - `FoodLens/features/result/services/resultNavigationService.ts` (신규)
  - `FoodLens/features/home/services/homeNavigationService.ts`
  - `FoodLens/features/scanCamera/utils/scanCameraGatewayHelpers.ts`
  - `FoodLens/components/historyList/services/historyNavigationService.ts`
  - `FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts`
  - `FoodLens/features/camera/screens/CameraScreen.tsx`
  - `FoodLens/services/utils/location.ts`
  - `FoodLens/features/tripStats/services/tripStatsService.ts`
  - `FoodLens/services/aiCore/constants.ts`
  - `FoodLens/features/allergies/constants/allergies.constants.ts`
  - `FoodLens/features/history/constants/history.constants.ts`
  - `FoodLens/features/emojiPicker/constants/emojiPicker.constants.ts`
  - `FoodLens/features/profile/constants/profile.constants.ts`
  - `FoodLens/features/scanCamera/constants/scanCamera.constants.ts`
  - `FoodLens/features/camera/constants/camera.constants.ts`
  - `FoodLens/features/tripStats/constants/tripStats.constants.ts`
  - `FoodLens/features/result/constants/result.constants.ts`
  - `FoodLens/hooks/result/autoSaveUtils.ts`
  - `FoodLens/features/home/hooks/useHomeDashboard.ts`
  - `FoodLens/features/home/screens/HomeScreen.tsx`
  - `FoodLens/components/travelerAllergyCard/hooks/useTravelerCardTargetLanguage.ts`
  - `FoodLens/components/travelerAllergyCard/hooks/useTravelerAllergens.ts`
- 적용 내용:
  - 사용자 ID 단일 소스화:
    - `CURRENT_USER_ID`를 추가하고 각 `TEST_UID` 정의를 중앙 상수 참조로 전환
    - 코드 내 하드코딩 `"test-user-v1"` 제거(테스트 파일 제외)
  - 위치 권한 요청 공통화:
    - `ensureForegroundLocationPermission` 추가
    - `getLocationData`, `tripStatsService.resolveCurrentLocation`에서 공통 게이트 사용
  - `/result` 라우트 파라미터 공통화:
    - `buildResultRoute` 추가
    - Home/History/Scan/Camera 경로에서 공통 route builder 사용
- 안전 근거:
  - 기존 `fromStore/isNew/isBarcode` 파라미터 의미/값 유지
  - 위치 권한 거부 시 반환 정책(`permission_denied`/`null`) 유지
  - 사용자 식별자 값은 동일하되 정의 위치만 중앙화
  - `npx tsc --noEmit` 통과

### P3-1 미반영
- 없음

### P3-2 반영 (완료)
- 완료 파일:
  - `FoodLens/hooks/result/useAnalysisData.ts`
  - `FoodLens/hooks/result/analysisDataService.ts`
  - `FoodLens/hooks/historyDataUtils.ts`
  - `FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts`
  - `FoodLens/features/scanCamera/services/scanCameraAnalysisService.ts`
  - `FoodLens/hooks/result/analysisDataUtils.ts` (연계 타입 보강)
  - `FoodLens/features/scanCamera/utils/scanCameraGatewayHelpers.ts` (연계 타입 보강)
  - `FoodLens/models/History.ts` (연계 타입 보강)
  - `FoodLens/components/result/resultContent/types.ts` (연계 타입 보강)
- 적용 내용:
  - 우선 대상 5개 파일의 `any`/`as any` 제거
  - `LoadedAnalysisData`, `ImageSourcePropType`, `LocationData` 등 명시 타입으로 상태/서비스 타입 정렬
  - Scan 분석 플로우의 에러/라우트/위치 타입을 `unknown`, `Href`, `LocationData` 기반으로 교체
  - History flatten item의 `food-item.data` 타입을 `CountryData` 파생 타입으로 구체화
- 안전 근거:
  - 분석/저장/네비게이션 동작 변경 없이 타입 계층만 강화
  - barcode/image/location 처리 분기 유지
  - `npx tsc --noEmit` 통과

### P3-2 미반영
- 없음 (우선 대상 5개 파일 기준)

### P3-3 반영 (완료)
- 완료 파일:
  - `FoodLens/services/logger.ts` (신규)
  - `FoodLens/services/ui/uiAlerts.ts`
  - `FoodLens/features/camera/services/cameraAnalysisService.ts`
  - `FoodLens/features/scanCamera/services/scanCameraAnalysisService.ts`
  - `FoodLens/features/history/utils/historyDialogs.ts`
  - `FoodLens/features/result/services/photoLibraryService.ts`
  - `FoodLens/services/analysisService.ts`
  - `FoodLens/services/userService.ts`
- 적용 내용:
  - 공통 로그 정책 모듈 `logger` 추가 (`debug/info/warn/error`)
  - 서비스에서 직접 `Alert.alert` 호출하던 경로를 `showAlert` 경유로 통일
  - 대상 서비스의 `console.log/warn/error`를 `logger.*`로 치환해 출력 정책 일관화
- 안전 근거:
  - 기존 경고/오류 처리 분기 및 메시지 내용 유지
  - 오프라인/삭제/저장/권한 플로우 동작 변경 없음
  - `npx tsc --noEmit` 통과

### P3-3 미반영
- 없음 (문서 지정 대상 6개 파일 기준)

### P3-4 반영 (완료)
- 완료 파일:
  - `FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts`
  - `FoodLens/features/scanCamera/hooks/useScanPermissionFlow.ts` (신규)
  - `FoodLens/features/scanCamera/hooks/useScanBarcodeFlow.ts` (신규)
  - `FoodLens/features/scanCamera/hooks/useScanCaptureFlow.ts` (신규)
  - `FoodLens/features/scanCamera/hooks/useScanGalleryFlow.ts` (신규)
  - `FoodLens/features/camera/hooks/useCameraGateway.ts`
  - `FoodLens/features/camera/hooks/useCameraGatewayErrorHandler.ts` (신규)
  - `FoodLens/hooks/historyDataUtils.ts`
  - `FoodLens/hooks/historyDataFlatten.ts` (신규)
- 적용 내용:
  - Scan 대형 gateway 훅을 플로우별 모듈로 분해
    - permission / barcode / capture / gallery
  - Camera gateway 에러 처리 로직을 전용 훅으로 분리
  - History flatten 로직을 별도 파일로 분리하고 기존 파일은 집계/정리 책임에 집중
  - 결과적으로 주요 파일 복잡도 감소
    - `useScanCameraGateway.ts`: 450 -> 269 lines
    - `useCameraGateway.ts`: 181 -> 124 lines
    - `historyDataUtils.ts`: 197 -> 123 lines
- 안전 근거:
  - 기존 반환 인터페이스/네비게이션/알림 동작 유지
  - 스캔/촬영/갤러리 분기와 오프라인/권한 분기 동일
  - `npx tsc --noEmit` 통과

### P3-4 미반영
- 없음 (문서 지정 대상 기준)

---

## P0 (즉시 대상)

### 1) 분석 실행 파이프라인 중복
- `FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts`
- `FoodLens/features/camera/hooks/useCameraGateway.ts`
- `FoodLens/features/scanCamera/services/scanCameraAnalysisService.ts`
- `FoodLens/features/camera/services/cameraAnalysisService.ts`

중복 포인트:
- 오프라인 체크, 취소 플래그, step/progress 업데이트, 에러 처리, 종료/네비게이션이 유사 구조로 반복됨.

권장 리팩토링:
- `Template Method` 성격의 공통 실행기 추출
- 예: `executeAnalysisPipeline({ analyzer, mode, needsFileValidation, onSuccessNavigate })`

안전 체크:
- 기존 `Alert` 메시지/타이밍 유지
- `isCancelled`/`resetState` 호출 순서 보존
- progress step 전이(0→1→2→3) 보존

### 2) 권한/Alert 처리 산재
- `FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts`
- `FoodLens/features/camera/hooks/useCameraGateway.ts`
- `FoodLens/features/result/hooks/useResultSideEffects.ts`
- `FoodLens/components/profileSheet/utils/profileSheetStateUtils.ts`
- `FoodLens/hooks/usePermissionGuard.ts` (현재 미사용 정황)

중복 포인트:
- 권한 거부 시 Alert + 설정 이동 패턴 반복
- 유사한 권한 체크가 여러 파일에 분산

권장 리팩토링:
- `permissionUxService`/`permissionDialogs`로 최소 보조 UX 통합
- 미사용 `usePermissionGuard`는 삭제 또는 실제 공용 진입점으로 통합

안전 체크:
- OS 권한 상태 의존 로직 유지
- 권한 자동 요청 타이밍 변경 금지(기능 회귀 방지)

---

## P1 (고효율 대상)

### 3) 이미지 저장/영구화/해결 경로 중복
- `FoodLens/services/imageStorage.ts`
- `FoodLens/features/scanCamera/utils/scanCameraGatewayHelpers.ts`
- `FoodLens/features/result/services/photoLibraryService.ts`
- `FoodLens/components/profileSheet/utils/profileSheetStateUtils.ts`

중복 포인트:
- 파일 존재/용량 검증, copy/save, 실패 fallback, 로그 패턴 유사

권장 리팩토링:
- `imagePersistenceService` 계층으로 공통화
- 저장 대상(앱 내부/사진앱)만 전략 분리(`Strategy`)

안전 체크:
- 현재 로그/에러 문구/폴백 정책 유지
- 임시 파일 정리 루틴 누락 방지

### 4) Result 데이터 복원/분기 중복
- `FoodLens/hooks/result/useAnalysisData.ts`
- `FoodLens/hooks/result/analysisDataService.ts`
- `FoodLens/hooks/result/analysisDataUtils.ts`

중복 포인트:
- `fromStore`, `isBarcode`, `imageSource` resolve 분기 경로가 다층 분산

권장 리팩토링:
- `buildResultViewModel(params, store)` 단일 진입 함수로 통합

안전 체크:
- 복원 실패 시 null-state 반환 규칙 유지
- barcode fallback 이미지 처리 규칙 유지

---

## P2 (품질 향상 대상)

### 5) i18n 로컬라이즈 fallback 규칙 중복
- `FoodLens/features/home/utils/localizedFoodName.ts`
- `FoodLens/components/result/resultContent/utils/localizedNames.ts`
- `FoodLens/hooks/historyDataUtils.ts`

중복 포인트:
- `ko/en/fallback` 우선순위 규칙이 파일별로 중복 구현

권장 리팩토링:
- `services/i18n/nameResolver.ts` 공통 순수 함수로 통합

안전 체크:
- locale별 우선순위(`ko -> ko/en/fallback`, `en -> en/fallback/ko`) 동일성 보장

### 6) Alert 메시지 구성 중복
- `FoodLens/features/*/hooks/*.ts` 다수
- `FoodLens/components/profileSheet/hooks/useProfileSheetState.ts`

권장 리팩토링:
- `uiAlerts.ts`에 선언적 함수(`showOfflineAlert`, `showPermissionDeniedAlert`) 제공

안전 체크:
- 번역 키/기본 fallback 텍스트 그대로 유지

---

## P3 (안정화/정합성 대상)

### P3-1 사용자 컨텍스트/권한/네비게이션 정합성 통합
- 목표:
  - `TEST_UID` 하드코딩 단일화
  - 위치 권한 요청 플로우 공통화
  - `/result` 라우트 파라미터 생성 공통화
- 대상 파일(우선):
  - `FoodLens/features/**/constants/*.ts` (여러 `TEST_UID`)
  - `FoodLens/services/utils/location.ts`
  - `FoodLens/features/tripStats/services/tripStatsService.ts`
  - `FoodLens/features/home/services/homeNavigationService.ts`
  - `FoodLens/features/scanCamera/utils/scanCameraGatewayHelpers.ts`
  - `FoodLens/components/historyList/services/historyNavigationService.ts`
- 산출물:
  - `services/auth/currentUser.ts` (또는 동등 단일 소스)
  - `services/permissions/locationPermissionService.ts`
  - `features/result/services/resultNavigationService.ts`
- 완료 조건:
  - `TEST_UID` 상수 중복 제거
  - 위치 권한 요청 진입점 1개로 통일
  - `/result` 파라미터 조립 로직 중복 제거

### P3-2 타입 안정성 강화(any 축소)
- 목표:
  - 핵심 경로(`result`, `history`, `scan`)의 `any` 타입 축소
- 대상 파일(우선):
  - `FoodLens/hooks/result/useAnalysisData.ts`
  - `FoodLens/hooks/result/analysisDataService.ts`
  - `FoodLens/hooks/historyDataUtils.ts`
  - `FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts`
  - `FoodLens/features/scanCamera/services/scanCameraAnalysisService.ts`
- 산출물:
  - `ResultViewModel`, `HistoryListItem`, `AnalysisFlowRoute` 등 명시 타입
- 완료 조건:
  - 우선 대상 파일의 `any` 제거/축소
  - `npx tsc --noEmit` 통과

### P3-3 분석/알림/로깅 정책 정리
- 목표:
  - 서비스 레이어 Alert 직접 호출 정리
  - 로그 레벨/출력 정책 통일 (`__DEV__`/환경 분기)
- 대상 파일(우선):
  - `FoodLens/features/camera/services/cameraAnalysisService.ts`
  - `FoodLens/features/scanCamera/services/scanCameraAnalysisService.ts`
  - `FoodLens/features/history/utils/historyDialogs.ts`
  - `FoodLens/features/result/services/photoLibraryService.ts`
  - `FoodLens/services/analysisService.ts`
  - `FoodLens/services/userService.ts`
- 산출물:
  - `services/ui/uiAlerts.ts` 확장(서비스용 메시지 래퍼 포함)
  - `services/logger.ts` (또는 동등 logger wrapper)
- 완료 조건:
  - 서비스에서 UI Alert 직접 의존 최소화
  - 디버그 로그는 정책 기반 출력으로 통일

### P3-4 대형 훅 분해 및 유지보수성 개선
- 목표:
  - 대형 훅을 기능 단위로 분해해 테스트/수정 비용 감소
- 대상 파일(우선):
  - `FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts`
  - `FoodLens/features/camera/hooks/useCameraGateway.ts`
  - `FoodLens/hooks/historyDataUtils.ts`
- 산출물:
  - scan gateway 하위 모듈:
    - `useScanBarcodeFlow`
    - `useScanCaptureFlow`
    - `useScanGalleryFlow`
    - `useScanPermissionFlow`
- 완료 조건:
  - 기존 동작/네비게이션/알림 동일
  - 훅 파일 라인수/복잡도 감소
  - 핵심 경로 수동 회귀 점검 완료

---

## 제안 실행 순서 (리스크 최소화)
1. `P0-1` 분석 파이프라인 공통화
2. `P0-2` 권한/Alert 최소 공통화 + 미사용 권한 유틸 정리
3. `P1-3` 이미지 저장 흐름 통합
4. `P1-4` Result 복원 분기 통합
5. `P2-5` i18n fallback resolver 통합
6. `P2-6` Alert helper 통합
7. `P3-1` 사용자 컨텍스트/권한/네비게이션 정합성 통합
8. `P3-2` 타입 안정성 강화(any 축소)
9. `P3-3` 분석/알림/로깅 정책 정리
10. `P3-4` 대형 훅 분해

## Safety Checklist (공통)
- 입력/출력 타입 동일성 유지
- 네비게이션 파라미터(`fromStore`, `isNew`, `isBarcode`) 보존
- 기존 로그 문자열/레벨 유지(운영 추적성)
- 파일 저장/삭제 부수효과 순서 보존
- 권한 거부 시 UX(설정 이동) 유지
- 각 단계마다 `npx tsc --noEmit` + 핵심 흐름 수동 검증

## 참고
- 본 문서는 “대상 파일 조사 결과” 문서이며, 실제 코드 변경은 포함하지 않는다.
