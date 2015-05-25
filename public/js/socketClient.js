function SocketClient() {
  var self = this;
  var host = window.location.host;
  this.socket = window.io(host + '/socket');

  this.socket.on('authenticated', function(data) {
    self.socket.emit('join', { username: window.username, channel: "general" } );
    $('#message-input').attr('placeHolder', 'Type your message here...');
    $('#send-button').prop('disabled', false);
    $('#loading-icon').remove();
    window.enableChat();
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
      window.handleMessage(message, data.user);
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
      window.sendNotification(null, 'PiPo', data.joinUser + ' has joined channel #' + data.channel, 3000);
    }
    else {
      window.sendNotification(null, 'PiPo', 'You have joined channel #' + data.channel, 3000);
    }

  });
}

SocketClient.prototype.authenticate = function() {
  this.socket.emit('init', {username: window.username, publicKey: window.encryptionManager.keyPair.publicKey});
};

SocketClient.prototype.sendMessage = function(channel, message) {
  var self = this;
  window.prepareMessage(message, function(err, preparedMessage) {
    window.encryptionManager.encryptRoomMessage(channel, preparedMessage, function(err, pgpMessage) {
      if (err) {
        console.log("Error Encrypting Message: " + err);
      }
      else {
        // Need to not send the username here and derive it from the socket on the server
        self.socket.emit('roomMessage', {pgpMessage: pgpMessage});
        $('#message-input').val('');
      }
    });
  });
};
