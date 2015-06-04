function EncryptionManager() {
  this.keyPair = ({
    publicKey: null,
    privateKey: null
  });

  //this.masterKeyPair = ({
  //  password: 'pipo',
  //  id: null,
  //  publicKey: null,
  //  privateKey: null,
  //  encryptedPrivateKey: null
  //});

  // Should update this setting from the server using getConfig and configUpToDate
  this.encryptionScheme = 'masterKey';

  this.keyManager = null;
  this.masterKeyManager = null;
  this.keyRing = new window.kbpgp.keyring.KeyRing();
  this.clientCredentialsLoaded = false;
  this.masterCredentialsLoaded = false;
  this.clientCredentailsDecrypted = false;
  this.masterCredentailsDecrypted = false;
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
  if (self.clientCredentialsLoaded) {
    console.log("Client credentials already loaded...");
    return callback(null, true);
  }
  console.log("[LOAD CLIENT KEY PAIR] Loading client key pair from local storage");
  var keyPairData = localStorage.getItem('keyPair');
  console.log("[LOAD CLIENT KEY PAIR] Loaded keyPairData from localStorage:",keyPairData);
  if (keyPairData) {
    console.log("[LOAD CLIENT KEY PAIR] Loaded client key pair from local storage!");
    try {
      keyPairData = JSON.parse(keyPairData);
    }
    catch(e) {
      console.log("Error parsing keyPair data from localStorage", e);
      return callback(e);
    }
  }
  else {
    console.log("[LOAD CLIENT KEY PAIR] Unable to load client key pair from localStorage");
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
    self.keyManager = keyManager;

    self.decryptClientKey(function(err) {
      if (err) {
        console.log("[LOAD CLIENT KEY PAIR] Error decrypting client key pair: +err");
        callback(err, null);
      }
      self.clientCredentialsLoaded = true;
      callback(null, true);
    });

  });
};

/**
 * Attemtps to load stored PGP key from localStorage and initalize all internal variables
 * @param callback(err, loaded)
 */
EncryptionManager.prototype.loadMasterKeyPair = function loadMasterKeyPair(room, masterKeyPair, callback) {
  var self = this;
  var masterKeyId = masterKeyPair.id;
  var masterPublicKey = masterKeyPair.publicKey;
  var encryptedMasterPrivateKey = masterKeyPair.encryptedPrivateKey;

  console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) masterKeyId: "+masterKeyId+" masterPublicKey: "+masterPublicKey+" encryptedMasterPrivateKey: "+encryptedMasterPrivateKey);
  var masterKeyPairData = localStorage.getItem('masterKeyPair');

  if (masterKeyPair) {
    // MasterKey mode
    self.decryptMasterKey(encryptedMasterPrivateKey, function(err, masterPrivateKey) {
      // We should always have masterKeyPairData as it comes from joinComplete() and newMasterKey()
      if (masterKeyPairData) {
        // If we have already loaded credentials and the id matches the key we received return loaded (true)
        console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) We have masterKeyPairData, masterKeyPair.id: "+masterKeyPair.id);
        try {
          masterKeyPairData = JSON.parse(masterKeyPairData);
        }
        catch(e) {
          console.log("Error parsing masterKeyPair data from localStorage", e);
          return callback(e);
        }
        if (masterKeyPairData.id == masterKeyPair.id) {
          console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) Cached master key pair id matches current...");
          window.encryptionManager.getKeyManager({ publicKey: masterKeyPair.publicKey, privateKey: masterPrivateKey, passphrase: '' }, function(err, keyManager) {
            if (err) {
              return console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) ERROR getting key manager: "+err);
            }
            self.masterKeyManager = keyManager;
            console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) Assigned masterKeyManager to self...");
            window.encryptionManager.unlockMasterKey(room, function(err) {
              if (err) {
                console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) Error decrypting master key pair: "+err);
                return callback(err, false);
              }
              console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) derypted master key pair...");
              self.masterCredentialsLoaded = true;
              return callback(err, true);
            });
          });
        }
        else {
          console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) Our masterKey id did not match current. Saving new keypair to localStorage...");
          localStorage.setItem('masterKeyPair', JSON.stringify(masterKeyPair));
          // Decrypt master key and add to keyRing
          console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) Decrypting master key");
          window.encryptionManager.getKeyManager({ publicKey: masterKeyPair.publicKey, privateKey: masterPrivateKey }, function(err, keyManager) {
            self.masterKeyManager = keyManager;
            window.encryptionManager.unlockMasterKey(room, function(err) {
              self.masterCredentialsLoaded = true;
              return callback(err, true);
            });
          });
        }
        // If no credentails loaded or the id does not match key provided, parse the keyPair data loaded from localStorage
        //console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) Gone past it now...");
        //window.encryptionManager.decryptMasterKey(room, function(err) {
        //  self.masterCredentialsLoaded = true;
        //  return callback(err, true);
        //});
      } else {
        // We didn't find the masterKey for this channel in localStorage so we should save the keyPair provided
        localStorage.setItem('masterKeyPair', JSON.stringify(masterKeyPair));
        self.masterCredentialsDecrypted = false;
        // Decrypt master key and add to keyRing
        window.encryptionManager.unlockMasterKey(room, function(err) {
          self.masterCredentialsLoaded = true;
          return callback(err, true);
        });
        return callback("[ENCRYPTION MANAGER] (loadMasterKeyPair) ERROR - Made it past all conditionals");
      }
    });
    console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) end of loadMasterKeyPair");
  } else {
    // ClientKey mode
  }
};

