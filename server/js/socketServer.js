'use strict'

// Models
var User = require('../models/user');
var KeyId = require('../models/keyid');
var KeyPair = require('../models/keypair');
var Room = require('../models/room');
var PFile = require('../models/pfile');
var Message = require('../models/message');
var Chat = require('../models/chat');
var dl = require('delivery');
var fs = require('fs');
var stream = require('stream');

// Managers
var FileManager = require('./managers/file');
var EncryptionManager = require('./managers/encryption');

// Config
var config = require('../../config/pipo')(process.env.NODE_ENV);
var logger = require('../../config/logger');

// Admin Data
var AdminCertificate = require('../../config/adminData/adminCertificate');

// Modules
var mongoose = require('mongoose');
var crypto = require('crypto');

/**
 * Handles all socket traffic
 * @param namespace
 * @returns {Function}
 * @constructor
 */
function SocketServer(namespace) {
  if (!(this instanceof SocketServer)) {
    return new SocketServer(namespace);
  }

  this.namespace = namespace;
  if (this.namespace) {
    if (!this.namespace.socketMap) {
      this.namespace.socketMap = {};
    }
    if (!this.namespace.userMap) {
      this.namespace.userMap = {};
    }
  }

}

SocketServer.prototype.init = function init() {
  var self = this;

  var systemUserData = config.systemUser;

  User.getSystemUser(function(err, systemUser) {
    if (err) {
      return logger.error('[socketServer.init] Error getting system user: %s', err);
    }

    // Add the system user to the userMap
    self.namespace.userMap[systemUser.id] = systemUser;

    var encryptionManagerOptions = {
      systemUserData: systemUserData,
      systemUser: systemUser
    };

    self.encryptionManager = new EncryptionManager(encryptionManagerOptions);

    var managers = {
      socketServer: self,
      encryptionManager: self.encryptionManager
    };

    logger.debug('[socketServer.constructor] encryptionManager is: ', Object.prototype.toString.call(self.encryptionManager));

    self.fileManager = new FileManager(managers);
  });

  // Make sure we have a key for the PiPo user
  if (config.encryptionScheme === 'masterKey') {
    // Do master key things
    this.initMasterKeyPair(function(err) {
      if (err) {
        return logger.error("[INIT] Error updating master key pair: "+err);
      }
      logger.info("[INIT] Finsihed updating master key pair");
    });
  } else {
    // Do client key things
  }
};

SocketServer.prototype.onBinarySocketConnection = function(binSocket) {
  this.binSocket = binSocket;
  var self = this;

  logger.debug("[socketServer.onBinarySocketConnection] Init binary listeners");

  binSocket.on('stream', function(fileStream, data) {
    data.socketServer = self;

    logger.debug('[socketServer.onBinarySocketConnection.stream] Got sendFile socket event');

    // Pass the fileStream to the file stream handler in fileManager
    self.fileManager.handleFileStream(fileStream, data, function(err) {
      if (err) {
        return console.log('Error handling file stream: %s', err);
      }

      console.log('File stream handled');
    });
  });
};

SocketServer.prototype.onSocket = function(socket) {
  this.socket = socket;
  var self = this;

  this.init();

  logger.debug('[CONNECTION] Socket %s connected to main', socket.client.id);

  socket.on('authenticate', function(data) {
    self.authenticate(socket, data);
  });
  socket.on('checkUsernameAvailability', function(data) {
    self.checkUsernameAvailability(socket, data);
  });
  socket.on('updateClientKey', function(data) {
    self.updateClientKey(socket, data);
  });
  socket.on('disconnect', function(data) {
    self.disconnect(socket);
  });
  socket.on('leaveRoom', function(data) {
    self.leaveRoom(socket, data);
  });
  socket.on('join', function(data) {
    self.joinRoom(socket, data);
  });
  socket.on('part', function(data) {
    self.partRoom(socket, data);
  });
  socket.on('createRoom', function(data) {
    self.createRoom(socket, data);
  });
  socket.on('updateRoom', function(data) {
    self.updateRoom(socket, data);
  });
  socket.on('getChat', function(data) {
    self.getChat(socket, data);
  });
  socket.on('getPreviousPage', function(data) {
    self.getPreviousPage(socket, data);
  });
  socket.on('membership', function(data) {
    self.membership(socket, data);
  });
  socket.on('message', function(data) {
    self.onMessage(socket, data);
  });
  socket.on('toggleFavorite', function(data) {
    self.toggleFavorite(socket, data);
  });
  socket.on('serverCommand', function(data) {
    self.onServerCommand(socket, data);
  });

  // File transfer
  socket.on('sendFile', function(data) {
    self.onSendFile(socket, data);
  });
  socket.on('getFile', function(data) {
    self.onGetFile(socket, data);
  });
};


/*
 * Get the default room or create it if it does not exist
 */
SocketServer.prototype.getDefaultRoom = function getDefaultRoom(callback) {
  var self = this;
  // get the default room name

  User.getSystemUser(function(err, systemUser) {
    if (err) {
      logger.error('[socketServer.getDefaultRoom] Error getting default room');
    }

    logger.debug("[getDefaultRoom] systemUser is: ", systemUser.username);

    var defaultRoomName = 'pipo';

    var defaultRoomData = {
      username: 'pipo',
      name: 'pipo',
      topic: 'Welcome to PiPo.',
      group: 'default',
      membershipRequired: false,
      keepHistory: true,
      encryptionScheme: 'clientkey',
    };

    // create the default room object
    logger.debug("[getDefaultRoom] Getting default room #" + defaultRoomName);
    Room.getByName(defaultRoomName, function(defaultRoom) {
      if (!defaultRoom) {
        logger.debug("[getDefaultRoom) No default room on initial run, creating default room...");
        Room.create(defaultRoomData, function(defaultRoom) {
          Room.getByName(defaultRoomName, function(savedDefaultRoom) {
            logger.debug("[getDefaultRoom] Saved default room is: ", savedDefaultRoom.name);

            if (savedDefaultRoom == null) {
              return logger.error("[getDefaultRoom] ERROR - Default room is NULL");
            }

            logger.debug("Found default room: #",savedDefaultRoom.name);

            return callback(savedDefaultRoom);
          })
        });
      } else {
        return callback(defaultRoom);
      }
    });
  });
};


