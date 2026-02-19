---
name: foodlens-refresh-token-rotation-hardening
description: Use when implementing secure refresh-token rotation in FoodLens, including single-use refresh semantics, replay detection, revocation, and session invalidation strategy.
---

# FoodLens Refresh Token Rotation Hardening

Use this skill for refresh token security controls.

## Scope
- Access/refresh lifecycle, rotation, revocation.
- Replay/reuse detection and forced logout policy.

## Workflow
1. Review Phase 1 docs and current auth contracts.
2. Enforce one-time refresh token usage and issue replacement token per refresh.
3. On reuse detection, revoke session family and require re-auth.
4. Add tests for expiry, replay, concurrent refresh race.

## DoD
- Rotation works for normal flow.
- Reuse attack path is detected and blocked.
