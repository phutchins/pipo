function EncryptionManager() {
  this.keyPair = ({
    publicKey: null,
    privateKey: null
  });

  this.masterKeyPair = ({
    keyId: null,
    publicKey: null,
    privateKey: null
  });

  // Should update this setting from the server using getConfig and configUpToDate
  this.encryptionScheme = 'masterKey';

  this.keyManager = null;
  this.keyRing = new window.kbpgp.keyring.KeyRing();
  this.credentialsLoaded = false;
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
  if (self.credentialsLoaded) {
    return callback(null, true);
  }
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
      var tries = 3;
      promptAndDecrypt();

      function promptAndDecrypt() {
        ChatManager.promptForPassphrase(function (passphrase) {
          keyManager.unlock_pgp({
            passphrase: passphrase
          }, function (err) {
            if (err) {
              if (tries) {
                tries--;
                return promptAndDecrypt();
              }
              console.log("Error unlocking key", err);
              return callback(err);
            }

            self.keyManager = keyManager;
            self.keyRing.add_key_manager(keyManager);
            self.credentialsLoaded = true;

            return callback(null, true);
          });
        });
      }
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
  var self = this;

  //Build array of all users' keyManagers
  var keys = window.roomUsers[room].map(function(username) {
    return window.userMap[username].keyInstance;
  }).filter(function(key) {
    return !!key;
  });

  //Add our own key to the mix so that we can read the message as well
  keys.push(self.keyManager);

  //Encrypt the message
  if (Config.encryptionScheme == 'masterKey') {
    var masterPubKey = openpgp.key.readArmored(key);
    openpgp.encryptMessage(masterPubKey.keys, message).then(function(pgpMessage) {
      callback(null, pgpMessage);
    }).catch(function(error) {
      return callback(error, null);
    });
  } else {
    window.kbpgp.box({
      msg: message,
      encrypt_for: keys,
      sign_with: self.keyManager
    }, callback);
  };
};

/**
 * Encrypts messages to the master key if we are using
 * master key room message encryption
 */
EncryptionManager.prototype.encryptMasterKeyMessage = function encryptMasterKeyMessage(key, message, callback) {
};

EncryptionManager.prototype.encryptPrivateMessage = function encryptPrivateMessage(username, message, callback) {
  var self = this;
  window.kbpgp.box({
    msg: message,
    encrypt_for: window.userMap[username].keyInstance,
    sign_with: self.keyManager
  }, callback);
};

/**
 * Decrypts an incoming message with our key
 * @param encryptedMessage
 * @param callback
 */
 //TODO: Should name this appropriately for client key decryption
EncryptionManager.prototype.decryptMessage = function decryptMessage(encryptedMessage, callback) {
  window.kbpgp.unbox({
    keyfetch: this.keyRing,
    armored: encryptedMessage
  }, callback);
};

//TODO: Should name this appropriately for master key decryption
EncryptionManager.prototype.decryptRoomMessage = function decryptRoomMessage(key, passphrase, pgpMessage, callback) {
  var masterPrivateKey = openpgp.key.readArmored(key).keys[0];
  if (typeof masterPrivateKey !== 'undefined') {
    masterPrivateKey.decrypt(passphrase);
    pgpMessage = openpgp.message.readArmored(pgpMessage);
    openpgp.decryptMessage(masterPrivateKey, pgpMessage).then(function(plaintext) {
      console.log("Decrypted message!");
      callback(null, plaintext);
    }).catch(function(err) {
      console.log("Error decrypting message");
      return callback(err, null);
    });
  } else {
    console.log("master private key is undefined!");
    return callback("master private key is undefined", null);
  }
}


//TODO: Determine if these are needed

EncryptionManager.prototype.removeClientKeyPair = function removeClientKeyPair(fs, callback) {
  fs.root.getFile('clientkey.aes', {create: false}, function(fileEntry) {
    fileEntry.remove(function() {
      console.log('File successufully removed.');
      fs.root.getFile('clientkey.pub', {create: false}, function(fileEntry) {
        fileEntry.remove(function() {
          console.log('File successufully removed.');
          callback(null);
        }, errorHandler);
      }, errorHandler);
    }, errorHandler);
  }, errorHandler);
  function errorHandler(err) {
    var msg = '';
    switch(err.name) {
      case "BAD":
        console.log("Bad");
        return callback(err.message);
      default:
        message = 'Unknown Error: '+err.name;
        return callback(err.message);
    };
    console.log("Error: "+message);
  };
};

