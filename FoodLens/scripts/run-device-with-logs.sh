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
PACKAGE_FAMILY_REGEX='com\\.hoihou\\.foodlens(\\.[A-Za-z0-9_]+)*'
LOG_FILTER_REGEX="request_id|user_id|AuthSession|Phase2Sync|\\\\[Auth\\\\]|AUTH_|SafeStorage|MMKV|Session bootstrap|Secure storage|No route named|unmatched route|AndroidRuntime|FATAL EXCEPTION|Process: ${PACKAGE_FAMILY_REGEX}"
LOG_PID=""
LOG_FILE=""
ANDROID_MANIFEST_PATH="${PROJECT_DIR}/android/app/src/main/AndroidManifest.xml"
MAPS_KEY_PLACEHOLDER="__MISSING_GOOGLE_MAPS_API_KEY__"
ANDROID_METRO_PORT="${ANDROID_METRO_PORT:-8081}"
DEFAULT_ANDROID_METRO_PORT="8081"

enforce_clean_worktree() {
  if [[ "${ALLOW_DIRTY_DEVICE_BUILD:-0}" == "1" ]]; then
    echo "[run-with-logs] ALLOW_DIRTY_DEVICE_BUILD=1 set. Skipping git clean check."
    return 0
  fi

  if ! command -v git >/dev/null 2>&1; then
    return 0
  fi

  if ! git -C "${PROJECT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi

  local dirty
  dirty="$(git -C "${PROJECT_DIR}" status --porcelain)"
  if [[ -n "${dirty}" ]]; then
    echo "[run-with-logs] ERROR: Working tree is not clean."
    echo "[run-with-logs] Mixed local changes can re-introduce already fixed sync bugs."
    echo "[run-with-logs] Commit/stash first, then rebuild device app."
    echo "[run-with-logs] Changed files:"
    echo "${dirty}"
    echo "[run-with-logs] Override only if intentional: ALLOW_DIRTY_DEVICE_BUILD=1"
    exit 1
  fi
}

load_build_identity() {
  if ! command -v node >/dev/null 2>&1; then
    echo "[run-with-logs] ERROR: node not found. Cannot resolve build identity."
    exit 1
  fi

  local build_identity_output=""
  build_identity_output="$(
    node "${PROJECT_DIR}/buildIdentity.js" shell "${PROJECT_DIR}" "${APP_VARIANT:-}"
  )"
  eval "${build_identity_output}"

  if [[ -z "${ANDROID_LAUNCH_PACKAGE:-}" ]]; then
    export ANDROID_LAUNCH_PACKAGE="${FOODLENS_BUILD_ANDROID_PACKAGE}"
  fi

  if [[ -z "${IOS_BUNDLE_IDENTIFIER:-}" ]]; then
    export IOS_BUNDLE_IDENTIFIER="${FOODLENS_BUILD_IOS_BUNDLE_IDENTIFIER}"
  fi
}

print_build_fingerprint() {
  echo "[run-with-logs] Build fingerprint:"
  echo "[run-with-logs]   worktree: ${FOODLENS_BUILD_WORKTREE_NAME}"
  echo "[run-with-logs]   source: ${FOODLENS_BUILD_SOURCE_LABEL}"
  echo "[run-with-logs]   variant: ${FOODLENS_BUILD_APP_VARIANT}"
  echo "[run-with-logs]   install track: ${FOODLENS_BUILD_INSTALL_TRACK}"
  echo "[run-with-logs]   android package: ${FOODLENS_BUILD_ANDROID_PACKAGE}"
  echo "[run-with-logs]   ios bundle: ${FOODLENS_BUILD_IOS_BUNDLE_IDENTIFIER}"
  echo "[run-with-logs]   branch: ${FOODLENS_BUILD_GIT_BRANCH:-unknown}"
  echo "[run-with-logs]   commit: ${FOODLENS_BUILD_GIT_COMMIT_SHORT_SHA:-unknown}"
  echo "[run-with-logs]   dirty: ${FOODLENS_BUILD_GIT_DIRTY}"
}

