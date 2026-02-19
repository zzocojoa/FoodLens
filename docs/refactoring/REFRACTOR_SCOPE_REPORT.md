# Refactor Scope Report

Date: 2026-02-13

## 목적
- 전수검사 기준으로 모듈화/리팩토링 적용 대상을 우선순위(P0/P1/P2)로 확정한다.
- 기능 변경 없이(behavior-preserving) 파일 단위 책임 분리를 진행한다.

## 우선순위 정의
- P0: 핵심 진입점, 네트워크/스토리지/권한/AI 추론 등 고위험 사이드이펙트 경로
- P1: 대형 조립 컴포넌트 및 복합 훅(화면 안정성/유지보수성 영향 큼)
- P2: 상수/타입/스타일/순수 유틸/설정 파일 중심

## 구분 규칙 (중요)
- `P0 Targets`: P0 전체 파일 집합(Full Set)
- `Execution Batches (P0 Subset)`: P0 집합을 작업 순서대로 나눈 하위 배치
- 관계: `Batch 1~5`는 모두 `P0 Targets`의 부분집합

## 작업 상태 (Updated: 2026-02-13)
- P0: 완료 (`Batch 1~10 완료`)
- P1: 완료 (`Batch P1-1~P1-6 완료`)
- P2: 완료 (`Batch P2-1~P2-5 완료`)
- 전체: 완료

## P0 Targets (Full Set)

[FILE] FoodLens/app/(tabs)/index.tsx
[FILE] FoodLens/app/allergies.tsx
[FILE] FoodLens/app/camera.tsx
[FILE] FoodLens/app/emoji-picker.tsx
[FILE] FoodLens/app/history.tsx
[FILE] FoodLens/app/profile.tsx
[FILE] FoodLens/app/result.tsx
[FILE] FoodLens/app/trip-stats.tsx
[FILE] FoodLens/app/scan/camera.tsx

[FILE] FoodLens/features/home/screens/HomeScreen.tsx
[FILE] FoodLens/features/home/hooks/useHomeDashboard.ts
[FILE] FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts
[FILE] FoodLens/features/scanCamera/screens/ScanCameraScreen.tsx
[FILE] FoodLens/features/camera/hooks/useCameraGateway.ts
[FILE] FoodLens/features/camera/screens/CameraScreen.tsx
[FILE] FoodLens/features/result/screens/ResultScreen.tsx
[FILE] FoodLens/features/result/hooks/useResultScreen.ts
[FILE] FoodLens/features/profile/screens/ProfileScreen.tsx
[FILE] FoodLens/features/profile/hooks/useProfileScreen.ts
[FILE] FoodLens/features/history/screens/HistoryScreen.tsx
[FILE] FoodLens/features/history/hooks/useHistoryScreen.ts
[FILE] FoodLens/features/tripStats/screens/TripStatsScreen.tsx
[FILE] FoodLens/features/tripStats/hooks/useTripStatsScreen.ts

[FILE] FoodLens/services/ai.ts
[FILE] FoodLens/services/aiCore/endpoints.ts
[FILE] FoodLens/services/aiCore/upload.ts
[FILE] FoodLens/services/analysisService.ts
[FILE] FoodLens/services/userService.ts
[FILE] FoodLens/services/imageStorage.ts
[FILE] FoodLens/services/dataStore.ts
[FILE] FoodLens/services/storage.ts
[FILE] FoodLens/services/utils/location.ts
[FILE] FoodLens/services/utils.ts

[FILE] backend/modules/analyst.py
[FILE] backend/modules/nutrition.py
[FILE] backend/modules/smart_router.py
[FILE] backend/modules/barcode/service.py
[FILE] backend/modules/barcode/clients/datago_client.py
[FILE] backend/modules/barcode/clients/openfoodfacts_client.py
[FILE] backend/modules/barcode/clients/public_data_client.py
[FILE] backend/modules/analyst_runtime/generation.py
[FILE] backend/modules/analyst_runtime/safety.py
[FILE] backend/modules/analyst_core/response_utils.py
[FILE] backend/modules/analyst_core/prompts.py
[FILE] backend/modules/analyst_core/schemas.py
[FILE] backend/modules/analyst_core/postprocess.py
[FILE] backend/server.py

## P1 Targets

