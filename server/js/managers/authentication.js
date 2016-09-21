'use strict';

var User = require('../../models/user');
var passport = require('passport');
var KeyVerifyStrategy = require('passport-keyverify').Strategy;
var logger = require('../../../config/logger');
var EncryptionManager = require('./encryption');

function Authentication() {
  if (!(this instanceof Authentication)) {
    return new Authentication();
  }
}

Authentication.prototype.init = function ( app ) {
  var self = this;

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser(function(user, done) {
    done(null, user);
  });

  passport.deserializeUser(function(user, done) {
    logger.debug('deserializing user from passport');
    User.findById(user, function(err, user) {
      done(null, user);
    });
  });

  //
  // Authentication
  passport.use(new KeyVerifyStrategy( self.verify ));
};

Authentication.prototype.verify = function(username, nonce, signature, callback) {
  var self = this;
  this.encryption = new EncryptionManager();
  logger.debug('Verifying authentication of user %s', username);

  User.findByUsername(username, function (err, user) {
    if (err) {
      logger.debug('Error getting user by username');
      return callback(err);
    }
    if (!user) { return callback(null, false); }

    var sigBuffer = new Buffer(signature, 'base64');
    var sigString = sigBuffer.toString();

    var publicKey = user.publicKey;
    self.encryption.verifyMessageSignature(sigString, publicKey, nonce, function(err, signatureFingerprint) {
      if (err) { return callback("[Authentication.verifySignature] ERROR: " + err, false); };

      var sessionUser = user.id;

      if (signatureFingerprint) {
        logger.debug("[authentication.verify] User '" + user.username + "' verification SUCCESS with signature fingerprint '" + signatureFingerprint + "'");
        return callback(null, true);
        logger.debug("[authentication.verify] User '" + user.username + "' verification FAILED!");
      } else {
        return callback(null, false);
      }
    });
  });
};

module.exports = Authentication;
