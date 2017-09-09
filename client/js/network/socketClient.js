'use strict';

var Authentication = require('../authentication/index.js');
var ChatManager = require('../chat/index.js');
var MasterUserlist = require('../users/masterUserlist.js');
var chatHeader = require('../chat/header.js');
var Userlist = require('../users/userlist.js');
var EncryptionManager = require('../encryption/index.js');

function SocketClient() {
  var self = this;
  var protocol = window.location.protocol;
  var host = window.location.host;
  var port = window.location.port;

  // EncryptionManager needs ChatManager and ChatManager needs EncryptionManager
  // Need to figure out the best way to handle that...
  this.encryptionManager = new EncryptionManager();

  this.chatManager = new ChatManager({
    managers: {
      encryptionManager: this.encryptionManager,
      socketClient: this
    }
  });

  this.chatManager.init();

  this.userlistCtl = new Userlist();
  this.userlistCtl.init({ chatManager: this.chatManager });

  this.masterUserlist = new MasterUserlist(this, {});
  this.authentication = new Authentication({
    masterUserlist: this.masterUserlist,
    encryptionManager: this.encryptionManager,
    chatManager: this.chatManager,
    socketClient: this
  });

  var encryptionOpts = {
    managers: {
      socketClient: this,
      authentication: this.authentication
    }
  };
  this.encryptionManager.init(encryptionOpts);

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

  this.socket.on('disconnect', function() {
    console.log('Disconnected from server...');
  });

  this.socket.on('certificate', function(certificate) {
    console.log("[socketClient] (certificate) Got server certificate. Verifying...");
    self.encryptionManager.verifyCertificate(certificate, function(err) {
      // This should probably check for an error and not continue if we have an error...
      console.log("[socketClient] (certificate) Veritifed server certificate! Authenticating with server.");
      self.init();
    });
  });

  this.socket.on('connect_error', function(err) {
    console.log('[SOCKET] (connection error) Disabling chat!', err);
    if (self.listeners) {
      // TODO: Should be updating CLIENT STATUS here instead of chat status
      console.log("[SocketClient.SocketClient] (1) connect_error, running ChatManager.updateChatStatus();");
      self.chatManager.updateChatStatus({ status: 'disabled' });
    }
  });
}

