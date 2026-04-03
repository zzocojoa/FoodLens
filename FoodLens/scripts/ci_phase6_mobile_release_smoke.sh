#!/usr/bin/env bash
set -euo pipefail

echo "[Phase6 Mobile Release Smoke] i18n/type/lint"
npm run i18n:release-gate

echo "[Phase6 Mobile Release Smoke] sync regression"
npm run test:sync-regression

echo "[Phase6 Mobile Release Smoke] core flow smoke"
npm run test:release-smoke

echo "[Phase6 Mobile Release Smoke] passed"
