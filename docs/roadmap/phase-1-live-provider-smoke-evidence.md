# Phase 1 Live Provider Smoke Evidence

- Date (UTC): 2026-02-20T12:56:05Z
- Workflow: `Phase1 Live Provider Smoke`
- Run ID: `22224958415`
- Run URL: https://github.com/zzocojoa/FoodLens/actions/runs/22224958415
- Ref: `main`
- Commit: `97d81ab`
- Input `auth_public_base_url`: `https://foodlens-2-w1xu.onrender.com`

## Artifact

- Artifact name: `phase1-live-provider-smoke-log`
- Artifact ID: `5589552604`
- Retention: 14 days

## Log Summary

- `[Smoke] google-start OK` -> `accounts.google.com`
- `[Smoke] kakao-start OK` -> `kauth.kakao.com`
- `[Smoke] google-logout-start OK` -> `accounts.google.com`
- `[Smoke] kakao-logout-start OK` -> `kauth.kakao.com`
- Final: `[Smoke] Live provider bridge smoke checks passed.`

## Source Workflow

- `.github/workflows/phase1-live-provider-smoke.yml`
- `backend/scripts/ci_auth_live_provider_smoke.sh`
