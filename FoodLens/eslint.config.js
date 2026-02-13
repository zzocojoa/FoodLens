// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const IGNORE_PATTERNS = ['dist/*'];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: IGNORE_PATTERNS,
  },
]);
