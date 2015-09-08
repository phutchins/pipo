function SocketClient() {
  var self = this;
  var host = window.location.host;
  this.socket = window.io(host + '/socket');

  window.userName = localStorage.getItem('userName');
  window.email = localStorage.getItem('email');
  window.fullName = localStorage.getItem('fullName');

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


SocketClient.prototype.addListeners = function() {
  var self = this;
  self.listeners = true;

  this.socket.on('authenticated', function(data) {
    var autoJoinRooms = data.autoJoin;
    var defaultRoomName = data.defaultRoomName;
    var userIdMap = data.userIdMap;
    var userlist = data.userlist;

    // Ensure that we have permission to show notifications and prompt if we don't
    clientNotification.init();

    if (data.message !== 'ok') {
      return console.log("[SOCKET CLIENT] (addListeners) Error from server during authentication")
    };

    if (window.activeChat) {
      ChatManager.activeChat = window.activeChat;
    }

    ChatManager.defaultRoomName = data.defaultRoomName;

    if (!ChatManager.activeChat) {
      ChatManager.activeChat = { name: defaultRoomName, type: 'room' };
    }

    ChatManager.userlist = userlist;
    ChatManager.userIdMap = userIdMap;

    ChatManager.updateProfileHeader();

    window.encryptionManager.keyManager.sign({}, function(err) {
      window.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
        window.encryptionManager.verifyRemotePublicKey(window.userName, publicKey, function(err, upToDate) {
          if (err) { return console.log("[INIT] Error updating remote public key: "+err) };

          if (upToDate) {
            console.log("[INIT] Your public key matches what is on the server");
            console.log("[AUTHENTICATED] Authenticated successfully");
            // Use cilent keys and enable chat for each room user is currently in
            if (autoJoinRooms.length > 0) {
              console.log("[SOCKET] (authenticated) Joining room ",room);
              autoJoinRooms.forEach(function(room) {
                if (room && typeof room !== 'undefined') {
                  self.joinRoom(room, function(err) {
                    console.log("[SOCKET] (authenticated) Sent join request for room "+room);
                  });
                }
              });
            } else {
              // Join the default room
              // Get default room name
              var defaultRoomName = ChatManager.defaultRoomName;
              // Join default room
              console.log("[SOCKET] (authenticated) Joining room ",defaultRoomName);
              self.joinRoom(defaultRoomName, function(err) {
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
                console.log("[SOCKET] (authenticated) Joining room ",room);
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

  this.socket.on('roomUpdate', function(data) {
    console.log("[SOCKET] roomUpdate");
    self.handleRoomUpdate(data);
  });

  this.socket.on('joinComplete', function(data) {
    console.log("[SOCKET] joinComplete");
    self.joinComplete(data);
  });

  this.socket.on('partComplete', function(data) {
    console.log("[SOCKET] partComplete");
    self.partComplete(data);
  });

  this.socket.on('createRoomComplete', function(data) {
    console.log('[SOCKET] createRoomComplete');
    self.createRoomComplete(data);
  });

  this.socket.on('updateRoomComplete', function(data) {
    self.updateRoomComplete(data);
  });

  this.socket.on('chatUpdate', function(data) {
    ChatManager.handleChatUpdate(data);
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

  this.socket.on('membershipUpdateComplete', function(data) {
    self.handleMembershipUpdateComplete(data);
  });

  this.socket.on('roomMessage', function(data) {
    var message = data.message;
    window.encryptionManager.decryptMessage(data.message, function(err, messageString) {
      if (err) {
        console.log(err);
      }
      console.log("[SOCKET] (roomMessage) Handling message: "+message+" from: "+data.user);
      ChatManager.handleMessage({ messageString: messageString.toString(), date: message.date, user: data.user, room: data.room });
    });
  });

  this.socket.on('privateMessage', function(data) {
    var message = data.message;
    var from = data.from;
    var to = data.to;
    var date = data.date;

    console.log('privateMessage', data);
    window.encryptionManager.decryptMessage(message, function(err, messageString) {
      if (err) {
        console.log(err);
      }
      ChatManager.handlePrivateMessage({ messageString: messageString, fromUser: from, toUser: to, date: date });
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

  this.socket.on('userlistUpdate', function(data) {
    var userlist = data.userlist;
    var userIdMap = data.userIdMap;

    console.log("[SOCKET] 'userlistUpdate'");

    ChatManager.userlist = userlist;
    ChatManager.userIdMap = uesrIdMap;
  });

  this.socket.on('roomUsersUpdate', function(data) {
    console.log("Got roomUsersUpdate for room #"+data.room);

    var uniqueRoomUsersArray = [];
    var newRoomUsersArray = [];
    var roomName = data.room;
    var roomUsers = data.userlist;

    if (window.roomUsers[roomName]) {
      var currentRoomUsersArray = Object.keys(window.roomUsers[roomName]);

      Object.keys(roomUsers).forEach(function(key) {
        console.log("Found new user '" + roomUsers[key].userName);
        newRoomUsersArray.push(roomUsers[key].userName);
      });

      uniqueRoomUsersArray = newRoomUsersArray.filter(function(user) {
        return !currentRoomUsersArray.indexOf(user);
      });

      //Don't notify us about ourselves
      // Also should not notify when initially getting the room users update
      uniqueRoomUsersArray.forEach(function(joinUserName) {
        if (window.userName !== joinUserName) {
          if (currentRoomUsersArray.indexOf(joinUserName)) {
            console.log("User " + joinUserName + " has joined #" + roomName);
            clientNotification.send(null, 'PiPo', joinUserName + ' has joined #' + roomName, 3000);
          } else {
            console.log("User " + joinUserName + " has left #" + roomName);
            clientNotification.send(null, 'PiPo', joinUserName + ' has left #' + roomName, 3000);
          }
        }
      })
    }

    window.roomUsers[roomName] = {};

    roomUsers.forEach(function(user) {
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
      if (!window.roomUsers[roomName][user.userName]) {
        window.roomUsers[roomName][user.userName] = {
          connections: 1
        };
      }
      else {
        window.roomUsers[roomName][user.userName].connections++;
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
    ChatManager.chats[roomName].members = Object.keys(window.roomUsers[roomName]);
    if (ChatManager.activeChat && ChatManager.activeChat.name == roomName) {
      ChatManager.updateRoomUsers({ room: roomName, socket: self.socket });
    }
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

SocketClient.prototype.init = function() {
  var self = this;
  console.log("[INIT] Loading client keypair...");
  ChatManager.init();
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

SocketClient.prototype.authenticate = function() {
  var self = this;
  console.log("[AUTH] Authenticating with server with userName: '"+window.userName+"'");
  window.encryptionManager.keyManager.sign({}, function(err) {
    window.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
      self.socket.emit('authenticate', {userName: window.userName, publicKey: publicKey, email: window.email});
    });
  });
};

SocketClient.prototype.joinRoom = function(room, callback) {
  var self = this;
  if (room && typeof room !== 'undefined') {
    console.log("[JOIN ROOM] Joining room #"+room+" as "+window.userName);
    self.socket.emit('join', { room: room } );
    return callback(null);
  } else {
    return console.log("[JOIN ROOM] room was null  !");
  }
};

SocketClient.prototype.createRoom = function(data, callback) {
  var self = this;
  console.log("[CREATE ROOM] Creating room");
  var data = {
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  };
  self.socket.emit('createRoom', data);
  callback(null);
};

SocketClient.prototype.updateRoom = function(data, callback) {
  var self = this;
  console.log("[UPDATE ROOM] Updating room");
  var data = {
    id: data.id,
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  };
  console.log("[UPDATE ROOM] Updating with data:",data);
  self.socket.emit('updateRoom', data);
  callback(null);
};

SocketClient.prototype.partRoom = function(data, callback) {
  var self = this;
  var name = data.name;
  console.log("[PART ROOM] Parting room #" + name);
  self.socket.emit('part', { name: name } );
  callback(null);
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

    if (ChatManager.lastActiveChat) {
      ChatManager.activeChat = ChatManager.lastActiveChat;
    }

    return ChatManager.showError(err);
  } else {
    console.log("[SOCKET] (joinComplete) room: "+room.name+" data.encryptionScheme: "+data.encryptionScheme);
    window.encryptionManager.encryptionScheme[room.name] = data.encryptionScheme;
    console.log("[SOCKET] (joinComplete) encryptionScheme: "+data.encryptionScheme);
    if (data.encryptionScheme == 'masterKey') {
      var masterKeyPair = data.masterKeyPair;
      console.log("[SOCKET] (joinComplete) Loading master key pair...");
      // TODO: Need to make sure clientKeyManager is decrypted here
      window.encryptionManager.loadMasterKeyPair(room.name, masterKeyPair, function(err, loaded) {
        if (err) { return console.log("[INIT] ERROR loading master key pair") };
        if (!loaded) { return console.log("[JOIN COMPLETE] masterKeyPair not loaded...") };
        console.log("[INIT] Done decrypting master and client credentials - ENABLEING CHAT");
      });
    } else {
      console.log("[INIT] Enabling chat in clientKey mode");
    }
    ChatManager.initRoom(room, function(err) {
      ChatManager.chats[room.name].joined = true;
      ChatManager.updateRoomList(function() {
        ChatManager.enableChat(room, data.encryptionScheme);
      });
    });
  }
};

SocketClient.prototype.partComplete = function(data) {
  var self = this;
  var room = data.room;
  ChatManager.destroyChat(room, function() {
    console.log("Done parting room");
  });
};

SocketClient.prototype.createRoomComplete = function(data) {
  var self = this;
  var name = data.name;
  self.joinRoom(name, function(err) {
    if (err) {
      return console.log("Error joining room after creating: " + err);
    }
    console.log("Joined room...");
  })
};

SocketClient.prototype.updateRoomComplete = function(data) {
  var self = this;
  var name = data.name;
  console.log("[UPDATE ROOM COMPLETE] Done updating room...");
};

/*
 * Get all rooms that user is a member of or is public
 */
SocketClient.prototype.handleRoomUpdate = function(data) {
  var self = this;
  var rooms = data.rooms;
  var activeChatName = null;

  if (data.err) {
    return console.log("Room update failed: ",data.err);
  };

  // We want to update one at a time in case we only receive an update for select room(s)
  Object.keys(rooms).forEach(function(name) {
    console.log("Adding room",name,"to array with data:",rooms[name]);
    ChatManager.chats[name] = rooms[name];
  })

  if (ChatManager.activeChat) {
    activeChatName = ChatManager.activeChat.name;
    console.log("[handleRoomUpdate] Refreshing active chat '" + activeChatName + "'");
    ChatManager.refreshChatContent(activeChatName);
  }

  ChatManager.buildRoomListModal;
  // should only update the modal if it is open in this case as some other user has made a change

  // if manageMembersModal is currently visible don't clear any error or ok messages
  ChatManager.populateManageMembersModal({ clearMessages: false });
};

SocketClient.prototype.handleMembershipUpdateComplete = function(data) {
  var success = data.success;
  var message = data.message;

  if (!success) {
    // display error on membership editor modal
    ChatManager.membershipUpdateError(data.message);
    return console.log("[HANDLE MEMBERSHIP UPDATE COMPLETE] Failed to add member: ", message);
  }

   // Show OK on membership editor modal
  console.log("[HANDLE MEMBERSHIP UPDATE COMPLETE] Member added! Displaying message in modal. Message:", message);

  // This doesn't actually do anything becuase the room update has not been received by roomUpdate yet
  ChatManager.populateManageMembersModal({ clearMessages: false });
  ChatManager.membershipUpdateMessage(message);
};

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

SocketClient.prototype.membership = function(data) {
  var self = this;

  console.log("[MEMBERSHIP] Emitting membership");
  self.socket.emit('membership', data);
};

SocketClient.prototype.sendPrivateMessage = function(userName, message) {
  var self = this;

  // These should be sent as an array of ID's
  var participantUsernames = [ userName, window.userName ];
  var participantIds = [];

  participantUsernames.forEach(function(username) {
    participantIds.push(ChatManager.userlist[username].id);
  });

  ChatManager.prepareMessage(message, function(err, preparedMessage) {
    window.encryptionManager.encryptPrivateMessage(userName, preparedMessage, function(err, pgpMessage) {
      if (err) {
        console.log("Error Encrypting Message: " + err);
      }

      else {
        self.socket.emit('privateMessage', {toUser: userName, pgpMessage: pgpMessage, participantIds: participantIds });
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
