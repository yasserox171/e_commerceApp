module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: [
      // Must stay last: Reanimated's worklet transform rewrites function bodies
      // and has to see the output of every other plugin.
      'react-native-worklets/plugin',
    ],
  };
};
