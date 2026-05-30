# Mobile Feature Sync Inventory

## 목적

FoodLens 모바일 앱의 사용자 기능이 `완전 sync`, `부분 sync`, `로컬 only` 중 어디에 속하는지 현재 코드 기준으로 정리한다.

판단 기준:

- `완전 sync`: 사용자 데이터가 로컬 캐시 + 서버 sync queue/pull 경로로 관리되고, 기능의 핵심 결과가 cross-device 일관성을 목표로 한다.
- `부분 sync`: 핵심 데이터 일부는 sync되지만, 화면 동작이나 일부 편집 기능은 로컬에만 머문다.
- `로컬 only`: 디바이스 UI 상태 또는 OS 자원 기반 기능으로, 서버/계정 sync 경로가 없다.

## 완전 sync

| 기능 | 근거 | 메모 |
| --- | --- | --- |
| 프로필 기본 정보 | `FoodLens/services/userService.ts` `getUserProfile`, `CreateOrUpdateProfile` | 사용자 프로필을 user-scoped local cache에 저장하고 Phase2 queue로 profile/allergies/settings를 동기화한다. |
| 프로필 이미지 | `FoodLens/features/profile/profileHub/services/profileHubService.ts`, `FoodLens/services/sync/phase2SyncQueue.ts`, `FoodLens/components/SecureImage.tsx` | 편집 이미지는 media upload 자산으로 올린 뒤 `profile_image_asset_id`와 signed render URL을 sync한다. 업로드 실패 시 이미지 없는 profile payload를 synced 처리하지 않고 retry 가능한 queue 상태로 유지한다. |
| 알러지 / 식이 제한 / 심각도 | `FoodLens/features/profile/utils/profilePersistence.ts`, `FoodLens/services/userService.ts` | 프로필 저장 경로를 그대로 타므로 cross-device sync 대상이다. |
| Traveler Card Language | `FoodLens/components/profileSheet/services/profileSheetService.ts` `updateTravelerLanguage` | 로컬 i18n store를 즉시 갱신하고, 이후 프로필 settings로 저장해 sync한다. |
| 앱 UI 언어 설정 데이터 | `FoodLens/components/profileSheet/services/profileSheetService.ts` `updateSettingsLanguage`, `FoodLens/features/i18n/services/i18nStore.ts` | 설정값을 로컬 store + 프로필 snapshot + 원격 settings pull 경로로 맞춘다. |
| 대표 이모지 선택 | `FoodLens/features/emojiPicker/services/emojiPickerService.ts` | 선택 이모지가 `UserService.updateUserProfile`를 타므로 settings sync 대상이다. |
| 여행 시작 정보 | `FoodLens/features/tripStats/services/tripStatsService.ts` `startTrip` | 현재 여행 시작 시점/위치를 프로필에 저장하므로 sync된다. |
| 새 분석 결과 저장 | `FoodLens/hooks/result/useAutoSave.ts`, `FoodLens/hooks/result/autoSaveService.ts`, `FoodLens/services/analysisService.ts` `saveAnalysis` | 결과 생성 시 history 엔티티로 enqueue/flush까지 수행한다. |
| 분석 이미지 | `FoodLens/services/analysisService.ts`, `FoodLens/services/sync/phase2SyncQueue.ts`, `FoodLens/components/FoodThumbnail.tsx` | history 이미지도 media upload 자산과 signed render URL로 동기화한다. 서버 반영 후 로컬 history 저장소와 React Query cache를 같이 갱신해 홈/히스토리/다른 기기 표시가 같은 자산을 바라보게 한다. |
| 결과 날짜 수정 | `FoodLens/features/result/hooks/useResultSideEffects.ts` `useDateUpdateAction`, `FoodLens/services/analysisService.ts` `updateAnalysisTimestamp` | 날짜 수정 시 로컬 cache/query cache를 즉시 갱신하고 `timestamp_patch` history queue로 서버까지 동기화한다. |

## 부분 sync

