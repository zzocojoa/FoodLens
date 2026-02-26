#!/usr/bin/env bash
set -euo pipefail

echo "[Phase2 Mobile Smoke] type check"
npx tsc --noEmit

echo "[Phase2 Mobile Smoke] lint"
npm run lint

echo "[Phase2 Mobile Smoke] sync tests"
npx jest services/sync/__tests__/phase2SyncQueue.test.ts services/sync/__tests__/phase2Mappers.test.ts --runInBand

echo "[Phase2 Mobile Smoke] passed"
