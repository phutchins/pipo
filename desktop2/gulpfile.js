'use strict';

var gulp = require('gulp');
var runSequence = require('run-sequence');
var gutil = require('gulp-util');
var mainBowerFiles = require('main-bower-files');
var concat = require('gulp-concat');
var rename = require('gulp-rename');
var less = require('gulp-less');
var filter = require('gulp-filter');
var clean = require('gulp-clean');
var shell = require('gulp-shell');
var sourcemaps = require('gulp-sourcemaps');
var webpack = require('webpack');
var webpackConfig = require('./webpack.config');
var ejs = require("gulp-ejs");

function webpackLogger(callback) {
  return function(err, stats) {
    if (err) throw new gutil.PluginError('webpack', err);
    gutil.log('[webpack] Build success:'.yellow, stats.toString({
      hash: false,
      version: false,
      cached: false,
      colors: true
    }));
    if (callback) {
      callback();
    }
  };
}


gulp.task('default', ['watch']);

gulp.task('watch', function() {
  runSequence(
    'build',
    [
      'watch-src',
      'watch-vendor'
    ]
  );
});

gulp.task('build', function(callback) {
  runSequence(
    'clean:dist',
    'build-src',
    'build-vendor',
    callback
  );
});

gulp.task('build-src', [
  'build-src:js',
  'build-src:css',
  'build-src:ejs',
  'build-src:html'
]);

gulp.task('build-vendor', [
  'build-vendor:js',
  'build-vendor:css',
  'build-vendor:semantic-ui'
]);

gulp.task('watch-src', [
  'watch-src:js',
  'watch-src:css',
  'watch-src:ejs',
  'watch-src:html'
]);

gulp.task('watch-vendor', function() {
  gulp.watch('bower.json' ['build-vendor']);
});

gulp.task('watch-src:js', function() {
  webpack(webpackConfig).watch({}, webpackLogger());
});

gulp.task('watch-src:css', function() {
  gulp.watch('./src/less/**/*', ['build-src:css']);
});

gulp.task('watch-src:html', function() {
  gulp.watch('./src/html/**/*', ['build-src:html']);
});

gulp.task('watch-src:html', function() {
  gulp.watch('./src/ejs/**/*', ['build-src:ejs']);
});

gulp.task('build-src:js', function(callback) {
  webpack(webpackConfig).run(webpackLogger(callback));
});

gulp.task('build-src:css', function() {
  return gulp.src('src/css/main.less')
    .pipe(sourcemaps.init())
    //.pipe(less())
    .pipe(rename('main.css'))
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('dist'));
});

gulp.task('build-src:html', function() {
  return gulp.src('src/html/main.html')
    .pipe(gulp.dest('dist'));
});

gulp.task('build-src:ejs', function() {
  return gulp.src("src/ejs/*.ejs")
    .pipe(ejs({
      msg: "Hello Gulp!"
    }))
    .pipe(gulp.dest("dist"));
});

gulp.task('build-vendor:js', function() {
  return gulp.src(mainBowerFiles())
    .pipe(filter(['**/*.js']))
    .pipe(sourcemaps.init())
    .pipe(concat('vendor.js'))
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('dist'));
});

gulp.task('build-vendor:css', function() {
  return gulp.src(mainBowerFiles())
    .pipe(filter(['**/*.css']))
    .pipe(sourcemaps.init())
    .pipe(concat('vendor.css'))
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('dist'));
});

gulp.task('build-vendor:semantic-ui', function() {
  return gulp.src('bower_components/semantic-ui/dist/**/*')
    .pipe(gulp.dest('dist/semantic-ui'));
});

gulp.task('clean:dist', function() {
  return gulp.src('dist')
    .pipe(clean());
});

gulp.task('build-electron', function(callback) {
  runSequence(
    'build',
    'build-electron:clean',
    'build-electron:src',
    callback
  );
});

gulp.task('build-electron:clean', function() {
  return gulp.src('Electron.app')
    .pipe(clean());
});

gulp.task('build-electron:src', shell.task([
  'cp -a node_modules/electron-prebuilt/dist/Electron.app ./',
  'mkdir Electron.app/Contents/Resources/app',
  'cp main.js Electron.app/Contents/Resources/app/',
  'cp package.json Electron.app/Contents/Resources/app/',
  'cp -a dist Electron.app/Contents/Resources/app/'
]));