/*
 * Check if a username is available
 */
SocketServer.prototype.checkUsernameAvailability = function checkUsernameAvailability(socket, data) {
  var self = this;
  var username = data.username;
  var socketCallback = data.socketCallback;
  var available = true;
  var error = null;

  logger.debug("[socketServer.checkUsernameAvailability] checking username availability for username '" + username + "'");

  User.findOne({ username: username }, function(err, user) {
    if (err) {
      logger.error('[socketServer.checkUsernameAvailability] There was an error while checking availbility of a username: ' + err);
      error = "There was an error while checking availability of supplied username";
    }

    if (user) {
      available = false;
    }

    return socket.emit('availability-' + username, { available: available, error: error });
  });
};


/**
 * New socket connected to server
 */
SocketServer.prototype.authenticate = function authenticate(socket, data) {
  var self = this;

  logger.debug('Authenticating new socket with data: ', data);

  User.authenticateOrCreate(data, function(err, authData) {
    logger.debug('blam');

    if (!authData) {
      logger.warn('Authentication error: no auth data provided by user');

      return socket.emit('errorMessage',
                         { message: 'Authentication error: no auth data provided' }
                        );
    }

    // Why are we doing this like this here??
    var user = authData.user;
    var newUser = authData.newUser;
    self.socket.user = user;

    if (err) {
      logger.warn('Authentication error', err);
      return socket.emit(
        'errorMessage',
        {message: 'Error authenticating you ' + err}
      );
    }

    if (!user) {
      logger.warn('[INIT] Problem initializing connection, no error, but no user');
      return socket.emit(
        'errorMessage',
        {message: 'An unknown error has occurred'}
      );
    }

    // This helps keep track of when users sign up so that
    // we can emit the new user data to all clients
    if (newUser) {
      logger.debug('Adding %s to master userlist', data.username);
      self.updateUserList({scope: 'all'});
    }

    var socketMapKeys = Object.keys(self.namespace.socketMap);

    logger.debug('[socketServer.authenticate] Added user if needed, socket.id: %s username: %s userId: %s', socket.id, user.username, user._id.toString());

    // Add the user's socketId to the socket map
    self.namespace.socketMap[socket.id] = {
      username: user.username,
      userId: user._id.toString(),
      publicKey: user.publicKey
    };

    // Init the user in the userMap if they don't exist yet
    if (!self.namespace.userMap[user._id.toString()])
      self.namespace.userMap[user._id.toString()] = [];

    // Push the current socket to the users socketMap arary
    self.namespace.userMap[user._id.toString()].push(socket.id);

    User.setActive({ userId: user._id.toString(), active: true }, function(err) {
      self.updateUserList({ scope: 'all' });
    });

    logger.debug("[INIT] getting userlist for user...");
    self.getDefaultRoom(function(defaultRoom) {
      logger.debug("[socketServer.authenticate] defaultRoom.name: " + defaultRoom.name);


      Message.get({ chatId: defaultRoom.id, type: 'room' }, function(err, messages) {
        logger.debug("[socketServer.authenticate] Got messages for default room. Message count is " + messages.length);

        defaultRoom.messages = messages;

        Room.sanatize(defaultRoom, function(sanatizedRoom) {
          logger.debug("Sanatized default room #",sanatizedRoom.name,"running User.getAllUsers");
          User.getAllUsers({}, function(userlist) {
            logger.debug("[socketServer.authenticate] Got all users, running User.buildUserIdMap");
            User.buildUserNameMap({ userlist: userlist}, function(userNameMap) {
              logger.debug("[socketServer.authenticate] Built user ID Map, running user.buildProfile for user %s", user._id.toString());
              logger.debug('[socketServer.authenticate] user._favoriteRooms: ', user._favoriteRooms);

              User.buildProfile({ user: user }, function(userProfile) {
                // Should send userProfile separate from userlist
                logger.debug("[socketServer.authenticate] Done building users profile, sending 'authenticated' to " + user.username);

                var authenticationData = {
                  message: 'ok',
                  userProfile: userProfile,
                  userlist: userlist,
                  userNameMap: userNameMap,
                  defaultRoomId: sanatizedRoom.id
                };

                self.socket.emit('authenticated', authenticationData);
              });
            });
          });
        });
      });

      logger.debug("[socketServer.authenticate] getting available room list for ", user.username);

      // Send the available rooms to the user
      User.availableRooms({ userId: user.id }, function(err, roomData) {
        if (err) {
          logger.error("[socketServer.authenticate] Authentication failed getting available rooms: ", err);
          return socket.emit('roomUpdate', { err: "Room update failed: " + err });
        }

        // Go ahead and send the room objects to the user even if they haven't joined it yet
        // - Need to figure out how to have the client only decrypt messages once when joining
        //   as there is no need to decrypt twice. If there is a legit roomUpdate later tho,
        //   we may want to decrypt messages again? When could this happen?
        Room.sanatizeRooms(roomData.rooms, function(sanatizedRooms) {
          logger.debug("[socketServer.authenticate] Running roomUpdate from authenticate");
          socket.emit('roomUpdate', { rooms: sanatizedRooms });
        });
      })
    })
  })
};