SocketClient.prototype.addListeners = function() {
  var self = this;
  self.listeners = true;

  self.socket.on('authenticated', function(data) {
    data.socket = this;

    self.authentication.authenticated(data);
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
    self.chatManager.handleChatUpdate(data);
  });

  this.socket.on('previousPageUpdate', function(data) {
    self.chatManager.handlePreviousPageUpdate(data);
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

  this.socket.on('message', function(data) {
    console.log('[SOCKET] Got message from server of type %s', data.type);

    if (data.type == 'room') {
      self.chatManager.handleMessage(data);
    }

    if (data.type == 'chat') {
      self.chatManager.handlePrivateMessage(data);
    }
  });

  this.socket.on('newMasterKey', function(data) {
    console.log("[SOCKET] 'new master key'");
    var room = data.room;
    self.chatManager.disableChat();
    self.joinRoom(room, function(err) {
      self.chatManager.localMsg({ type: null, message: "Master key being updated. Please wait..." });
    });
  });

  this.socket.on('userlistUpdate', function(data) {
    var userlist = data.userlist;
    var userNameMap = data.userNameMap;

    console.log('[SOCKET] userlistUpdate');

    self.chatManager.userNameMap = userNameMap;

    // Passing chatManager for now, shouldn't do this...
    self.masterUserlist.update(userlist, function(err) {
      console.log("[socketClient.on userlistUpdate] Updated userlist");
      // Update userlist if the current chat is a private chat
      //   there is a better way to do this, should likely do this
      //   the same way that we're doing it for rooms and issue an update
      //   only for the private chats that the user is a part of
      var activeChatId = self.chatManager.activeChat;
      if (activeChatId && self.chatManager.chats[activeChatId].type == 'chat') {
        self.userlistCtl.update({ chatId: activeChatId });
        console.log("[socketClient.on userlistUpdate] Updated userlist for private chat with id '" + activeChatId + "'");
      };
    });
  });

  this.socket.on('activeUsersUpdate', function(data) {
    var uniqueRoomUsersArray = [];
    var newRoomUsersArray = [];
    var chatId = data.chatId;

    console.log("[SOCKET] activeUsersUpdate - Got SOCKET event");

    if (!self.chatManager.chats[chatId]) {
      return;
    };

    var chatName = self.chatManager.chats[chatId].name;

    var activeUsers = data.activeUsers;
    var roomUsers = data.activeUsers;

    console.log("[SOCKET] 'roomUsersUpdate' for room #" + chatName);

    if (self.chatManager.chats[chatId]) {
      self.chatManager.chats[chatId].activeUsers = activeUsers;
    }

    console.log("[USERLIST UPDATE] Updating userlist");

    //
    // Need to hash out using active to update the room users list
    // Should probably do this in roomUpdate or chatUpdate instead
    // Break this up into roomUpdate, chatUpdate and key add/remove methods
    //

    if (self.chatManager.activeChat === chatId) {
      self.userlistCtl.update({ chatId: chatId });
    }
  });

  this.socket.on('chatStatus', function(data) {
    console.log("Got chat status...");
    var statusType = data.statusType;
    var statusMessage = data.statusMessage;
    self.chatManager.localMsg({ type: statusType, message: statusMessage });
    var $messages = $('#messages');
    $messages[0].scrollTop = $messages[0].scrollHeight;
  });

};

SocketClient.prototype.init = function() {
  var self = this;
  console.log("[INIT] Loading client keypair...");

  // Need to clean up all local state in case this is a reconnect

  self.encryptionManager.loadClientKeyPair(function (err, loaded) {
    if (err) {
      //Show error somewhere
      return console.log("[INIT] Error loading client key pair: "+err);
    }

    if (!loaded) {
      console.log("[INIT] Prompting for credentials");
      return self.chatManager.initialPromptForCredentials();
    } else {
      self.chatManager.init();

      console.log("[INIT] Client credentials loaded");
    }

    if (!self.listeners) {
      console.log('[INIT] Didnt find any socket listeners so adding them now');
      self.addListeners();
    }

    return self.authentication.authenticate({ socket: self.socket });
  });
};



SocketClient.prototype.joinRoom = function(roomId, callback) {
  var self = this;
  if (roomId && typeof roomId !== 'undefined') {
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
  console.log("[PART ROOM] Parting room #" + self.chatManager.chats[chatId].name);
  self.socket.emit('part', { chatId: chatId } );
  callback(null);
};

SocketClient.prototype.sendMessage = function(data) {
  var self = this;
  var messageId = data.messageId;
  var chatId = data.chatId;
  var toUserIds = data.toUserIds;
  var message = data.message;
  var type = data.type;

  console.log("Encrypting message: " + message);
  self.encryptionManager.encryptMessage({
    chatId: chatId,
    message: message
  }, function(err, pgpMessage) {
    if (err) {
      console.log("Error Encrypting Message: " + err);
    }
    else {
      console.log("[socketClient.sendMessage] Sending encrypted message to chat ID: ", chatId);
      self.socket.emit('message', {
        messageId: messageId,
        chatId: chatId,
        type: type,
        toUserIds: toUserIds,
        pgpMessage: pgpMessage
      });
    }
  });
};

SocketClient.prototype.joinComplete = function(data) {
  var self = this;
  var err = data.err;
  var room = data.room;

  if (err) {
    console.log("Cannot join channel due to permissions");
    return self.chatManager.showError(err);
  }

  // Determine what the current active chat should be
  // If we have an active chat cached locally, set it to active chat but only if it exists in our chats list
  if (!self.chatManager.activeChat && window.activeChat && self.chatManager.chats[window.activeChat]) {
    self.chatManager.activeChat = window.activeChat;
  };

  // If there is still no active chat, set it to the one we just joined
  if (!self.chatManager.activeChat) {
    self.chatManager.setActiveChat(room.id);
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
  self.chatManager.initRoom(room, function(err) {
    self.chatManager.chats[room.id].joined = true;
    self.chatManager.updateRoomList(function() {
      if (self.chatManager.activeChat == room.id) {
        self.chatManager.focusChat({ id: room.id }, function(err) {
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
  self.chatManager.partChat(chatId, function() {
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
    chatHeader.updateFavoriteButton.call(self.chatManager, { favorite: data.favorite });
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
    self.chatManager.initRoom(rooms[id], function(err) {
      console.log("Init'd room " + rooms[id].name + " from room update");

      if (self.chatManager.activeChat && self.chatManager.activeChat == id) {
        self.userlistCtl.update({ chatId: id });
      }

      self.chatManager.updateRoomList(function() {
        console.log("[SocketClient.handleRoomUpdate] (1) Running self.chatManager.updateChatStauts();");
        self.chatManager.updateChatStatus({ chatId: id, status: 'enabled' });
      });

      chatHeader.update.call(self.chatManager, id);

      self.chatManager.buildRoomListModal;

      // if manageMembersModal is currently visible don't clear any error or ok messages
      self.chatManager.populateManageMembersModal({ clearMessages: false });
    });
  })
};

SocketClient.prototype.handleMembershipUpdateComplete = function(data) {
  var self = this;

  var success = data.success;
  var message = data.message;

  if (!success) {
    // display error on membership editor modal
    self.chatManager.membershipUpdateError(data.message);
    return console.log("[HANDLE MEMBERSHIP UPDATE COMPLETE] Failed to add member: ", message);
  }

   // Show OK on membership editor modal
  console.log("[HANDLE MEMBERSHIP UPDATE COMPLETE] Member added! Displaying message in modal. Message:", message);

  // This doesn't actually do anything becuase the room update has not been received by roomUpdate yet
  console.log("[socketClient.handleMembershipUpdateComplete] Running populateManageMembersModal");
  self.chatManager.populateManageMembersModal({ clearMessages: false });
  self.chatManager.membershipUpdateMessage(message);
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
  var activeChatid = self.chatManager.activeChat;
  console.log("Displaying response from server command in chat '" + self.chatManager.chats[activeChatId].name + "'");
  self.chatManager.addMessageToChat({ type: self.chatManager.chats[activeChatId].type, message: response, chat: self.chatManager.chats[activeChatId].name });
};

SocketClient.prototype.membership = function(data) {
  var self = this;

  console.log("[MEMBERSHIP] Emitting membership with data - ", data);
  self.socket.emit('membership', data);
};

SocketClient.prototype.updateMasterKey = function updateMasterKey(callback) {
  self.encryptionManager.getMasterKeyPair(username, function(err, encryptedMasterKeyPair) {
    if (err) {
      console.log("Error getting master key pair: "+err);
      self.chatManager.localMsg({ type: "ERROR", message: "Error getting master key pair" });
      return callback("Error getting master key pair");
    } else {
      pleaseWait();
      self.chatManager.localMsg({ type: null, message: "Updated master key pair" });
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
