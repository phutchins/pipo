// Include gulp
var gulp = require('gulp');

// Include Our Plugins
var jshint = require('gulp-jshint');
var copy = require('gulp-copy');
var sass = require('gulp-sass');
var concat = require('gulp-concat');
var minifyCss = require('gulp-minify-css');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');

// Lint Task
gulp.task('lint', function() {
    return gulp.src('src/js/*.js')
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});

// Compile Our Sass
gulp.task('sass', function() {
    return gulp.src('src/scss/*.scss')
        .pipe(sass())
        .pipe(gulp.dest('dist'));
});

// Concatenate & Minify JS
gulp.task('scripts', function() {
    return gulp.src('src/js/*.js')
        .pipe(concat('pipo.js'))
        .pipe(gulp.dest('dist'))
        .pipe(rename('pipo.min.js'))
        .pipe(uglify())
        .pipe(gulp.dest('dist'));
});

// Minify CSS
gulp.task('css', function() {
  return gulp.src('src/css/**/*.css')
  .pipe(minifyCss())
  .pipe(gulp.dest('dist'));
});

// Watch Files For Changes
gulp.task('watch', function() {
    gulp.watch('src/js/*.js', ['lint', 'scripts']);
    gulp.watch('src/scss/*.scss', ['sass']);
});

// Default Task
gulp.task('default', ['lint', 'sass', 'scripts', 'css', 'watch']);
gulp.task('build', ['sass', 'scripts', 'css']);