/*
 * Check all users to make sure they have an up to date masterKeyPair
 * encrypted to them
 *
 * TODO:
 * Add membership check before encrypting key to user
 */

SocketServer.prototype.initMasterKeyPair = function initMasterKeyPair(callback) {
  var self = this;
  // Run through each room and do this...
  KeyPair.checkMasterKeyPairForAllUsers(function(err, response) {
    logger.info("Checked master key pair for all users. Response is '"+response+"'");
    if (err) { logger.info("[START] Error checking master key for all users: "+err); };
    if (response == 'update') {
      logger.info("Users keypair needs updating so generating new master key pair");
      KeyPair.regenerateMasterKeyPair(function(err, masterKeyPair, id) {
        logger.info("[START] New master keyPair generated with id '"+id+"'");
        KeyPair.updateMasterKeyPairForAllUsers(masterKeyPair, id, function(err) {
          if (err) {
            logger.info("[START] Error encrypting master key for all users: "+err);
            return callback(err);
          };
          logger.info("[SOCKET SERVER] (initMasterKeyPair) Encrypted master key for all users!");
          self.namespace.emit('newMasterKey', { room: "general" } );
          callback(null);
        });
      });
    } else if (response == 'ok') {
      logger.info("All users master key matches current version");
      //self.namespace.emit('newMasterKey');
      callback(null);
    }
  });
};

/**
 * Check and sync master key for user
 */
SocketServer.prototype.getMasterKeyPairForUser = function getMasterKeyPairForUser(username, room, callback) {
  User.getMasterKeyPair(username, room, function(masterKeyPair) {
    return callback(null, masterKeyPair);
  });
};

SocketServer.prototype.updateClientKey = function updateClientKey(data) {

};



/**
 * Message broadcast from client
 */
SocketServer.prototype.onMessage = function onMessage(socket, data) {
  var self = this;

  if (!data) {
    return logger.error('[socketServer.onMessage] No data provided with onMessage');
  }

  var chatId = data.chatId;

  if (!socket.user) {
    logger.info("[MSG] Ignoring message from unauthenticated user");
    return socket.emit('errorMessage', {message: 401});
  }

  logger.info("[socketServer.onMessage] Server got message type %s from %s", data.type, socket.user.username);

  if (data.type == 'room') {
    logger.debug('[MSG] handling room message');

    Room.findOne({ _id: chatId }, function(err, room) {
      // Confirm that user has permission to send message to this room
      if (err) {
        return logger.error("[socketServer.onMessage] Error when finding room to send message: ", err);
      };

      if (!room) {
        return logger.error("[socketServer.onMessage] No room found for message");
      };

      User.findOne({ username: socket.user.username }, function(err, user) {
        // Add message to room.messages
        if (room.keepHistory) {
          var message = new Message({
            _room: chatId,
            type: data.type,
            _fromUser: user,
            messageId: data.messageId,
            date: new Date(),
            fromUser: user._id.toString(),
            encryptedMessage: data.pgpMessage
          });

          message.save(function(err) {
            logger.debug("[MSG] Pushing message to room message history");
          })
        }

        logger.debug("[socketServer.onMessage] MessageId: %s fromUserId: %s", data.messageid, user._id.toString());

        self.namespace.emit('message', {
          chatId: room.id,
          type: 'room',
          fromUserId: user._id.toString(),
          messageId: data.messageId,
          message: data.pgpMessage
        });
      });
    })
  }

  if (data.type == 'chat') {
    logger.debug('[MSG] handling chat message');

    self.handleChatMessage(socket, data);
  }

  logger.info("[MSG] Server emitted chat message to users");
};



/**
 * Private message from client
 */
SocketServer.prototype.handleChatMessage = function onPrivateMessage(socket, data) {
  var self = this;
  var messageId = data.messageId;
  var targetSockets = [];

  if (!socket.user) {
    logger.info("[MSG] Ignoring message from unauthenticated user");
    return socket.emit('errorMessage', {message: 401});
  }

  console.log('Sending message from user %s', socket.user._id.toString());

  var fromUser = socket.user._id.toString();
  var chatId = data.chatId;
  var toUserIds = data.toUserIds;

  // Get the socketId's for each participant
  // If any of these do not exist yet, we need to grab it from the DB and add it to the namespace userMap
  toUserIds.forEach(function(toUserId) {
    if (self.namespace.userMap[toUserId]) {
      if (self.namespace.userMap[toUserId] != socket.user._id.toString()) {
        logger.debug("[socketServer.onPrivateMessage] Looping toUserIds to find socket - self.namespace.userMap[toUserId]: ", self.namespace.userMap[toUserId]);
        targetSockets = targetSockets.concat(self.namespace.userMap[toUserId]);
      }
    } else {
      // Notify the sending user that the receiving user is not currently online
    }
  });

  var userMapKeys = Object.keys(self.namespace.userMap);

  Chat.findOne({ chatHash: chatId }, function(err, chat) {
    // If there is not a chat with these participants create one
    if (err) {
      return logger.error("[onPrivateMessage] Error finding Chat with participantIds: ", toUserIds);
    };

    var messageData = {
      _fromUser: socket.user,
      _toUsers: toUserIds,
      type: 'chat',
      messageId: messageId,
      date: new Date(),
      encryptedMessage: data.pgpMessage
    };

    var emitData = {
      fromUserId: socket.user._id.toString(),
      type: 'chat',
      chatId: chatId,
      messageId: messageId,
      toUserIds: toUserIds,
      date: messageData.date,
      message: data.pgpMessage,
      signature: data.signature
    };

    var chatData = {
        type: "chat",
        chatHash: chatId,
        participantIds: toUserIds
    }

    if (!chat) {
      logger.debug("[socketServer.onPrivateMessage] No chat found with requested participants. Creating new chat.");
      Chat.create(chatData, function(err, chat) {
        messageData._chat = chat.id;
        Message.create(messageData, function(err) {
          emitToSockets(targetSockets, emitData);
        });
      });
    }

    if (chat) {
      logger.debug("[socketServer.onPrivateMessage] Found chat with participantIds: ", toUserIds);
      messageData._chat = chat.id;

      Message.create(messageData, function(err) {
        emitToSockets(targetSockets, emitData);
      });
    };

    // This shouldn't ever happen because the sending user should always get the message, and if sent should be online
    if (!targetSockets) {
      logger.info("[socketServer.onPrivateMessage] No participants of this chat are on line");
      return socket.emit('errorMessage', {message: "User is not online"});
    }
  });

  // Should have chats work like rooms and create a room to emit to instead of individual sockets
  var emitToSockets = function emitToSockets(targetSockets, emitData) {
    targetSockets.forEach(function(targetSocket) {
      logger.debug("[socketServer.onPrivateMessage] Emitting private message to socket: " + targetSocket);

      socket.broadcast.to(targetSocket).emit('message', emitData);
    });
    // Must emit to self becuase broadcast.to does not emit back to itself
    socket.emit('message', emitData);
  };
};

