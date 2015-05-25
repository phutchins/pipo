function EncryptionManager() {
  this.keyPair = ({
    publicKey: null,
    privateKey: null
  });

  this.keyRing = new window.kbpgp.keyring.KeyRing();
}

/**
 * Generates a new keypair for this manager
 * @param numBits
 * @param userId
 * @param passphrase
 * @param callback
 */
EncryptionManager.prototype.generateClientKeyPair = function generateClientKeyPair(numBits, userId, passphrase, callback) {
  var self = this;
  var options = {
    numBits: numBits,
    userId: userId,
    passphrase: passphrase
  };

  console.log("Generating client keypair, please wait...");

  window.openpgp.generateKeyPair(options).then(function(keys) {
    self.keyPair = {
      privateKey: keys.privateKeyArmored,
      publicKey: keys.publicKeyArmored
    };
    return callback(null, self.keyPair);
  }).catch(function(err) {
    return callback(err, null);
  });
};

/**
 * Attemtps to load stored PGP key from localStorage and initalize all internal variables
 * @param callback(err, loaded)
 */
EncryptionManager.prototype.loadClientKeyPair = function loadClientKeyPair(callback) {
  var self = this;
  var keyPairData = localStorage.getItem('keyPair');
  if (keyPairData) {
    try {
      keyPairData = JSON.parse(keyPairData);
    }
    catch(e) {
      console.log("Error parsing keyPair data from localStorage", e);
      return callback(e);
    }
  }
  else {
    return callback(null, false);
  }

  this.keyPair = {
    privateKey: keyPairData.privateKey,
    publicKey: keyPairData.publicKey
  };

  //Load key into keyRing
  window.kbpgp.KeyManager.import_from_armored_pgp({
    armored: self.keyPair.privateKey
  }, function(err, keyManager) {
    if (err) {
      console.log("Error loading key", err);
      return callback(err);
    }

    //Unlock key with passphrase if locked
    if (keyManager.is_pgp_locked()) {
      keyManager.unlock_pgp({
        passphrase: "temporaryPassphrase"
      }, function (err) {
        if (err) {
          console.log("Error unlocking key", err);
          return callback(err);
        }
        self.keyRing.add_key_manager(keyManager);
        return callback(null, true);
      });
    }
    else {
      self.keyRing.add_key_manager(keyManager);
      return callback(null, true);
    }
  });
};


/**
 * Encrypts a message to all keys in the room
 * @param room
 * @param message
 * @param callback
 */
EncryptionManager.prototype.encryptRoomMessage = function encryptRoomMessage(room, message, callback) {
  var keys = window.roomUsers[room].map(function(username) {
    return window.userMap[username].keyInstance;
  });

  window.kbpgp.box({
    msg: message,
    encrypt_for: keys
  }, callback);
};

/**
 * Decrypts an incoming message with our key
 * @param encryptedMessage
 * @param callback
 */
EncryptionManager.prototype.decryptMessage = function decryptMessage(encryptedMessage, callback) {
  window.kbpgp.unbox({
    keyfetch: this.keyRing,
    armored: encryptedMessage
  }, callback);
};

window.encryptionManager = new EncryptionManager();