/*
* create a KeyManager from object containing publicKey and privateKey
*/
EncryptionManager.prototype.getKeyManager = function getKeyManager(data, callback) {
  var privateKey = data.privateKey;
  var publicKey = data.publicKey;
  var passphrase = data.passphrase;

  console.log("[ENCRYPTION MANAGER] (getKeyManager) Starting KeyManager creation with privateKey: "+privateKey+" publicKey: "+publicKey+" passphrase: "+passphrase);
  kbpgp.KeyManager.import_from_armored_pgp({
    armored: publicKey
  }, function(err, keyManager) {
    if (!err) {
      keyManager.merge_pgp_private({
        armored: privateKey
      }, function(err) {
        if (!err) {
          if (keyManager.is_pgp_locked()) {
            keyManager.unlock_pgp({
              passphrase: passphrase
            }, function(err) {
              if (!err) {
                console.log("Loaded private key with passphrase");
              }
              return callback(err, keyManager);
            });
          } else {
            console.log("Loaded private key w/o passphrase");
            return callback(err, keyManager);
          }
        } else {
          return callback(err, null);
        }
      });
    } else {
      return callback(err, null);
    }
  });
}

EncryptionManager.prototype.decryptClientKey = function decryptClientKey(callback) {
  var self = this;
  //Unlock key with passphrase if locked
  if (self.keyManager.is_pgp_locked()) {
    var tries = 3;
    promptAndDecrypt();

    function promptAndDecrypt() {
      ChatManager.promptForPassphrase(function (passphrase) {
        self.keyManager.unlock_pgp({
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

          //self.keyManager = keyManager;
          self.keyRing.add_key_manager(self.keyManager);

          self.clientCredentialsDecrypted = true;

          return callback(null);
        });
      });
    }
  }
  else {
    self.keyRing.add_key_manager(keyManager);
    return callback(null);
  }
};

EncryptionManager.prototype.unlockMasterKey = function unlockMasterKey(room, callback) {
  //Unlock key with passphrase if locked
  var self = this;
  if (self.encryptionScheme == 'masterKey' && self.masterKeyManager.is_pgp_locked()) {
    var tries = 3;
    decryptMaster();

    function decryptMaster() {
      self.masterKeyManager.unlock_pgp({
        passphrase: 'pipo'
      }, function (err) {
        if (err) {
          console.log("Error unlocking key", err);
          return callback(err);
        }

        //self.masterKeyManager = masterKeyManager;
        self.keyRing.add_key_manager(self.masterKeyManager);

        self.masterCredentialsDecrypted = true;

        return callback(null);
      });
    }
  }
  else {
    self.keyRing.add_key_manager(self.masterKeyManager);
    console.log("[UNLOCK MASTER KEY] Added passwordless masterKey to keyring");
    return callback(null);
  }
}


/**
 * Encrypts a message to all keys in the room
 * @param room
 * @param message
 * @param callback
 */
EncryptionManager.prototype.encryptRoomMessage = function encryptRoomMessage(room, message, callback) {
  var self = this;

  //Encrypt the message
  if (this.encryptionScheme == "masterKey") {
    console.log("[ENCRYPT ROOM MESSAGE] Using masterKey scheme");
    this.encryptMasterKeyMessage(room, message, function(err, pgpMessage) {
      callback(err, pgpMessage);
    });
  } else if (this.encryptionScheme == "clientKey") {
    console.log("[ENCRYPT ROOM MESSAGE] Using clientKey scheme");
    this.encryptClientKeyMessage(room, message, function(err, pgpMessage) {
      callback(err, pgpmessage);
    });
  } else {
    console.log("[ENCRYPT ROOM MESSAGE] Using default scheme");
    this.encryptClientKeyMessage(room, message, function(err, pgpMessage) {
      callback(err, pgpmessage);
    });
  }
};

/**
 * Encrypts messages to the master key if we are using
 * master key room message encryption
 */
EncryptionManager.prototype.encryptMasterKeyMessage = function encryptMasterKeyMessage(room, message, callback) {
    var masterPublicKey = openpgp.key.readArmored(this.masterKeyPair.publicKey);
    openpgp.encryptMessage(masterPublicKey.keys, message).then(function(pgpMessage) {
      callback(null, pgpMessage);
    }).catch(function(error) {
      return callback(error, null);
    });
};

