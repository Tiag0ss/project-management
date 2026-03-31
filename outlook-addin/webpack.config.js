const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, options) => {
  const dev = options.mode !== 'production';
  return {
    entry: {
      taskpane: './src/taskpane/index.tsx',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].bundle.js',
      clean: true,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/taskpane/taskpane.html',
        filename: 'taskpane.html',
        chunks: ['taskpane'],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'assets', to: 'assets' },
          { from: 'manifest.xml', to: 'manifest.xml' },
        ],
      }),
    ],
    devServer: {
      port: 3001,
      hot: true,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      // HTTPS is required for Office Add-ins in production
      // For local dev, sideload manifest pointing to http://localhost:3001
    },
    devtool: dev ? 'source-map' : false,
  };
};
