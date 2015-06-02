function SocketClient() {
  var self = this;
  var host = window.location.host;
  this.socket = window.io(host + '/socket');

  window.userName = localStorage.getItem("userName");
  window.autoJoinRooms = ['general'];

  this.socket.on('connect', function() {
    console.log("Connected to socket.io server");
    self.init();
    //self.initMasterKey();
  });

  this.socket.on('connect_error', function(err) {
    console.log('connection error', err);
    if (self.listeners) {
      ChatManager.disableChat();
    }
  });
}

SocketClient.prototype.init = function() {
  var self = this;
  console.log("[INIT] Loading client keypair...");
  window.encryptionManager.loadClientKeyPair(function (err, loaded) {
    if (err) {
      //Show error somewhere
    }
    if (!loaded) {
      console.log("[INIT] Prompting for credentials");
      return ChatManager.promptForCredentials();
    } else {
      console.log("[INIT] Client credentials loaded");
    }
    if (!self.listeners) {
      self.addListeners();
    }
    console.log("[INIT] Authenticating");
    //TODO: Here we should confirm that the client publickey that we have matches the one on the server
    // We can then prompt the user to either load the keypair with the ID thats on the server ...
    // ... or upload the current client publickey to the server which would require re-auth by an admin
    window.encryptionManager.verifyRemotePublicKey(window.userName, window.encryptionManager.keyPair.publicKey, function(err, result) {
      if (err) {
        return console.log("[INIT] Error updating remote public key: "+err);
        //Show error
      }
      if (result == 'match') {
        console.log("[INIT] Your public key matches what is on the server");
        return self.authenticate();
      } else if (result == 'nomatch') {
        // Prompt to update remote key
        window.encryptionManager.updatePublicKeyOnRemote(window.userName, window.encryptionManager.keyPair.publicKey, function(err) {
          if (err) {
            return console.log("[INIT] ERROR updating public key on server: "+err);
          };
          return self.authenticate();
        });
      } else if (result == 'nokey') {
        // Prompt to update remote key
        window.encryptionManager.updatePublicKeyOnRemote(window.userName, window.encryptionManager.keyPair.publicKey, function(err) {
          if (err) {
            return console.log("[INIT] ERROR updating public key on server: "+err);
          };
          return self.authenticate();
        });
      };
    });
  });
};

SocketClient.prototype.joinRoom = function(room, callback) {
  console.log("[AUTHENTICATED] Joining channel #"+room+" as "+window.userName+" with master keyId "+window.masterKeyId);
  self.socket.emit('join', { userName: window.userName, channel: room, masterKeyId: window.masterKeyId } );
  if (window.encryptionManager.encryptionScheme == 'masterKey') {
    // Make sure we have the most recent verison of our master keys for all
    console.log("[AUTHENTICATED] In Master Key mode - currentKeyId: "+window.encryptionManager.masterKeyPair.id);
    self.socket.emit('masterKeySync', { currentKeyId: window.encryptionManager.masterKeyPair.id });
  } else {
  }

  if (window.encryptionManager.encryptionScheme == 'masterKey') {
    console.log("[INIT] Loading master credentials");
    //TODO: finish this...
    window.encryptionManager.loadMasterKeyPair(function(err, loaded) {
      // Should return if we have masterKeyPair, if not do something here to get it and then run init again
      if (err) { return console.log("[INIT] ERROR loading master key pair") };
      window.encryptionManager.decryptKeys(function(err) {
        console.log("[INIT] Done decrypting master and client credentials");
      });
    });
  } else {
    window.encryptionManager.decryptKeys(function(err) {
      console.log("[INIT] Done decrypting client credentials");
    });
  };

  callback(null);
};

