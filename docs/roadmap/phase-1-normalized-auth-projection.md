# Phase 1: Normalized Auth/Data Projection (Optional)

## Goal

Keep the current runtime state backend unchanged while adding a low-risk bridge toward normalized tables in Postgres.

## What is implemented

- Existing source path remains intact:
  - `auth_runtime_state` snapshot (`state_json`) remains the authoritative runtime persistence.
- New optional projection path:
  - When `AUTH_NORMALIZED_PROJECTION_ENABLED=1`, every auth state persist also upserts to normalized projection tables.
  - Tables (prefix default: `auth_projection_`):
    - `users`
    - `profiles`
    - `allergies`
    - `settings`
    - `history`
    - `media_assets`

## New environment variables

- `AUTH_NORMALIZED_PROJECTION_ENABLED`
  - `0` (default): disabled
  - `1`: enabled
- `AUTH_PROJECTION_TABLE_PREFIX`
  - default: `auth_projection`

## Safety model

- Projection is additive and optional.
- If projection fails, runtime state snapshot persistence still runs first.
- No API contract changes in this phase.
- No schema cutover in this phase.

## Next phase candidates

1. Add read-side parity checks (`snapshot` vs `projection`) in CI/runtime smoke.
2. Add incremental projection update path (entity-level upsert only) to reduce write cost.
3. Move selected reads to projection under feature flag.
4. Final cutover and snapshot backend deprecation.
