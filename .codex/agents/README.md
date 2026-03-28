# FoodLens Subagent Operating Rules

## 목적

이 문서는 FoodLens 저장소에서 Codex custom subagent를 운용할 때의 기본 규칙을 정의한다.

핵심 원칙은 세 가지다.

1. `화면별`이 아니라 `아키텍처 경계별`로 agent를 나눈다.
2. 공용 orchestration 파일은 동시에 한 agent만 수정한다.
3. built-in `explorer`는 상시 고정 agent가 아니라 필요할 때만 ad hoc으로 사용한다.

## 기본 구성

기본 roster는 아래 4개로 고정한다.

- `mobile-experience-owner`
- `analysis-platform-owner`
- `sync-contract-owner`
- `release-ci-owner`

built-in `explorer`는 별도 고정 roster에 넣지 않는다.

## Agent Ownership

### mobile-experience-owner

담당 범위:

- `FoodLens/app`
- `FoodLens/components`
- `FoodLens/features`
- `FoodLens/contexts`
- `FoodLens/hooks`

대표 파일:

- `FoodLens/components/ProfileSheet.tsx`
- `FoodLens/components/profileSheet/components/ProfileSheetView.tsx`
- `FoodLens/features/home/screens/HomeScreen.tsx`
- `FoodLens/features/history/screens/HistoryScreen.tsx`
- `FoodLens/features/result/screens/ResultScreen.tsx`

주 용도:

- Android/iOS UI 차이
- gesture, modal, theme, layout 문제
- 화면 단위 UX 수정

수정 금지 경계:

- `FoodLens/services/sync`
- `FoodLens/services/userService.ts`
- `FoodLens/services/analysisService.ts`
- `backend/server.py`
- `backend/contracts/openapi.json`

### analysis-platform-owner

담당 범위:

- `backend/modules/analysis_jobs.py`
- `backend/modules/analyst_core`
- `backend/modules/analyst_runtime`
- `backend/modules/media`
- `backend/modules/barcode`

대표 파일:

- `backend/modules/analyst_runtime/food_analyst.py`
- `backend/modules/analyst_core/schemas.py`
- `backend/modules/analyst_core/response_utils.py`
- `backend/modules/media/service.py`
- `backend/modules/barcode/service.py`

주 용도:

- async analysis job
- photo, label, barcode 결과
- media upload/render
- prompt/schema/localized response 문제

수정 금지 경계:

- `FoodLens/services/sync`
- `FoodLens/services/userService.ts`
- `backend/modules/auth/service.py`

### sync-contract-owner

담당 범위:

- `FoodLens/services/sync`
- `FoodLens/services/userService.ts`
- `FoodLens/services/analysisService.ts`
- `FoodLens/services/aiCore`
- `backend/modules/auth/service.py`
- `backend/modules/contracts`
- `backend/contracts/openapi.json`

대표 파일:

- `FoodLens/services/sync/phase2SyncQueue.ts`
- `FoodLens/services/sync/phase2Api.ts`
- `FoodLens/services/sync/phase2Mappers.ts`
- `FoodLens/services/sync/clientState.ts`
- `FoodLens/services/sync/phase2Sync.types.ts`

주 용도:

- history/profile/settings/allergies sync
- `updated_at`, conflict, LWW
- mobile-backend contract 변경
- OpenAPI diff
- durable client state

수정 금지 경계:

- 순수 UI 스타일링
- pure analysis prompt 튜닝

### release-ci-owner

담당 범위:

- `render.yaml`
- `.github/workflows`
- `FoodLens/scripts`
- `backend/scripts`
- 브랜치, 커밋, push, PR, CI, device release logs

대표 파일:

- `.github/workflows/contracts.yml`
- `.github/workflows/mobile-sync-regression.yml`
- `.github/workflows/pr-policy.yml`
- `render.yaml`
- `FoodLens/scripts/run-android-device-release-with-logs.sh`

주 용도:

- commit/push/PR
- CI fail triage
- Render 배포
- contract gate
- device release verification

수정 금지 경계:

- 제품 로직 본문 대규모 변경

## Chokepoint Files

아래 파일은 동시에 둘 이상의 agent가 수정하면 안 된다.

- `FoodLens/app/_layout.tsx`
- `FoodLens/services/sync/phase2SyncQueue.ts`
- `FoodLens/services/userService.ts`
- `FoodLens/services/analysisService.ts`
- `backend/server.py`
- `backend/contracts/openapi.json`
- `render.yaml`

이 파일들은 항상 `주 소유 agent 1개`만 쓰기 권한을 가진다.

## Spawn Rules

### 시작 규칙

- 작업이 작으면 `agent 없이 메인 thread`에서 처리한다.
- 범위가 불명확하면 built-in `explorer`를 먼저 띄운다.
- 실제 코드 변경은 `주 소유 agent 1개`부터 시작한다.

### 병렬 규칙

- UI 문제: `mobile-experience-owner`
- analysis/media/barcode 문제: `analysis-platform-owner`
- sync/contracts 문제: `sync-contract-owner`
- PR/CI/배포 문제: `release-ci-owner`

교차 작업일 때만 두 번째 writer agent를 추가한다.

- UI + sync: `mobile-experience-owner` + `sync-contract-owner`
- backend + contracts: `analysis-platform-owner` + `sync-contract-owner`
- 코드 + 릴리즈: 구현 agent + `release-ci-owner`

### 금지 규칙

- `feature별` agent를 새로 만들지 않는다.
- `이슈 전용` agent를 고정 roster에 넣지 않는다.
- 같은 작업에서 `backend/server.py` 와 `FoodLens/app/_layout.tsx` 를 여러 agent가 동시에 건드리지 않는다.

## Review And Handoff

- explorer는 영향 범위와 관련 파일만 정리한다.
- writer agent는 자기 소유 범위만 수정한다.
- chokepoint 파일 변경이 필요하면 주 소유 agent에게 handoff한다.
- `release-ci-owner`는 기본적으로 코드 작성자가 아니라 마지막 검증자다.

## Recommended Settings

권장 Codex agent 설정은 아래와 같다.

- `agents.max_threads = 4`
- `agents.max_depth = 1`
- `agents.job_max_runtime_seconds = 2700`

이 저장소는 공용 orchestration 파일이 많아서, thread 수를 늘릴수록 충돌 비용이 커진다.
또한 device release 검증과 배포 확인이 섞여서 job runtime은 너무 짧게 두지 않는 편이 낫다.

프로젝트용 설정 예시는 아래 파일에 둔다.

- `.codex/config.example.toml`

## Practical Default

실무 기본 조합은 아래다.

- 기본 작업: `explorer` 1개 또는 writer 1개
- 일반 기능 작업: writer 1개
- cross-stack 작업: writer 2개
- release 포함 작업: writer 1개 + `release-ci-owner`

항상 `최소 수의 agent`로 시작하고, 범위가 실제로 갈라질 때만 추가한다.
