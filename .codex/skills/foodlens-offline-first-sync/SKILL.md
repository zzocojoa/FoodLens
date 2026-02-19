---
name: foodlens-offline-first-sync
description: Use when implementing FoodLens Phase 2-3 offline-first data migration and sync, including local-cache-first reads, server-source-of-truth writes, sync queue, idempotency keys, and conflict resolution.
---

# FoodLens Offline-First Sync

Use this skill for Phase 2 and Phase 3 work that migrates local data ownership to server-backed sync.

## Scope
- `/me/profile`, `/me/history`, `/me/allergies`, `/me/settings` integration.
- Local cache strategy and sync queue lifecycle.
- Conflict policy and idempotent writes.

## Required Inputs
- Target entities in this task (profile/history/allergies/settings).
- Conflict policy for each entity (LWW or manual merge).
- Retry/backoff policy and queue limits.

## Workflow
1. Confirm standards.
- Read `docs/roadmap/phase-2-cloud-db-execution.md` and `docs/roadmap/phase-3-sync-conflict-execution.md`.
- Confirm request/response shape in `docs/contracts/api-contracts.md`.

2. Implement local-first data path.
- Read path: UI <- local cache.
- Write path: UI -> local cache (optimistic) -> sync queue -> server.
- Namespace local cache by `user_id`.

3. Implement sync queue and idempotency.
- Queue states: `pending`, `sending`, `failed`, `synced`.
- Attach UUID idempotency key to each write operation.
- Exponential backoff retries with max-attempt cap.

4. Implement conflict handling.
- Default to LWW by server receive timestamp.
- Use manual merge flow for sensitive fields (for example allergies).
- Emit structured telemetry with `request_id` and `user_id`.

5. Validate migration and recovery.
- First-login migration from legacy local records to server.
- Device switch and reinstall restore checks.
- Offline/online transition tests for loss and duplication.

## Definition of Done
- No data loss or duplicate writes in offline/online test matrix.
- User A/B isolation is preserved across cache and server.
- Reinstall and device change restore user data successfully.
- Queue failures are visible and recoverable.

## Rollback
- Keep old read-only local data path behind fallback toggle.
- Pause sync dispatch while preserving queued events if server instability occurs.
- Disable manual-merge gate and fallback to safe LWW mode if merge UI is blocking delivery.

## Output Format
- Entity-by-entity migration status.
- Sync queue behavior summary with retry policy.
- Conflict decisions and unresolved edge cases.
