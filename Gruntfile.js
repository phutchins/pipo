grunt.initConfig({
  jasmine_node: {
    task_name: {
      options: {
        coverage: {},
        forceExit: true,
        match: '.',
        matchAll: false,
        specFolders: ['specs'],
        extensions: 'js',
        specNameMatcher: 'spec',
        captureExceptions: true,
        junitreport: {
          report: false,
          savePath : './build/reports/jasmine/',
          useDotNotation: true,
          consolidate: true
        }
      },
      src: ['**/*.js']
    }
  }
});

grunt.loadNpmTasks('grunt-jasmine-node-coverage');

grunt.registerTask('default', 'jasmine_node');