[FILE] FoodLens/components/ProfileSheet.tsx
[FILE] FoodLens/components/HistoryMap.tsx
[FILE] FoodLens/components/HistoryList.tsx
[FILE] FoodLens/components/InfoBottomSheet.tsx
[FILE] FoodLens/components/BreakdownOverlay.tsx
[FILE] FoodLens/components/SpatialApple.tsx
[FILE] FoodLens/components/FloatingEmojis.tsx
[FILE] FoodLens/components/TravelerAllergyCard.tsx
[FILE] FoodLens/components/DateEditSheet.tsx
[FILE] FoodLens/components/BoundingBoxOverlay.tsx
[FILE] FoodLens/components/WeeklyStatsStrip.tsx
[FILE] FoodLens/components/weeklyStatsStrip/WeeklyStatsStripView.tsx
[FILE] FoodLens/components/historyMap/hooks/useHistoryMapState.ts
[FILE] FoodLens/components/historyMap/components/HistoryMapMarkers.tsx
[FILE] FoodLens/components/historyMap/components/HistoryMapOverlay.tsx
[FILE] FoodLens/components/historyMap/components/HistoryMapStatusLayers.tsx
[FILE] FoodLens/components/profileSheet/hooks/useProfileSheetState.ts
[FILE] FoodLens/components/profileSheet/hooks/useSheetGesture.ts
[FILE] FoodLens/components/result/ResultContent.tsx
[FILE] FoodLens/components/result/ResultHeader.tsx
[FILE] FoodLens/components/result/ActionButtons.tsx
[FILE] FoodLens/components/result/PinOverlay.tsx
[FILE] FoodLens/components/result/SpatialPin.tsx
[FILE] FoodLens/components/result/resultContent/components/ResultMetaHeader.tsx
[FILE] FoodLens/components/result/resultContent/components/IngredientsListWithExpand.tsx
[FILE] FoodLens/components/result/resultContent/components/IngredientItem.tsx
[FILE] FoodLens/components/result/resultContent/components/AllergyAlertCard.tsx
[FILE] FoodLens/components/result/resultContent/components/AiSummaryCard.tsx
[FILE] FoodLens/hooks/useHistoryData.ts
[FILE] FoodLens/hooks/result/useAnalysisData.ts
[FILE] FoodLens/hooks/result/useAutoSave.ts
[FILE] FoodLens/hooks/result/usePinLayout.ts
[FILE] FoodLens/hooks/result/useResultUI.ts

## P2 Targets

