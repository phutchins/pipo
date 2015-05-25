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

        //Build pgp key instance
        window.kbpgp.KeyManager.import_from_armored_pgp({
          armored: user.publicKey
        }, function(err, keyInstance) {
          window.userMap[user.username].keyInstance = keyInstance;
        });

      }
    });

    if (data.joinUser && window.username !== data.joinUser) {
      ChatManager.sendNotification(null, 'PiPo', data.joinUser + ' has joined channel #' + data.channel, 3000);
    }
    else {
      //window.sendNotification(null, 'PiPo', 'You have joined channel #' + data.channel, 3000);
    }

  });
};

SocketClient.prototype.authenticate = function() {
  this.socket.emit('authenticate', {username: window.username, publicKey: window.encryptionManager.keyPair.publicKey});
};

SocketClient.prototype.sendMessage = function(channel, message) {
  var self = this;
  ChatManager.prepareMessage(message, function(err, preparedMessage) {
    window.encryptionManager.encryptRoomMessage(channel, preparedMessage, function(err, pgpMessage) {
      if (err) {
        console.log("Error Encrypting Message: " + err);
      }
      else {
        self.socket.emit('roomMessage', {pgpMessage: pgpMessage});
        $('#message-input').val('');
      }
    });
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

window.socketClient = new SocketClient();