EncryptionManager.prototype.regenerateClientKeyPair = function regenerateClientKeyPair(callback) {
  initStorage(function(err, fs) {
    if (err) { return callback(err); };
    removeClientKeyPair(fs, function() {
      // Generate new key pair
      promptForKeyCredentials(function(err, data) {
        var password = data.password;
        var userName = data.userName;
        var email = data.email;
        var fullName = data.fullName;
        generateClientKeyPair(data, function(err, keyPair) {
          saveClientKeyPair(fs, keyPair, userName, function(err) {
            if(err) { return console.log("Error regenerating client key pair: "+err); };
            callback(null);
          });
        });
      });
    });
  });
};

EncryptionManager.prototype.saveClientKeyPair = function saveClientKeyPair(fs, keyPair, userName, callback) {
  var privKey = keyPair.privKey;
  var pubKey = keyPair.pubKey;
  fs.root.getFile(userName+'_clientkey.aes', {create: true}, function(fileEntry) {
    // Create a FileWriter object for our FileEntry (log.txt).
    fileEntry.createWriter(function(fileWriter) {
      fileWriter.onwriteend = function(e) {
        console.log('Client secret key write completed.');
        fs.root.getFile(userName+'_clientkey.pub', {create: true}, function(fileEntry) {
          // Create a FileWriter object for our FileEntry (log.txt).
          fileEntry.createWriter(function(fileWriter) {
            fileWriter.onwriteend = function(e) {
              console.log('Client public key write completed.');
              return callback(null);
            };
            fileWriter.onerror = function(e) {
              console.log('Write failed: ' + e.toString());
            };
            // Create a new Blob and write it to log.txt.
            var blob = new Blob([pubKey], {type: 'text/plain'});
            fileWriter.write(blob);
          }, errorHandler);
        }, errorHandler);
      };
      fileWriter.onerror = function(e) {
        console.log('Write failed: ' + e.toString());
      };
      // Create a new Blob and write it to log.txt.
      var blob = new Blob([privKey], {type: 'text/plain'});
      fileWriter.write(blob);
    }, errorHandler);
  }, errorHandler);
  function errorHandler(err) {
    var msg = '';
    switch(err.name) {
      case "BAD":
        console.log("Bad");
      default:
        message = 'Unknown Error: '+err.name;
    };
    console.log("Error: "+message);
  };
}

EncryptionManager.prototype.initStorage = function initStorage(callback) {
  //Taking care of the browser-specific prefix
  window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
  window.requestFileSystem(window.PERSISTENT, 1024*1024,onInitFs, function(err) {
    console.log("Error initStorage: "+err);
  });
  function onInitFs(fs) {
    console.log("[INIT STORAGE] Initializing storage...");
    // First check how much we can use in the Persistent storage.
    fs = fs;
    navigator.webkitPersistentStorage.queryUsageAndQuota(
      function (usage, quota) {
        var availableSpace = quota - usage;
        console.log("availableSpace: "+availableSpace);
        if (availableSpace >= amountOfSpaceNeeded) {
          console.log("Have as much space as we need!");
          return callback(null, fs);
        }
        var requestingQuota = amountOfSpaceNeeded + usage;
        navigator.webkitPersistentStorage.requestQuota(
            requestingQuota,
            function (grantedQuota) {
              console.log("Didn't have enough space so requested more. Got: "+grantedQuota);
              return callback(null, fs)
            },
            onError);
      }, onError
    );
    function onError(err) {
      console.log("Got error during init storage: "+err);
      callback(err);
    }
  };
};


