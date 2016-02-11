module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt);
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    electron: {
      osxBuild: {
        options: {
          name: 'PiPo',
          dir: '.',
          out: 'dist',
          version: '0.36.5',
          platform: 'darwin',
          icon: 'src/img/pipo.icns',
          arch: 'x64'
        }
      }
    }
  });

  grunt.registerTask('default', ['electron']);
};
