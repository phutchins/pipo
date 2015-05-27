function SocketClient() {
  var self = this;
  var host = window.location.host;
  this.socket = window.io(host + '/socket');

  window.username = localStorage.getItem("username");

  this.socket.on('connect', function() {
    self.init();
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
  window.encryptionManager.loadClientKeyPair(function (err, loaded) {
    if (err) {
      //Show error somewhere
    }
    if (!loaded) {
      return ChatManager.promptForCredentials();
    }
    if (!self.listeners) {
      self.addListeners();
    }
    return self.authenticate();
  });
};

SocketClient.prototype.addListeners = function() {
  var self = this;
  self.listeners = true;
  this.socket.on('authenticated', function(data) {
    self.socket.emit('join', { username: window.username, channel: "general" } );
    ChatManager.enableChat();
  });

  this.socket.on('errorMessage', function(data) {
    console.log('errorMessage', data);
  });

  this.socket.on('user connect', function(data) {
    //console.log('user connect', data);
  });

  this.socket.on('roomMessage', function(data) {
    //console.log('roomMessage', data);
    window.encryptionManager.decryptMessage(data.message, function(err, message) {
      if (err) {
        console.log(err);
      }
      ChatManager.handleMessage(message, data.user);
    });
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

  this.socket.on('new master key', function(data) {
    console.log("[SOCKET] 'new master key'");
    getMasterKeyPair(userName, function(err, encMasterKeyPair) {
      if (err) {
        console.log("Error getting master key pair: "+err);
        localMsg({ type: "ERROR", message: "Error getting master key pair" });
      } else {
        localMsg({ type: null, message: "Updated master key pair" });
        console.log("Got master keypair, ready to encrypt/decrypt");
        encryptedMasterKeyPair.pubKey = encMasterKeyPair.pubKey;
        encryptedMasterKeyPair.privKey = encMasterKeyPair.privKey;
        console.log("Ensuring that client keypair exists");
        //console.log("keyPair.privKey at new master key is: "+keyPair.privKey);
        if (typeof keyPair.privKey !== 'undefined' && keyPair.privKey !== null) {
          console.log("(new master key) Trying to decrypt master key...");
          //console.log("encryptedMasterKeyPair.privKey: "+encryptedMasterKeyPair.privKey);
          //console.log("encryptedMasterKeyPair.pubKey: "+encryptedMasterKeyPair.pubKey);
          decryptMasterKey(userName, keyPair.privKey, encryptedMasterKeyPair.privKey, function(err, key) {
            console.log("(new master key) Caching master private key decrypted");
            masterKeyPair.privKey = key;
            masterKeyPair.pubKey = encMasterKeyPair.pubKey;
            pleaseWaitOff();
          });
        } else {
          console.log("Private key does not yet exist so cannot decrypt master key");
        };
      };
    });
  });

  this.socket.on('userlist update', function(data) {
    window.roomUsers[data.channel] = [];

    data.userList.forEach(function(user) {
      if (user) {
        if (window.userMap[user.userName]) {
          if (window.userMap[user.userName].pubkey === user.publicKey) {
            return;
          }
        }

        window.roomUsers[data.channel].push(user.username);
        window.userMap[user.username] = {
          pubkey: user.publicKey
        };

        //Don't build pubkey for ourselves
        if (user.username != window.username) {

          //Build pgp key instance
          window.kbpgp.KeyManager.import_from_armored_pgp({
            armored: user.publicKey
          }, function (err, keyInstance) {
            if (err) {
              console.log("Error importing user key", err);
            }
            console.log("imported key", user.username);
            window.userMap[user.username].keyInstance = keyInstance;
            encryptionManager.keyRing.add_key_manager(keyInstance);
          });

        }

      }
    });

    //Don't notify us about ourselves
    if (data.joinUser && window.username !== data.joinUser) {
      ChatManager.sendNotification(null, 'PiPo', data.joinUser + ' has joined channel #' + data.channel, 3000);
    }

    ChatManager.updateUserList();

  });

  this.socket.on('chatStatus', function(data) {
    console.log("Got chat status...");
    var statusType = data.statusType;
    var statusMessage = data.statusMessage;
    localMsg({ type: statusType, message: statusMessage });
    var $messages = $('#messages');
    $messages[0].scrollTop = $messages[0].scrollHeight;
  });

};

SocketClient.prototype.authenticate = function() {
  this.socket.emit('authenticate', {username: window.username, publicKey: window.encryptionManager.keyPair.publicKey});
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

SocketClient.prototype.sendPrivateMessage = function(username, message) {
  var self = this;
  ChatManager.prepareMessage(message, function(err, preparedMessage) {
    window.encryptionManager.encryptPrivateMessage(username, preparedMessage, function(err, pgpMessage) {
      if (err) {
        console.log("Error Encrypting Message: " + err);
      }
      else {
        //Write private message locally to chat
        ChatManager.handlePrivateMessage(message, window.username, username);

        self.socket.emit('privateMessage', {toUser: username, pgpMessage: pgpMessage});
        $('#message-input').val('');
      }
    });
  });
};

SocketClient.prototype.updateMasterKey = function updateMasterKey(callback) {
  getMasterKeyPair(userName, function(err, encMasterKeyPair) {
    if (err) {
      console.log("Error getting master key pair: "+err);
      localMsg({ type: "ERROR", message: "Error getting master key pair" });
      return callback("Error getting master key pair");
    } else {
      pleaseWait();
      localMsg({ type: null, message: "Updated master key pair" });
      console.log("Got master keypair, ready to encrypt/decrypt");
      encryptedMasterKeyPair.pubKey = encMasterKeyPair.pubKey;
      encryptedMasterKeyPair.privKey = encMasterKeyPair.privKey;
      console.log("Ensuring that client keypair exists");
      //console.log("keyPair.privKey at new master key is: "+keyPair.privKey);
      if (typeof keyPair.privKey !== 'undefined' && keyPair.privKey !== null) {
        console.log("[new master key] Client KeyPair exists. Trying to decrypt master key for '"+userName+"'...");
        //console.log("encryptedMasterKeyPair.privKey: "+encryptedMasterKeyPair.privKey);
        //console.log("encryptedMasterKeyPair.pubKey: "+encryptedMasterKeyPair.pubKey);
        decryptMasterKey(userName, keyPair.privKey, encryptedMasterKeyPair.privKey, function(err, key) {
          console.log("(new master key) Caching master private key decrypted");
          masterKeyPair.privKey = key;
          masterKeyPair.pubKey = encMasterKeyPair.pubKey;
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
