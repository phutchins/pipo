var crypto = require('crypto');
var kbpgp = require('kbpgp');

function EncryptionManager() {
  var calculatedKeys = {};
  var keyRing = new kbpgp.keyring.KeyRing();

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
        logger.debug("payloadString: "+payloadString+" expectedPayloadString: "+expectedPayloadString);

        if (payloadString !== expectedPayloadString) {
          return callback(new Error("Signature payload did not match expected payload"));
        }

        return callback(null, signatureFingerprint);

      });
    });
  };
}

module.exports = new EncryptionManager();