SocketServer.prototype.onSendFile = function(socket, data){
  var self = this;
  data.socketServer = self;

  logger.debug('[socketServer.onSendFile] Got sendFile socket event');

  this.fileManager.handleChunk(data);
};

SocketServer.prototype.onGetFile = function(socket, data){
  var self = this;

  logger.debug("[socketServer.onGetFile] Got getFile request");

  if (!socket || !self.binSocket) {
    return logger.error('[socketServer.onGetFile] No socket or self.binSicket, one must be specified');
  }

  data.socket = socket;
  data.binSocket = self.binSocket;

  this.fileManager.handleGetFile(data);
};

SocketServer.prototype.onFileReceiveSuccess = function onFileReceiveSuccess(file) {
  var params = file.params;
  logger.debug("[socketServer.onFileReceiveSuccess] File params is: ", params);
  fs.writeFile(file.name,file.buffer, function(err){
    if(err){
      console.log('File could not be saved.');
    }else{
      console.log('File saved.');
    };
  });
};


SocketServer.prototype.arrayHash = function arrayHash(array, callback) {
  // Sort participantIds
  var orderedArray = array.sort();

  // MD5 participantIds
  encryptionManager.sha256(orderedArray.toString()).then(function(arrayHash) {
    return callback(arrayHash);
  });
};


/*
 * Handle request from client to get chat history between two or more users
 */
SocketServer.prototype.getChat = function getChat(socket, data) {
  var self = this;

  logger.debug('[socketServer.getChat] participantIds is', participantIds);

  // How do we find the chat using the participants (or some other thing)?
  var chatId = data.chatId;
  var chatHash = data.chatHash;
  var participantIds = data.participantIds;

  Chat.getSanatized({
    chatId: chatId,
    chatHash: chatHash,
    participantIds: participantIds
  }, function(err, sanatizedChat) {
    if (err) {
      socket.emit('chatUpdate-' + chatHash, null);
      return logger.error("[socketServer.getChat] Error getting chat: " + err);
    };

    if (!sanatizedChat) {
      logger.debug("[socketServer.getChat] No chat found! Will create a new one with hash '" + chatHash + "'");
    }

    finish(sanatizedChat);
  });

  var finish = function finish(sanatizedChat) {
    logger.debug("[socketServer.getChat finish] Starting to finish...");
    if (sanatizedChat) {
      if (chatHash) {
        logger.debug("[getChat.finish] We have chatHash '" + chatHash + "'");
        return socket.emit('chatUpdate-' + chatHash, { chat: sanatizedChat });
      } else {
        logger.debug("[socketServer.getChat.finish] We have no chatHash");
        return socket.emit('chatUpdate', { chat: sanatizedChat });
      };
    } else {
      logger.debug("[socketServer.getChat finish] Finishing without a chat");

      // This may be redundant as the client is doing the array hash also but we could check it here to make sure it matches?
      self.arrayHash(participantIds, function(chatHash) {
        Chat.create({
          participantIds: participantIds,
          chatHash: chatHash,
          type: 'chat'
        }, function(err, newChat) {
          if (err) {
            return logger.error('[socketServer.getChat.finish] Error creating new chat with chatHash %s', chatHash);
          }

          logger.debug('[socketServer.getChat.finish] Created new chat with id %s', newChat._id);

          Chat.sanatize(newChat, function(newSanatizedChat) {
            return socket.emit('chatUpdate-' + chatHash, { chat: newSanatizedChat });
          });
        });
      });
    };
  };
};


SocketServer.prototype.getPreviousPage = function getPreviousPage(socket, data) {
  var self = this;
  var chatId = data.chatId;
  var type = data.type;
  var referenceMessageId = data.referenceMessageId;

  Message.get({
    chatId: chatId,
    type: type,
    referenceMessageId: referenceMessageId,
  }, function(err, messages) {
    Message.bulkSanatize(messages, function(sanatizedMessages) {
      return socket.emit('previousPageUpdate', {
        chatId: chatId,
        messages: sanatizedMessages
      });
    });
  });
};


SocketServer.prototype.arrayHash = function arrayHash(array, callback) {
  var self = this;

  // Sort participantIds
  var orderedArray = array.sort();

  var arrayHashString = crypto.createHash('sha256').update(orderedArray.toString()).digest('hex').toString();
  return callback(arrayHashString);
};


