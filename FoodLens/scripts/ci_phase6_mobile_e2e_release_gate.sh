#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_DIR="artifacts/phase6/mobile-e2e-release-gate"
SUMMARY_FILE="${ARTIFACT_DIR}/gate-manifest.json"
LOG_FILE="${ARTIFACT_DIR}/jest.log"
DEVICE_EVIDENCE_FILE="${ARTIFACT_DIR}/real-device-evidence.json"

mkdir -p "${ARTIFACT_DIR}"

REAL_DEVICE_EVIDENCE_REQUIRED="false"
case "${MOBILE_E2E_REAL_DEVICE_EVIDENCE_REQUIRED:-0}" in
  1|true|TRUE|yes|YES)
    REAL_DEVICE_EVIDENCE_REQUIRED="true"
    ;;
  0|false|FALSE|no|NO|"")
    REAL_DEVICE_EVIDENCE_REQUIRED="false"
    ;;
  *)
    echo "[Phase6 Mobile E2E Release Gate] invalid MOBILE_E2E_REAL_DEVICE_EVIDENCE_REQUIRED=${MOBILE_E2E_REAL_DEVICE_EVIDENCE_REQUIRED}" >&2
    exit 2
    ;;
esac

IOS_REAL_DEVICE_EVIDENCE_URI="${MOBILE_E2E_IOS_REAL_DEVICE_EVIDENCE_URI:-}"
ANDROID_REAL_DEVICE_EVIDENCE_URI="${MOBILE_E2E_ANDROID_REAL_DEVICE_EVIDENCE_URI:-}"
IOS_REAL_DEVICE_RUNNER="${MOBILE_E2E_IOS_REAL_DEVICE_RUNNER:-}"
ANDROID_REAL_DEVICE_RUNNER="${MOBILE_E2E_ANDROID_REAL_DEVICE_RUNNER:-}"

export SUMMARY_FILE
export DEVICE_EVIDENCE_FILE
export REAL_DEVICE_EVIDENCE_REQUIRED
export IOS_REAL_DEVICE_EVIDENCE_URI
export ANDROID_REAL_DEVICE_EVIDENCE_URI
export IOS_REAL_DEVICE_RUNNER
export ANDROID_REAL_DEVICE_RUNNER

node <<'NODE'
const fs = require("fs");

const required = process.env.REAL_DEVICE_EVIDENCE_REQUIRED === "true";
const generatedAt = new Date().toISOString();

const stringValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const evidenceUriForPlatform = (platform) => {
  if (platform === "ios") {
    return stringValue(process.env.IOS_REAL_DEVICE_EVIDENCE_URI);
  }

  return stringValue(process.env.ANDROID_REAL_DEVICE_EVIDENCE_URI);
};

const runnerForPlatform = (platform) => {
  if (platform === "ios") {
    return stringValue(process.env.IOS_REAL_DEVICE_RUNNER);
  }

  return stringValue(process.env.ANDROID_REAL_DEVICE_RUNNER);
};

const platformEvidence = ["ios", "android"].map((platform) => {
  const evidenceUri = evidenceUriForPlatform(platform);
  const runner = runnerForPlatform(platform);

  return {
    platform,
    required,
    present: evidenceUri.length > 0,
    evidenceUri: evidenceUri.length > 0 ? evidenceUri : null,
    runner: runner.length > 0 ? runner : null,
  };
});

const evidence = {
  gate: "phase6-mobile-e2e-release-gate",
  generatedAt,
  realDeviceEvidenceRequired: required,
  acceptedEvidenceInputs: [
    "MOBILE_E2E_IOS_REAL_DEVICE_EVIDENCE_URI",
    "MOBILE_E2E_ANDROID_REAL_DEVICE_EVIDENCE_URI",
    "MOBILE_E2E_IOS_REAL_DEVICE_RUNNER",
    "MOBILE_E2E_ANDROID_REAL_DEVICE_RUNNER"
  ],
  platforms: platformEvidence,
};

const manifest = {
  gate: "phase6-mobile-e2e-release-gate",
  runner: "jest-expo",
  deviceRunnerConfigured: false,
  requiredFlows: [
    "login",
    "scan",
    "result",
    "history"
  ],
  realDeviceEvidence: {
    required,
    evidenceFile: "real-device-evidence.json",
    requiredPlatforms: [
      "ios",
      "android"
    ],
    platforms: platformEvidence.map((item) => ({
      platform: item.platform,
      present: item.present,
      runner: item.runner,
    })),
  },
};

fs.writeFileSync(process.env.DEVICE_EVIDENCE_FILE, `${JSON.stringify(evidence, null, 2)}\n`);
fs.writeFileSync(process.env.SUMMARY_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

if [[ "${REAL_DEVICE_EVIDENCE_REQUIRED}" == "true" ]]; then
  missing_platforms=()

  if [[ -z "${IOS_REAL_DEVICE_EVIDENCE_URI}" ]]; then
    missing_platforms+=("ios")
  fi

  if [[ -z "${ANDROID_REAL_DEVICE_EVIDENCE_URI}" ]]; then
    missing_platforms+=("android")
  fi

  if (( ${#missing_platforms[@]} > 0 )); then
    echo "[Phase6 Mobile E2E Release Gate] missing required real-device evidence for platforms=${missing_platforms[*]}" >&2
    echo "[Phase6 Mobile E2E Release Gate] set MOBILE_E2E_IOS_REAL_DEVICE_EVIDENCE_URI and MOBILE_E2E_ANDROID_REAL_DEVICE_EVIDENCE_URI to CI artifact, TestFlight/Play internal test, or manual QA evidence URLs" >&2
    exit 1
  fi
fi

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
