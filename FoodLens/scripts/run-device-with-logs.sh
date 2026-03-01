#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

PLATFORM="${1:-}"
BUILD_TYPE="${2:-debug}"
if [[ "$#" -ge 2 ]]; then
  shift 2
elif [[ "$#" -eq 1 ]]; then
  shift 1
fi

if [[ -z "${PLATFORM}" ]]; then
  echo "Usage: bash scripts/run-device-with-logs.sh <ios|android> [debug|release] [extra expo args...]"
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILTER_REGEX='request_id|user_id|AuthSession|Phase2Sync|\\[Auth\\]|AUTH_|SafeStorage|MMKV|Session bootstrap|Secure storage|No route named|unmatched route|AndroidRuntime|FATAL EXCEPTION|Process: com\\.hoihou\\.foodlens|Process: com\\.hoihou\\.foodlens\\.dev'
LOG_PID=""
LOG_FILE=""
ANDROID_MANIFEST_PATH="${PROJECT_DIR}/android/app/src/main/AndroidManifest.xml"

redact_sensitive_log_fields() {
  sed -E \
    -e 's/(code=)[^&[:space:]]+/\1[REDACTED]/g' \
    -e 's/(state=)[^&[:space:]]+/\1[REDACTED]/g' \
    -e 's/(access_token=)[^&[:space:]]+/\1[REDACTED]/g' \
    -e 's/(refresh_token=)[^&[:space:]]+/\1[REDACTED]/g' \
    -e 's/(id_token=)[^&[:space:]]+/\1[REDACTED]/g'
}

cleanup() {
  if [[ -n "${LOG_PID}" ]]; then
    kill "${LOG_PID}" >/dev/null 2>&1 || true
    wait "${LOG_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

resolve_ios_udid() {
  if [[ -n "${IOS_DEVICE_UDID:-}" ]]; then
    echo "${IOS_DEVICE_UDID}"
    return 0
  fi

  if ! command -v xcrun >/dev/null 2>&1; then
    return 1
  fi

  local line
  line="$(
    xcrun xctrace list devices 2>/dev/null \
      | grep -E "^[^=].*\([0-9A-F-]{8,}\)$" \
      | grep -v "Simulator" \
      | head -n 1 || true
  )"

  if [[ -z "${line}" ]]; then
    return 1
  fi

  echo "${line}" | sed -E 's/.*\(([0-9A-F-]+)\)$/\1/'
}

start_ios_logs() {
  mkdir -p "${PROJECT_DIR}/artifacts/phase2/ios/logs"
  LOG_FILE="${PROJECT_DIR}/artifacts/phase2/ios/logs/ios-${BUILD_TYPE}-${TIMESTAMP}.log"

  if ! command -v xcrun >/dev/null 2>&1; then
    echo "[run-with-logs] xcrun not found. iOS runtime log capture skipped."
    return
  fi

  local udid
  udid="$(resolve_ios_udid || true)"
  if [[ -z "${udid}" ]]; then
    echo "[run-with-logs] iOS device UDID not found. Set IOS_DEVICE_UDID to force log capture."
    echo "[run-with-logs] Continuing without iOS runtime log capture."
    return
  fi

  echo "[run-with-logs] iOS runtime logs -> ${LOG_FILE}"
  xcrun devicectl device log stream --device "${udid}" 2>&1 \
    | awk -v pattern="${LOG_FILTER_REGEX}" '$0 ~ pattern { print; fflush(); }' \
    | redact_sensitive_log_fields \
    | tee "${LOG_FILE}" >/dev/null &
  LOG_PID="$!"
}

start_android_logs() {
  mkdir -p "${PROJECT_DIR}/artifacts/phase2/android/logs"
  LOG_FILE="${PROJECT_DIR}/artifacts/phase2/android/logs/android-${BUILD_TYPE}-${TIMESTAMP}.log"

  if ! command -v adb >/dev/null 2>&1; then
    echo "[run-with-logs] adb not found. Android runtime log capture skipped."
    return
  fi

  adb start-server >/dev/null 2>&1 || true
  adb logcat -c >/dev/null 2>&1 || true

  echo "[run-with-logs] Android runtime logs -> ${LOG_FILE}"
  adb logcat -v time 2>&1 \
    | awk -v pattern="${LOG_FILTER_REGEX}" '$0 ~ pattern { print; fflush(); }' \
    | redact_sensitive_log_fields \
    | tee "${LOG_FILE}" >/dev/null &
  LOG_PID="$!"
}

EXPO_CMD=()

build_expo_command() {
  local platform="$1"
  local build="$2"
  shift 2

  case "${platform}" in
    ios)
      if [[ "${build}" == "release" ]]; then
        EXPO_CMD=(npx expo run:ios --configuration Release --device)
      else
        EXPO_CMD=(npx expo run:ios --device)
      fi
      ;;
    android)
      if [[ "${build}" == "release" ]]; then
        EXPO_CMD=(npx expo run:android --variant release --device)
      else
        EXPO_CMD=(npx expo run:android --device)
      fi
      ;;
    *)
      echo "Unsupported platform: ${platform}. Use ios or android."
      exit 1
      ;;
  esac

  if [[ "$#" -gt 0 ]]; then
    EXPO_CMD+=("$@")
  fi
}

