var crypto = require('crypto');
var kbpgp = require('kbpgp');
var fs = require('fs');
var logger = require('../../../config/logger');

function EncryptionManager() {
  var calculatedKeys = {};
  var keyRing = new kbpgp.keyring.KeyRing();
  // Need to merge this with createSystemUser so we're not defining things in multiple places...
  this.systemUser = {
    username: 'pipo',
    publicKey: fs.readFileSync(__dirname + '/../../../keys/pipo.pub'),
    privateKey: fs.readFileSync(__dirname + '/../../../keys/pipo.key'),
    email: 'pipo@pipo.chat'
  };

  this.getKeyFingerprint = function (key, callback) {
    var fingerprint;

    //Perform a sha1 hash of the key to create a unique short string for storage
    var keyHash = crypto.createHash('sha1').update(key).digest('hex');

    //Check to see if we've already fingerprinted this key and return it so we don't have to check a lot
    if (calculatedKeys[keyHash]) {
      return callback(null, calculatedKeys[keyHash].fingerprint);
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
      calculatedKeys[keyHash] = {
        fingerprint: fingerprint,
        instance: keyManager
      };

      //Add to our keyRing
      keyRing.add_key_manager(keyManager);

      return callback(null, fingerprint);
    });
  };

  this.verifyMessageSignature = function(signedMessage, publicKey, expectedPayloadString, callback) {
    var signer, keyManager, signatureFingerprint, payload, payloadString;

    if (typeof expectedPayloadString === 'function') {
      callback = expectedPayloadString;
      expectedPayloadString = null;
    }

    this.getKeyFingerprint(publicKey, function(err, publicKeyFingerprint) {
      if (err) {
        return callback(err);
      }

      kbpgp.unbox({keyfetch: keyRing, armored: signedMessage}, function(err, literals) {
        if (err) {
          return callback(err);
        }
        signer = literals[0].get_data_signer();

        if (!signer) {
          return callback(new Error("Message was not signed, no signer found"));
        }

        keyManager = signer.get_key_manager();

        if (!keyManager) {
          return callback(new Error("Message was not signed, no keyManager instance"));
        }

        signatureFingerprint = keyManager.get_pgp_fingerprint_str();

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
        console.log("payloadString: "+payloadString+" expectedPayloadString: "+expectedPayloadString);

        if (payloadString !== expectedPayloadString) {
          return callback(new Error("Signature payload did not match expected payload"));
        }

        return callback(null, signatureFingerprint);

      });
    });
  };


  this.buildKeyRing = function(keys, callback) {
    var keyRing = new kbpgp.keyring.KeyRing();
    var err;

    keys.forEach(function(key) {
      kbpgp.KeyManager.import_from_armored_pgp({ armored: key }, function(err, keyManager) {
        logger.debug("[EncryptionManager.buildKeyRing] Loop: Adding keyManager to keyRing");
        keyRing.add_key_manager(keyManager);
      });
    });

    logger.debug("[EncryptionManager.buildKeyRing] After key loop, returning.");
    return callback(err, keyRing);
  };


  this.buildKeyManager = function(publicKey, privateKey, passphrase, callback) {
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
              logger.debug("[EncryptionManager.buildKeyManager] Key locked, unlocking.");
              self.unlockKeyManager(keyManager, passphrase, function(err, unlockedKeyManager) {
                logger.debug("[EncryptionManager.buildKeyManager] Unlocked Key. Returning.");
                return callback(null, unlockedKeyManager);
              });
            } else {
              logger.debug("[EncryptionManager.buildKeyManager] Key is not locked... Returning");
              return callback(null, keyManager);
            };
          };
        })
      }
    });
  };


  this.unlockKeyManager = function(keyManager, passphrase, callback) {
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



  this.encryptChatMessage = function(keys, signingKey, message, callback) {
    kbpgp.box({
      msg: message,
      encrypt_for: keys,
      sign_with: signingKey
    }, callback);
  };
}

module.exports = new EncryptionManager();
