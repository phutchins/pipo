'use strict';

var crypto = require('crypto');
var kbpgp = require('kbpgp');
var fs = require('fs');
var logger = require('../../../config/logger');
var config = require('../../../config/pipo')(process.env.NODE_ENV);

function Encryption(options) {
  if (!(this instanceof Encryption)) {
    return new Encryption(options);
  }

  this._options = options || {};
  this.calculatedKeys = {};
  this.keyRing = new kbpgp.keyring.KeyRing();

  // Need to merge this with createSystemUser so we're not defining things in multiple places...

  this.systemUserData = this._options.systemUserData;
  this.systemUser = this._options.systemUser;
}

Encryption.prototype.getKeyFingerprint = function (key, callback) {
  var self = this;
  var fingerprint;

  //Perform a sha1 hash of the key to create a unique short string for storage
  var keyHash = crypto.createHash('sha1').update(key).digest('hex');

  //Check to see if we've already fingerprinted this key and return it so we don't have to check a lot
  if (self.calculatedKeys[keyHash]) {
    return callback(null, self.calculatedKeys[keyHash].fingerprint);
  }

  kbpgp.KeyManager.import_from_armored_pgp({
    armored: key
  }, function(err, keyManager) {
    if (err) {
      return callback(err);
    }
    if (!keyManager) {
      return callback(new Error("Key could not be loaded"));
    }

    fingerprint = keyManager.get_pgp_fingerprint_str();

    //Store fingerprint for later usage
    self.calculatedKeys[keyHash] = {
      fingerprint: fingerprint,
      instance: keyManager
    };

    //Add to our keyRing
    self.keyRing.add_key_manager(keyManager);

    return callback(null, fingerprint);
  });
};

Encryption.prototype.verifyMessageSignature = function(signedMessage, publicKey, expectedPayloadString, callback) {
  var self = this;
  var signer, keyManager, signatureFingerprint, payload, payloadString;

  if (typeof expectedPayloadString === 'function') {
    callback = expectedPayloadString;
    expectedPayloadString = null;
  }

  this.getKeyFingerprint(publicKey, function(err, publicKeyFingerprint) {
    if (err) {
      return callback(err);
    }

    kbpgp.unbox({keyfetch: self.keyRing, armored: signedMessage}, function(err, literals) {
      if (err) {
        return callback(err);
      }
      signer = literals[0].get_data_signer();

      if (!signer) {
        return callback(new Error("Message was not signed, no signer found"));
      }

      self.keyManager = signer.get_key_manager();

      if (!self.keyManager) {
        return callback(new Error("Message was not signed, no keyManager instance"));
      }

      signatureFingerprint = self.keyManager.get_pgp_fingerprint_str();

      if (signatureFingerprint !== publicKeyFingerprint) {
        return callback(new Error("Signature does not match provided publicKey"));
      }

      if (expectedPayloadString === null) {
        return callback(null, signatureFingerprint);
      }

      payload = literals[0].to_signature_payload();

      if (!payload) {
        return callback(new Error("No payload found in signature"));
      }

      var regex = /\r?\n|\r/g
      var payloadString = payload.toString().replace(regex, '');
      expectedPayloadString = expectedPayloadString.toString().replace(regex, '');

      if (payloadString !== expectedPayloadString) {
        return callback(new Error("Signature payload did not match expected payload"));
      }

      return callback(null, signatureFingerprint);

    });
  });
};

Encryption.prototype.buildKeyRing = function(keys, callback) {
  var keyRing = new kbpgp.keyring.KeyRing();
  var err;

  keys.forEach(function(key) {
    kbpgp.KeyManager.import_from_armored_pgp({ armored: key }, function(err, keyManager) {
      //logger.debug("[Encryption.buildKeyRing] Loop: Adding keyManager to keyRing");
      keyRing.add_key_manager(keyManager);
    });
  });

  //logger.debug("[Encryption.buildKeyRing] After key loop, returning.");
  return callback(err, keyRing);
};

Encryption.prototype.buildKeyManager = function(publicKey, privateKey, passphrase, callback) {
  var self = this;

  kbpgp.KeyManager.import_from_armored_pgp({
    armored: publicKey
  }, function(err, keyManager) {
    if (err) {
      console.log("Error loading key", err);
      return callback(err);
    } else {
      keyManager.merge_pgp_private({
        armored: privateKey
      }, function(err) {
        if (!err) {
          self.keyManager = keyManager;
          if (keyManager.is_pgp_locked()) {
            logger.debug("[Encryption.buildKeyManager] Key locked, unlocking.");
            self.unlockKeyManager(keyManager, passphrase, function(err, unlockedKeyManager) {
              logger.debug("[Encryption.buildKeyManager] Unlocked Key. Returning.");
              return callback(null, unlockedKeyManager);
            });
          } else {
            logger.debug("[Encryption.buildKeyManager] Key is not locked... Returning");
            return callback(null, keyManager);
          };
        };
      })
    }
  });
};

Encryption.prototype.unlockKeyManager = function(keyManager, passphrase, callback) {
  var keyManager = keyManager;

  keyManager.unlock_pgp({
    passphrase: passphrase
  }, function (err) {
    if (err) {
      console.log("Error unlocking key", err);
      return callback(err, null);
    }

    return callback(null, keyManager);
  });
};

Encryption.prototype.encryptChatMessage = function(keys, signingKey, message, callback) {
  kbpgp.box({
    msg: message,
    encrypt_for: keys,
    sign_with: signingKey
  }, callback);
};

module.exports = Encryption;
