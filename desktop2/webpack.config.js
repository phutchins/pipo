'use strict';


var _ = require('underscore');
var pkg = require('./package.json');


module.exports = {
  devtool: 'eval',
  resolve: {
    modulesDirectories: ['src/js'],
    extensions: ['', '.es6', '.js']
  },
  entry: {
    'main': './src/js/main.es6'
  },
  output: {
    path: 'dist/',
    filename: '[name].js',
    libraryTarget: 'commonjs2'
  },
  target: 'atom',
  externals: _.keys(pkg.dependencies),
  module: {
    loaders: [
      { test: /\.es6$/, loader: 'babel-loader' },
      { test: /\.jsx$/, loader: 'babel-loader' },
      { test: /\.json$/, loader: 'json-loader' }
    ]
  }
};
