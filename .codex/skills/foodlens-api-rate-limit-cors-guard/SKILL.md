---
name: foodlens-api-rate-limit-cors-guard
description: Use when adding API edge protections for FoodLens backend, including CORS policy, per-client rate limits, and standardized 429 handling across analysis endpoints.
---

# FoodLens API Rate Limit and CORS Guard

Use this skill for backend edge hardening.

## Scope
- CORS allow-list and headers.
- Rate limit policy, burst handling, and 429 contract.

## Workflow
1. Review `docs/roadmap/phase-4-ai-ops-execution.md` and current endpoints.
2. Add CORS middleware with explicit origin policy.
3. Add rate limiting per user/device/IP with safe defaults.
4. Verify 429 backoff behavior in mobile integration tests.

## DoD
- CORS and limits active on protected routes.
- 429 behavior is consistent and documented.
