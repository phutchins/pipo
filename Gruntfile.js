module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt);
  grunt.loadNpmTasks('grunt-jslint');
  grunt.loadNpmTasks('grunt-contrib-clean');

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    jslint: { // configure the task
      // lint your project's server code
      server: {
        src: [
          '*.js',
          'src/routes/*.js',
          'managers/*.js',
          'models/*.js',
          'test/**/*.js'
        ],
        exclude: [
        ],
        directives: { // example directives
          node: true,
          todo: true
        },
        options: {
          edition: 'latest', // specify an edition of jslint or use 'dir/mycustom-jslint.js' for own path
          junit: 'out/server-junit.xml', // write the output to a JUnit XML
          log: 'out/server-lint.log',
          jslintXml: 'out/server-jslint.xml',
          errorsOnly: true, // only display errors
          failOnError: false, // defaults to true
          checkstyle: 'out/server-checkstyle.xml' // write a checkstyle-XML
        }
      },
      // lint your project's client code
      client: {
        src: [
          'src/js/*.js'
        ],
        directives: {
          browser: true,
          predef: [
            'jQuery'
          ]
        },
        options: {
          junit: 'out/client-junit.xml'
        }
      }
    },

    electron: {
      osxBuild: {
        options: {
          name: 'PiPo',
          dir: '.',
          out: 'dist',
          version: '0.36.5',
          platform: 'darwin',
          icon: 'public/img/pipo.icns',
          arch: 'x64'
        }
      }
    },

    clean: {
      build: ["out", "pipo.log"],
      release: ["dist"]
    },
  });



  grunt.registerTask('default', ['electron']);
  grunt.registerTask('lint', ['jslint']);
};