SocketClient.prototype.addListeners = function() {
  var self = this;
  var channel = 'general';
  self.listeners = true;
  this.socket.on('authenticated', function(data) {
    // TODO: check data.message here and if not 'ok' warn user and give options
    console.log("[AUTHENTICATED] Authenticated successfully");

    // Use cilent keys and enable chat now
    // Should enable chat for specific rooms
    autoJoinRooms.forEach(function(room) {
      self.joinRoom(room, function(err) {
        ChatManager.enableChat(room);
      });
    });
  });



  this.socket.on('errorMessage', function(data) {
    console.log('errorMessage', data);
  });

  this.socket.on('user connect', function(data) {
    console.log('user connect', data);
  });

  this.socket.on('roomMessage', function(data) {
    if (window.encryptionManager.encryptionScheme == 'masterKey') {
      window.encryptionManager.decryptMasterKeyMessage(data.message, function(err, message) {
        if (err) {
          console.log(err);
        }
        ChatManager.handleMessage(message, data.user);
      });
    } else if (window.encryptionManager.encryptionScheme == 'clientKey') {
      window.encryptionManager.decryptMessage(data.message, function(err, message) {
        if (err) {
          console.log(err);
        }
        ChatManager.handleMessage(message, data.user);
      });
    };
  });

  this.socket.on('privateMessage', function(data) {
    console.log('privateMessage', data);
    window.encryptionManager.decryptMessage(data.message, function(err, message) {
      if (err) {
        console.log(err);
      }
      ChatManager.handlePrivateMessage(message, data.from, data.to);
    });
  });

  this.socket.on('newMasterKey', function(data) {
    console.log("[SOCKET] 'new master key'");
    window.encryptionManager.getMasterKeyPair(userName, function(err, encMasterKeyPair) {
      if (err) {
        console.log("Error getting master key pair: "+err);
        ChatManager.localMsg({ type: "ERROR", message: "Error getting master key pair" });
      } else {
        console.log("Got master keypair, ready to encrypt/decrypt");
        //console.log("Encrypted master key is: "+encMasterKeyPair.privateKey);
        //console.log("Public master key is: "+encMasterKeyPair.publicKey);
        window.encryptionManager.masterKeyPair.publicKey = encMasterKeyPair.publicKey;
        window.encryptionManager.masterKeyPair.encryptedPrivateKey = encMasterKeyPair.privateKey;
        console.log("Ensuring that client keypair exists");
        //console.log("keyPair.privateKey at new master key is: "+keyPair.privateKey);
        if (typeof encryptionManager.keyPair.privateKey !== 'undefined' && encryptionManager.keyPair.privateKey !== null) {
          console.log("(new master key) Trying to decrypt master key...");
          console.log("[NEW MASTER KEY] window.userName: "+window.userName);
          console.log("[NEW MASTER KEY] window.encryptionManager.keyPair.privateKey: "+window.encryptionManager.keyPair.privateKey);
          console.log("[NEW MASTER KEY] window.encryptionManager.masterKeyPair.encryptedPrivateKey: "+window.encryptionManager.masterKeyPair.encryptedPrivateKey);
          encryptionManager.decryptMasterKey(window.userName, window.encryptionManager.keyPair.privateKey, window.encryptionManager.masterKeyPair.encryptedPrivateKey, function(err, key) {
            console.log("(new master key) Caching master private key decrypted");
            window.encryptionManager.masterKeyPair.privateKey = key;
            encryptionManager.loadMasterKeyPair(function(err, loaded) {
              if (!loaded) {
                return console.log("Error loading keypair from local storage");
              };
              ChatManager.localMsg({ type: null, message: "Updated master key pair" });
              ChatManager.enableChat();
            });
          });
        } else {
          console.log("Private key does not yet exist so cannot decrypt master key");
        };
      };
    });
  });

  this.socket.on('userlist update', function(data) {
    console.log("Got userlist update!");
    window.roomUsers[data.channel] = [];

    data.userList.forEach(function(user) {
      if (user) {
        if (window.userMap[user.userName]) {
          if (window.userMap[user.userName].publicKey === user.publicKey) {
            return;
          }
        }

        window.roomUsers[data.channel].push(user.userName);
        window.userMap[user.userName] = {
          publicKey: user.publicKey
        };

        //Don't build publicKey for ourselves
        if (user.userName != window.userName) {

          //Build pgp key instance
          console.log("[USERLIST UPDATE] user.publicKey: "+user.publicKey);
          window.kbpgp.KeyManager.import_from_armored_pgp({
            armored: user.publicKey
          }, function (err, keyInstance) {
            if (err) {
              console.log("Error importing user key", err);
            }
            console.log("imported key", user.userName);
            window.userMap[user.userName].keyInstance = keyInstance;
            encryptionManager.keyRing.add_key_manager(keyInstance);
          });

        }

      }
    });

    //Don't notify us about ourselves
    if (data.joinUser && window.userName !== data.joinUser) {
      ChatManager.sendNotification(null, 'PiPo', data.joinUser + ' has joined channel #' + data.channel, 3000);
    }

    console.log("[USERLIST UPDATE] Updating userlist");
    ChatManager.updateUserList();

  });

  this.socket.on('chatStatus', function(data) {
    console.log("Got chat status...");
    var statusType = data.statusType;
    var statusMessage = data.statusMessage;
    ChatManager.localMsg({ type: statusType, message: statusMessage });
    var $messages = $('#messages');
    $messages[0].scrollTop = $messages[0].scrollHeight;
  });

};

