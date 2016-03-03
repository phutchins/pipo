var User = require('../../models/user');
var passport = require('passport');
var KeyVerifyStrategy = require('passport-keyverify').Strategy;
var EncryptionManager = require('./encryption');

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
    passport.use(new KeyVerifyStrategy(
      function(username, nonce, signature, done) {
        console.log("[server.passport.keyVerify] nonce: " + nonce + " signature: " + signature);
        User.findByUsername(username, function (err, user) {
          if (err) { return done(err); }
          if (!user) { return done(null, false); }

          var sigBuffer = new Buffer(signature, 'base64');
          var sigString = sigBuffer.toString();

          console.log("[server.passport.keyVerify] sigString: " + sigString);

          var publicKey = user.publicKey;
          EncryptionManager.verifyMessageSignature(sigString, publicKey, nonce, function(err, signatureFingerprint) {
            if (err) { return console.log("[AuthenticationManager.verifySignature] ERROR: " + err); };
            console.log("[AuthenticationManager.verifySignature] signatureFingerprint: " + signatureFingerprint);

            var sessionUser = user.id;

            console.log("[authentication.init] signatureFingerprint: " + signatureFingerprint);
            if (signatureFingerprint) {
              return done(null, sessionUser);
            } else {
              return done(null, false);
            }
          });

          // May should pass keys for verification as base64 instead of the other way around

          //var verifier = crypto.createVerify("RSA-SHA256");
          //verifier.update(nonce);

          //var sig = btoa(signature);
          //var publicKey = btoa(user.publicKey);
          //var publicKeyBuf = new Buffer(publicKey, 'base64');

          //var result = verifier.verify(publicKeyBuf, sig, "base64");
          //var result = verifier.verify(publicKey, signature);

          //var result = true;

        });
      }
    ));
  };
}

module.exports = new AuthenticationManager();
