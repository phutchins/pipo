// Configuration
var configDB = require('../../config/database');

// Modules
var mongoose = require('mongoose');

// Local modules
var logger = require('../../config/logger');

var connect = function(env) {
  var env = env;
  return mongoose.connect(configDB.url[env], function(err) {
    logger.debug("Connecting to "+configDB.url[env]);
    if (err) {
      logger.error('Failed to connect to mongo on startup - retrying in 5 sec', err);
      retry(env);
    }
  });
};

var retry = function(env) {
  setTimeout(connect.bind(null, env), 5000);
};

module.exports = {
  connect: connect
};
