---
name: foodlens-oauth-provider-integration
description: Use when implementing FoodLens social/email login provider integration for Phase 1, including Google/Kakao/Email OAuth wiring, callback validation, and provider-specific error handling.
---

# FoodLens OAuth Provider Integration

Use this skill for provider-level auth work.

## Scope
- Provider auth endpoints and callback handling.
- Redirect URI, PKCE/state, and error mapping.

## Workflow
1. Read `docs/roadmap/phase-1-login-session-execution.md` and `docs/contracts/api-contracts.md`.
2. Implement provider handlers and normalize output into a common auth response.
3. Add tests for success, cancel, invalid code, redirect mismatch.
4. Ensure logs include `request_id` and provider name only (no token leaks).

## DoD
- Google/Kakao/Email login all pass in stage.
- Provider errors map to stable app-facing codes.
