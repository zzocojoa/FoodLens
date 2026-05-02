#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_ROOT="${ROOT_DIR}/artifacts/phase6/mobile-store-evidence"
EXPECTED_ANDROID_PACKAGE="${PHASE6_EXPECTED_ANDROID_PACKAGE:-com.hoihou.foodlens}"

export FOODLENS_FORCE_CANONICAL_PACKAGE="${FOODLENS_FORCE_CANONICAL_PACKAGE:-1}"

require_env() {
  local name="$1"
  local value="${!name:-}"
  if [ -z "$value" ]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

normalize_submit_enabled() {
  local value="$1"
  case "$value" in
    0|1|true|false)
      ;;
    *)
      echo "PHASE6_SUBMIT_ENABLED must be one of: 0, 1, true, false" >&2
      exit 1
      ;;
  esac
}

build_platforms() {
  local platform="$1"
  case "$platform" in
    android)
      printf '%s\n' android
      ;;
    ios)
      printf '%s\n' ios
      ;;
    all)
      printf '%s\n' android ios
      ;;
    *)
      echo "PHASE6_PLATFORM must be one of: android, ios, all" >&2
      exit 1
      ;;
  esac
}

run_stamp() {
  if [ -n "${PHASE6_RUN_STAMP:-}" ]; then
    printf '%s\n' "${PHASE6_RUN_STAMP}"
    return
  fi
  date -u +"%Y%m%dT%H%M%SZ"
}

submit_enabled_flag() {
  local value="$1"
  if [ "$value" = "1" ] || [ "$value" = "true" ]; then
    printf '%s\n' "true"
    return
  fi
  printf '%s\n' "false"
}

assert_android_release_identity() {
  local expected_package="$1"

  EXPECTED_ANDROID_PACKAGE="${expected_package}" node <<'NODE'
const { resolveBuildIdentity } = require("./buildIdentity");

const expectedAndroidPackage = process.env.EXPECTED_ANDROID_PACKAGE;
const identity = resolveBuildIdentity({
  projectDir: process.cwd(),
  appVariant: process.env.APP_VARIANT,
  processEnv: process.env,
});

if (!identity.isCanonicalPackageContext) {
  console.error(
    `Phase 6 mobile store evidence requires canonical package context. ` +
      `Resolved androidPackage=${identity.androidPackage}, ` +
      `worktreeName=${identity.worktreeName}, ` +
      `FOODLENS_FORCE_CANONICAL_PACKAGE=${process.env.FOODLENS_FORCE_CANONICAL_PACKAGE || ""}.`
  );
  process.exit(1);
}

if (identity.androidPackage !== expectedAndroidPackage) {
  console.error(
    `Phase 6 Android store evidence resolved androidPackage=${identity.androidPackage}, ` +
      `expected ${expectedAndroidPackage}.`
  );
  process.exit(1);
}

console.log(`Android store evidence package: ${identity.androidPackage}`);
NODE
}

assert_release_identity_for_platforms() {
  local platform

  while IFS= read -r platform; do
    if [ "${platform}" = "android" ] && [ "${PHASE6_BUILD_PROFILE}" = "production" ]; then
      assert_android_release_identity "${EXPECTED_ANDROID_PACKAGE}"
    fi
  done < <(build_platforms "${PHASE6_PLATFORM}")
}

write_summary_header() {
  local summary_file="$1"
  {
    echo "# Phase 6 Mobile Store Evidence"
    echo
    echo "- git_sha: $(git rev-parse HEAD)"
    echo "- build_profile: ${PHASE6_BUILD_PROFILE}"
    echo "- submit_profile: ${PHASE6_SUBMIT_PROFILE}"
    echo "- submit_enabled: ${SUBMIT_ENABLED_NORMALIZED}"
    echo "- foodlens_force_canonical_package: ${FOODLENS_FORCE_CANONICAL_PACKAGE}"
    if [ -n "${PHASE6_SUBMIT_JUSTIFICATION:-}" ]; then
      echo "- submit_justification: ${PHASE6_SUBMIT_JUSTIFICATION}"
    fi
    if [ -n "${GITHUB_RUN_ID:-}" ]; then
      echo "- github_run_id: ${GITHUB_RUN_ID}"
    fi
    if [ -n "${GITHUB_SERVER_URL:-}" ] && [ -n "${GITHUB_REPOSITORY:-}" ] && [ -n "${GITHUB_RUN_ID:-}" ]; then
      echo "- run_url: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
    fi
    echo
  } > "${summary_file}"
}

