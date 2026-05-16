# Analysis Jobs Privacy Backfill Runbook

## Purpose

Use this runbook when old `analysis_jobs` rows might retain recoverable user data after account/data deletion or after anonymous/device/ip-scoped jobs exceed the original-data retention window.

The script is `backend/scripts/backfill_analysis_jobs_privacy.py`.

## What It Scrubs

The execute path clears recoverable user data from targeted `analysis_jobs` rows:

- `user_id`
- `idempotency_key`
- `allergy_info`
- `image_base64`
- `image_sha256`
- `result_json`
- worker lease and fallback/error detail fields

Rows are marked with `error_code=USER_DATA_DELETED`. Re-running the script is idempotent because already scrubbed rows are counted as skipped.

## Go Criteria

Run execute only after all items are true:

- The exact script commit is deployed on the Render service used for the one-off job.
- A production dry-run JSON has been captured from that deployed service.
- The anonymous cutoff is approved. FoodLens default original-data TTL is 30 days.
- Render Postgres point-in-time recovery is `AVAILABLE`, and the pre-execute timestamp is recorded.
- The operator accepts that app deploy rollback does not restore scrubbed DB fields. Only DB restore/PITR can recover them.
- The expected target counts are small enough for one transaction, or a batch-specific plan has been approved.
- Execute is scheduled for a quiet window. If the target set includes rows that might still be processed by `foodlens-worker`, suspend/scale down the worker first or stop and design a batch-specific plan.
- If the dry-run fails because auth state is empty while user-scoped jobs exist, do not use `--allow-empty-auth-state` unless the active-user source has been independently verified and approved for this run.

## Dry-Run

Run only from the deployed Render service environment so `DATABASE_URL` and table env keys match production:

```bash
python -u backend/scripts/backfill_analysis_jobs_privacy.py --dry-run --anonymous-older-than-days 30
```

Capture only the structured aggregate JSON. Do not copy raw database URLs or secret values into tickets.

## Execute

Execute requires explicit confirmation:

```bash
python -u backend/scripts/backfill_analysis_jobs_privacy.py --execute --confirm-production-backfill --anonymous-older-than-days 30
```

The script protects the execute path with:

- transaction-scoped advisory lock
- transaction-local `lock_timeout`
- transaction-local `statement_timeout`
- rollback if scrubbed row counts do not match the pre-execute target counts

Optional timeout controls:

- `ANALYSIS_JOBS_PRIVACY_BACKFILL_LOCK_TIMEOUT_MS`
- `ANALYSIS_JOBS_PRIVACY_BACKFILL_STATEMENT_TIMEOUT_MS`
- `ANALYSIS_JOBS_PRIVACY_BACKFILL_LOCK_KEY`

## Post-Execute Verification

Immediately run the same dry-run command again.

Expected result:

- `total.target = 0`
- scrubbed rows from execute appear under `already_user_data_deleted.skipped`
- `/health/ready` remains `200` and `ready=true`

## Failure Handling

If dry-run or execute fails, use the structured error payload only. The script redacts database URLs, bearer tokens, common secret key/value pairs, `user_id` values, and Postgres key-detail values before printing.

If execute commits but the result is wrong, do not use app rollback as the recovery path. Before any DB restore/cutover, stop new writes by scaling down web/worker writers or putting the API into maintenance. Use Render Postgres PITR or restore into a new database, then decide whether to cut over `DATABASE_URL`.
