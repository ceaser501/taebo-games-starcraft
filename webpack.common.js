const path = require('path');
const crypto = require('crypto');
const webpack = require('webpack');

// `SITE_PASSWORD=... npm run build` puts a password screen in front of the game.
// Only the hash ships; this keeps casual visitors out but is not real access control.
const password = process.env.SITE_PASSWORD || '';

// The bundle lands in starcraft/js/app.js, next to the page that loads it. The engine
// (starcraft/js/engine/bw.mjs + bw.wasm) is loaded at runtime, not bundled.
module.exports = {
  entry: {
    starcraft: './starcraft/js/app.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    filename: '[name]/js/app.js',
    chunkFilename: 'starcraft/js/chunk-[id].js',
  },
  plugins: [
    new webpack.DefinePlugin({
      PASSWORD_HASH: JSON.stringify(password ? crypto.createHash('sha256').update(password).digest('hex') : ''),
    }),
  ],
};
