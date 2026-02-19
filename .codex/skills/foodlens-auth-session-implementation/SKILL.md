---
name: foodlens-auth-session-implementation
description: Use when implementing or refactoring FoodLens authentication/session flows (Phase 1), including /auth endpoints, refresh-token rotation, secure token storage, and user_id ownership boundaries across backend and mobile.
---

# FoodLens Auth Session Implementation

Use this skill for Phase 1 work tied to auth and session integrity.

## Scope
- Backend auth endpoints and token lifecycle.
- Mobile login/session wiring and secure token storage.
- User ownership guards and account-switch isolation.

## Required Inputs
- Target phase/ticket ID.
- Provider scope (Google/Kakao/Email).
- Environment list (dev/stage/prod).

## Workflow
1. Confirm current contracts and roadmap context.
- Read `docs/contracts/api-contracts.md`.
- Read `docs/roadmap/master-plan.md` and `docs/roadmap/phase-1-login-session-execution.md`.

2. Implement backend auth surface.
- Add/adjust endpoints: `/auth/*` and `/me/*`.
- Enforce token expiry and refresh-token rotation.
- Reject reused/invalidated refresh tokens.
- Ensure logs include `request_id` and `user_id` for failures.

3. Implement mobile session handling.
- Centralize identity source to auth result only.
- Store tokens in secure storage (Keychain/Keystore), not AsyncStorage.
- Restore session on app launch, fallback to re-login on hard failure.
- On logout/account switch, clear session-scoped caches.

4. Add tests and gates.
- Backend: success, expiry, reuse detection, logout, account switch.
- Mobile: startup restore, refresh path, logout, account switch isolation.
- Update CI checks to fail on auth regression.

## Definition of Done
- Login/logout/refresh pass for all in-scope providers.
- Account A/B switch produces zero data leakage.
- Session restore works after app restart.
- Contracts and docs updated with any field changes.

## Rollback
- Keep previous auth route handlers behind feature flag or branch guard.
- Revert to prior token validation path if refresh rotation causes production lockout.
- Disable provider-specific login route independently if one provider is unstable.

## Output Format
- Change summary by area: backend, mobile, tests, docs.
- Explicit list of new/changed endpoints.
- Residual risks and follow-up tasks.
