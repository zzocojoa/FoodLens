# HistoryList 후속 리팩토링 대상 탐색 문서

작성일: 2026-02-13
대상 코드베이스: `FoodLens` (React Native + Expo + TypeScript)

## 목적
`components/HistoryList.tsx` 리팩토링 이후, 동일한 기준(조립형 컴포넌트 + 로직/사이드이펙트/유틸 분리)으로 추가 적용이 필요한 파일을 우선순위화한다.

## 평가 기준
- 파일 크기(라인 수)
- Hook 밀도 (`useState/useEffect/useMemo/useCallback`)
- 사이드이펙트 밀도 (`router.push/replace`, `dataStore`, `Alert`, timer, animation)
- 화면/기능 회귀 위험 대비 분리 효과

## 우선순위 결과

### P0 (즉시 권장)
1. `features/scanCamera/hooks/useScanCameraGateway.ts`
- 라인 수: 552
- 특징: 상태, 네트워크, Alert, 네비게이션, 애니메이션, 바코드/이미지 처리 로직이 단일 훅에 집중
- 권장 분리:
  - `hooks/useScanCameraState.ts` (로컬 UI 상태)
  - `services/scanCameraAnalysisService.ts` (분석/저장/이동)
  - `services/scanCameraBarcodeService.ts` (바코드 조회/캐시)
  - `utils/scanCameraError.ts` (에러 분기)

2. `components/historyMap/hooks/useHistoryMapState.ts`
- 라인 수: 302
- 특징: 타이머/인터벌 + 지도 계산 + 이벤트 핸들러 혼재
- 권장 분리:
  - `hooks/useHistoryMapEffects.ts` (타이머/사이드이펙트)
  - `utils/historyMapDerivations.ts` (cluster/visible marker 계산)
  - `services/historyMapInteractionService.ts` (지도 인터랙션 액션)

3. `features/camera/hooks/useCameraGateway.ts`
- 라인 수: 211
- 특징: scan 카메라 훅과 동일 패턴의 복합 책임
- 권장 분리:
  - 공통 카메라 액션 계층 도입(`features/camera/services/*`)
  - 게이트웨이 훅은 조립/이벤트 연결만 담당

### P1 (다음 배치)
4. `features/home/screens/HomeScreen.tsx`
- 라인 수: 263
- 특징: 화면 조립 + 상태/이벤트 처리 혼합
- 권장: container/presenter 분리

5. `features/profile/hooks/useProfileScreen.ts`
- 라인 수: 111
- 특징: 폼 상태 + 저장 흐름 + 사이드이펙트 결합
- 권장: validation/utils/service 분리

6. `features/tripStats/hooks/useTripStatsScreen.ts`
- 라인 수: 96
- 특징: 계산/화면 상태/토스트 트리거 결합
- 권장: 통계 계산 순수 함수화 우선

### P2 (중기 정리)
7. `features/result/screens/ResultScreen.tsx`
8. `features/history/screens/HistoryScreen.tsx`
9. `components/profileSheet/components/ProfileSheetView.tsx`

## 추천 실행 순서
1. `useScanCameraGateway.ts`
2. `useHistoryMapState.ts`
3. `useCameraGateway.ts`
4. `HomeScreen.tsx`

## 작업 원칙 (재확인)
- 기능/화면 동작 불변(behavior-preserving)
- 사이드이펙트는 hook/service로 격리
- 순수 계산은 utils로 분리하고 테스트 우선 적용
- 의존성 방향 고정:
  - `screen -> hook -> service -> utils/types`
  - 하위 계층에서 상위 계층 import 금지

## 완료 판정 체크리스트
- [ ] 기존 사용자 플로우 회귀 없음
- [ ] `npx tsc --noEmit` 통과
- [ ] `npm run lint` 에러 0 유지
- [ ] 신규 분리된 순수 함수 테스트 추가
- [ ] 순환 import 없음

