var User = require('../../models/user');
var passport = require('passport');
var KeyVerifyStrategy = require('passport-keyverify').Strategy;
var EncryptionManager = require('./encryption');
var logger = require('../../../config/logger');

function AuthenticationManager() {
  this.init = function ( app ) {
    app.use(passport.initialize());
    app.use(passport.session());

    passport.serializeUser(function(user, done) {
        done(null, user);
    });

    passport.deserializeUser(function(user, done) {
      User.findById(id, function(err, user) {
        done(null, user);
      });
    });

    //
    // Authentication
    passport.use(new KeyVerifyStrategy( this.verify ));
  };

  this.verify = function(username, nonce, signature, callback) {
    User.findByUsername(username, function (err, user) {
      if (err) { return done(err); }
      if (!user) { return done(null, false); }

      var sigBuffer = new Buffer(signature, 'base64');
      var sigString = sigBuffer.toString();

      var publicKey = user.publicKey;
      EncryptionManager.verifyMessageSignature(sigString, publicKey, nonce, function(err, signatureFingerprint) {
        if (err) { return callback("[AuthenticationManager.verifySignature] ERROR: " + err, false); };

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
}

module.exports = new AuthenticationManager();