resolve_android_launch_package() {
  if ! command -v adb >/dev/null 2>&1; then
    return 1
  fi

  local candidates=()
  if [[ -n "${ANDROID_LAUNCH_PACKAGE:-}" ]]; then
    candidates+=("${ANDROID_LAUNCH_PACKAGE}")
  fi
  candidates+=("com.hoihou.foodlens" "com.hoihou.foodlens.dev")

  local package_name
  for package_name in "${candidates[@]}"; do
    if adb shell pm path "${package_name}" >/dev/null 2>&1; then
      echo "${package_name}"
      return 0
    fi
  done

  return 1
}

force_launch_android_main() {
  if [[ "${PLATFORM}" != "android" ]]; then
    return
  fi

  if ! command -v adb >/dev/null 2>&1; then
    return
  fi

  local package_name
  package_name="$(resolve_android_launch_package || true)"
  if [[ -z "${package_name}" ]]; then
    package_name="${ANDROID_LAUNCH_PACKAGE:-com.hoihou.foodlens}"
  fi
  local activity_name="${ANDROID_LAUNCH_ACTIVITY:-.MainActivity}"
  local launch_output=""

  echo "[run-with-logs] Installed package candidates:"
  adb shell pm list packages | grep -E "com\\.hoihou\\.foodlens(\\.dev)?$" || true

  echo "[run-with-logs] Forcing launcher start: ${package_name}/${activity_name}"
  launch_output="$(
    adb shell am start -W \
    -a android.intent.action.MAIN \
    -c android.intent.category.LAUNCHER \
    -n "${package_name}/${activity_name}" 2>&1
  )" || true
  echo "${launch_output}"
  if echo "${launch_output}" | grep -q "Status: ok"; then
    return
  fi

  launch_output="$(adb shell monkey -p "${package_name}" -c android.intent.category.LAUNCHER 1 2>&1)" || true
  echo "${launch_output}"
  if echo "${launch_output}" | grep -q "Events injected: 1"; then
    echo "[run-with-logs] Fallback launch via monkey succeeded."
    return
  fi

  echo "[run-with-logs] Launcher start failed. Set ANDROID_LAUNCH_PACKAGE/ANDROID_LAUNCH_ACTIVITY if your app id differs."
}

cd "${PROJECT_DIR}"

# Ensure Android native build can read maps key even when it exists only in .env.
if [[ "${PLATFORM}" == "android" && -z "${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:-}" && -f "${PROJECT_DIR}/.env" ]]; then
  maps_key_line="$(grep -E '^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=' "${PROJECT_DIR}/.env" | tail -n 1 || true)"
  if [[ -n "${maps_key_line}" ]]; then
    export EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="${maps_key_line#EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=}"
    # Strip surrounding quotes if present.
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY%\"}"
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY#\"}"
    export EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    echo "[run-with-logs] Loaded EXPO_PUBLIC_GOOGLE_MAPS_API_KEY from .env for android build."
  fi
fi

if [[ "${PLATFORM}" == "android" ]]; then
  if [[ -z "${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:-}" ]]; then
    echo "[run-with-logs] ERROR: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is empty."
    echo "[run-with-logs] Set it in FoodLens/.env or current shell env before android build."
    exit 1
  fi
fi

if [[ "${PLATFORM}" == "android" ]]; then
  echo "[run-with-logs] Syncing native Android config via Expo prebuild..."
  npx expo prebuild --platform android --no-install
  if [[ -f "${ANDROID_MANIFEST_PATH}" ]]; then
    if ! rg -n "com.google.android.geo.API_KEY" "${ANDROID_MANIFEST_PATH}" >/dev/null; then
      echo "[run-with-logs] ERROR: AndroidManifest is missing com.google.android.geo.API_KEY meta-data."
      echo "[run-with-logs] Check app.config.js android.config.googleMaps.apiKey wiring."
      exit 1
    fi
  fi
fi

if [[ "${PLATFORM}" == "ios" ]]; then
  start_ios_logs
else
  start_android_logs
fi

# Local device log capture should not fail on missing Sentry org/project config.
if [[ "${BUILD_TYPE}" == "release" ]]; then
  export SENTRY_DISABLE_AUTO_UPLOAD=true
  export SENTRY_ALLOW_FAILURE=1
  echo "[run-with-logs] Local release run: Sentry upload failures are non-blocking."
  if [[ -n "${EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE+x}" ]]; then
    echo "[run-with-logs] EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE=${EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE} (user supplied)."
  else
    echo "[run-with-logs] EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE not set (default disabled)."
  fi
  if [[ -z "${SENTRY_ORG:-}" && -z "${SENTRY_PROPERTIES:-}" ]]; then
    echo "[run-with-logs] SENTRY_ORG/SENTRY_PROPERTIES not set. Sentry source map upload is disabled."
  fi
fi

build_expo_command "${PLATFORM}" "${BUILD_TYPE}" "$@"
echo "[run-with-logs] Running: ${EXPO_CMD[*]}"
"${EXPO_CMD[@]}"
force_launch_android_main

if [[ -n "${LOG_FILE}" && -n "${LOG_PID}" ]]; then
  echo "[run-with-logs] Build/install finished. Interact with app now."
  echo "[run-with-logs] Press Enter to stop log capture."
  read -r _
fi
