function SocketClient() {
  var self = this;
  var host = window.location.host;
  this.socket = window.io(host + '/socket');

  window.userName = localStorage.getItem("userName");

  this.socket.on('connect', function() {
    console.log("Connected to socket.io server");
    self.init();
    //self.initMasterKey();
  });

  this.socket.on('connect_error', function(err) {
    console.log('[SOCKET] (connection error) Disabling chat!', err);
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
      return console.log("[INIT] Error loading client key pair: "+err);
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
    window.encryptionManager.keyManager.sign({}, function(err) {
      window.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
        if (err) { return console.log("[INIT] Error getting public key from keyManager: "+err) };
        if (!publicKey) { return console.log("[INIT] publicKey is NULL!") };
        return self.authenticate();
      });
    });
  });
};

SocketClient.prototype.joinRoom = function(room, callback) {
  var self = this;
  console.log("[JOIN ROOM] Joining room #"+room+" as "+window.userName);
  self.socket.emit('join', { userName: window.userName, channel: room } );
  callback(null);
};


SocketClient.prototype.addListeners = function() {
  var self = this;
  var channel = 'general';
  var autoJoinRooms = ['general'];
  self.listeners = true;
  this.socket.on('authenticated', function(data) {
    if (data.message !== 'ok') { return console.log("[SOCKET CLIENT] (addListeners) Error from server during authentication") };
    window.encryptionManager.keyManager.sign({}, function(err) {
      window.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
        window.encryptionManager.verifyRemotePublicKey(window.userName, publicKey, function(err, upToDate) {
          if (err) { return console.log("[INIT] Error updating remote public key: "+err) };
          if (upToDate) {
            console.log("[INIT] Your public key matches what is on the server");
            console.log("[AUTHENTICATED] Authenticated successfully");
            // Use cilent keys and enable chat for each room user is currently in
            autoJoinRooms.forEach(function(room) {
              console.log("[SOCKET] (authenticated) Joining room "+room);
              self.joinRoom(room, function(err) {
                console.log("[SOCKET] (authenticated) Sent join request for room "+room);
              });
            });
          } else {
            // TODO: Prompt to confirm update remote key
            console.log("[INIT] Remote public key is not up to date so updating!");
            window.encryptionManager.updatePublicKeyOnRemote(window.userName, publicKey, function(err) {
              if (err) { return console.log("[INIT] ERROR updating public key on server: "+err) };
              console.log("[AUTHENTICATED] Authenticated successfully");
              // Use cilent keys and enable chat for each room user is currently in
              autoJoinRooms.forEach(function(room) {
                console.log("[SOCKET] (authenticated) Joining room "+room);
                self.joinRoom(room, function(err) {
                  console.log("[SOCKET] (authenticated) Sent join request for room "+room);
                });
              });
            });
          }
        });
      });
    });
  });

  this.socket.on('joinComplete', function(data) {
    console.log("[SOCKET] joinComplete");
    self.joinComplete(data);
  });

  this.socket.on('errorMessage', function(data) {
    console.log('errorMessage', data);
  });

  this.socket.on('user connect', function(data) {
    //console.log('user connect', data);
  });

  this.socket.on('roomMessage', function(data) {
    console.log("[SOCKET] (roomMessage) Got room message in mode: "+window.encryptionManager.encryptionScheme[data.room]);
    if (window.encryptionManager.encryptionScheme[data.room] == 'masterKey') {
      window.encryptionManager.decryptMasterKeyMessage(data.message, function(err, message) {
        if (err) {
          console.log(err);
        }
        ChatManager.handleMessage(message, data.user);
      });
    } else if (window.encryptionManager.encryptionScheme[data.room] == 'clientKey') {
      window.encryptionManager.decryptMessage(data.message, function(err, message) {
        if (err) {
          console.log(err);
        }
        console.log("[SOCKET] (roomMessage) Handling message: "+message+" from: "+data.user);
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
    var room = data.room;
    ChatManager.disableChat();
    self.joinRoom(room, function(err) {
      ChatManager.localMsg({ type: null, message: "Master key being updated. Please wait..." });
    });
  });

  this.socket.on('userlist update', function(data) {
    console.log("Got userlist update for room #"+data.room);
    //console.log("data.userList is: "+JSON.stringify(data.userList));
    window.roomUsers[data.room] = {};

    data.userList.forEach(function(user) {
      if (user) {
        addToRoomUsers(user);
        if (window.userMap[user.userName]) {
          if (window.userMap[user.userName].publicKey === user.publicKey) {
            return;
          }
        }
        addToGlobalUsers(user);
      }
    });

    function addToRoomUsers(user) {
      if (!window.roomUsers[data.room][user.userName]) {
        window.roomUsers[data.room][user.userName] = {
          connections: 1
        };
      }
      else {
        window.roomUsers[data.room][user.userName].connections++;
      }
    }
    function addToGlobalUsers(user) {
      window.userMap[user.userName] = {
        publicKey: user.publicKey
      };

      //Don't build publicKey for ourselves
      if (user.userName != window.userName) {
        //Build pgp key instance
        //console.log("[USERLIST UPDATE] user.publicKey: "+user.publicKey);
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

    //Don't notify us about ourselves
    if (data.joinUser && window.userName !== data.joinUser) {
      ChatManager.sendNotification(null, 'PiPo', data.joinUser + ' has joined channel #' + data.channel, 3000);
    }
    console.log("[USERLIST UPDATE] Updating userlist");
    ChatManager.updateUserList({ room: data.room, members: Object.keys(window.roomUsers[data.room]) });
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
  var self = this;
  console.log("[AUTH] Authenticating with server with userName: '"+window.userName+"'");
  window.encryptionManager.keyManager.sign({}, function(err) {
    window.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
      console.log("[AUTHENTICATE] Authenticating with publicKey: "+publicKey);
      self.socket.emit('authenticate', {userName: window.userName, publicKey: publicKey});
    });
  });
};

SocketClient.prototype.sendMessage = function(room, message) {
  var self = this;
  window.encryptionManager.encryptRoomMessage({ room: room, message: message }, function(err, pgpMessage) {
    if (err) {
      console.log("Error Encrypting Message: " + err);
    }
    else {
      self.socket.emit('roomMessage', {room: room, pgpMessage: pgpMessage});
      $('#message-input').val('');
    }
  });
};

SocketClient.prototype.joinComplete = function(data) {
  var room = data.room;
  var self = this;
  console.log("[SOCKET] (joinCOmplete) room: "+room+" data.encryptionScheme: "+data.encryptionScheme);
  window.encryptionManager.encryptionScheme[room] = data.encryptionScheme;
  console.log("[SOCKET] (joinComplete) encryptionScheme: "+data.encryptionScheme);
  if (data.encryptionScheme == 'masterKey') {
    var masterKeyPair = data.masterKeyPair;
    console.log("[SOCKET] (joinComplete) Loading master key pair...");
    // TODO: Need to make sure clientKeyManager is decrypted here
    window.encryptionManager.loadMasterKeyPair(room, masterKeyPair, function(err, loaded) {
      if (err) { return console.log("[INIT] ERROR loading master key pair") };
      if (!loaded) { return console.log("[JOIN COMPLETE] masterKeyPair not loaded...") };
      console.log("[INIT] Done decrypting master and client credentials - ENABLEING CHAT");
      ChatManager.enableChat(room, data.encryptionScheme);
    });
  } else {
    console.log("[INIT] Enabling chat in clientKey mode");
    ChatManager.enableChat(room, data.encryptionScheme);
  }
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
