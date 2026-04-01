const fs = require('fs/promises');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const SETTINGS_GRADLE_PATH = ['settings.gradle'];

const SETTINGS_REPOSITORIES_BLOCK = `pluginManagement {
  repositories {
    gradlePluginPortal()
    google()
    mavenCentral()
  }
`;

const ensurePluginManagementRepositories = (contents) => {
  if (contents.includes('gradlePluginPortal()')) {
    return contents;
  }

  if (!contents.startsWith('pluginManagement {')) {
    throw new Error('Could not find pluginManagement block in android/settings.gradle.');
  }

  return contents.replace('pluginManagement {\n', SETTINGS_REPOSITORIES_BLOCK);
};

const updateSettingsGradle = async (platformProjectRoot) => {
  const settingsGradlePath = path.join(platformProjectRoot, ...SETTINGS_GRADLE_PATH);
  const contents = await fs.readFile(settingsGradlePath, 'utf8');
  const updatedContents = ensurePluginManagementRepositories(contents);
  await fs.writeFile(settingsGradlePath, updatedContents, 'utf8');
};

const withGradlePluginPortal = (config) =>
  withDangerousMod(config, [
    'android',
    async (modConfig) => {
      await updateSettingsGradle(modConfig.modRequest.platformProjectRoot);
      return modConfig;
    },
  ]);

module.exports = withGradlePluginPortal;
