# Phase 3 Sync/Conflict Evidence

## Scope

- Phase 3 DoD:
  - sync queue 상태 모델 동작 검증 (`pending/sending/failed/synced/conflicted`)
  - idempotency key 기반 중복 저장 방지 검증
  - LWW 기본 정책 + 민감 데이터 manual merge 경로 검증
  - 오프라인/온라인 전환 및 다중 기기 충돌 상황에서 유실/중복 0 검증
  - `request_id`, `user_id` 기반 추적 가능성 검증
- Platforms: iOS + Android (real device)
- Reference commit: `5d9d2ab` (Phase 3 consistency fix)

## Automated Gate Evidence

- Type check: pass
- Sync queue test: pass
- ProfileSheet conflict test: pass
- Health Profile conflict/pending test: pass
- Home dashboard auto-refresh subscription test: pass

### Commands

- `cd FoodLens && npm test -- useProfileSheetState --runInBand`
- `cd FoodLens && npm test -- useProfileScreen --runInBand`
- `cd FoodLens && npm test -- useHomeDashboard --runInBand`
- `cd FoodLens && npm test -- phase2SyncQueue --runInBand`
- `cd FoodLens && npx tsc --noEmit`

## Real Device Evidence Matrix

### Conflict Popup Verification

- [x] Profile 동시 변경 시 `Later / Keep Server / Keep This Device` 표시 확인
- [x] Health Profile(알러지) 동시 변경 시 `Later / Keep Server / Keep This Device` 표시 확인

### Cross-Device Immediate Reflection Verification

- [x] Android에서 프로필 이름 1회 저장 시 즉시 반영 + iOS 즉시 반영 확인
- [x] iOS에서 프로필 이름 1회 저장 시 즉시 반영 + Android 즉시 반영 확인

### Render Log Evidence (2026-03-02)

- Successful write traces:
  - `[Phase2Write] ... method=PUT path=/me/profile` + `PUT /me/profile HTTP/1.1 200 OK`
  - `[Phase2Write] ... method=PUT path=/me/allergies` + `PUT /me/allergies HTTP/1.1 200 OK`
  - `[Phase2Write] ... method=PUT path=/me/settings` + `PUT /me/settings HTTP/1.1 200 OK`
  - `[Phase2Write] ... method=POST path=/me/history` + `POST /me/history HTTP/1.1 200 OK`
- Conflict traces:
  - `[Auth] request failed ... code=PHASE2_CONFLICT`
  - `PUT /me/profile HTTP/1.1 409 Conflict`
  - `PUT /me/allergies HTTP/1.1 409 Conflict`

## External Skill Reflection (Phase 3)

- `react-native-skills` 적용 근거:
  - 훅 단위 상태 분기 테스트 추가(`useProfileScreen`, `useHomeDashboard`)
  - 화면 반영 지연 문제를 이벤트 구독 + 디바운스로 완화
- `composition-patterns` 적용 근거:
  - 프로필 갱신 이벤트 채널을 독립 모듈(`userProfileStore`)로 분리
  - `UserService`는 publish 역할, 화면 훅은 subscribe 역할로 책임 분리

## Final Verdict

- Phase 3 verdict: **PASS (완료)**
- DoD 판정:
  - sync queue 상태 모델: Pass
  - idempotency 중복 방지: Pass
  - LWW 기본 정책: Pass
  - manual merge 경로: Pass
  - 오프라인/온라인 전환 유실/중복 0: Pass (현재 증적 범위 내)
  - request_id/user_id 추적: Pass
  - 외부 스킬 적용 근거: Pass

## Residual Risks / Follow-up

- History/분석 저장 충돌을 사용자에게 어떻게 노출할지 UX 정책은 추가 확정 필요
- Observability 대시보드에 충돌 건수/해소율 패널 운영 고정 필요
- 장시간 soak 테스트(약한 네트워크, 다중 충돌 반복) 증적 축적 필요
