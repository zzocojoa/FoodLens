---
name: foodlens-release-gate-automation
description: Use when establishing or enforcing FoodLens Phase 6 release gates across mobile and backend, including type/lint/contract/regression/smoke checks, staged rollout, and rollback readiness.
---

# FoodLens Release Gate Automation

Use this skill for Phase 6 work that turns release quality checks into mandatory automated gates.

## Scope
- CI gate definitions and merge-blocking policy.
- Contract and regression verification.
- Staged rollout and rollback runbook checks.

## Required Inputs
- Release branch/target environment.
- Mandatory gate set for this release.
- Rollout plan (1%, 5%, 20%, 100% or equivalent).

## Workflow
1. Lock the gate policy.
- Read `docs/roadmap/phase-6-release-gate-execution.md`.
- Confirm mandatory checks for this repo:
  - Type check and lint.
  - Contract tests / schema diff.
  - Automated regression (unit + E2E subset).
  - Post-deploy smoke test.

2. Wire gates into CI.
- Ensure every pull request runs all mandatory checks.
- Block merge on failure.
- Publish concise test and contract artifacts.

3. Enforce release sequencing.
- Execute staged rollout with hold points.
- Verify key KPIs before each rollout step.
- Keep feature flags for emergency remote disable.

4. Verify rollback readiness.
- Maintain rollback command/path per environment.
- Run rollback rehearsal at least once per cycle.
- Ensure on-call ownership and escalation path are documented.

## Definition of Done
- Mandatory gates are automated and non-bypassable in standard flow.
- Release candidate passes all gates and smoke checks.
- Staged rollout and rollback rehearsal are both completed.
- Runbook and owner matrix are current.

## Rollback
- Stop rollout at current stage on KPI regression.
- Roll back service/app version using pre-approved release artifact.
- Disable risky features via feature flags while incident triage proceeds.

## Output Format
- Gate pass/fail matrix with links to CI jobs.
- Rollout decision log by stage.
- Rollback readiness status and any gaps.
