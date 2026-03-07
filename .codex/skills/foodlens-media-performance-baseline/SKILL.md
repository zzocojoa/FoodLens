---
name: foodlens-media-performance-baseline
description: Use when establishing or repeating FoodLens media-path performance baselines under load, including /media/render latency, /me/profile checks, and optional /analyze/label traffic via k6.
---

# FoodLens Media Performance Baseline

Use this skill to run repeatable baseline measurements before/after performance changes.

## Scope
- `GET /media/render/{asset_id}` load path.
- `GET /me/profile` verification under auth.
- Optional mixed traffic for `POST /analyze/label`.

## Required Inputs
- `MEDIA_RENDER_URL` (signed render URL).
- `BASE_URL` (required if auth or analyze is enabled).
- `AUTH_BEARER_TOKEN` (optional for `/me/profile` checks).
- `ENABLE_ANALYZE=1` + `ANALYZE_PATH` for mixed analyze traffic.

## Use Existing Assets
- Baseline runbook: `docs/ops/media-performance-baseline.md`
- k6 scenario: `scripts/perf/k6-media-baseline.js`
- run wrapper: `scripts/perf/run-media-baseline.sh`

## Workflow
1. Validate prerequisites.
- Ensure `k6` is installed (`brew install k6`).
- Acquire one valid signed `MEDIA_RENDER_URL` from `/me/profile` or `/me/history`.

2. Set environment values.
- Export `BASE_URL`, `MEDIA_RENDER_URL`.
- Optionally export `AUTH_BEARER_TOKEN`.
- Optionally export analyze vars (`ENABLE_ANALYZE=1`, `ANALYZE_PATH`, `ANALYZE_LOCALE`, `ANALYZE_ALLERGY`).
- Tune load vars (`K6_VUS`, `K6_DURATION`, `THINK_TIME_MS`).

3. Execute baseline script.
- Run:
```bash
bash /Users/beatlefeed/Documents/FoodLens-project/scripts/perf/run-media-baseline.sh
```

4. Capture artifacts and summarize.
- Read:
  - `artifacts/perf/<timestamp>/summary.json`
  - `artifacts/perf/<timestamp>/k6.log`
- Report:
  - `http_req_failed.rate`
  - `render_latency p95`
  - `profile_latency p95`
  - `analyze_latency p95` (if enabled)

5. Compare before/after runs.
- Keep the same scenario and env for valid comparison.
- Flag regressions when p95 or failure rate worsens versus baseline.

## Definition of Done
- Baseline run completed with exported summary artifacts.
- Key metrics are reported in a comparable format.
- Pass/fail judgement is documented against current thresholds in `docs/ops/media-performance-baseline.md`.
