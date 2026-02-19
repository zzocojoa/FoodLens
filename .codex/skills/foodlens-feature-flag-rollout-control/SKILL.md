---
name: foodlens-feature-flag-rollout-control
description: Use when implementing staged rollout and feature-flag controls for FoodLens releases, including percentage rollout, kill switch handling, and KPI-based promotion gates.
---

# FoodLens Feature Flag Rollout Control

Use this skill for controlled release exposure.

## Scope
- Percentage rollout stages and hold points.
- Feature flag defaults and remote disable procedure.

## Workflow
1. Read `docs/roadmap/phase-6-release-gate-execution.md`.
2. Configure rollout stages (1/5/20/100 or project policy).
3. Define KPI gates for promote/hold/rollback decisions.
4. Validate kill-switch runbook during rehearsal.

## DoD
- Stage transitions follow KPI gates.
- Remote disable path is verified.
