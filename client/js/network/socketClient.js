'use strict';

var authentication = require('../authentication/index.js');
var ChatManager = require('../chat/index.js');
var masterUserlist = require('../users/masterUserlist.js');
var chatHeader = require('../chat/header.js');
var Userlist = require('../users/userlist.js');
var EncryptionManager = require('../encryption/index.js');

function SocketClient() {
  var self = this;
  var protocol = window.location.protocol;
  var host = window.location.host;
  var port = window.location.port;
  this.encryptionManager = new EncryptionManager();
  this.chatManager = new ChatManager(encryptionManager, options);
  chatManager.init(function(err) {
    if (err) {
      return console.log('Error setting up ChatManager: %s', err);
    }

    console.log('ChatManager successfully initialized');
  });

  if (window.config) {
    host = window.config.server.host;
    port = window.config.client.port;

    if (window.config.client.ssl) {
      protocol = "https:";
    } else {
      protocol = "http:";
    }
  }
  var server = protocol + '//' + host + ':' + port;

  console.log("Server: " + server);
  this.socket = window.io(server + '/socket');

  window.username = localStorage.getItem('username');
  window.email = localStorage.getItem('email');
  window.fullName = localStorage.getItem('fullName');

  this.socket.on('connect', function() {
    console.log("Connected to socket.io server");
  });

  this.socket.on('certificate', function(certificate) {
    console.log("[socketClient] (certificate) Got server certificate. Verifying...");
    encryptionManager.verifyCertificate(certificate, function(err) {
      // This should probably check for an error and not continue if we have an error...
      console.log("[socketClient] (certificate) Veritifed server certificate! Authenticating with server.");
      self.init();
    });
    debugger;
  });

  this.socket.on('connect_error', function(err) {
    console.log('[SOCKET] (connection error) Disabling chat!', err);
    if (self.listeners) {
      // TODO: Should be updating CLIENT STATUS here instead of chat status
      console.log("[SocketClient.SocketClient] (1) connect_error, running ChatManager.updateChatStatus();");
      chatManager.updateChatStatus({ status: 'disabled' });
    }
  });
}

SocketClient.prototype.addListeners = function() {
  var self = this;
  self.listeners = true;

  self.socket.on('authenticated', function(data) {
    data.socket = this;

    authentication.authenticated(data);
  });

  self.socket.on('roomUpdate', function(data) {
    console.log("[SOCKET] roomUpdate");
    self.handleRoomUpdate(data);
  });

  self.socket.on('joinComplete', function(data) {
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
    chatManager.handleChatUpdate(data);
  });

  this.socket.on('previousPageUpdate', function(data) {
    chatManager.handlePreviousPageUpdate(data);
  });

  this.socket.on('serverCommandComplete', function(data) {
    console.log("[SOCKET] serverCommandComplete");
    self.serverCommandComplete(data);
  });

  this.socket.on('errorMessage', function(data) {
    console.log('errorMessage', data);
  });

  this.socket.on('membershipUpdateComplete', function(data) {
    self.handleMembershipUpdateComplete(data);
  });

  self.socket.on('roomMessage', function(data) {
    chatManager.handleMessage(data);
  });


  this.socket.on('privateMessage', function(data) {
    var self = this;
    var message = data.message;
    var chatId = data.chatId;

    console.log('[socketClient] (privateMessage) Got private message event. Data is: ', data);
    data.socket = self;

    chatManager.handlePrivateMessage(data);
  });

  this.socket.on('newMasterKey', function(data) {
    console.log("[SOCKET] 'new master key'");
    var room = data.room;
    chatManager.disableChat();
    self.joinRoom(room, function(err) {
      chatManager.localMsg({ type: null, message: "Master key being updated. Please wait..." });
    });
  });

  this.socket.on('userlistUpdate', function(data) {
    var userlist = data.userlist;
    var userNameMap = data.userNameMap;

    console.log('[SOCKET] userlistUpdate');

    chatManager.userNameMap = userNameMap;

    // Passing chatManager for now, shouldn't do this...
    masterUserlist.update(chatManager, userlist, function(err) {
      console.log("[socketClient.on userlistUpdate] Updated userlist");
      // Update userlist if the current chat is a private chat
      //   there is a better way to do this, should likely do this
      //   the same way that we're doing it for rooms and issue an update
      //   only for the private chats that the user is a part of
      var activeChatId = chatManager.activeChat;
      if (activeChatId && chatManager.chats[activeChatId].type == 'chat') {
        Userlist.update.call(chatManager, { chatId: activeChatId });
        console.log("[socketClient.on userlistUpdate] Updated userlist for private chat with id '" + activeChatId + "'");
      };
    });
  });

  this.socket.on('activeUsersUpdate', function(data) {
    var uniqueRoomUsersArray = [];
    var newRoomUsersArray = [];
    var chatId = data.chatId;

    console.log("[SOCKET] activeUsersUpdate - Got SOCKET event");

    if (!chatManager.chats[chatId]) {
      return;
    };

    var chatName = chatManager.chats[chatId].name;

    var activeUsers = data.activeUsers;
    var roomUsers = data.activeUsers;

    console.log("[SOCKET] 'roomUsersUpdate' for room #" + chatName);

    if (ChatManager.chats[chatId]) {
      chatManager.chats[chatId].activeUsers = activeUsers;
    }

    console.log("[USERLIST UPDATE] Updating userlist");

    //
    // Need to hash out using active to update the room users list
    // Should probably do this in roomUpdate or chatUpdate instead
    // Break this up into roomUpdate, chatUpdate and key add/remove methods
    //

    if (chatManager.activeChat === chatId) {
      Userlist.update.call(chatManager, { chatId: chatId });
    }
  });

  this.socket.on('chatStatus', function(data) {
    console.log("Got chat status...");
    var statusType = data.statusType;
    var statusMessage = data.statusMessage;
    chatManager.localMsg({ type: statusType, message: statusMessage });
    var $messages = $('#messages');
    $messages[0].scrollTop = $messages[0].scrollHeight;
  });

};