SocketServer.prototype.onServerCommand = function onServerCommand(socket, data) {
  var self = this;
  var socket = this.socket;
  var command = data.command;
  var username = socket.user.username;
  //TODO refactor this
  var currentChat = data.currentChat;
  logger.info("Received command '"+command+"' from user '"+socket.name+"'");
  var splitCommand = command.split(" ");
  if (splitCommand[0] == "who") {
    logger.info("[SERVER] Responding to 'who' request from '"+socket.name+"'");
    var roomMembershipArray = [];
    logger.info("[SERVER COMMAND] Checking room #"+currentChat);
    for (var key in roomMembership[currentChat]) {
      logger.info("[SERVER COMMAND] Iterating user "+roomMembership[CurrentChat][key].username);
      roomMembershipArray.push(roomMembership[currentChat][key].username);
    }
    logger.info("[SERVER COMMAND] Broadcasting user list for #"+currentChat+" to socket.id "+socket.id+" with data ( "+roomMembershipArray.toString()+" )");
    this.namespace.to(socket.id).emit('chat status', { statusType: "WHO", statusMessage: "Current users of #"+currentChat+" are ( "+roomMembershipArray.toString()+" )"});
    //socket.broadcast.to(socket.id).emit('chat status', "Current users of #"+currentChat+" are ( "+roomMembershipArray.toString()+" )");
  } else if (splitCommand[0] == "room") {
    logger.info("Got room command");
    if (splitCommand[2] == "member") {
      logger.info("Got member sub command");
      if (splitCommand[3] == "add") {
        logger.info("Got add sub sub command");
        Room.addMember({ member: splitCommand[4], roomName: splitCommand[1] }, function(data) {
          var success = data.success;

          if (!success) {
            return logger.info("Was not successful when adding membe to room");
          }
          logger.info("Added " + splitCommand[4] + " to room " + splitCommand[1]);
          return socket.emit('serverCommandComplete', { response: "[SERVER] Added " + splitCommand[4] + " to room " + splitCommand[1] });
        })
      }
    }
  } else if (splitCommand[0] == "help") {
    // Output help here
  } else {
    logger.info("[SERVER COMMAND] Unable to parse server command...");
  }
};


/**
 * Client join room
 */
SocketServer.prototype.joinRoom = function joinRoom(socket, data) {
  var self = this;

  //logger.debug("[JOIN ROOM] data is ",data);

  if (!socket.user) {
    logger.info("Ignoring join attempt by unauthenticated user");
    return socket.emit('errorMessage', {message: 401});
  }

  var username = socket.user.username;
  var roomId = data.roomId;

  logger.info("[socketServer.joinRoom] User '" + username + "' joining room with id "+ roomId);

  logger.debug('[socketServer.joinRoom] config.encryptionScheme is: %s', config.encryptionScheme);

  // Ensure that user has the most recent master key for this room if in masterKey mode
  if (config.encryptionScheme === 'masterKey') {
    logger.debug("[JOIN ROOM] encryptionScheme: masterKey - checking masterKey");
    KeyId.getMasterKeyId(roomName, function(err, currentKeyId) {
      User.getMasterKeyPair(username, roomName, function(err, masterKeyPair) {
        if (masterKeyPair.id !== currentKeyId) {
          self.initMasterKeyPair(function(err) {
            // Should probably return and call self here
            User.getMasterKeyPair(username, roomName, function(err, newMasterKeyPair) {
              socket.emit('joinComplete', { encryptionScheme: 'masterKey', room: roomName, masterKeyPair: newMasterKeyPair });
              self.namespace.to(root).emit('newMasterKey', { room: roomName, keyId: currentKeyId });
              socket.join(roomId);
              Room.join({username: username, name: roomName}, function(err, data) {
                var auth = data.auth;
                if (err) {
                  return logger.info("Error joining room " + roomName + " with error: " + err);
                }
                if (!auth) {
                  return logger.warning("Failed to join room " + roomName);
                }
              })
              logger.debug("[SOCKET SERVER] (joinRoom) Sending updateActiveUsers for room " + roomName);
              self.updateActiveUsers(socket, roomId);
            });
          });
        } else {
          //logger.info("[JOIN ROOM] Clients master key is up to date");
          socket.join(roomName);

          socket.emit('joinComplete', { encryptionScheme: 'masterKey', room: sanatizedRoom, masterKeyPair: masterKeyPair });
          logger.debug("[SOCKET SERVER] (joinRoom) Sending updateActiveUsers for room " + room.name + " with member list of ", membersArray);
          self.updateActiveUsers(socket, roomId);
        };
      });
    });
  } else {
    // Using client key encryption scheme
    Room.join({ id: roomId, username: username, socket: socket }, function(err, data) {
      var auth = data.auth;
      var room = data.room;
      var roomUpdated = data.updated;


      if (!room) {
        if (err) {
          logger.debug('socketServer.join] Error joining room: %s', err);
          return socket.emit('joinComplete', { err: "Error joining room:" + err });
        }

        if (!auth) {
          logger.debug('socketServer.join] User could not auth to room', err);
          return socket.emit('joinComplete', { err: "Sorry, you are not authorized to join this room" });
        }
      }

      logger.debug("[socketServer.join] User %s is auth'd for %s", username, roomId);

      Room.sanatize(room, function(sanatizedRoom) {
        if (err) {
          logger.debug('Error sanatizing room: %s', err);
          return socket.emit('joinComplete', { err: "Error while joining room " + room.name + ": "+ err });
        }

        logger.debug('[socketServer.join] sanatized room');

        var rooms = {};

        // Should only include the room users here as a join should only change that
        rooms[room.id] = sanatizedRoom;

        socket.emit('joinComplete', { encryptionScheme: 'clientKey', room: sanatizedRoom });

        if (roomUpdated) {
          logger.debug("[socketServer.joinRoom] Running roomUpdate from joinRoom");

          // The joining user will get a double update but there isn't much better of a way to do this easily
          self.namespace.emit('roomUpdate', { rooms: rooms });
        }

        logger.debug("[SOCKET SERVER] (joinRoom) Sending updateActiveUsers for room " + roomId);

        self.updateActiveUsers(socket, roomId);
      })
    })
  };
};