enforce_release_install_identity() {
  if [[ "${BUILD_TYPE}" != "release" ]]; then
    return 0
  fi

  if [[ "${FOODLENS_BUILD_CANONICAL_CONTEXT}" == "1" && "${FOODLENS_BUILD_APP_VARIANT}" == "production" ]]; then
    return 0
  fi

  if [[ "${FOODLENS_ALLOW_NONCANONICAL_RELEASE:-0}" == "1" ]]; then
    echo "[run-with-logs] WARN: FOODLENS_ALLOW_NONCANONICAL_RELEASE=1 set. Continuing with non-canonical release install."
    return 0
  fi

  echo "[run-with-logs] ERROR: Local release installs must come from the canonical production worktree."
  echo "[run-with-logs] Current worktree: ${FOODLENS_BUILD_WORKTREE_NAME}"
  echo "[run-with-logs] Current variant: ${FOODLENS_BUILD_APP_VARIANT}"
  echo "[run-with-logs] Current install track: ${FOODLENS_BUILD_INSTALL_TRACK}"
  echo "[run-with-logs] Current android package: ${FOODLENS_BUILD_ANDROID_PACKAGE}"
  echo "[run-with-logs] Canonical worktree: ${FOODLENS_BUILD_CANONICAL_WORKTREE_NAME}"
  echo "[run-with-logs] Use the canonical worktree or set FOODLENS_ALLOW_NONCANONICAL_RELEASE=1 only for an explicit exception."
  exit 1
}

run_with_timeout() {
  local timeout_secs="$1"
  shift

  "$@" &
  local cmd_pid=$!
  local elapsed=0

  while kill -0 "${cmd_pid}" >/dev/null 2>&1; do
    if (( elapsed >= timeout_secs )); then
      kill "${cmd_pid}" >/dev/null 2>&1 || true
      wait "${cmd_pid}" >/dev/null 2>&1 || true
      return 124
    fi
    sleep 1
    ((elapsed+=1))
  done

  wait "${cmd_pid}"
}

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

resolve_android_device_serial() {
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    echo "${ANDROID_SERIAL}"
    return 0
  fi

  if ! command -v adb >/dev/null 2>&1; then
    return 1
  fi

  local line=""
  line="$(
    adb devices -l 2>/dev/null \
      | awk 'NR > 1 && $2 == "device" { print $1; exit }'
  )"

  if [[ -z "${line}" ]]; then
    return 1
  fi

  echo "${line}"
}

resolve_android_device_name() {
  if [[ -n "${ANDROID_DEVICE_NAME:-}" ]]; then
    echo "${ANDROID_DEVICE_NAME}"
    return 0
  fi

  if ! command -v adb >/dev/null 2>&1; then
    return 1
  fi

  local line=""
  line="$(
    adb devices -l 2>/dev/null \
      | awk 'NR > 1 && $2 == "device" { print; exit }'
  )"

  if [[ -z "${line}" ]]; then
    return 1
  fi

  local model_name=""
  model_name="$(printf '%s' "${line}" | sed -nE 's/.*model:([^[:space:]]+).*/\1/p')"
  if [[ -n "${model_name}" ]]; then
    echo "${model_name}"
    return 0
  fi

  printf '%s' "${line}" | awk '{ print $1 }'
}

is_valid_tcp_port() {
  local port="$1"

  if [[ ! "${port}" =~ ^[0-9]+$ ]]; then
    return 1
  fi

  if (( port < 1 || port > 65535 )); then
    return 1
  fi

  return 0
}

append_unique_port() {
  local port="$1"
  shift

  local existing_port=""
  if ! is_valid_tcp_port "${port}"; then
    return 0
  fi

  for existing_port in "$@"; do
    if [[ "${existing_port}" == "${port}" ]]; then
      return 0
    fi
  done

  printf '%s\n' "${port}"
}

