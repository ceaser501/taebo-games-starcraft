const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = merge(common, {
  mode: 'production',
  // The engine and game data are big on purpose; size hints would only be noise.
  performance: { hints: false },
  plugins: [
    new CopyPlugin({
      patterns: [
        // Site-wide: the root page (forwards to starcraft/) and shared icons.
        { from: 'index.html', to: 'index.html' },
        { from: 'robots.txt', to: 'robots.txt' },
        { from: '*.png', to: '[name][ext]' },
        { from: 'sw.js', to: 'sw.js' },
        { from: '404.html', to: '404.html' },
        { from: 'site.webmanifest', to: 'site.webmanifest' },
        // StarCraft
        { from: 'starcraft/index.html', to: 'starcraft/index.html' },
        { from: 'starcraft/css', to: 'starcraft/css' },
        { from: 'starcraft/js/engine', to: 'starcraft/js/engine' },
        { from: 'starcraft/assets', to: 'starcraft/assets', noErrorOnMissing: true },
      ],
    }),
  ],
});
