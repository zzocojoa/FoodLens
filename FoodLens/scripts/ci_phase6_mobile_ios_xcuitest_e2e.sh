#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV_FILE="${ROOT_DIR}/.env.maestro.local"
TEMPLATE_DIR="${ROOT_DIR}/test/ios-xcuitest"
XCUITEST_DIR="${ROOT_DIR}/ios/FoodLensUITests"
CREDENTIALS_FILE="${XCUITEST_DIR}/FoodLensUITestCredentials.swift"
ARTIFACT_DIR="${ROOT_DIR}/artifacts/phase6/mobile-ios-xcuitest-e2e"
RESULT_BUNDLE_PATH="${ARTIFACT_DIR}/FoodLens-iOS-ReleaseSmoke.xcresult"
LOG_FILE="${ARTIFACT_DIR}/xcodebuild.log"
MANIFEST_FILE="${ARTIFACT_DIR}/xcuitest-manifest.json"

cleanup_credentials_file() {
  rm -f "${CREDENTIALS_FILE}"
}

trap cleanup_credentials_file EXIT

trim_value() {
  local value="${1}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

require_env() {
  local name="${1}"
  local value
  value="$(trim_value "${!name:-}")"
  if [[ -z "${value}" ]]; then
    echo "[Phase6 iOS XCUITest E2E] ${name} is required." >&2
    exit 1
  fi
}

load_local_env_file() {
  if [[ ! -f "${LOCAL_ENV_FILE}" ]]; then
    return
  fi

  if [[ ! -r "${LOCAL_ENV_FILE}" ]]; then
    echo "[Phase6 iOS XCUITest E2E] local env file is not readable: ${LOCAL_ENV_FILE}" >&2
    exit 1
  fi

  local original_foodlens_e2e_device_id="${FOODLENS_E2E_DEVICE_ID:-}"
  local original_foodlens_e2e_email="${FOODLENS_E2E_EMAIL:-}"
  local original_foodlens_e2e_password="${FOODLENS_E2E_PASSWORD:-}"
  local has_foodlens_e2e_device_id="${FOODLENS_E2E_DEVICE_ID+x}"
  local has_foodlens_e2e_email="${FOODLENS_E2E_EMAIL+x}"
  local has_foodlens_e2e_password="${FOODLENS_E2E_PASSWORD+x}"

  set -a
  source "${LOCAL_ENV_FILE}"
  set +a

  if [[ -n "${has_foodlens_e2e_device_id}" ]]; then
    export FOODLENS_E2E_DEVICE_ID="${original_foodlens_e2e_device_id}"
  fi
  if [[ -n "${has_foodlens_e2e_email}" ]]; then
    export FOODLENS_E2E_EMAIL="${original_foodlens_e2e_email}"
  fi
  if [[ -n "${has_foodlens_e2e_password}" ]]; then
    export FOODLENS_E2E_PASSWORD="${original_foodlens_e2e_password}"
  fi

  echo "[Phase6 iOS XCUITest E2E] loaded local env file: ${LOCAL_ENV_FILE}"
}

prepare_native_project() {
  if [[ "${FOODLENS_XCUITEST_SKIP_PREBUILD:-0}" == "1" ]]; then
    return
  fi

  (
    cd "${ROOT_DIR}"
    npx expo prebuild --platform ios --no-install
    npx pod-install ios
  )
}

write_xcuitest_files() {
  if [[ ! -f "${TEMPLATE_DIR}/FoodLensReleaseSmokeUITests.swift" ]]; then
    echo "[Phase6 iOS XCUITest E2E] missing XCUITest template: ${TEMPLATE_DIR}/FoodLensReleaseSmokeUITests.swift" >&2
    exit 1
  fi

  mkdir -p "${XCUITEST_DIR}"
  cp "${TEMPLATE_DIR}/FoodLensReleaseSmokeUITests.swift" "${XCUITEST_DIR}/FoodLensReleaseSmokeUITests.swift"
  node - "${CREDENTIALS_FILE}" "${FOODLENS_E2E_EMAIL}" "${FOODLENS_E2E_PASSWORD}" <<'NODE'
const fs = require('fs');

const [outputFile, email, password] = process.argv.slice(2);
const swift = [
  'import Foundation',
  '',
  'enum FoodLensUITestCredentials {',
  `    static let email: String = ${JSON.stringify(email)}`,
  `    static let password: String = ${JSON.stringify(password)}`,
  '}',
  '',
].join('\n');

fs.writeFileSync(outputFile, swift);
NODE
  cat > "${XCUITEST_DIR}/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>$(DEVELOPMENT_LANGUAGE)</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>$(PRODUCT_NAME)</string>
	<key>CFBundlePackageType</key>
	<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0</string>
	<key>CFBundleVersion</key>
	<string>1</string>
</dict>
</plist>
PLIST
}

configure_xcuitest_target() {
  (
    cd "${ROOT_DIR}/.."
    ruby <<'RUBY'
require 'xcodeproj'

project_path = 'FoodLens/ios/FoodLens.xcodeproj'
project = Xcodeproj::Project.open(project_path)
app_target = project.targets.find { |target| target.name == 'FoodLens' }
raise 'FoodLens target not found' unless app_target

ui_target = project.targets.find { |target| target.name == 'FoodLensUITests' }
unless ui_target
  ui_target = project.new_target(:ui_test_bundle, 'FoodLensUITests', :ios, '15.1')
  ui_target.add_dependency(app_target)
end

ui_target.product_name = 'FoodLensUITests'
ui_target.product_reference.name = 'FoodLensUITests.xctest'
ui_target.product_reference.path = 'FoodLensUITests.xctest'

ui_group = project.main_group.find_subpath('FoodLensUITests', true)
ui_group.set_source_tree('SOURCE_ROOT')
ui_group.path = 'FoodLensUITests'
['FoodLensReleaseSmokeUITests.swift', 'FoodLensUITestCredentials.swift'].each do |file_path|
  file_ref = ui_group.files.find { |file| file.path == file_path } || ui_group.new_file(file_path)
  ui_target.add_file_references([file_ref]) unless ui_target.source_build_phase.files_references.include?(file_ref)
end
ui_group.files.find { |file| file.path == 'Info.plist' } || ui_group.new_file('Info.plist')

ui_target.build_configurations.each do |config|
  settings = config.build_settings
  settings['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'YES'
  settings['CODE_SIGN_STYLE'] = 'Automatic'
  settings['DEVELOPMENT_TEAM'] = '9ZL3RJ73M7'
  settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  settings['INFOPLIST_FILE'] = 'FoodLensUITests/Info.plist'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.hoihou.foodlens.UITests'
  settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  settings['SWIFT_VERSION'] = '5.0'
  settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  settings['TEST_TARGET_NAME'] = 'FoodLens'
end

project.save

scheme_path = 'FoodLens/ios/FoodLens.xcodeproj/xcshareddata/xcschemes/FoodLens.xcscheme'
scheme = Xcodeproj::XCScheme.new(scheme_path)
unless scheme.test_action.testables.any? { |testable| testable.buildable_references.any? { |ref| ref.target_name == 'FoodLensUITests' } }
  scheme.add_test_target(ui_target)
end
scheme.save_as(project_path, 'FoodLens', true)
RUBY
  )
}

mkdir -p "${ARTIFACT_DIR}"
rm -rf "${RESULT_BUNDLE_PATH}"

load_local_env_file

FOODLENS_E2E_DEVICE_ID="$(trim_value "${FOODLENS_E2E_DEVICE_ID:-${IOS_DEVICE_UDID:-}}")"
FOODLENS_E2E_EMAIL="$(trim_value "${FOODLENS_E2E_EMAIL:-}")"
FOODLENS_E2E_PASSWORD="$(trim_value "${FOODLENS_E2E_PASSWORD:-}")"

export FOODLENS_E2E_EMAIL
export FOODLENS_E2E_PASSWORD
export SENTRY_ALLOW_FAILURE=1
export SENTRY_DISABLE_AUTO_UPLOAD=true

require_env FOODLENS_E2E_DEVICE_ID
require_env FOODLENS_E2E_EMAIL
require_env FOODLENS_E2E_PASSWORD

node - "${MANIFEST_FILE}" "${FOODLENS_E2E_DEVICE_ID}" <<'NODE'
const fs = require('fs');

const [manifestFile, deviceId] = process.argv.slice(2);
const manifest = {
  gate: 'phase6-mobile-ios-xcuitest-e2e',
  runner: 'xcodebuild-xcuitest',
  deviceRunnerConfigured: true,
  platform: 'ios',
  deviceId,
  scheme: 'FoodLens',
  configuration: 'Release',
  requiredFlows: ['login', 'scan', 'history'],
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
NODE

prepare_native_project
write_xcuitest_files
configure_xcuitest_target

echo "[Phase6 iOS XCUITest E2E] device_id=${FOODLENS_E2E_DEVICE_ID}"
(
  cd "${ROOT_DIR}"
  xcodebuild test \
    -workspace ios/FoodLens.xcworkspace \
    -scheme FoodLens \
    -configuration Release \
    -destination "platform=iOS,id=${FOODLENS_E2E_DEVICE_ID}" \
    -only-testing:FoodLensUITests/FoodLensReleaseSmokeUITests/testReleaseSmokeFlow \
    -resultBundlePath "${RESULT_BUNDLE_PATH}" \
    -allowProvisioningUpdates
) 2>&1 | tee "${LOG_FILE}"

if grep -Eq "Test Case .* skipped|with [1-9][0-9]* test skipped" "${LOG_FILE}"; then
  echo "[Phase6 iOS XCUITest E2E] XCUITest skipped at least one required test." >&2
  exit 1
fi

echo "[Phase6 iOS XCUITest E2E] passed"