append_platform_section() {
  local summary_file="$1"
  local platform="$2"
  local build_log="$3"
  local submit_log="$4"
  local submit_note="$5"

  {
    echo "## ${platform}"
    echo
    echo "- build_log: $(basename "${build_log}")"
    if [ -f "${submit_log}" ]; then
      echo "- submit_log: $(basename "${submit_log}")"
    fi
    if [ -f "${submit_note}" ]; then
      echo "- submit_note: $(basename "${submit_note}")"
    fi
    echo
  } >> "${summary_file}"
}

run_build() {
  local platform="$1"
  local build_log="$2"

  eas build \
    --platform "${platform}" \
    --profile "${PHASE6_BUILD_PROFILE}" \
    --non-interactive \
    --wait \
    2>&1 | tee "${build_log}"
}

run_submit() {
  local platform="$1"
  local submit_log="$2"

  eas submit \
    --platform "${platform}" \
    --profile "${PHASE6_SUBMIT_PROFILE}" \
    --latest \
    --non-interactive \
    2>&1 | tee "${submit_log}"
}

write_submit_note() {
  local platform="$1"
  local submit_note="$2"

  {
    echo "submit_skipped=true"
    echo "platform=${platform}"
    echo "justification=${PHASE6_SUBMIT_JUSTIFICATION}"
  } > "${submit_note}"
}

require_env PHASE6_PLATFORM
require_env PHASE6_BUILD_PROFILE
require_env PHASE6_SUBMIT_PROFILE
require_env PHASE6_SUBMIT_ENABLED
require_env EXPO_TOKEN
normalize_submit_enabled "${PHASE6_SUBMIT_ENABLED}"

SUBMIT_ENABLED_NORMALIZED="$(submit_enabled_flag "${PHASE6_SUBMIT_ENABLED}")"

if [ "${SUBMIT_ENABLED_NORMALIZED}" = "false" ] && [ -z "${PHASE6_SUBMIT_JUSTIFICATION:-}" ]; then
  echo "PHASE6_SUBMIT_JUSTIFICATION is required when submit is disabled." >&2
  exit 1
fi

assert_release_identity_for_platforms

STAMP="$(run_stamp)"
EVIDENCE_DIR="${ARTIFACT_ROOT}/${STAMP}"
SUMMARY_FILE="${EVIDENCE_DIR}/summary.md"

mkdir -p "${EVIDENCE_DIR}"
write_summary_header "${SUMMARY_FILE}"

while IFS= read -r platform; do
  BUILD_LOG="${EVIDENCE_DIR}/${platform}-build.log"
  SUBMIT_LOG="${EVIDENCE_DIR}/${platform}-submit.log"
  SUBMIT_NOTE="${EVIDENCE_DIR}/${platform}-submit-note.txt"

  run_build "${platform}" "${BUILD_LOG}"

  if [ "${SUBMIT_ENABLED_NORMALIZED}" = "true" ]; then
    run_submit "${platform}" "${SUBMIT_LOG}"
  else
    write_submit_note "${platform}" "${SUBMIT_NOTE}"
  fi

  append_platform_section "${SUMMARY_FILE}" "${platform}" "${BUILD_LOG}" "${SUBMIT_LOG}" "${SUBMIT_NOTE}"
done < <(build_platforms "${PHASE6_PLATFORM}")

echo "Evidence directory: ${EVIDENCE_DIR}"
