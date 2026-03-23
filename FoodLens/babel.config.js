const BABEL_PRESETS = ['babel-preset-expo'];
const BABEL_PLUGINS = ['react-native-reanimated/plugin'];

if (process.env.MOCK_MAPS_FOR_WEB === '1') {
  BABEL_PLUGINS.push([
    'module-resolver',
    {
      root: ['./'],
      alias: {
        'react-native-maps': './__mocks__/react-native-maps.js',
      },
    },
  ]);
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: BABEL_PRESETS,
    plugins: BABEL_PLUGINS,
  };
};