[FILE] FoodLens/components/**/styles.ts
[FILE] FoodLens/components/**/constants.ts
[FILE] FoodLens/components/**/types.ts
[FILE] FoodLens/components/**/utils/*.ts
[FILE] FoodLens/features/**/styles/*.ts
[FILE] FoodLens/features/**/constants/*.ts
[FILE] FoodLens/features/**/types/*.ts
[FILE] FoodLens/features/**/utils/*.ts
[FILE] FoodLens/services/aiCore/constants.ts
[FILE] FoodLens/services/aiCore/mappers.ts
[FILE] FoodLens/services/aiCore/types.ts
[FILE] FoodLens/services/utils/coordinates.ts
[FILE] FoodLens/services/utils/date.ts
[FILE] FoodLens/services/utils/emoji.ts
[FILE] FoodLens/services/utils/types.ts
[FILE] FoodLens/constants/theme.ts
[FILE] FoodLens/models/User.ts
[FILE] FoodLens/models/History.ts
[FILE] FoodLens/data/ingredients.ts
[FILE] FoodLens/utils/pinLayoutAlgorithm.ts
[FILE] FoodLens/app.config.js
[FILE] FoodLens/babel.config.js
[FILE] FoodLens/eslint.config.js
[FILE] FoodLens/jest.config.js
[FILE] FoodLens/expo-env.d.ts
[FILE] FoodLens/scripts/reset-project.js
[FILE] backend/modules/analyst_core/constants.py
[FILE] backend/modules/analyst_core/allergen_utils.py
[FILE] backend/modules/__init__.py
[FILE] scripts/remove_bg.py

## Execution Batches (P0 Subset)

### Batch 1 (Server Core) - 완료
#### Batch 1 START
[FILE] backend/modules/analyst.py
[FILE] backend/modules/nutrition.py
[FILE] backend/modules/smart_router.py
[FILE] backend/modules/barcode/service.py
[FILE] backend/server.py
#### Batch 1 END

### Batch 2 (AI / Network Services) - 완료
#### Batch 2 START
[FILE] FoodLens/services/ai.ts
[FILE] FoodLens/services/aiCore/endpoints.ts
[FILE] FoodLens/services/aiCore/upload.ts
[FILE] FoodLens/services/analysisService.ts
[FILE] FoodLens/services/userService.ts
#### Batch 2 END

### Batch 3 (Camera / Scan Flow) - 완료
#### Batch 3 START
[FILE] FoodLens/app/scan/camera.tsx
[FILE] FoodLens/app/camera.tsx
[FILE] FoodLens/features/scanCamera/hooks/useScanCameraGateway.ts
[FILE] FoodLens/features/scanCamera/screens/ScanCameraScreen.tsx
[FILE] FoodLens/features/camera/hooks/useCameraGateway.ts
[FILE] FoodLens/features/camera/screens/CameraScreen.tsx
#### Batch 3 END

### Batch 4 (Result / History / Profile) - 완료
#### Batch 4 START
[FILE] FoodLens/app/result.tsx
[FILE] FoodLens/features/result/screens/ResultScreen.tsx
[FILE] FoodLens/features/result/hooks/useResultScreen.ts
[FILE] FoodLens/app/history.tsx
[FILE] FoodLens/features/history/screens/HistoryScreen.tsx
[FILE] FoodLens/features/history/hooks/useHistoryScreen.ts
[FILE] FoodLens/app/profile.tsx
[FILE] FoodLens/features/profile/screens/ProfileScreen.tsx
[FILE] FoodLens/features/profile/hooks/useProfileScreen.ts
#### Batch 4 END

### Batch 5 (Home / Tabs / Remaining Entry) - 완료
#### Batch 5 START
[FILE] FoodLens/app/(tabs)/index.tsx
[FILE] FoodLens/features/home/screens/HomeScreen.tsx
[FILE] FoodLens/features/home/hooks/useHomeDashboard.ts
[FILE] FoodLens/app/allergies.tsx
[FILE] FoodLens/app/emoji-picker.tsx
[FILE] FoodLens/app/trip-stats.tsx
#### Batch 5 END

## Remaining Execution Batches

### P0 Remaining (Batch 6~10)

### Batch 6 (Client Storage / Shared Service State) - 완료
#### Batch 6 START
[FILE] FoodLens/services/storage.ts
[FILE] FoodLens/services/dataStore.ts
[FILE] FoodLens/services/imageStorage.ts
[FILE] FoodLens/services/utils.ts
[FILE] FoodLens/services/utils/location.ts
#### Batch 6 END

### Batch 7 (Analyst Runtime / Core Postprocess) - 완료
#### Batch 7 START
[FILE] backend/modules/analyst_runtime/generation.py
[FILE] backend/modules/analyst_runtime/safety.py
[FILE] backend/modules/analyst_core/response_utils.py
[FILE] backend/modules/analyst_core/postprocess.py
#### Batch 7 END

### Batch 8 (Analyst Core Contracts / Prompt) - 완료
#### Batch 8 START
[FILE] backend/modules/analyst_core/prompts.py
[FILE] backend/modules/analyst_core/schemas.py
#### Batch 8 END

### Batch 9 (Barcode Clients) - 완료
#### Batch 9 START
[FILE] backend/modules/barcode/clients/datago_client.py
[FILE] backend/modules/barcode/clients/openfoodfacts_client.py
[FILE] backend/modules/barcode/clients/public_data_client.py
#### Batch 9 END

### Batch 10 (Trip Stats Feature) - 완료
#### Batch 10 START
[FILE] FoodLens/features/tripStats/hooks/useTripStatsScreen.ts
[FILE] FoodLens/features/tripStats/screens/TripStatsScreen.tsx
#### Batch 10 END

### P1 Planned Batches (Batch P1-1~P1-6)

### Batch P1-1 (Map / History Composition) - 완료
#### Batch P1-1 START
[FILE] FoodLens/components/HistoryMap.tsx
[FILE] FoodLens/components/HistoryList.tsx
[FILE] FoodLens/components/historyMap/hooks/useHistoryMapState.ts
[FILE] FoodLens/components/historyMap/components/HistoryMapMarkers.tsx
[FILE] FoodLens/components/historyMap/components/HistoryMapOverlay.tsx
[FILE] FoodLens/components/historyMap/components/HistoryMapStatusLayers.tsx
[FILE] FoodLens/hooks/useHistoryData.ts
#### Batch P1-1 END

### Batch P1-2 (Profile / Sheet Interaction) - 완료
#### Batch P1-2 START
[FILE] FoodLens/components/ProfileSheet.tsx
[FILE] FoodLens/components/profileSheet/hooks/useProfileSheetState.ts
[FILE] FoodLens/components/profileSheet/hooks/useSheetGesture.ts
[FILE] FoodLens/components/InfoBottomSheet.tsx
[FILE] FoodLens/components/DateEditSheet.tsx
[FILE] FoodLens/components/TravelerAllergyCard.tsx
#### Batch P1-2 END

### Batch P1-3 (Result Container / Actions) - 완료
#### Batch P1-3 START
[FILE] FoodLens/components/result/ResultContent.tsx
[FILE] FoodLens/components/result/ResultHeader.tsx
[FILE] FoodLens/components/result/ActionButtons.tsx
[FILE] FoodLens/components/result/PinOverlay.tsx
[FILE] FoodLens/components/result/SpatialPin.tsx
[FILE] FoodLens/hooks/result/useResultUI.ts
[FILE] FoodLens/hooks/result/usePinLayout.ts
[FILE] FoodLens/hooks/result/useAnalysisData.ts
[FILE] FoodLens/hooks/result/useAutoSave.ts
#### Batch P1-3 END

### Batch P1-4 (Result Content Subcomponents) - 완료
#### Batch P1-4 START
[FILE] FoodLens/components/result/resultContent/components/ResultMetaHeader.tsx
[FILE] FoodLens/components/result/resultContent/components/IngredientsListWithExpand.tsx
[FILE] FoodLens/components/result/resultContent/components/IngredientItem.tsx
[FILE] FoodLens/components/result/resultContent/components/AllergyAlertCard.tsx
[FILE] FoodLens/components/result/resultContent/components/AiSummaryCard.tsx
[FILE] FoodLens/components/BreakdownOverlay.tsx
[FILE] FoodLens/components/BoundingBoxOverlay.tsx
#### Batch P1-4 END

### Batch P1-5 (Visual Motion / Dashboard Widgets) - 완료
#### Batch P1-5 START
[FILE] FoodLens/components/SpatialApple.tsx
[FILE] FoodLens/components/FloatingEmojis.tsx
[FILE] FoodLens/components/WeeklyStatsStrip.tsx
[FILE] FoodLens/components/weeklyStatsStrip/WeeklyStatsStripView.tsx
#### Batch P1-5 END

### Batch P1-6 (P1 Integration Sweep) - 완료
#### Batch P1-6 START
[FILE] FoodLens/components/ProfileSheet.tsx
[FILE] FoodLens/components/HistoryMap.tsx
[FILE] FoodLens/components/result/ResultContent.tsx
[FILE] FoodLens/hooks/result/useResultUI.ts
#### Batch P1-6 END

### P2 Planned Batches (Batch P2-1~P2-5)

### Batch P2-1 (Component / Feature Styles & Local Types) - 완료
#### Batch P2-1 START
[FILE] FoodLens/components/**/styles.ts
[FILE] FoodLens/components/**/constants.ts
[FILE] FoodLens/components/**/types.ts
[FILE] FoodLens/components/**/utils/*.ts
[FILE] FoodLens/features/**/styles/*.ts
[FILE] FoodLens/features/**/constants/*.ts
[FILE] FoodLens/features/**/types/*.ts
[FILE] FoodLens/features/**/utils/*.ts
#### Batch P2-1 END

### Batch P2-2 (Service Shared Types / Mappers / Helpers) - 완료
#### Batch P2-2 START
[FILE] FoodLens/services/aiCore/constants.ts
[FILE] FoodLens/services/aiCore/mappers.ts
[FILE] FoodLens/services/aiCore/types.ts
[FILE] FoodLens/services/utils/coordinates.ts
[FILE] FoodLens/services/utils/date.ts
[FILE] FoodLens/services/utils/emoji.ts
[FILE] FoodLens/services/utils/types.ts
#### Batch P2-2 END

### Batch P2-3 (Domain Model / App Constants / Data) - 완료
#### Batch P2-3 START
[FILE] FoodLens/constants/theme.ts
[FILE] FoodLens/models/User.ts
[FILE] FoodLens/models/History.ts
[FILE] FoodLens/data/ingredients.ts
[FILE] FoodLens/utils/pinLayoutAlgorithm.ts
#### Batch P2-3 END

### Batch P2-4 (Config / Tooling) - 완료
#### Batch P2-4 START
[FILE] FoodLens/app.config.js
[FILE] FoodLens/babel.config.js
[FILE] FoodLens/eslint.config.js
[FILE] FoodLens/jest.config.js
[FILE] FoodLens/expo-env.d.ts
[FILE] FoodLens/scripts/reset-project.js
#### Batch P2-4 END

### Batch P2-5 (Python Ancillary Utilities) - 완료
#### Batch P2-5 START
[FILE] backend/modules/analyst_core/constants.py
[FILE] backend/modules/analyst_core/allergen_utils.py
[FILE] backend/modules/__init__.py
[FILE] scripts/remove_bg.py
#### Batch P2-5 END

## Notes
- 본 문서는 리팩토링 순서 결정을 위한 계획 문서이며, 실제 커밋 단위는 배치별로 분리한다.
- 각 배치 완료 시 `tsc --noEmit` 및 핵심 플로우 수동 검증을 수행한다.
