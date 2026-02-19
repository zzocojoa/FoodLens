---
name: foodlens-ci-policy-enforcement
description: Use when enforcing FoodLens CI policy gates, including mandatory type/lint/contract/test checks, merge blocking rules, and non-bypassable release quality controls.
---

# FoodLens CI Policy Enforcement

Use this skill for repository-level quality enforcement.

## Scope
- Required CI jobs and branch protection.
- Merge-blocking and exception process.

## Workflow
1. Align mandatory checks with Phase 6 release gates.
2. Set branch protections for required job completion.
3. Ensure contract diffs and regression tests are included.
4. Track and report policy violations.

## DoD
- Required checks are enforced on protected branches.
- Non-compliant PRs cannot merge by default.
