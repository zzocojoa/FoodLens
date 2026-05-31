# PR #173 Mobile Rollout Evidence and Decision

Date: 2026-05-31
Branch checked: `codex/release-logout-ui-mobile`
Commit checked: `4bbaf7044df95ffc7ad830bb7ab7cc5b210ad4c8`
Scope: backend deploy evidence, Android internal draft evidence, mobile logout UI rollout decision

## Decision

Status: PARTIAL GO.

Android internal draft evidence is GO for the PR #173 logout UI build. Broad mobile rollout is still NO-GO until iOS build/TestFlight evidence, current real-device E2E evidence, staged rollout hold points, and rollback readiness evidence are attached.

Backend status is GO: PR #173 is merged to `main`, Render deploy `dep-d8dvf6brjlhs73bj2310` is live, and `/health/ready` returned HTTP 200 with `ready=true` in `.gstack/deploy-reports/2026-05-31-pr173-deploy.md`.

Mobile UI status is rollout-required: the logout failure UX changes are client-side React Native changes and require a new EAS build plus TestFlight/Play Internal or store rollout before users receive them. Android now has current-sha EAS build and Play internal draft submission evidence. iOS still needs TestFlight or equivalent evidence.

## Local Evidence

- Current branch `codex/release-logout-ui-mobile` is based on PR #173 merge commit `4bbaf70`.
- PR #173 touched mobile logout UI/flow files including `FoodLens/components/ProfileSheet.tsx`, `FoodLens/features/profile/screens/ProfileHubScreen.tsx`, `FoodLens/services/auth/logoutFlow.ts`, i18n resources, and related Jest tests.
- `CHANGELOG.md` version `0.0.3.0` records the logout revoke failure handling changes.
- `FoodLens/eas.json` has `preview` and `production` build profiles targeting `https://foodlens-2-w1xu.onrender.com`; production submit config uses Android internal track with draft release status.
- `.github/workflows/` contains Phase 6 mobile rollout workflows: `mobile-bundle-size.yml`, `mobile-e2e-release-gate.yml`, and `phase6-mobile-store-evidence.yml`.
- PR #173 added named `AUTH_NETWORK_ERROR` UI tests for both `ProfileSheet` and `ProfileHubScreen`; the earlier QA gap is closed.
- `npm run release:env:gate` passed locally.
- `npm run phase6:mobile-performance:gate` passed locally with fresh export. Bundle summary path: `/var/folders/1z/jcg9l9h92g7g_0sl4jsmy35m0000gn/T/foodlens-mobile-bundle-export/mobile-bundle-size-summary.json`, `exportMode=fresh-export`.

## Android Store Evidence

- GitHub workflow: `Phase6 Mobile Store Evidence`
- Run URL: `https://github.com/zzocojoa/FoodLens/actions/runs/26708512966`
- Run status: success
- Artifact: `phase6-mobile-store-evidence-26708512966`
- Evidence summary timestamp: `20260531T090947Z`
- Build profile: `production`
- Submit profile: `production`
- Submit enabled: `true`
- Platform: Android
- EAS build ID: `1be9d648-3899-4529-b7a4-7e8c2b879e5d`
- EAS build status: finished
- Distribution: store
- App version: `1.0.0`
- Version code: `25`
- Commit: `4bbaf7044df95ffc7ad830bb7ab7cc5b210ad4c8`
- Fingerprint: `a777ebeeb0da024bc43ddef272de074f264a81a8`
- AAB artifact: `https://expo.dev/artifacts/eas/4rVgtoPmtYukWpeJUNvViF.aab`
- Submission ID: `979d32a2-9c99-42a0-aa3b-920c09b26f0f`
- Submission URL: `https://expo.dev/accounts/hoihou/projects/FoodLens/submissions/979d32a2-9c99-42a0-aa3b-920c09b26f0f`
- Submit result: `Submitted your app to Google Play Store`
- Play release track: internal
- Release status: draft

## Pending Gates

1. Produce iOS EAS build and TestFlight/Internal evidence for commit `4bbaf70`, or explicitly scope this release to Android only.
2. Run and attach `npm run phase6:mobile-e2e:release-gate` from `FoodLens/` with current iOS and Android real-device evidence URIs, or explicitly accept the risk if this remains internal-only.
3. Run actual staging integration smoke from `main` or `release/**` if this release is promoted beyond internal Android draft.
4. Run current postdeploy live smoke with rollback rehearsal reference before broad release.
5. Decide staged rollout hold points before promotion: 1%, 5%, 20%, 100%.
6. Confirm rollback path before rollout: stop staged rollout, keep the previous app build available, and verify backend health remains green.
7. Tighten branch protection/ruleset required checks to include `i18n-release-gate` before relying on release branch protection as the only gate.

## Release Call

Proceed with backend as already deployed. Android internal draft evidence for the logout UI change is complete. Do not promote beyond Android internal draft, and do not claim iOS user availability, until the pending gates above are complete or explicitly waived.
