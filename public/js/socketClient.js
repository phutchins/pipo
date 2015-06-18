function SocketClient() {
  var self = this;
  var host = window.location.host;
  this.socket = window.io(host + '/socket');

  window.userName = localStorage.getItem("userName");

  this.socket.on('connect', function() {
    console.log("Connected to socket.io server");
  });

  this.socket.on('certificate', function(certificate) {
    window.encryptionManager.verifyCertificate(certificate, function(err) {
      self.init();
    });
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
      return ChatManager.initialPromptForCredentials();
    } else {
      console.log("[INIT] Client credentials loaded");
    }
    if (!self.listeners) {
      self.addListeners();
    }
    console.log("[INIT] Authenticating");
    return self.authenticate();
  });
};

SocketClient.prototype.joinRoom = function(room, callback) {
  var self = this;
  console.log("[JOIN ROOM] Joining room #"+room+" as "+window.userName);
  self.socket.emit('join', { room: room } );
  callback(null);
};

SocketClient.prototype.partRoom = function(room, callback) {
  var self = this;
  console.log("[PART ROOM] Parting room #" + room);
  self.socket.emit('part', { room: room } );
  callback(null);
};

SocketClient.prototype.addListeners = function() {
  var self = this;
  self.listeners = true;
  this.socket.on('authenticated', function(data) {
    if (data.message !== 'ok') { return console.log("[SOCKET CLIENT] (addListeners) Error from server during authentication") };
    var autoJoinRooms = data.autoJoin;
    console.log("Auto join rooms is: " + autoJoinRooms.toString() );
    window.encryptionManager.keyManager.sign({}, function(err) {
      window.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
        window.encryptionManager.verifyRemotePublicKey(window.userName, publicKey, function(err, upToDate) {
          if (err) { return console.log("[INIT] Error updating remote public key: "+err) };
          if (upToDate) {
            console.log("[INIT] Your public key matches what is on the server");
            console.log("[AUTHENTICATED] Authenticated successfully");
            // Use cilent keys and enable chat for each room user is currently in
            if (autoJoinRooms.length > 0) {
              autoJoinRooms.forEach(function(room) {
                console.log("[SOCKET] (authenticated) Joining room "+room);
                self.joinRoom(room, function(err) {
                  console.log("[SOCKET] (authenticated) Sent join request for room "+room);
                });
              });
            } else {
              // Join the default room
              self.joinRoom('pipo', function(err) {
                console.log("[SOCKET] (authenticated) Joined default room becuase autoJoin was empty");
              })
            }
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

  this.socket.on('partComplete', function(data) {
    console.log("[SOCKET] partComplete");
    self.partComplete(data);
  });

  this.socket.on('serverCommandComplete', function(data) {
    console.log("[SOCKET] serverCommandComplete");
    self.serverCommandComplete(data);
  });

  this.socket.on('errorMessage', function(data) {
    console.log('errorMessage', data);
  });

  this.socket.on('user connect', function(data) {
    //console.log('user connect', data);
  });

  this.socket.on('roomMessage', function(data) {
    if (window.encryptionManager.encryptionScheme[data.room] == 'masterKey') {
      window.encryptionManager.decryptMasterKeyMessage(data.message, function(err, message) {
        if (err) {
          console.log(err);
        }
        ChatManager.handleMessage({ message: message.toString(), user: data.user, room: data.room });
      });
    } else if (window.encryptionManager.encryptionScheme[data.room] == 'clientKey') {
      window.encryptionManager.decryptMessage(data.message, function(err, message) {
        if (err) {
          console.log(err);
        }
        console.log("[SOCKET] (roomMessage) Handling message: "+message+" from: "+data.user);
        ChatManager.handleMessage({ message: message.toString(), user: data.user, room: data.room });
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

    var uniqueRoomUsersArray = [];
    var newRoomUsersArray = [];
    if (window.roomUsers[data.room]) {
      var currentRoomUsersArray = Object.keys(window.roomUsers[data.room]);
      Object.keys(data.userList).forEach(function(key) {
        console.log("Found new user '" + data.userList[key].userName);
        newRoomUsersArray.push(data.userList[key].userName);
      });
      uniqueRoomUsersArray = newRoomUsersArray.filter(function(user) {
        return !currentRoomUsersArray.indexOf(user);
      });
      //Don't notify us about ourselves
      uniqueRoomUsersArray.forEach(function(joinUserName) {
        if (window.userName !== joinUserName) {
          ChatManager.sendNotification(null, 'PiPo', joinUserName + ' has joined channel #' + data.room, 3000);
        }
      })
    }

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

    console.log("[USERLIST UPDATE] Updating userlist");
    ChatManager.chats[data.room].members = Object.keys(window.roomUsers[data.room]);
    ChatManager.updateUserList({ room: data.room });
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
      self.socket.emit('authenticate', {userName: window.userName, publicKey: publicKey});
    });
  });
};

SocketClient.prototype.sendMessage = function(room, message) {
  var self = this;
  console.log("Encrypting message: " + message);
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
  var self = this;
  var err = data.err;
  var room = data.room;

  if (err) {
    console.log("Cannot join channel due to permissions");
    return ChatManager.showError(err);
  } else {
    console.log("[SOCKET] (joinComplete) room: "+room+" data.encryptionScheme: "+data.encryptionScheme);
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
      });
    } else {
      console.log("[INIT] Enabling chat in clientKey mode");
    }
    ChatManager.initRoom(room, function(err) {
      ChatManager.enableChat(room, data.encryptionScheme);
    });
  }
};

SocketClient.prototype.partComplete = function(data) {
  var self = this;
  var room = data.room;
  ChatManager.destroyRoom(room, function() {
    console.log("Done parting room");
  });
}

SocketClient.prototype.sendServerCommand = function(data) {
  var self = this;
  var command = data.command;
  var currentChat = data.currentChat;
  self.socket.emit('serverCommand', { command: command, currentChat: currentChat });
};

SocketClient.prototype.serverCommandComplete = function(data) {
  var self = this;
  var response = data.response;
  console.log("Displaying response from server command in chat '" + ChatManager.activeChat.name + "'");
  ChatManager.addMessageToChat({ type: ChatManager.activeChat.type, message: response, chat: ChatManager.activeChat.name });
};

SocketClient.prototype.sendPrivateMessage = function(userName, message) {
  var self = this;
  ChatManager.prepareMessage(message, function(err, preparedMessage) {
    window.encryptionManager.encryptPrivateMessage(userName, preparedMessage, function(err, pgpMessage) {
      if (err) {
        console.log("Error Encrypting Message: " + err);
      }
      else {
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

Array.prototype.contains = function(v) {
  for(var i = 0; i < this.length; i++) {
    if(this[i] === v) return true;
  }
  return false;
};

Array.prototype.unique = function() {
  var arr = [];
  for(var i = 0; i < this.length; i++) {
    if(!arr.contains(this[i])) {
      arr.push(this[i]);
    }
  }
  return arr;
}

window.socketClient = new SocketClient();