EncryptionManager.prototype.encryptClientKeyMessage = function encryptClientKeyMessage(room, message, callback) {
  //Build array of all users' keyManagers
  var keys = window.roomUsers[room].map(function(username) {
    return window.userMap[username].keyInstance;
  }).filter(function(key) {
    return !!key;
  });
  //Add our own key to the mix so that we can read the message as well
  keys.push(self.keyManager);

  window.kbpgp.box({
    msg: message,
    encrypt_for: keys,
    sign_with: self.keyManager
  }, callback);
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
EncryptionManager.prototype.decryptMasterKeyMessage = function decryptMasterKeyMessage(pgpMessage, callback) {
  // TODO: Should get masterPrivateKey from window.kbpgp.unbox like above
  var masterPrivateKey = this.masterKeyPair.privateKey;
  masterPrivateKey = openpgp.key.readArmored(masterPrivateKey).keys[0];
  if (typeof masterPrivateKey !== 'undefined') {
    masterPrivateKey.decrypt(this.masterKeyPair.password);
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
  var privateKey = keyPair.privateKey;
  var publicKey = keyPair.publicKey;
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
            var blob = new Blob([publicKey], {type: 'text/plain'});
            fileWriter.write(blob);
          }, errorHandler);
        }, errorHandler);
      };
      fileWriter.onerror = function(e) {
        console.log('Write failed: ' + e.toString());
      };
      // Create a new Blob and write it to log.txt.
      var blob = new Blob([privateKey], {type: 'text/plain'});
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


EncryptionManager.prototype.decryptMasterKey = function decryptMasterKey(encryptedMasterPrivateKey, callback) {
  var self = this;
  console.log("[DECRYPT MASTER KEY] encryptedMasterPrivateKey: "+encryptedMasterPrivateKey);
  kbpgp.unbox({keyfetch: self.keyRing, armored: encryptedMasterPrivateKey}, function(err, literals) {
    if (err != null) {
      return console.log("Problem: " + err);
    } else {
      var decryptedMasterPrivateKey = null;
      console.log("decrypted message");
      //console.log(literals[0].toString());
      decryptedMasterPrivateKey = literals[0].toString();
      var ds = km = null;
      ds = literals[0].get_data_signer();
      if (ds) { km = ds.get_key_manager(); }
      if (km) {
        console.log("Signed by PGP fingerprint");
        console.log(km.get_pgp_fingerprint().toString('hex'));
        return callback(err, decryptedMasterPrivateKey);
      }
      console.log("Unsigned key");
      return callback(err, decryptedMasterPrivateKey);
    }
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
        //console.log("[GET MASTER KEY PAIR] data.keyId: "+data.keyId+" data.publicKey: "+data.publicKey+" data.encryptedPrivateKey: "+data.encryptedPrivateKey);
        //TODO: add the keys to a keyManager here and save them to self

        kbpgp.KeyManager.import_from_armored_pgp({
          armored: data.publicKey
        }, function(err, masterKeyPair) {
          if (!err) {
            masterKeyPair.merge_pgp_private({
              armored: data.privateKey
            }, function(err) {
              if (!err) {
                if (masterKeyPair.is_pgp_locked()) {
                  masterKeyPair.unlock_pgp({
                    passphrase: ''
                  }, function(err) {
                    if (!err) {
                      console.log("Loaded private key with passphrase");
                    }
                  });
                } else {
                  console.log("Loaded private key w/o passphrase");
                }
              }
              localStorage.setItem('masterKeyPair', JSON.stringify(data));
              self.masterKeyManager = masterKeyPair;
            });
          }
        });
        return callback(null, data);
      }
    }
  });
};

// TODO: Change references from updateRemotePublicKey to verifyRemotePublicKey
EncryptionManager.prototype.verifyRemotePublicKey = function updateRemotePublicKey(userName, publicKey, callback) {
  console.log("Verifying remote public key for user '"+userName+"'");
  $.ajax({
    type: "GET",
    url: "/key/publickey",
    dataType: "json",
    data: {
      userName: userName
    },
    statusCode: {
      404: function(data) {
        console.log("No key found on remote");
        return callback(null, 'nokey');
      },
      200: function(data) {
        //console.log("[DEBUG] (updateRemotePublicKey) data: "+data);
        var remotePublicKey = data.publicKey;
        console.log("Key exists on remote");
        //console.log("Remote Pub Key: "+data.publicKey);
        if (keyPair.publicKey == remotePublicKey) {
          console.log("Key on remote matches local");
          return callback(null, 'match');
        } else {
          console.log("Key on remote does not match");
          //console.log("local publicKey: "+keyPair.publicKey);
          //console.log("remote publicKey: "+remotePublicKey);
          return callback(null, 'nomatch');
        };
      }
    }
  });
};

//TODO: Yes... I know this is a duplicate. Will deal with it later.
EncryptionManager.prototype.updatePublicKeyOnRemote = function updatePublicKeyOnRemote(userName, publicKey, callback) {
  console.log("Updating public key on remote");
  $.ajax({
    type: "POST",
    url: "/key/publickey",
    dataType: "json",
    data: {
      userName: userName,
      publicKey: publicKey
    },
    success: function(data, textStatus, xhr) {
    },
    statusCode: {
      404: function() {
        console.log("Got 404 when updating public key on remote");
        return callback("Error updating public key on remote");
      },
      200: function(data, textStatus, xhr) {
        console.log("Updated remote publicKey successfully");
        return callback(null);
      }
    }
  });
};


window.encryptionManager = new EncryptionManager();
