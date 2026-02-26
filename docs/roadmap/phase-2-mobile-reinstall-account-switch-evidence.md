# Phase 2 Mobile Restore/Account-Switch Evidence

## Scope

- Phase 2 DoD:
  - app delete/reinstall + login restore
  - account switch isolation
  - server source of truth with local cache
- Platforms: iOS + Android (real device)

## Automated Gate Evidence

- Type check: pass
- Lint: pass
- Sync queue/mappers tests: pass
- Last local run: `2026-02-25`
- Command:
  - `cd FoodLens && bash scripts/ci_phase2_mobile_sync_smoke.sh`
- Local artifact:
  - `FoodLens/artifacts/phase2-mobile-sync-smoke.local.log`

## Real Device Evidence Matrix

### iOS

- [ ] Install app fresh
- [ ] Login with Account A
- [ ] Update profile/allergies/settings
- [ ] Add at least 1 history item
- [ ] Delete app
- [ ] Reinstall app and login with Account A
- [ ] Verify profile/allergies/settings/history restored
- [ ] Logout and login with Account B
- [ ] Verify Account A data is not visible
- Evidence paths:
  - Screenshot/video bundle: `artifacts/phase2/ios/`
  - Session/request logs: `artifacts/phase2/ios/logs/`

### Android

- [ ] Install app fresh
- [ ] Login with Account A
- [ ] Update profile/allergies/settings
- [ ] Add at least 1 history item
- [ ] Delete app
- [ ] Reinstall app and login with Account A
- [ ] Verify profile/allergies/settings/history restored
- [ ] Logout and login with Account B
- [ ] Verify Account A data is not visible
- Evidence paths:
  - Screenshot/video bundle: `artifacts/phase2/android/`
  - Session/request logs: `artifacts/phase2/android/logs/`

## Current Status

- Automated gate: **PASS**
- iOS real-device evidence: **PENDING**
- Android real-device evidence: **PENDING**
- Final Phase 2 mobile verdict: **PENDING real-device completion**
