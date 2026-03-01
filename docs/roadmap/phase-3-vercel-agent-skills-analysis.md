# Phase 3: `vercel-labs/agent-skills` 탐색/분석 메모

## 1) 분석 범위

- 대상 저장소: `https://github.com/vercel-labs/agent-skills`
- 분석 시점: 2026-03-01
- 목적: Phase 3(동기화/충돌 정책)에서 추가 개선/재설계에 필요한 외부 스킬 적용 가능성 평가

## 2) 확인된 스킬 목록 (`skills/` 기준)

1. `claude.ai`
2. `composition-patterns`
3. `react-best-practices`
4. `react-native-skills`
5. `web-design-guidelines`

## 3) FoodLens Phase 3 적합도 매트릭스

| 스킬 | 적합도 | 적용 판단 | 근거 |
|---|---|---|---|
| `react-native-skills` | 높음 | **즉시 적용 권장** | FoodLens는 Expo + RN 기반이며, Queue/History UI 성능/상태표시에 직접 유효 |
| `composition-patterns` | 높음 | **즉시 적용 권장** | Manual Merge/충돌 UI를 boolean prop 확장 없이 Provider/Compound 구조로 재설계 가능 |
| `react-best-practices` | 중간 | 선택 적용 | Next.js 중심 규칙이 많아 RN에는 일부만 유효. 비동기 병렬화/재렌더 규칙은 참고 가치 있음 |
| `web-design-guidelines` | 낮음 | 조건부 적용 | 모바일 앱 본체에는 직접 영향 낮음. Web/운영 대시보드 도입 시 활용 |
| `claude.ai` | 낮음 | 비적용 | Codex 스킬 체계에서 Phase 3 구현/검증 직접 기여도가 낮음 |

## 4) 코드 기준 적용 포인트

- Sync Queue 엔진:
  - `FoodLens/services/sync/phase2SyncQueue.ts`
  - `FoodLens/services/sync/phase2Sync.types.ts`
  - `FoodLens/services/sync/phase2Api.ts`
- 백엔드 idempotency 저장:
  - `backend/modules/auth/service.py`
  - `backend/tests/runtime/test_auth_phase2_data.py`
- 히스토리/지도/리스트 UI:
  - `FoodLens/features/history/screens/HistoryScreen.tsx`
  - `FoodLens/components/HistoryList.tsx`
  - `FoodLens/components/historyList/components/HistoryListItemRenderer.tsx`

## 5) Phase 3 개선/재설계 제안

### A. 충돌 처리 모델 확장 (필수)

- 현재 큐 상태: `pending/sending/failed/synced`
- 제안: `conflicted` 상태를 명시적으로 추가하고, Manual Merge 경로를 상태머신으로 고정
- 적용 스킬:
  - `composition-patterns` (Provider + Compound Component 설계)
  - `react-native-skills` (상태 표시 UI/interaction 최적화)

### B. Manual Merge UI 분리 (필수)

- 제안 구조:
  - `SyncConflictProvider` (충돌 데이터 소유)
  - `ConflictResolutionSheet` (선택 UI)
  - `ConflictActionBar` (재시도/서버우선/내값우선 액션)
- 기대 효과:
  - Phase 3 DoD의 "중요 데이터 충돌 시 manual merge 경로 확인"을 명시적으로 충족

### C. Queue 가시성 개선 (권장)

- 제안:
  - 홈/히스토리 화면에 `pending/failed/conflicted` 카운트 배지
  - 실패 항목 개별 재시도 + 전체 재시도 버튼
- 적용 스킬:
  - `react-native-skills` (`list-performance-*`, `ui-*`, `react-state-*`)

### D. 성능/재렌더 가드 (권장)

- 제안:
  - History 리스트에서 item 렌더 안정화(콜백/스타일 객체 고정)
  - 동기화 상태 변경 시 불필요 리렌더 최소화
- 적용 스킬:
  - `react-native-skills` + `react-best-practices` 일부 규칙

## 6) 테스트 공백 및 보강 제안

- 현재 확인된 테스트는 idempotency/사용자 격리 중심이며, 충돌 Manual Merge 경로 검증은 부족함
- 추가 권장 테스트:
  - 큐 상태 전이 테스트(`failed -> conflicted -> resolved -> synced`)
  - 알레르기 충돌 시 Manual Merge 선택 결과 반영 테스트
  - 오프라인 연속 수정 + 온라인 복귀 시 LWW/merge 정책 검증

## 7) 결론

- Phase 3에서 외부 스킬은 `react-native-skills` + `composition-patterns`를 핵심으로 채택하는 것이 타당합니다.
- `react-best-practices`는 선택적 참고, `web-design-guidelines`는 Web 표면이 생길 때 활성화하는 전략이 적절합니다.
- 본 문서를 기준으로 Phase 3 실행표/검증 프롬프트에 외부 스킬 적용 항목을 추가합니다.

