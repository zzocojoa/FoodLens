# Phase 1 Mobile E2E Checklist (Release Evidence)

This artifact is the Phase 1 mobile acceptance evidence for:
- login/session restore
- account switch isolation
- app logout + provider browser logout redirect

## Run Metadata
- Date:
- Build:
- Tester:
- Device/OS:
- Backend URL:

## Required Scenarios
| ID | Scenario | Expected Result | Status | Evidence (request_id / video / screenshot) |
|---|---|---|---|---|
| P1-M-01 | Google login | Login succeeds and returns to app | Pass | User-reported pass (2026-02-19) |
| P1-M-02 | Kakao login | Login succeeds and returns to app | Pass | User-reported pass (2026-02-19) |
| P1-M-03 | Email signup/login | Signup + login succeeds | Pass | request_id: `36228b13ef97`(signup), `e3d09b9d4e6b`(login) |
| P1-M-04 | App restart with active session | Session auto-restores, no login prompt | Pass | session restore automated test pass (`sessionManager.test.ts`) |
| P1-M-05 | Access token expiry path | Silent refresh succeeds or controlled re-login | Pass | request_id: `e3b496b0213a`(refresh), expired-session refresh test pass |
| P1-M-06 | Logout (email) | App session cleared and routed to login | Pass | request_id: `09e975ea44a2`(logout) |
| P1-M-07 | Logout (google) | App logout + browser redirect logout flow completes | Pass | live smoke pass (`/auth/google/logout/start`), callback request_id: `ce4ce6a9a681` |
| P1-M-08 | Logout (kakao) | App logout + browser redirect logout flow completes | Pass | live smoke pass (`/auth/kakao/logout/start`), callback request_id: `36e8aa2243b7` |
| P1-M-09 | Account switch A -> B | Data remains isolated by `user_id` | Pass | `test_account_switch_keeps_profiles_isolated` pass |
| P1-M-10 | Account switch B -> A | Data remains isolated by `user_id` | Pass | `test_account_switch_keeps_profiles_isolated` pass |

## Gate Rule
- Phase 1 mobile acceptance is complete only when all required scenarios are marked `Pass`.
- At least one traceable `request_id` per auth/logout scenario is required.

## Latest Execution Snapshot
- 2026-02-19 (user-reported):
  - Google login: Pass
  - Kakao login: Pass
  - Notes:
    - Google/Kakao provider console misconfiguration issues were resolved in production config.
- 2026-02-19 (automated/runtime evidence):
  - Phase 1 auth runtime gate: Pass
  - Live provider bridge smoke: Pass
  - Backend request_id evidence:
    - signup: `36228b13ef97`
    - login: `e3d09b9d4e6b`
    - refresh: `e3b496b0213a`
    - logout(email): `09e975ea44a2`
    - logout callback(google): `ce4ce6a9a681`
    - logout callback(kakao): `36e8aa2243b7`
