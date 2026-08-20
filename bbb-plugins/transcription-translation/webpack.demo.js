/**
 * Demo harness build: renders the real plugin panel in a plain page, with the
 * BigBlueButton plugin SDK aliased to `demo/mock-sdk.tsx`, so the plugin can be
 * exercised end-to-end (against a real LibreTranslate) without a BBB server.
 *
 *   npx webpack serve --config webpack.demo.js   # http://localhost:4702
 */
const path = require('path');

module.exports = {
  mode: 'development',
  entry: './demo/index.tsx',
  output: {
    filename: 'demo.js',
    path: path.resolve(__dirname, 'demo-dist'),
    publicPath: '/',
  },
  devServer: {
    allowedHosts: 'all',
    port: 4702,
    host: '0.0.0.0',
    hot: false,
    liveReload: false,
    static: { directory: path.resolve(__dirname, 'demo') },
    client: { overlay: false },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    alias: {
      'bigbluebutton-html-plugin-sdk': path.resolve(__dirname, 'demo/mock-sdk.tsx'),
    },
  },
};
