---
name: foodlens-mobile-e2e-release-gate
description: Use when building and maintaining FoodLens mobile E2E regression gates for release readiness, covering login, scan, result, and history core user journeys.
---

# FoodLens Mobile E2E Release Gate

Use this skill for mobile release regression automation.

## Scope
- Core flow E2E scenarios.
- CI execution reliability and flaky test controls.

## Workflow
1. Define minimum critical flows per release.
2. Implement deterministic fixtures and environment setup.
3. Run E2E in CI with artifact capture on failure.
4. Enforce gate policy for release candidates.

## DoD
- Core journeys pass in CI.
- Failures include replayable artifacts.