/*
 * Create a room if user has permission
 */
SocketServer.prototype.createRoom = function createRoom(socket, data) {
  var self = this;
  var roomData = {
    username: socket.user.username,
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  }

  logger.info("User " + socket.user.username + " is trying to create room " + data.name);
  logger.info("New room data: ",data);
  Room.create(roomData, function(err, newRoom) {
    if (err) {
      return logger.info("Error creating room: " + err);
    }
    socket.emit('createRoomComplete', { room: { id: newRoom.id }});
    logger.info("Room created : " + JSON.stringify(newRoom));
    var rooms = {};
    logger.debug("[socketServer.createRoom] sanatize 4");
    Room.sanatize(newRoom, function(sanatizedRoom) {
      rooms[newRoom._id.toString()] = sanatizedRoom;
      if (roomData.membershipRequired) {
        // Emit membership update to user who created private room
        socket.emit('roomUpdate', { rooms: rooms });
      } else {
        // Emit membership update to all users
        self.namespace.emit('roomUpdate', { rooms: rooms });
      }
    })
  })
}

/*
 * Update a room if user has permission
 */
SocketServer.prototype.updateRoom = function updateRoom(socket, data) {
  var self = this;
  var roomData = {
    id: data.id,
    username: socket.user.username,
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  }

  logger.info("User " + socket.user.username + " is trying to update room " + data.name);
  Room.update(roomData, function(err, updatedRoom) {
    if (err) {
      return logger.info("Error creating room: " + err);
    }
    // TODO: This needs to emit room update with ID instead of name
    socket.emit('updateRoomComplete', { name: data.name });
    logger.debug("[socketServer.updateRoom] Room updated : " + JSON.stringify(updatedRoom));
    var rooms = {};
    Room.sanatize(updatedRoom, function(sanatizedRoom) {
      logger.debug("[socketServer.updateRoom] Sanatized room sending back as updated room: ", sanatizedRoom);
      rooms[sanatizedRoom.id] = sanatizedRoom;
      // TODO: Need to emit to members, not just the one who created the room
      if (roomData.membershipRequired) {
        // Emit membership update to user who created private room
        socket.emit('roomUpdate', { rooms: rooms });
      } else {
        // Emit membership update to all users
        self.namespace.emit('roomUpdate', { rooms: rooms });
      }
    });
  })
}

SocketServer.prototype.membership = function membership(socket, data) {
  var self = this;

  var type = data.type;
  var chatId = data.chatId;
  var memberName = data.memberName;
  var memberId = data.memberId;
  var membership = data.membership;
  var username = socket.user.username;
  var userId = socket.user.id;

  logger.debug("[MEMBERSHIP] Caught membership SOCKET event with type '" + type + "'");

  if (type == 'add') {
    var addData = ({
      username: username,
      userId: userId,
      memberId: memberId,
      memberName: memberName,
      membership: membership,
      chatId: chatId,
    })

    logger.debug("[MEMBERSHIP] membership data is:", addData);

    // Should be passing both user and member as userId's here
    Room.addMember(addData, function(addResultData) {
      var success = addResultData.success;
      var message = addResultData.message;

      if (!success) {
        socket.emit('membershipUpdateComplete', addResultData);
        return logger.warn("Failed to add member:", message);
      }

      logger.debug("[socketServer.membership] Member added, finding room with '" + chatId + "' to return...");

      Room.findOne({ _id: chatId }).populate('_members _admins _owner _subscribers _activeUsers _messages _messages._fromUser _messages._toUsers').exec(function(err, room) {
        logger.debug("[socketServer.membership] sanatize 5");
        Room.sanatize(room, function(sanatizedRoom) {
          var rooms = {};
          rooms[room._id.toString()] = sanatizedRoom;
          addResultData.rooms = rooms;

          logger.debug("[MEMBERSHIP] Found room, emitting roomUpdate to namespace for ",room.name);
          self.namespace.emit('roomUpdate', addResultData);

          logger.debug("[MEMBERSHIP] Member added successfully. Emitting membershipUpdateComplete");
          return socket.emit('membershipUpdateComplete', addResultData);
        })
      })
    })
  }
  if (type == 'modify') {
    var modifyData = ({
      memberName: data.member,
      chatId: data.chatId,
      memberId: data.memberId,
      membership: data.membership,
      username: username
    });

    logger.debug("[MEMBERSHIP] Attempting to modify member");
    Room.modifyMember(modifyData, function(resultData) {
      var success = resultData.success;
      var message = resultData.message;
      var chatId = resultData.chatId;
      logger.debug("[MEMBERSHIP] Member modification complete and success is ",success);


      if (!success) {
        return logger.warn("Failed to modify member:", message);
      }

      logger.debug("[MEMBERSHIP] Finding room to send back to the user");
      Room.findOne({ _id: chatId }).populate('_members _admins _owner _subscribers _activeUsers _messages').exec(function(err, room) {
        //logger.debug("[SOCKET SERVER] (membership) Room members: ",room._members);
        //logger.debug("[SOCKET SERVER] (membership) Room admins: ",room._admins);
        logger.debug("[SOCKET SERVER] (membership) Room owner: ",room._owner.username);
        //var adminKeys = Object.keys(room._admins);
        var adminsArray = [];
        room._admins.forEach(function(admin) {
          adminsArray.push(admin.username);
        })
        logger.debug("[SOCKET SERVER] (membership) Room admins: ",adminsArray);
        var rooms = {};
        logger.debug("[socketServer.membership] sanatize 6");
        Room.sanatize(room, function(sanatizedRoom) {
          logger.debug("[SOCKET SERVER] (membership) Room sanatized. Adding to rooms list and sending roomUpdate to namespace");
          rooms[room._id.toString()] = sanatizedRoom;

          var roomData = {
            rooms: rooms
          };

          logger.debug("[SOCKET SERVER] (membership) Emitting roomUpdate to namespace with roomData:",roomData)
          self.namespace.emit('roomUpdate', roomData);
          return socket.emit('membershipUpdateComplete', resultData);
        })
      })
    })
  }
}