EncryptionManager.prototype.decryptMasterKey = function decryptMasterKey(userName, privKey, encryptedMasterPrivateKey, callback) {
  var encMasterPrivateKey = openpgp.message.readArmored(encryptedMasterPrivateKey);
  var clientPrivKey = openpgp.key.readArmored(privKey).keys[0];
  clientPrivKey.decrypt(clientKeyPassword);
  //console.log("[DEBUG] (decryptMasterKey) values - userName: "+userName+" privKey: "+clientPrivKey+" encMasterPrivateKey: "+encMasterPrivateKey);
  console.log("[DEBUG] about to start decrypting master key");
  //console.log("[DEBUG] encryptedMasterPrivateKey is: "+encryptedMasterPrivateKey);
  //console.log("[DEBUG] decrypting master private key and client public key is: "+keyPair.pubKey);
  //console.log("[DEBUG] decrypting master private key and client private key is: "+keyPair.privKey);

  openpgp.decryptMessage(clientPrivKey, encMasterPrivateKey).then(function(decryptedKey) {
    console.log("[DEBUG] in decryptMessage callback");
    //console.log("decrypted key in decryptMaster Key is: "+decryptedKey);
    callback(null, decryptedKey);
  }).catch(function(err) {
    console.log("[DEBUG] error decrypting message: "+err);
    if (err) { callback(err, null); };
  });
};

EncryptionManager.prototype.getMasterKeyPair = function getMasterKeyPair(userName, callback) {
  var timestamp = new Date().toString();
  console.log("["+timestamp+"] Getting master keyPair for "+userName);
  $.ajax({
    type: "GET",
    url: "/key/masterKeyPair",
    dataType: "json",
    data: {
      userName: userName
    },
    statusCode: {
      404: function(err) {
        console.log("["+timestamp+"] [MASTER KEY PAIR] (404) Error getting master keypair: "+err);
        return callback(err, null);
      },
      200: function(data) {
        console.log("["+timestamp+"] [MASTER KEY PAIR] (200) Encrypted masterKeyPair retrieved and cached");
        return callback(null, data);
      }
    }
  });
};

EncryptionManager.prototype.updateRemotePubKey = function updateRemotePubKey(userName, pubKey, callback) {
  console.log("Updating remote public key");
  $.ajax({
    type: "GET",
    url: "/key/pubkey",
    dataType: "json",
    data: {
      userName: userName
    },
    statusCode: {
      404: function(err) {
        console.log("No key found on remote");
        updatePubKeyOnRemote(userName, keyPair.pubKey, function(err) {
          console.log("1 Updating public key on remote");
          if (err) {
            console.log("Error updating pubKey on remote");
            return callback(err);
          } else {
            console.log("Updated remote pubKey");
              return callback(null);
          }
        });
      },
      200: function(data) {
        //console.log("[DEBUG] (updateRemotePubKey) data: "+data);
        var remotePubKey = data.pubKey;
        console.log("Key exists on remote");
        //console.log("Remote Pub Key: "+data.pubKey);
        if (keyPair.pubKey == remotePubKey) {
          console.log("Key on remote matches local");
          return callback(null);
        } else {
          console.log("Key on remote does not match");
          //console.log("local pubKey: "+keyPair.pubKey);
          //console.log("remote pubKey: "+remotePubKey);
          updatePubKeyOnRemote(userName, keyPair.pubKey, function(err) {
            if (err) {
              console.log("Error updating pubKey on remote");
              return callback(err);
            } else {
              console.log("Updated remote pubKey");
              return callback(null);
            }
          });
        }
      }
    }
  });
};

//TODO: Yes... I know this is a duplicate. Will deal with it later.
EncryptionManager.prototype.updatePubKeyOnRemote = function updatePubKeyOnRemote(userName, pubKey, callback) {
  console.log("2 Updating public key on remote");
  $.ajax({
    type: "POST",
    url: "/key/pubkey",
    dataType: "json",
    data: {
      userName: userName,
      pubKey: pubKey
    },
    success: function(data, textStatus, xhr) {
    },
    statusCode: {
      404: function() {
        console.log("Got 404 when updating public key on remote");
        return callback("Error updating public key on remote");
      },
      200: function(data, textStatus, xhr) {
        console.log("Updated remote pubKey successfully");
        return callback(null);
      }
    }
  });
};


window.encryptionManager = new EncryptionManager();