SocketClient.prototype.authenticate = function() {
  console.log("[AUTH] Authenticating with server with userName: '"+window.userName+"'");
  this.socket.emit('authenticate', {userName: window.userName, publicKey: window.encryptionManager.keyPair.publicKey});
};

SocketClient.prototype.sendMessage = function(channel, message) {
  var self = this;
  window.encryptionManager.encryptRoomMessage(channel, message, function(err, pgpMessage) {
    if (err) {
      console.log("Error Encrypting Message: " + err);
    }
    else {
      self.socket.emit('roomMessage', {pgpMessage: pgpMessage});
      $('#message-input').val('');
    }
  });
};

SocketClient.prototype.sendPrivateMessage = function(userName, message) {
  var self = this;
  ChatManager.prepareMessage(message, function(err, preparedMessage) {
    window.encryptionManager.encryptPrivateMessage(userName, preparedMessage, function(err, pgpMessage) {
      if (err) {
        console.log("Error Encrypting Message: " + err);
      }
      else {
        //Write private message locally to chat
        ChatManager.handlePrivateMessage(message, window.userName, userName);

        self.socket.emit('privateMessage', {toUser: userName, pgpMessage: pgpMessage});
        $('#message-input').val('');
      }
    });
  });
};

SocketClient.prototype.updateMasterKey = function updateMasterKey(callback) {
  window.encryptionManager.getMasterKeyPair(userName, function(err, encryptedMasterKeyPair) {
    if (err) {
      console.log("Error getting master key pair: "+err);
      ChatManager.localMsg({ type: "ERROR", message: "Error getting master key pair" });
      return callback("Error getting master key pair");
    } else {
      pleaseWait();
      ChatManager.localMsg({ type: null, message: "Updated master key pair" });
      console.log("Got master keypair, ready to encrypt/decrypt");
      encryptedMasterKeyPair.publicKey = encMasterKeyPair.publicKey;
      encryptedMasterKeyPair.privateKey = encMasterKeyPair.privateKey;
      console.log("Ensuring that client keypair exists");
      //console.log("keyPair.privateKey at new master key is: "+keyPair.privateKey);
      if (typeof keyPair.privateKey !== 'undefined' && keyPair.privateKey !== null) {
        console.log("[new master key] Client KeyPair exists. Trying to decrypt master key for '"+userName+"'...");
        console.log("encryptedMasterKeyPair.privateKey: "+encryptedMasterKeyPair.privateKey);
        console.log("encryptedMasterKeyPair.publicKey: "+encryptedMasterKeyPair.publicKey);
        decryptMasterKey(userName, keyPair.privateKey, encryptedMasterKeyPair.privateKey, function(err, key) {
          console.log("(new master key) Caching master private key decrypted");
          masterKeyPair.privateKey = key;
          masterKeyPair.publicKey = encMasterKeyPair.publicKey;
          return callback(null);
        });
      } else {
        console.log("Private key does not yet exist so cannot decrypt master key");
        return callback("Private key does not exist");
      };
    };
  });
};

window.socketClient = new SocketClient();