/*
 * Client part room
 */
SocketServer.prototype.partRoom = function partRoom(socket, data) {
  var self = this;
  var chatId = data.chatId;
  var userId = socket.user.id;
  var username = socket.user.username;

  // Check if user has already initiated parting this room
  //

  logger.info("[PART ROOM] Parting room for",socket.user.username);

  if (!socket.user) {
    logger.info("Ignoring part attempt by unauthenticated user");
    return socket.emit('errorMessage', {message: 401});
  }

  logger.info("[PART ROOM] User " + username + " parting room with id '" + chatId + "'");

  Room.part({ userId: userId, chatId: chatId }, function(err, success) {
    if (err) {
      return logger.info("Error parting room with id '" + chatId + "' with error: " + err);
    }
    if (!success) {
      return logger.info("Failed to part room with id'" + chatId + "'");
    }
    logger.info("User " + username + " parted room with id'" + chatId + "'");

    // Update the active users for the chat and emit the change to all users in that namespace
    self.updateActiveUsers(socket, chatId);

    // Emit part complete to the parting user
    socket.emit('partComplete', { chatId: chatId });
  })
};


/*
 * Toggle a room as favorite
 */
SocketServer.prototype.toggleFavorite = function toggleFavorite(socket, data) {
  var self = this;
  var chatId = data.chatId;
  var userId = socket.user.id;
  var username = socket.user.username;

  logger.debug("[socketServer.toggleFavorite] (toggleFavorite) Got socket request to toggle favorite for user '" + userId + "' and chat '" + chatId + "'");

  User.findOne({ _id: userId }).exec(function(err, user) {
    var user = user;

    if (!user) {
      return logger.error("[socketServer.toggleFavorite] Error finding user '" + username + " to toggle favorite rooms for");
    };

    logger.debug("[socketServer.toggleFavorite] Found user " + user.username);
    //logger.debug("[socketServer.toggleFavorite] user.membership: ", user.membership._favoriteRooms);

    Room.findOne({ _id: chatId }, function(err, room) {
      if (!room) {
        return logger.error("[socketServer.toggleFavorite] Error finding room by chatId '" + chatId + "' while trying to toggle favorite");
      };

      logger.debug("[socketServer.toggleFavorite] favoriteRooms: ",user.membership._favoriteRooms);

      var favorite = (user.membership._favoriteRooms.indexOf(room.id) > -1);

      logger.debug("[socketServer.toggleFavorite] looking for room in membership: ", room.id);

      logger.debug("[socketServer.toggleFavorite] favorite is ", favorite);

      if (!favorite) {
        logger.debug("[socketServer.toggleFavorite] Favorite room not found for " + socket.user.username + " with id " + socket.user.id + " so adding " + chatId);
        user.membership._favoriteRooms.addToSet(room._id);
        //User.update({ _id: chatId }, { $addToSet: { membership: { _favoriteRooms: room._id }}});
        //user.membership._favoriteRooms.addToSet({ membership: { _favoriteRooms: mongoose.Types.ObjectId( room._id ) }});
        //user.membership._favoriteRooms.addToSet(room._id).save(function(err) {
        logger.debug("[socketServer.toggleFavorite] After adding room: ", user.membership._favoriteRooms);
        user.save(function(err) {
          if (err) {
            logger.error("[socketServer.toggleFavorite] Error saving toggle change");
          };

          return finish({ favorite: true });
        });
        //});
      };

      if (favorite) {
        logger.debug("[socketServer.toggleFavorite] Favorite room " + chatId + " exists for user " + socket.user.username + " with id " + socket.user.id + " so removing it");
        user.membership._favoriteRooms.pull(room._id);
        user.save(function(err) {
          return finish({ favorite: false });
        });
      };
    });

    var finish = function(data) {
      var favorite = data.favorite;

      return socket.emit('toggleFavoriteComplete-' + chatId, { favorite: favorite });
    };
  });
};



/*
 * Update the master userlist and send results to everyone
 */
SocketServer.prototype.updateUserList = function updateUserList(data) {
  var self = this;
  var scope = data.scope;
  User.getAllUsers({}, function(userlist) {
    logger.debug("[socketServer.updateUserList] Got data for userlist update with scope '" + scope + "'");
    User.buildUserNameMap({userlist: userlist}, function(userNameMap) {
      logger.debug("[socketServer.updateUserList] Returning userIdMap");
      if (scope == 'all') {
        self.namespace.emit("userlistUpdate", {
          userlist: userlist,
          userNameMap: userNameMap
        })
      } else if (scope == 'self') {
        socket.emit("userlistUpdate", {
          userlist: userlist,
          userNameMap: userNameMap
        })
      }
    });
  })
};



/**
 * Update userlist for a room and emit an update to the client
 *
 * Should this go in the room or chat model?
 * - may have to wait until room and chat are combined
 */
