const BABEL_PRESETS = ['babel-preset-expo'];
const BABEL_PLUGINS = ['react-native-reanimated/plugin'];

module.exports = function (api) {
  api.cache(true);
  return {
    presets: BABEL_PRESETS,
    plugins: BABEL_PLUGINS,
  };
};
