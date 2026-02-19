---
name: foodlens-deletion-ttl-orchestration
description: Use when implementing FoodLens Phase 5 deletion and retention operations, including TTL cleanup jobs, deletion queue orchestration, and audit-safe account data removal.
---

# FoodLens Deletion and TTL Orchestration

Use this skill for privacy deletion operations.

## Scope
- Account/data deletion API and queue workers.
- TTL cleanup schedules and audit logging.

## Workflow
1. Read `docs/roadmap/phase-5-privacy-security-deletion-execution.md`.
2. Define deletion scope map (immediate vs deferred).
3. Implement queue producer/consumer and retry policy.
4. Add TTL batch cleanup and post-delete verification checks.

## DoD
- Delete requests are processed within SLA.
- No recoverable user data remains after completion.