SocketServer.prototype.updateActiveUsers = function updateActiveUsers(socket, chatId) {
  var self = this;

  logger.debug("[socketServer.updateActiveUsers] Getting active users for chatId: %s", chatId);

  self.getActiveUsers(chatId, function(err, activeUsers) {
    logger.debug('[socketServer.updateActiveUsers] activeUsers is: ', activeUsers);
    logger.debug("[socketServer.updateActiveUsers] Sending 'roomUsersUpdate' to namespace '" + chatId + "' after updating active members");

    self.namespace.to(chatId).emit("activeUsersUpdate", {
      chatId: chatId,
      activeUsers: activeUsers
    });
  });
};



/*
 * Get a list of a rooms active members from the socket namespace
 */
SocketServer.prototype.getActiveUsers = function(chatId, callback) {
  var self = this;
  var activeUserIds = [];
  var activeUsers = [];
  var uniqueActiveUsers = [];

  logger.debug('[socketServer.getActiveUsers] Getting active users for chatId %s', chatId);

  if (typeof this.namespace.adapter.rooms[chatId] !== 'undefined') {
    logger.debug('[socketServer.getActiveUsers] Found room in namespace');

    activeUserIds = Object.keys(self.namespace.adapter.rooms[chatId].sockets).filter(function(sid) {
      return sid;
    });

    logger.debug('[socketServer.getActiveUsers] activeUserIds found: ', activeUserIds);

    //Map sockets to users
    activeUsers = activeUserIds.map(function(sid) {
      return self.namespace.socketMap[sid].userId;
    });

    uniqueActiveUsers = activeUsers.filter(function(elem, pos) {
      return activeUsers.indexOf(elem) == pos;
    });

    callback(null, uniqueActiveUsers);

  } else {
    console.log('[socketServer.getActiveUsers] No active users found for chatId %s', chatId);
    callback('Room is not defined under namespace.adapter', null);
  };

};



SocketServer.prototype.leaveRoom = function leaveRoom(socket, roomId) {
  logger.debug("[socketServer.leaveRoom] Got leave room for id: " + roomId);
};

// This was from a version of socket.io that I hacked and won't get used until the MR is accepted
SocketServer.prototype.disconnecting = function(socket, disconnecting) {
  var self = this;
  if (socket) {
    var userId = socket.user.id;
    var username = socket.user.username;
    // BOOKMARK BOOKMARK BOOKMARK
    var roomIds = Object.keys(socket.rooms);

    logger.debug("[socketServer.disconnecting] roomIds: ", roomIds);

    logger.debug("[socketServer.disconnecting] User '" + username + "' is disconnecting.");
    logger.debug("[socketServer.disconnecting] rooms: ", Object.keys(socket.rooms));

    //roomIds.forEach(function(id) {
    //  self.updateActiveUsers(id);
    //});
  }
};


SocketServer.prototype.disconnect = function disconnect(socket) {
  var self = this;
  if (!socket) {
    return logger.info("unknown socket");
  }

  logger.info("[DISCONNECT] socket.id: " + socket.id);

  // Remove user from the socket map as they have disconnected
  delete self.namespace.socketMap[socket.id];

  // If there is a user and id in the socket
  if (socket.user && socket.user.id) {
    var userId = socket.user.id;
    var username = socket.user.username;

    logger.info("[SOCKET SERVER] (disconnect) username: "+username);

    // Find the user object matching the user id that is disconnecting
    User.findOne({ _id: userId }).populate('membership._currentRooms').exec(function(err, user) {
      if (err) {
        return logger.info("ERROR finding user while parting room");
      }

      if (!user) {
        return logger.info("ERROR finding user while parting room");
      }

      logger.info("[DISCONNECT] Found user, disconnecting...");

      // Send an updated userlist to all users?
      User.setActive({ userId: user._id, active: false }, function(err) {
        self.updateUserList({ scope: 'all' });
      });

      // Loop through the rooms that this user is a member of and part the user from the room
      user.membership._currentRooms.forEach(function(room) {
        logger.debug("[socketServer.disconnect] room name is: " + room.name );
        Room.part({ userId: userId, chatId: room._id }, function(err, success) {
          if (err) {
            return logger.info("ERROR parting room: " + err);
          }

          if (!success) {
            return logger.info("User " + username + " failed to part room " + room.name);
          }

          logger.info("User " + username + " successfully parted room " + room.name);
          // TODO: Should update all appropritae rooms here
          logger.info("Updating room users!");
          self.updateActiveUsers(room._id.toString());
        })
      })
    })

    // Delete disconnecting users socket from socket array
    // TODO: May be better to find a way to use socketIO's namespace and the users username to check all active sockets
    if (self.namespace.userMap && self.namespace.userMap[socket.user._id.toString()]) {
      var indexOfSocketId = self.namespace.userMap[socket.user._id.toString()].indexOf(socket.id);
      if (indexOfSocketId > -1) {
        self.namespace.userMap[socket.user._id.toString()].splice(indexOfSocketId, 1);
      };
    };

    // If there are no more sockets in the array, delete the usermap entry for that user

    logger.debug('[socketServer.disconnect] namespace.userMap is: ', self.namespace.userMap);

    // Instead of doing all of this here, should move it to a method
    // - socketJoin
    // - socketLeave
    // or something like that...

    var userId = socket.user._id.toString();

    logger.debug('[socketServer.disconnect] userId: %s', userId);

    var userNamespace = Object.keys(self.namespace.userMap[userId]);

    if (userNamespace) {
      var userNamespaceSocketCount = userNamespace.length;
      if (userNamespaceSocketCount == 0) {
        delete self.namespace.userMap[socket.user._id.toString()];
      }
    }
  } else {
    logger.info("WARNING! Someone left the room and we don't know who it was...");
  }

};

module.exports = SocketServer;
