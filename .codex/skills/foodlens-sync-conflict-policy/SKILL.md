---
name: foodlens-sync-conflict-policy
description: Use when implementing FoodLens Phase 3 sync conflict handling, including LWW defaults, manual merge for sensitive fields, and idempotent retry-safe write behavior.
---

# FoodLens Sync Conflict Policy

Use this skill for conflict and consistency behavior.

## Scope
- LWW policy, manual merge triggers.
- Idempotency key handling and duplicate prevention.

## Workflow
1. Read `docs/roadmap/phase-3-sync-conflict-execution.md`.
2. Mark entity-level conflict strategy (LWW vs manual merge).
3. Attach idempotency key to all mutating requests.
4. Add offline->online test matrix and conflict scenario tests.

## DoD
- No duplicate writes under retry.
- Sensitive conflict cases invoke manual merge path.
