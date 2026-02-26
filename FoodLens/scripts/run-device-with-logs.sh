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
LOG_FILTER_REGEX='request_id|user_id|AuthSession|Phase2Sync|\[Auth\]'
LOG_PID=""
LOG_FILE=""

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

force_launch_android_release_main() {
  if [[ "${PLATFORM}" != "android" || "${BUILD_TYPE}" != "release" ]]; then
    return
  fi

  if ! command -v adb >/dev/null 2>&1; then
    return
  fi

  local package_name="${ANDROID_LAUNCH_PACKAGE:-com.hoihou.foodlens}"
  local activity_name="${ANDROID_LAUNCH_ACTIVITY:-.MainActivity}"

  echo "[run-with-logs] Forcing launcher start: ${package_name}/${activity_name}"
  if ! adb shell am start \
    -a android.intent.action.MAIN \
    -c android.intent.category.LAUNCHER \
    -n "${package_name}/${activity_name}" >/dev/null 2>&1; then
    echo "[run-with-logs] Launcher start failed. Set ANDROID_LAUNCH_PACKAGE/ANDROID_LAUNCH_ACTIVITY if your app id differs."
  fi
}

cd "${PROJECT_DIR}"

if [[ "${PLATFORM}" == "ios" ]]; then
  start_ios_logs
else
  start_android_logs
fi

build_expo_command "${PLATFORM}" "${BUILD_TYPE}" "$@"
echo "[run-with-logs] Running: ${EXPO_CMD[*]}"
"${EXPO_CMD[@]}"
force_launch_android_release_main

if [[ -n "${LOG_FILE}" && -n "${LOG_PID}" ]]; then
  echo "[run-with-logs] Build/install finished. Interact with app now."
  echo "[run-with-logs] Press Enter to stop log capture."
  read -r _
fi
