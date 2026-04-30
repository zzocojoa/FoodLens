#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_DIR="artifacts/phase6/mobile-e2e-release-gate"
SUMMARY_FILE="${ARTIFACT_DIR}/gate-manifest.json"
LOG_FILE="${ARTIFACT_DIR}/jest.log"

mkdir -p "${ARTIFACT_DIR}"

cat > "${SUMMARY_FILE}" <<'JSON'
{
  "gate": "phase6-mobile-e2e-release-gate",
  "runner": "jest-expo",
  "deviceRunnerConfigured": false,
  "requiredFlows": [
    "login",
    "scan",
    "result",
    "history"
  ],
  "realDeviceEvidenceRequired": [
    "ios",
    "android"
  ]
}
JSON

echo "[Phase6 Mobile E2E Release Gate] login / scan / result / history smoke suite"

npm run test -- --runInBand \
  features/auth/login/hooks/__tests__/useLoginScreen.test.ts \
  features/auth/login/screens/__tests__/LoginScreen.test.tsx \
  services/auth/__tests__/sessionManager.test.ts \
  features/scanCamera/hooks/__tests__/useScanCameraGateway.test.ts \
  features/scanCamera/hooks/__tests__/useScanLocalOnlyFlows.test.ts \
  features/scanCamera/hooks/__tests__/useScanBarcodeFlow.test.ts \
  features/scanCamera/services/__tests__/scanCameraAnalysisService.test.ts \
  features/result/screens/__tests__/ResultScreen.test.tsx \
  components/result/__tests__/ResultContent.test.tsx \
  hooks/result/__tests__/useAutoSave.test.ts \
  services/navigation/__tests__/resultEntryNavigation.test.ts \
  features/history/screens/__tests__/HistoryScreen.test.tsx \
  features/history/hooks/__tests__/useHistoryScreen.test.ts \
  hooks/__tests__/useHistoryData.test.ts \
  hooks/queries/__tests__/useHistoryQuery.test.ts \
  2>&1 | tee "${LOG_FILE}"

echo "[Phase6 Mobile E2E Release Gate] passed"
