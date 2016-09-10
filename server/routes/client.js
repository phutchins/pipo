'use strict';
// routes/chat.js

var pug = require('pug');
var path = require('path');

module.exports = function(app, pipo) {
  var logger = require('../../config/logger');
  var clientConfig = require('../../config/pipo')();

  app.get('/', function(req, res) {
    logger.debug("[ROUTE] '/'");
    var username = 'default';
    var templateBasedir = path.join(__dirname, '../../client/views/');

    var templateOptions = {
      pretty: true,
      depRoot: ''
    };

    var preDeps = pug.renderFile(templateBasedir + 'preDeps.pug', templateOptions);
    var postDeps = pug.renderFile(templateBasedir + 'postDeps.pug', templateOptions);

    var locals = {
      username : username,
      preDeps: preDeps,
      postDeps: postDeps,
      config: clientConfig
    };

    var renderedClient = pug.renderFile(path.join(__dirname, '../../client/views/client.pug'), locals);
    res.send(renderedClient);
  });
};