| 기능 | 근거 | 메모 |
| --- | --- | --- |
| 온보딩 완료 상태 | `FoodLens/features/onboarding/services/onboardingProfileService.ts`, `FoodLens/services/onboardingGateService.ts` | 온보딩에서 저장한 프로필/알러지/settings 증거는 sync되지만, `onboarding complete` 플래그 자체는 로컬 저장이다. 다른 기기에서는 서버 evidence로 완료 여부를 재판정한다. |
| 홈 대시보드 | `FoodLens/features/home/hooks/useHomeDashboard.ts`, `FoodLens/app/_layout.tsx` | 히스토리/프로필은 sync-backed 데이터지만, 선택 날짜/모달 상태/애니메이션은 로컬 상태다. |
| 여행 통계 화면 | `FoodLens/features/tripStats/services/tripStatsService.ts`, `FoodLens/services/user/profileAnalysisLoader.ts` | 통계의 원본 데이터는 sync-backed 프로필/히스토리이지만, 현재 위치 조회와 토스트 표시는 로컬 런타임이다. |
| 히스토리 / Food Passport | `FoodLens/services/analysisService.ts` `getAllAnalyses`, `deleteAnalyses`, `syncHistoryFromCloud`; `FoodLens/features/history/hooks/useHistoryScreen.ts` | 기록 저장/삭제는 sync되지만, map/list 모드, selection, expanded country, map region은 로컬 상태다. |
| 결과 화면 전체 | `FoodLens/hooks/result/useAutoSave.ts`, `FoodLens/features/result/hooks/useResultSideEffects.ts` | 결과 생성과 날짜 수정은 sync되지만, 결과 화면의 사진 저장과 일부 화면 상태는 로컬 only다. |
| 지도 표시 기능 | `FoodLens/features/history/screens/HistoryScreen.tsx`, `FoodLens/hooks/useHistoryData.ts` | 지도에 쓰는 데이터는 sync-backed history지만, 지도 사용 가능 여부와 UI 상태는 디바이스/빌드 의존이다. |
| 인증 기능 | `FoodLens/services/auth/sessionManager.ts`, `FoodLens/features/auth/login/hooks/useLoginScreen.ts` | 계정 인증은 서버 기반이지만, 세션 저장은 디바이스 local secure storage이고 로그인 화면 UI state는 로컬이다. |
| 계정 삭제 / 계정 전환 로컬 footprint | `FoodLens/services/auth/deletionService.ts`, `FoodLens/services/auth/sessionManager.ts`, `FoodLens/services/storage.ts`, `FoodLens/services/imageStorage.ts` | 삭제 요청 상태는 서버와 연동되지만, 완료 후 기기에서는 secure session, MMKV/AsyncStorage, 분석 backup, pending analysis, AI/barcode cache, sync queue, managed image를 로컬에서 지운다. 계정 전환은 이전 사용자 snapshot/cache와 이전 사용자 참조 managed image를 지운다. |

## 로컬 only

| 기능 | 근거 | 메모 |
| --- | --- | --- |
| 테마 설정 | `FoodLens/contexts/ThemeContext.tsx` | `@user_theme_preference`를 `SafeStorage`에만 저장한다. profile/settings sync 경로와 연결되지 않는다. |
| 카메라 모드 / 줌 / 플래시 | `FoodLens/features/scanCamera/screens/ScanCameraScreen.tsx` | 촬영 화면 런타임 state로만 관리된다. 계정 데이터로 저장하지 않는다. |
| 권한 상태 UI | `FoodLens/features/scanCamera/hooks/useScanPermissionFlow.ts`, `FoodLens/features/onboarding/services/onboardingPermissionService.ts` | OS 권한 요청/안내 흐름이며 서버 sync 대상이 아니다. |
| 기기 사진첩 저장 | `FoodLens/features/result/services/photoLibraryService.ts` | MediaLibrary/FileSystem 기반 로컬 저장이다. |
| 오프라인 배너 | `FoodLens/hooks/useNetworkStatus.ts` | 현재 디바이스의 네트워크 상태를 구독해 표시하는 UI다. |
| 카메라 촬영 인터랙션 | `FoodLens/features/scanCamera/hooks/useScanCaptureFlow.ts`, `FoodLens/features/scanCamera/hooks/useScanBarcodeFlow.ts` | 셔터, 바코드 ROI, 진동, 경고 다이얼로그 같은 상호작용은 로컬 런타임 로직이다. |
| 분석 전 임시 결과 버퍼 | `FoodLens/services/dataStore.ts` | 결과 화면 전환용 crash-recovery backup이며 디바이스 내부 저장만 사용한다. |

## 핵심 결론

- 현재 앱은 `모든 기능`이 개인화/동기화 로직으로 구성된 것은 아니다.
- 다만 `사용자 데이터 축`은 대부분 sync 중심이다.
  - 프로필
  - 알러지
  - 언어 설정
  - 이모지
  - 여행 시작 정보
  - 분석 히스토리 저장/삭제
- 반대로 `UI/디바이스 축`은 대부분 로컬 중심이다.
  - 테마
  - 카메라 런타임 제어
  - 권한 UI
  - 사진첩 저장
  - 오프라인 배너
- 현재 남은 공백은 주로 `UI/디바이스 상태` 쪽이다.
  - 테마
  - 권한/카메라 런타임
  - 사진첩 저장
  - 일부 화면 전용 상태

## 다음 우선순위

1. `테마`를 계정 settings로 올릴지 결정
2. `온보딩 완료 여부`를 별도 sync 필드로 둘지, 현재처럼 evidence 기반 판정으로 유지할지 결정
3. `UI/디바이스 상태` 중 어디까지를 계정 sync 대상으로 올릴지 결정
