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

- [x] Install app fresh
- [x] Login with Account A
- [x] Update profile/allergies/settings
- [x] Add at least 1 history item
- [x] Delete app
- [x] Reinstall app and login with Account A
- [x] Verify profile/allergies/settings/history restored
- [x] Logout and login with Account B
- [x] Verify Account A data is not visible
- Evidence paths:
  - Screenshot/video bundle: `artifacts/phase2/ios/`
  - Session/request logs: `artifacts/phase2/ios/logs/`
  - Render live logs (2026-02-28):
    - `[Phase2Write] ... method=PUT path=/me/profile` + `PUT /me/profile HTTP/1.1 200 OK`
    - `[Phase2Write] ... method=PUT path=/me/allergies` + `PUT /me/allergies HTTP/1.1 200 OK`
    - `[Phase2Write] ... method=PUT path=/me/settings` + `PUT /me/settings HTTP/1.1 200 OK`
    - `[Phase2Write] ... method=POST path=/me/history` + `POST /me/history HTTP/1.1 200 OK`
    - `[Auth] logout success ...` + `POST /auth/logout HTTP/1.1 200 OK`

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
- iOS real-device evidence: **PASS**
- Android real-device evidence: **PENDING**
- Final Phase 2 mobile verdict: **PENDING Android real-device completion**
