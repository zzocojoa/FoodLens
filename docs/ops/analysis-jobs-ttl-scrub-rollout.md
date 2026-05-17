# Analysis Jobs TTL Scrub Rollout

`analysis_jobs` stores temporary analysis payloads such as original image data, allergy text, image hashes, and model result JSON. TTL scrub removes those sensitive payload fields after the approved retention window while leaving an operational tombstone.

## Scope

- Table: `analysis_jobs`
- Default TTL: `30` days
- Scrubbed fields: `user_id`, `idempotency_key`, `image_base64`, `allergy_info`, `image_sha256`, `result_json`
- Runtime owner: `foodlens-retention-cron`
- Parity services: `foodlens-api`, `foodlens-worker`, `foodlens-retention-cron`

## Required Env Keys

All three Render services must define these keys before rollout:

```text
ANALYSIS_JOBS_TTL_SCRUB_ENABLED
ANALYSIS_JOBS_TTL_SCRUB_DRY_RUN
ANALYSIS_JOBS_TTL_SCRUB_DAYS
ANALYSIS_JOBS_TTL_SCRUB_BATCH_SIZE
```

Safe rollout defaults are:

```text
ANALYSIS_JOBS_TTL_SCRUB_ENABLED=0
ANALYSIS_JOBS_TTL_SCRUB_DRY_RUN=1
ANALYSIS_JOBS_TTL_SCRUB_DAYS=30
ANALYSIS_JOBS_TTL_SCRUB_BATCH_SIZE=100
```

## Preflight

Run the blueprint and live env checks without printing values:

```sh
bash backend/scripts/ci_render_blueprint_gate.sh
python .github/scripts/validate_render_live_env.py --blueprint render.yaml --presence-only
```

If an exhaustive Render env audit is needed, run:

```sh
python .github/scripts/validate_render_live_env.py --blueprint render.yaml --all-blueprint-env --presence-only
```

The live env check must report all four TTL scrub keys present on every parity service before enabling the cron path.

## Dry-Run Count Review

Dry-run must only report aggregate counts. Do not log row ids, user ids, image data, allergy text, hashes, result JSON, connection strings, bearer tokens, or secret values.

Review these fields:

```text
dry_run=true
ttl_days
batch_size
cutoff_at
eligible_total_count
eligible_batch_count
scrubbed_count=0
```

`eligible_batch_count` is capped by `ANALYSIS_JOBS_TTL_SCRUB_BATCH_SIZE`. If `eligible_batch_count == batch_size`, treat the backlog as potentially larger than one batch and require an explicit batch plan before execute.

Render one-off job stdout can be missing from the Logs API. In that case, use the Render Postgres connection-info endpoint for a read-only aggregate `SELECT COUNT(*)` check. Do not print the returned connection string.

## Execute Approval

Execute is approved only when all conditions are true:

- Live env parity is green for the four TTL scrub keys.
- Dry-run succeeds with `scrubbed_count=0`.
- The reviewed eligible count is expected and within the approved batch plan.
- Render Postgres recovery status is available and a pre-execute timestamp is recorded.
- A quiet window is approved.
- The operator accepts that DB recovery/PITR is the recovery path for scrubbed payload fields.

Execute is not needed when `eligible_total_count=0`.

## Enablement

Enable the cron path by changing only:

```text
ANALYSIS_JOBS_TTL_SCRUB_ENABLED=1
ANALYSIS_JOBS_TTL_SCRUB_DRY_RUN=1
```

After one or more dry-run cron passes are reviewed, execute by changing:

```text
ANALYSIS_JOBS_TTL_SCRUB_DRY_RUN=0
```

Keep `ANALYSIS_JOBS_TTL_SCRUB_BATCH_SIZE` small for the first execute pass.

## Post-Execute Verification

After execute, verify:

- The cron log reports `dry_run=false`.
- `scrubbed_count` matches the approved batch.
- A follow-up dry-run count decreases as expected.
- No raw payload fields appear in logs or artifacts.

Return to safe mode after the approved batch if continuous rollout is not intended:

```text
ANALYSIS_JOBS_TTL_SCRUB_DRY_RUN=1
ANALYSIS_JOBS_TTL_SCRUB_ENABLED=0
```