resolve_metro_port_from_expo_command() {
  local index=0
  local command_arg=""
  local next_arg=""

  for ((index = 0; index < ${#EXPO_CMD[@]}; index += 1)); do
    command_arg="${EXPO_CMD[index]}"
    case "${command_arg}" in
      --port=*)
        next_arg="${command_arg#--port=}"
        if is_valid_tcp_port "${next_arg}"; then
          printf '%s\n' "${next_arg}"
          return 0
        fi
        ;;
      --port)
        if (( index + 1 < ${#EXPO_CMD[@]} )); then
          next_arg="${EXPO_CMD[index + 1]}"
          if is_valid_tcp_port "${next_arg}"; then
            printf '%s\n' "${next_arg}"
            return 0
          fi
        fi
        ;;
    esac
  done

  return 1
}

metro_status_is_active() {
  local port="$1"
  local metro_status=""

  if ! command -v curl >/dev/null 2>&1; then
    return 1
  fi

  metro_status="$(
    curl --silent --show-error --max-time 2 "http://127.0.0.1:${port}/status" 2>/dev/null || true
  )"

  [[ "${metro_status}" == "packager-status:running" ]]
}

list_local_listening_ports() {
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi

  lsof -nP -iTCP -sTCP:LISTEN -F n 2>/dev/null \
    | sed -nE 's/^n.*:([0-9]+)$/\1/p' \
    | sort -n -u
}

resolve_android_metro_port() {
  local command_port=""
  local candidate_port=""
  local detected_port=""
  local fallback_port=""
  local ports=()

  command_port="$(resolve_metro_port_from_expo_command || true)"
  if [[ -n "${command_port}" ]]; then
    detected_port="$(append_unique_port "${command_port}" "${ports[@]}")"
    if [[ -n "${detected_port}" ]]; then
      ports+=("${detected_port}")
    fi
  fi

  detected_port="$(append_unique_port "${ANDROID_METRO_PORT}" "${ports[@]}")"
  if [[ -n "${detected_port}" ]]; then
    ports+=("${detected_port}")
  fi

  detected_port="$(append_unique_port "${DEFAULT_ANDROID_METRO_PORT}" "${ports[@]}")"
  if [[ -n "${detected_port}" ]]; then
    ports+=("${detected_port}")
  fi

  while IFS= read -r candidate_port; do
    detected_port="$(append_unique_port "${candidate_port}" "${ports[@]}")"
    if [[ -n "${detected_port}" ]]; then
      ports+=("${detected_port}")
    fi
  done < <(list_local_listening_ports)

  for candidate_port in "${ports[@]}"; do
    if metro_status_is_active "${candidate_port}"; then
      if [[ "${candidate_port}" != "${ANDROID_METRO_PORT}" ]]; then
        echo "[run-with-logs] Detected active Metro status on port ${candidate_port}; using it for adb reverse." >&2
      fi
      printf '%s\n' "${candidate_port}"
      return 0
    fi
  done

  fallback_port="${command_port:-${ANDROID_METRO_PORT}}"
  echo "[run-with-logs] Active Metro status endpoint not found. Using tcp:${fallback_port} for adb reverse." >&2
  printf '%s\n' "${fallback_port}"
}

ensure_android_debug_metro_reverse() {
  if [[ "${PLATFORM}" != "android" || "${BUILD_TYPE}" != "debug" ]]; then
    return
  fi

  if ! command -v adb >/dev/null 2>&1; then
    echo "[run-with-logs] ERROR: adb not found. Cannot configure Metro reverse tunnel."
    exit 1
  fi

  local android_device_serial=""
  android_device_serial="$(resolve_android_device_serial || true)"
  if [[ -z "${android_device_serial}" ]]; then
    echo "[run-with-logs] ERROR: Android device serial not found. Cannot configure Metro reverse tunnel."
    exit 1
  fi

  local metro_port=""
  metro_port="$(resolve_android_metro_port)"
  local reverse_ports=("${metro_port}")
  local fallback_reverse_port=""

  fallback_reverse_port="$(append_unique_port "${DEFAULT_ANDROID_METRO_PORT}" "${reverse_ports[@]}")"
  if [[ -n "${fallback_reverse_port}" ]]; then
    reverse_ports+=("${fallback_reverse_port}")
  fi

  fallback_reverse_port="$(append_unique_port "${ANDROID_METRO_PORT}" "${reverse_ports[@]}")"
  if [[ -n "${fallback_reverse_port}" ]]; then
    reverse_ports+=("${fallback_reverse_port}")
  fi

  local reverse_port=""
  for reverse_port in "${reverse_ports[@]}"; do
    echo "[run-with-logs] Configuring Metro reverse tunnel via adb reverse tcp:${reverse_port} -> tcp:${metro_port}"
    if ! adb -s "${android_device_serial}" reverse "tcp:${reverse_port}" "tcp:${metro_port}"; then
      echo "[run-with-logs] ERROR: Failed to configure adb reverse for Metro on ${android_device_serial}."
      echo "[run-with-logs] Run manually: adb -s ${android_device_serial} reverse tcp:${reverse_port} tcp:${metro_port}"
      exit 1
    fi
  done

  local reverse_list=""
  reverse_list="$(adb -s "${android_device_serial}" reverse --list 2>/dev/null || true)"

  for reverse_port in "${reverse_ports[@]}"; do
    if ! printf '%s\n' "${reverse_list}" | grep -Fq "tcp:${reverse_port} tcp:${metro_port}"; then
      echo "[run-with-logs] ERROR: adb reverse verification failed for ${android_device_serial}."
      echo "[run-with-logs] Expected reverse mapping: tcp:${reverse_port} tcp:${metro_port}"
      echo "[run-with-logs] Current reverse list:"
      printf '%s\n' "${reverse_list}"
      exit 1
    fi
  done

  echo "[run-with-logs] Metro reverse tunnel is active for ${android_device_serial}."
}

resolve_react_native_version() {
  node --print "require('${PROJECT_DIR}/node_modules/react-native/package.json').version"
}

restore_ios_release_rncore_prebuilt() {
  if [[ "${PLATFORM}" != "ios" || "${BUILD_TYPE}" != "release" ]]; then
    return
  fi

  local rncore_dir="${PROJECT_DIR}/ios/Pods/React-Core-prebuilt"
  local rncore_binary="${rncore_dir}/React.xcframework/ios-arm64/React.framework/React"

  if [[ -f "${rncore_binary}" ]]; then
    return
  fi

  local react_native_version
  react_native_version="$(resolve_react_native_version)"
  local release_tarball="${PROJECT_DIR}/ios/Pods/ReactNativeCore-artifacts/reactnative-core-${react_native_version}-release.tar.gz"

  if [[ ! -f "${release_tarball}" ]]; then
    echo "[run-with-logs] ERROR: Missing React Native release prebuilt tarball."
    echo "[run-with-logs] Expected: ${release_tarball}"
    exit 1
  fi

  echo "[run-with-logs] Restoring React-Core-prebuilt release slice from ${release_tarball}"
  rm -rf "${rncore_dir}"
  mkdir -p "${rncore_dir}"
  tar -xf "${release_tarball}" -C "${rncore_dir}"
  printf 'Release' > "${rncore_dir}/.last_build_configuration"
}

sync_ios_native_config() {
  if [[ "${PLATFORM}" != "ios" ]]; then
    return
  fi

  echo "[run-with-logs] Syncing native iOS config via Expo prebuild..."
  npx expo prebuild --platform ios --no-install
}

cleanup_stale_android_launcher_assets() {
  local resource_root="${PROJECT_DIR}/android/app/src/main/res"
  if [[ ! -d "${resource_root}" ]]; then
    return
  fi

  local density_dir=""
  local asset_name=""
  local png_path=""
  local webp_path=""
  local removed_any="0"
  local asset_names=(
    "ic_launcher"
    "ic_launcher_round"
    "ic_launcher_foreground"
    "ic_launcher_background"
    "ic_launcher_monochrome"
  )

  for density_dir in "${resource_root}"/mipmap-*; do
    if [[ ! -d "${density_dir}" ]]; then
      continue
    fi

    for asset_name in "${asset_names[@]}"; do
      png_path="${density_dir}/${asset_name}.png"
      webp_path="${density_dir}/${asset_name}.webp"
      if [[ -f "${png_path}" && -f "${webp_path}" ]]; then
        rm -f "${webp_path}"
        removed_any="1"
        echo "[run-with-logs] Removed stale Android launcher resource ${webp_path}"
      fi
    done
  done

  if [[ "${removed_any}" == "1" ]]; then
    echo "[run-with-logs] Cleared duplicate Android launcher resources before Gradle merge."
  fi
}

remove_android_launcher_variant_assets() {
  local resource_root="${PROJECT_DIR}/android/app/src/main/res"
  if [[ ! -d "${resource_root}" ]]; then
    return
  fi

  local asset_name=""
  local asset_extension=""
  local asset_path=""
  local removed_any="0"
  local asset_names=(
    "ic_launcher"
    "ic_launcher_round"
    "ic_launcher_foreground"
    "ic_launcher_background"
    "ic_launcher_monochrome"
  )
  local asset_extensions=(
    "png"
    "webp"
    "xml"
  )

  for asset_name in "${asset_names[@]}"; do
    for asset_extension in "${asset_extensions[@]}"; do
      while IFS= read -r -d '' asset_path; do
        rm -f "${asset_path}"
        removed_any="1"
        echo "[run-with-logs] Removed malformed Android launcher resource ${asset_path}"
      done < <(
        find "${resource_root}" -type f -name "${asset_name} *.${asset_extension}" -print0
      )
    done
  done

  if [[ "${removed_any}" == "1" ]]; then
    echo "[run-with-logs] Cleared malformed Android launcher resource variants."
  fi
}

cleanup_stale_android_release_intermediates() {
  if [[ "${PLATFORM}" != "android" || "${BUILD_TYPE}" != "release" ]]; then
    return
  fi

  local build_root="${PROJECT_DIR}/android/app/build"
  if [[ ! -d "${build_root}" ]]; then
    return
  fi

  local cleanup_targets=(
    "${build_root}/intermediates/packaged_res/release"
    "${build_root}/intermediates/incremental/release/packageReleaseResources"
    "${build_root}/intermediates/incremental/lintVitalAnalyzeRelease"
    "${build_root}/intermediates/lint_vital_partial_results/release"
    "${build_root}/intermediates/lint_vital_report_lint_model/release"
  )
  local cleanup_target=""
  local removed_any="0"

  for cleanup_target in "${cleanup_targets[@]}"; do
    if [[ -e "${cleanup_target}" ]]; then
      rm -rf "${cleanup_target}"
      removed_any="1"
      echo "[run-with-logs] Removed stale Android release intermediate ${cleanup_target}"
    fi
  done

  if [[ "${removed_any}" == "1" ]]; then
    echo "[run-with-logs] Cleared stale Android release intermediates before Gradle assemble."
  fi
}

remove_prebuilt_android_launcher_assets() {
  local resource_root="${PROJECT_DIR}/android/app/src/main/res"
  if [[ ! -d "${resource_root}" ]]; then
    return
  fi

  local density_dir=""
  local asset_name=""
  local asset_extension=""
  local asset_path=""
  local removed_any="0"
  local asset_names=(
    "ic_launcher"
    "ic_launcher_round"
    "ic_launcher_foreground"
    "ic_launcher_background"
    "ic_launcher_monochrome"
  )
  local asset_extensions=(
    "png"
    "webp"
  )

  for density_dir in "${resource_root}"/mipmap-*; do
    if [[ ! -d "${density_dir}" ]]; then
      continue
    fi

    for asset_name in "${asset_names[@]}"; do
      for asset_extension in "${asset_extensions[@]}"; do
        asset_path="${density_dir}/${asset_name}.${asset_extension}"
        if [[ -f "${asset_path}" ]]; then
          rm -f "${asset_path}"
          removed_any="1"
          echo "[run-with-logs] Removed prebuilt Android launcher resource ${asset_path}"
        fi
      done
    done
  done

  if [[ "${removed_any}" == "1" ]]; then
    echo "[run-with-logs] Cleared Android launcher resources before Expo prebuild."
  fi
}

start_ios_logs() {
  mkdir -p "${PROJECT_DIR}/artifacts/phase2/ios/logs"
  LOG_FILE="${PROJECT_DIR}/artifacts/phase2/ios/logs/ios-${BUILD_TYPE}-${TIMESTAMP}.log"

  if ! command -v xcrun >/dev/null 2>&1; then
    echo "[run-with-logs] xcrun not found. iOS runtime log capture skipped."
    return
  fi

  local device_help
  device_help="$(xcrun devicectl help device 2>/dev/null || true)"
  if ! printf '%s\n' "${device_help}" | grep -Eq '^[[:space:]]+log([[:space:]]|$)'; then
    echo "[run-with-logs] Current devicectl does not support 'device log stream'."
    echo "[run-with-logs] iOS runtime log capture is skipped on this Xcode toolchain."
    {
      echo "[run-with-logs] iOS runtime log capture skipped: devicectl 'device log stream' not supported."
      echo "[run-with-logs] Capture backend evidence from Render Live Logs instead."
    } > "${LOG_FILE}"
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
    | redact_sensitive_log_fields \
    | tee "${LOG_FILE}" \
    | awk -v pattern="${LOG_FILTER_REGEX}" '$0 ~ pattern { print; fflush(); }' >/dev/null &
  LOG_PID="$!"
}

start_android_logs() {
  mkdir -p "${PROJECT_DIR}/artifacts/phase2/android/logs"
  LOG_FILE="${PROJECT_DIR}/artifacts/phase2/android/logs/android-${BUILD_TYPE}-${TIMESTAMP}.log"

  if ! command -v adb >/dev/null 2>&1; then
    echo "[run-with-logs] adb not found. Android runtime log capture skipped."
    return
  fi

  echo "[run-with-logs] Preparing adb runtime log capture..."
  if ! run_with_timeout 12 adb start-server >/dev/null 2>&1; then
    echo "[run-with-logs] WARN: adb start-server timed out. Continuing without blocking."
  fi
  if ! run_with_timeout 8 adb logcat -c >/dev/null 2>&1; then
    echo "[run-with-logs] WARN: adb logcat -c timed out. Continuing."
  fi

  echo "[run-with-logs] Android runtime logs -> ${LOG_FILE}"
  adb logcat -v time 2>&1 \
    | redact_sensitive_log_fields \
    | tee "${LOG_FILE}" \
    | awk -v pattern="${LOG_FILTER_REGEX}" '$0 ~ pattern { print; fflush(); }' >/dev/null &
  LOG_PID="$!"
}

EXPO_CMD=()

prepare_android_device_context() {
  if [[ "${PLATFORM}" != "android" ]]; then
    return
  fi

  local android_device_serial=""
  android_device_serial="$(resolve_android_device_serial || true)"
  if [[ -n "${android_device_serial}" ]]; then
    export ANDROID_SERIAL="${android_device_serial}"
  fi
}

build_expo_command() {
  local platform="$1"
  local build="$2"
  shift 2

  local ios_device=""
  local android_device_name=""
  local android_device_serial=""
  if [[ "${platform}" == "ios" ]]; then
    ios_device="$(resolve_ios_udid || true)"
  elif [[ "${platform}" == "android" ]]; then
    android_device_serial="$(resolve_android_device_serial || true)"
    android_device_name="$(resolve_android_device_name || true)"
    if [[ -n "${android_device_serial}" ]]; then
      export ANDROID_SERIAL="${android_device_serial}"
    fi
  fi

  case "${platform}" in
    ios)
      if [[ "${build}" == "release" ]]; then
        EXPO_CMD=(npx expo run:ios --configuration Release --no-bundler)
      else
        EXPO_CMD=(npx expo run:ios)
      fi
      if [[ -n "${ios_device}" ]]; then
        EXPO_CMD+=(-d "${ios_device}")
      else
        EXPO_CMD+=(--device)
      fi
      ;;
    android)
      if [[ "${build}" == "release" ]]; then
        EXPO_CMD=(npx expo run:android --variant release --no-bundler)
      else
        EXPO_CMD=(npx expo run:android)
      fi
      if [[ -n "${android_device_name}" ]]; then
        EXPO_CMD+=(--device "${android_device_name}")
      else
        EXPO_CMD+=(--device)
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
  if [[ -n "${FOODLENS_BUILD_ANDROID_PACKAGE:-}" ]]; then
    candidates+=("${FOODLENS_BUILD_ANDROID_PACKAGE}")
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
    package_name="${ANDROID_LAUNCH_PACKAGE:-${FOODLENS_BUILD_ANDROID_PACKAGE:-com.hoihou.foodlens}}"
  fi
  local activity_name="${ANDROID_LAUNCH_ACTIVITY:-.MainActivity}"
  local launch_output=""

  echo "[run-with-logs] Installed package candidates:"
  adb shell pm list packages | sed 's/^package://' | grep -E "^${PACKAGE_FAMILY_REGEX}$" || true

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

run_android_release_with_gradle() {
  if [[ "${PLATFORM}" != "android" || "${BUILD_TYPE}" != "release" ]]; then
    return
  fi

  local apk_path="${PROJECT_DIR}/android/app/build/outputs/apk/release/app-release.apk"

  echo "[run-with-logs] Running: ./gradlew :app:assembleRelease"
  (
    cd "${PROJECT_DIR}/android"
    ./gradlew :app:assembleRelease
  )

  if [[ ! -f "${apk_path}" ]]; then
    echo "[run-with-logs] ERROR: Release APK was not created."
    echo "[run-with-logs] Expected: ${apk_path}"
    exit 1
  fi

  echo "[run-with-logs] Installing ${apk_path}"
  adb install -r "${apk_path}"
}

cd "${PROJECT_DIR}"
load_build_identity
print_build_fingerprint
enforce_clean_worktree
enforce_release_install_identity

# Ensure Android native build can read maps key even when it exists only in .env.
if [[ "${PLATFORM}" == "android" && -z "${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:-}" && -f "${PROJECT_DIR}/.env" ]]; then
  maps_key_line="$(grep -E '^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=' "${PROJECT_DIR}/.env" | tail -n 1 || true)"
  if [[ -n "${maps_key_line}" ]]; then
    export EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="${maps_key_line#EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=}"
    # Strip surrounding quotes if present.
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY%\"}"
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY#\"}"
    # Normalize accidental whitespace-only values.
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="$(printf '%s' "${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    export EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
    echo "[run-with-logs] Loaded EXPO_PUBLIC_GOOGLE_MAPS_API_KEY from .env for android build."
  fi
fi

if [[ "${PLATFORM}" == "android" ]]; then
  maps_key_value="${EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:-}"
  maps_key_value="$(printf '%s' "${maps_key_value}" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  export EXPO_PUBLIC_GOOGLE_MAPS_API_KEY="${maps_key_value}"

  if [[ -z "${maps_key_value}" || "${maps_key_value}" == "${MAPS_KEY_PLACEHOLDER}" ]]; then
    echo "[run-with-logs] ERROR: EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is empty."
    echo "[run-with-logs] Set it in FoodLens/.env or current shell env before android build."
    exit 1
  fi
fi

if [[ "${PLATFORM}" == "android" ]]; then
  echo "[run-with-logs] Syncing native Android config via Expo prebuild..."
  remove_android_launcher_variant_assets
  remove_prebuilt_android_launcher_assets
  npx expo prebuild --platform android --no-install
  remove_android_launcher_variant_assets
  cleanup_stale_android_launcher_assets
  if [[ -f "${ANDROID_MANIFEST_PATH}" ]]; then
    if ! grep -q "com.google.android.geo.API_KEY" "${ANDROID_MANIFEST_PATH}"; then
      echo "[run-with-logs] ERROR: AndroidManifest is missing com.google.android.geo.API_KEY meta-data."
      echo "[run-with-logs] Check app.config.js android.config.googleMaps.apiKey wiring."
      exit 1
    fi
  fi
fi

if [[ "${PLATFORM}" == "ios" ]]; then
  sync_ios_native_config
  restore_ios_release_rncore_prebuilt
  start_ios_logs
else
  start_android_logs
fi

# Local device log capture should not fail on missing Sentry org/project config.
if [[ "${BUILD_TYPE}" == "release" ]]; then
  export SENTRY_DISABLE_AUTO_UPLOAD=true
  export SENTRY_ALLOW_FAILURE=1
  echo "[run-with-logs] Local release run: Sentry upload failures are non-blocking."
  if [[ "${PLATFORM}" == "android" ]]; then
    echo "[run-with-logs] Local Android release run uses Gradle + adb install only."
  fi
  if [[ -n "${EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE+x}" ]]; then
    echo "[run-with-logs] EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE=${EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE} (user supplied)."
  else
    export EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE=1
    echo "[run-with-logs] EXPO_PUBLIC_PHASE2_FORCE_WRITE_PROBE not set. Enabled default (=1) for release diagnostics."
  fi
  if [[ -z "${SENTRY_ORG:-}" && -z "${SENTRY_PROPERTIES:-}" ]]; then
    echo "[run-with-logs] SENTRY_ORG/SENTRY_PROPERTIES not set. Sentry source map upload is disabled."
  fi
fi

prepare_android_device_context
cleanup_stale_android_release_intermediates

if [[ "${PLATFORM}" == "android" && "${BUILD_TYPE}" == "release" ]]; then
  run_android_release_with_gradle
else
  build_expo_command "${PLATFORM}" "${BUILD_TYPE}" "$@"
  ensure_android_debug_metro_reverse
  echo "[run-with-logs] Running: ${EXPO_CMD[*]}"
  "${EXPO_CMD[@]}"
fi

force_launch_android_main

if [[ -n "${LOG_FILE}" && -n "${LOG_PID}" ]]; then
  echo "[run-with-logs] Build/install finished. Interact with app now."
  echo "[run-with-logs] Press Enter to stop log capture."
  read -r _
fi