SocketClient.prototype.init = function() {
  var self = this;
  console.log("[INIT] Loading client keypair...");

  self.encryptionManager.loadClientKeyPair(function (err, loaded) {
    if (err) {
      //Show error somewhere
      return console.log("[INIT] Error loading client key pair: "+err);
    }

    if (!loaded) {
      console.log("[INIT] Prompting for credentials");
      return chatManager.initialPromptForCredentials();
    } else {
      chatManager.init();

      console.log("[INIT] Client credentials loaded");
    }

    if (!self.listeners) {
      console.log('[INIT] Didnt find any socket listeners so adding them now');
      self.addListeners();
    }

    return authentication.authenticate({ socket: self.socket });
  });
};



SocketClient.prototype.joinRoom = function(roomId, callback) {
  var self = this;
  if (roomId && typeof roomId !== 'undefined') {
    console.log("[JOIN ROOM] Joining room #"+roomId+" as "+window.username);
    self.socket.emit('join', { roomId: roomId } );
    return callback(null);
  } else {
    return console.log("[JOIN ROOM] roomId was null  !");
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
  var chatId = data.chatId;
  console.log("[PART ROOM] Parting room #" + chatManager.chats[chatId].name);
  self.socket.emit('part', { chatId: chatId } );
  callback(null);
};

SocketClient.prototype.sendMessage = function(data) {
  var self = this;
  var messageId = data.messageId;
  var chatId = data.chatId;
  var message = data.message;

  console.log("Encrypting message: " + message);
  self.encryptionManager.encryptRoomMessage({ chatId: chatId, message: message }, function(err, pgpMessage) {
    if (err) {
      console.log("Error Encrypting Message: " + err);
    }
    else {
      console.log("[socketClient.sendMessage] Sending encrypted message to chat ID: ", chatId);
      self.socket.emit('roomMessage', { messageId: messageId, chatId: chatId, pgpMessage: pgpMessage});
      //$('#message-input').val('');
    }
  });
};


SocketClient.prototype.sendPrivateMessage = function(data) {
  var self = this;
  var messageId = data.messageId;
  var chatId = data.chatId;
  var toUserIds = data.toUserIds;
  var message = data.message;

  chatManager.prepareMessage(message, function(err, preparedMessage) {
    self.encryptionManager.encryptPrivateMessage({ chatId: chatId, message: preparedMessage }, function(err, pgpMessage) {
      if (err) {
        console.log("Error Encrypting Message: " + err);
      }

      else {
        // Only leaving toUsername until I migrate the server side to tracking users by id instead of name
        self.socket.emit('privateMessage', {messageId: messageId, chatId: chatId, toUserIds: toUserIds, pgpMessage: pgpMessage });
        $('#message-input').val('');
      }
    });
  });
};


SocketClient.prototype.joinComplete = function(data) {
  var self = this;
  var err = data.err;
  var room = data.room;

  if (err) {
    console.log("Cannot join channel due to permissions");
    return chatManager.showError(err);
  }

  // Determine what the current active chat should be
  // If we have an active chat cached locally, set it to active chat but only if it exists in our chats list
  if (!chatManager.activeChat && window.activeChat && chatManager.chats[window.activeChat]) {
    chatManager.activeChat = window.activeChat;
  };

  // If there is still no active chat, set it to the one we just joined
  if (!chatManager.activeChat) {
    chatManager.setActiveChat(room.id);
  };

  console.log("[SOCKET] (joinComplete) room: "+room.name+" data.encryptionScheme: "+data.encryptionScheme);

  self.encryptionManager.encryptionScheme[room.name] = data.encryptionScheme;

  console.log("[SOCKET] (joinComplete) encryptionScheme: "+data.encryptionScheme);

  if (data.encryptionScheme == 'masterKey') {
    var masterKeyPair = data.masterKeyPair;

    console.log("[SOCKET] (joinComplete) Loading master key pair...");

    // TODO: Need to make sure clientKeyManager is decrypted here
    self.encryptionManager.loadMasterKeyPair(room.name, masterKeyPair, function(err, loaded) {
      if (err) { return console.log("[INIT] ERROR loading master key pair") };

      if (!loaded) { return console.log("[JOIN COMPLETE] masterKeyPair not loaded...") };

      console.log("[INIT] Done decrypting master and client credentials - ENABLEING CHAT");
    });
  } else {
    console.log("[INIT] Enabling chat in clientKey mode");
  }

  console.log("[socketClient.joinComplete] (1) Running initRoom");
  chatManager.initRoom(room, function(err) {
    chatManager.chats[room.id].joined = true;
    chatManager.updateRoomList(function() {
      if (chatManager.activeChat == room.id) {
        chatManager.focusChat({ id: room.id }, function(err) {
          console.log("[chatManager.initRoom] Room focus for " + room.name + " done");
        });
      };
      // Should move this inside focusChat callback after moving enable/disable chats to room object
      //console.log("[SocketClient.joinComplete] (1) Running chatManager.updateChatStauts();");
      //chatManager.updateChatStatus({ chatId: room.id, status: 'enabled' });
    });
  });
};

SocketClient.prototype.partComplete = function(data) {
  var self = this;
  var chatId = data.chatId;
  chatManager.partChat(chatId, function() {
    console.log("Done parting room");
  });
};

SocketClient.prototype.createRoomComplete = function(data) {
  var self = this;
  var room = data.room;
  self.joinRoom(room.id, function(err) {
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
 * Toggle favorite room
 */
SocketClient.prototype.toggleFavorite = function(data) {
  var self = this;
  var chatId = data.chatId;

  console.log("[socketClient.toggleFavorite] Emitting toggle favorite for '" + chatId + "'");
  self.socket.emit('toggleFavorite', { chatId: chatId });
  self.socket.on('toggleFavoriteComplete-' + chatId, function(data) {
    console.log("[socketClient.toggleFavorite] Got toggleFavoriteComplete for '" + chatId + "'");
    self.socket.removeListener('toggleFavoriteComplete-' + chatId);
    chatHeader.updateFavoriteButton.call(chatManager, { favorite: data.favorite });
  });
};


/*
 * Get all rooms that user is a member of or is public
 */
SocketClient.prototype.handleRoomUpdate = function(data) {
  var self = this;
  var rooms = data.rooms;
  var activeChatId = null;
  var activeChatName = null;

  if (data.err) {
    return console.log("[socketClient.handleRoomUpdate] Room update failed: ",data.err);
  };

  // We want to update one at a time in case we only receive an update for select room(s)
  Object.keys(rooms).forEach(function(id) {
    console.log("[socketClient.handleRoomUpdate] Adding room",id,"to array with data:",rooms[id]);

    console.log("[socketClient.handleRoomUpdate] (1) Running initRoom");

    // Should we update the room selectively in initRoom or create a new method that handles only room updates
    // while initRoom only handles the initial room setup case?
    console.log("[socketClient.handleRoomUpdate] Running initRoom from handleRoomUpdate");
    chatManager.initRoom(rooms[id], function(err) {
      console.log("Init'd room " + rooms[id].name + " from room update");

      if (chatManager.activeChat && chatManager.activeChat == id) {
        Userlist.update.call(chatManager, { chatId: id });
      }

      chatManager.updateRoomList(function() {
        console.log("[SocketClient.handleRoomUpdate] (1) Running chatManager.updateChatStauts();");
        chatManager.updateChatStatus({ chatId: id, status: 'enabled' });
      });

      chatHeader.update.call(chatManager, id);

      chatManager.buildRoomListModal;

      // if manageMembersModal is currently visible don't clear any error or ok messages
      chatManager.populateManageMembersModal({ clearMessages: false });
    });
  })
};

SocketClient.prototype.handleMembershipUpdateComplete = function(data) {
  var success = data.success;
  var message = data.message;

  if (!success) {
    // display error on membership editor modal
    chatManager.membershipUpdateError(data.message);
    return console.log("[HANDLE MEMBERSHIP UPDATE COMPLETE] Failed to add member: ", message);
  }

   // Show OK on membership editor modal
  console.log("[HANDLE MEMBERSHIP UPDATE COMPLETE] Member added! Displaying message in modal. Message:", message);

  // This doesn't actually do anything becuase the room update has not been received by roomUpdate yet
  console.log("[socketClient.handleMembershipUpdateComplete] Running populateManageMembersModal");
  chatManager.populateManageMembersModal({ clearMessages: false });
  chatManager.membershipUpdateMessage(message);
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
  var activeChatid = chatManager.activeChat;
  console.log("Displaying response from server command in chat '" + chatManager.chats[activeChatId].name + "'");
  chatManager.addMessageToChat({ type: chatManager.chats[activeChatId].type, message: response, chat: chatManager.chats[activeChatId].name });
};

SocketClient.prototype.membership = function(data) {
  var self = this;

  console.log("[MEMBERSHIP] Emitting membership");
  self.socket.emit('membership', data);
};

SocketClient.prototype.updateMasterKey = function updateMasterKey(callback) {
  self.encryptionManager.getMasterKeyPair(username, function(err, encryptedMasterKeyPair) {
    if (err) {
      console.log("Error getting master key pair: "+err);
      chatManager.localMsg({ type: "ERROR", message: "Error getting master key pair" });
      return callback("Error getting master key pair");
    } else {
      pleaseWait();
      chatManager.localMsg({ type: null, message: "Updated master key pair" });
      console.log("Got master keypair, ready to encrypt/decrypt");
      encryptedMasterKeyPair.publicKey = encMasterKeyPair.publicKey;
      encryptedMasterKeyPair.privateKey = encMasterKeyPair.privateKey;
      console.log("Ensuring that client keypair exists");
      //console.log("keyPair.privateKey at new master key is: "+keyPair.privateKey);
      if (typeof keyPair.privateKey !== 'undefined' && keyPair.privateKey !== null) {
        console.log("[new master key] Client KeyPair exists. Trying to decrypt master key for '"+username+"'...");
        console.log("encryptedMasterKeyPair.privateKey: "+encryptedMasterKeyPair.privateKey);
        console.log("encryptedMasterKeyPair.publicKey: "+encryptedMasterKeyPair.publicKey);
        decryptMasterKey(username, keyPair.privateKey, encryptedMasterKeyPair.privateKey, function(err, key) {
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

SocketClient.prototype.checkUsernameAvailability = function checkUsernameAvailability(username, callback) {
  var self = this;
  var usernameCallback = callback;

  // Create a listener tied to the username we are checking
  self.socket.on('availability-' + username, function(data) {
    console.log("[socketClient.checkUsernameAvailability] Got availability callback");
    var available = data.available;
    var error = data.error;

    if (error) {
      console.log("[socketClient.checkUsernameAvailability] There was an error while checking username availability");

      // Show error on modal
    };

    self.socket.removeListener('availability-' + username);
    usernameCallback({ available: available });
  });

  // Send the socket request to check the username
  self.socket.emit('checkUsernameAvailability', { username: username, socketCallback: 'availability-' + username });
}

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

// Move this to an included stream listeners lib file
SocketClient.prototype.listenForStreamData = function(id, callback) {
  console.log('[socketClient.listenForStreamData] Got stream data for streamId %s', id);

  return this.socket.on('streamData-' + id, callback);
};


window.socketClient = new SocketClient();
