# Phase 2 Cutover Rehearsal Evidence

## Scope

- Runbook: `docs/ops/db-cutover-local-to-render-postgres.md`
- Goal: verify local dump/restore integrity and Render restore path readiness.
- Rehearsal script: `backend/scripts/phase2_cutover_rehearsal.sh`
- Latest run timestamp: `20260225-224104` (local timezone)

## Environment Snapshot

- Local Postgres container: `foodlens-postgres` (healthy)
- Backend auth state mode: `AUTH_STATE_BACKEND=postgres`
- Auth state table/key: `auth_runtime_state` / `default`
- Render DB target (masked): `postgresql://foodlens_db_user:***@dpg-d6fd8eq4d50c73eant3g-a.virginia-postgres.render.com:5432/foodlens_db?sslmode=require`

## Execution Summary

1. Local backup (`pg_dump -Fc`, no TTY)  
   - Artifact: `artifacts/phase2/local-foodlens-20260225-224104.dump`
   - SHA256: `2e56756ecff9ab61c00746aba4ab4a7e037f89450f061ad69020f3d01dbf0781`
   - Dump catalog entries: `18`

2. Local restore rehearsal (`foodlens_restore_check`)  
   - Drop/Create DB: success
   - Restore: success
   - Public table count after restore: `1`
   - Artifacts:
     - `artifacts/phase2/local-restore-drop-20260225-224104.log`
     - `artifacts/phase2/local-restore-create-20260225-224104.log`
     - `artifacts/phase2/local-restore-run-20260225-224104.log`
     - `artifacts/phase2/local-restore-tablecount-20260225-224104.txt`

3. Render restore path check (non-destructive connection + restore attempt)
   - Connection smoke (`select now()`): failed
   - Restore attempt (`pg_restore` client container): failed
   - Common error:
     - `SSL connection has been closed unexpectedly`
   - Artifacts:
     - `artifacts/phase2/render-conn-smoke-20260225-224104.log`
     - `artifacts/phase2/render-restore-attempt-20260225-224104.log`
     - `artifacts/phase2/render-env-keys-20260225-224104.txt`
     - `artifacts/phase2/render-db-meta-20260225-224104.txt`
     - `artifacts/phase2/render-url-masked-20260225-224104.txt`
     - `artifacts/phase2/render-internal-smoke-hint-20260225-224104.txt`

4. Render web service shell DB smoke (runtime path)
   - Command context: Render web service shell (`srv-d5unl856ubrc73bsrarg`)
   - Result:
     - `DATABASE_URL_SET=True`
     - `db_smoke=(UTC timestamp, 'foodlens_db', 'foodlens_db_user')`
     - `auth_runtime_state_count=1`
   - Interpretation: application runtime path (`Render web service -> Render Postgres`) is working.

5. Rollback-safety check
   - Primary DB `auth_runtime_state` row count and restored DB row count matched at verification point: `4 / 4`
   - Temp restore DB cleanup executed: `DROP DATABASE`
   - Artifacts:
     - `artifacts/phase2/local-primary-auth-state-count.txt`
     - `artifacts/phase2/local-restore-auth-state-count.txt`
     - `artifacts/phase2/local-restore-cleanup.log`

## Verdict

- Local backup/restore rehearsal: **PASS**
- Render runtime DB connectivity (web service shell): **PASS**
- Render restore rehearsal from local environment: **FAIL (external network/TLS path)**
- Runbook readiness for full cutover: **PARTIAL** (runtime path validated, external restore rehearsal pending)

## Follow-up Required

1. Execute `pg_restore` rehearsal from Render-side network path (one-off job or equivalent) to close external TLS dependency.
2. Capture restore artifacts (`pg_restore` exit code `0`, restore log, post-restore verification query, rollback log).
3. Attach those artifacts and update verdict from **PARTIAL** to **PASS**.
