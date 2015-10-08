var User = require('./models/user');
var KeyId = require('./models/keyid');
var KeyPair = require('./models/keypair');
var Room = require('./models/room');
var Message = require('./models/message');
var Chat = require('./models/chat');
var config = require('./config/pipo');
var logger = require('./config/logger');
var AdminCertificate = require('./adminData/adminCertificate');

/**
 * Handles all socket traffic
 * @param namespace
 * @returns {Function}
 * @constructor
 */
function SocketServer(namespace) {
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

SocketServer.prototype.onSocket = function(socket) {
  var self = this;
  this.socket = socket;
  this.init();

  logger.debug("[CONNECTION] Socket connected to main");

  socket.on('authenticate', self.authenticate.bind(self));

  socket.on('updateClientKey', self.updateClientKey.bind(self));
  socket.on('disconnect', self.disconnect.bind(self));

  socket.on('join', self.joinRoom.bind(self));
  socket.on('part', self.partRoom.bind(self));

  socket.on('createRoom', self.createRoom.bind(self));
  socket.on('updateRoom', self.updateRoom.bind(self));

  socket.on('getChat', self.getChat.bind(self));

  socket.on('membership', self.membership.bind(self));

  socket.on('roomMessage', self.onMessage.bind(self));
  socket.on('privateMessage', self.onPrivateMessage.bind(self));

  socket.on('serverCommand', self.onServerCommand.bind(self));

  /**
   * ADMIN COMMANDS
   */
  // TODO Put this behind admin control when new client keys are approved
  // socket.on('maserKeySync', self.masterKeySync.bind(self));

};

SocketServer.prototype.init = function init() {
  var self = this;
  if (config.encryptionScheme == 'masterKey') {
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



/*
 * Get the default room or create it if it does not exist
 */
SocketServer.prototype.getDefaultRoom = function getDefaultRoom(callback) {
  var self = this;
  // get the default room name
  // This needs to be set in the config somewhere and passed to the client in a config block
  var systemusername = 'pipo';

  // System user is also getting created in server.js so one of these should be removed
  var systemUserData = {
    username: 'pipo',
    publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: OpenPGP.js v1.0.1\nComment: http://openpgpjs.org\n\nxsBNBFYHKFYBCAC2+gs6wGupdqKwAAHsNfTMqpBJkezYox9fRnHXBgkOzWty\nTzBdItmKRRBr7RCpeQ9nPS4WtEq6d3iUcP4MQmL35gou4mQIH6ClhVUAZykJ\niYXugvPgZXZl6qK8/k7EaLl2kAiYM0n9NSQhOGkZXAtH6MGw0gR4bhw7Dcp7\n3GSOMpgT/n4nBOWbiATKy9Kl3FrW5DrLkt8l0P3ocwVmGC418fkqJSkuNJR1\nFi87L2E2kEcn4EHL9Z4uVTI1mdBp9oLkriW2lMrR1aKMa/I5L5U6ayNALYnS\nNC7pieG3ZuxX7crFcaWa9krFinLSf6AxATQFLpJQLPLTF68yjYhNHzSDABEB\nAAHNDGZsaXBfZmlyZWZveMLAcgQQAQgAJgUCVgcoVwYLCQgHAwIJEKb6o/qa\nk5gaBBUIAgoDFgIBAhsDAh4BAABuWQf5AagTGdxjkpWreAEbqBcolqEIP8I5\nBIHsJcpDoI7VPKsrb4H0qLdE0YTIeD59yPBbs8NPPSh3veebMGU8fVr+5HoN\nQpg8JJImlSvTnZM83fpygsOrMzULgNIqsACDM933Bu34v43dodQ/1n7SN88c\nmpxJSzjoAJdMQ6ItFg6bsPp7Us9KfCeXBSNXHnuBrky9YqyIoAbBmi9mefzh\ngTRI2OnezCIGuNvu/fK2whgjK+qx831EVepqf8JM+IVfA22eZBq9wPFbYkof\n3q1yjuyGePPpn1uTZgQSlw/Ql/uuyQe66PxLuXm2eBrbzbPGdapllywThQ6j\nhfzSR5B6hyiPGM7ATQRWByhWAQgAwXw97JA9goeBP3K3FOb8TVLq/E/Vi13i\ndsrrc2A9D9g/ISCky9Ax211rCZg7IjzKWO7tNU14f25eOoD+pPKxC4iJkmVx\nAXQGIp744g7NmA0WhgzrnM/lId2OvypUihEMq5d3EFVO8g5DKhsRHHkReE6s\nmiagfKlhHT6epZu7lBhU3uUUtwfsdl/cbwpaZb27FeiKvp+5hL03de3g8v+v\nHO81XmS8q2wWOI2OR+419iYDlmXVD9NKxiDMRaJjCDbgJUsM82QgaTnG5WvZ\nAap5OzCL/AKfnN0KQgZsF9oxsl5izmGDuu6faAzO/hyDQ4EK3WwvFtzEtsK8\nGdS6l6ROjwARAQABwsBfBBgBCAATBQJWByhXCRCm+qP6mpOYGgIbDAAAAqIH\n/jLpXcPZhnwCYG3W/9XsAA3xMfzPAiYmv0NeWuLsovPvsOkQGgD6iPoNmdCm\nJrL8dYqmwUSAn+SELYYtLjGk/0XvgCi2l3I46mO4Z8of0cjyHRr6n2j7xRRb\nKRFOj3DTrhhqHSA/rXzrR+r8dT75/EUcIlQZ/3CiI4lF474c5+793DjyCXDC\nkZdurRkTA6UWT2fvnq4HqKlBMZEGMwO5keXMcaQL+mcZOCjgNJxwVqk6DtiY\ntUX8Tvo0QvbOaFhRMaKFqeMBlSrQZmzzBmTXYOBtupfxAFIqjYLqO2AsRXUr\nk8vffgzuYy6uRINhhTfz/iGKsQAVWAWzQ+ndSj86jRE=\n=83fL\n-----END PGP PUBLIC KEY BLOCK-----',
    email: 'pipo@pipo.chat',
  }

  // Move this to User.getSystemUser
  User.findOne({ username: systemusername }, function(err, systemUser) {
    logger.debug("[getDefaultRoom] systemUser is: ", systemUser.username);
    if (!systemUser) {
      logger.debug("[getDefaultRoom] NO system user found!")
      User.create(systemUserData, function(data) {
        self.getDefaultRoom(function(newDefaultRoom) {
          logger.debug("[getDefaultRoom] Created new DEFAULT room '" + newDefaultRoom.name + "'");
          return callback(newDefaultRoom);
        })
      })
    }
    logger.debug("[getDefaultRoom] System user found!");

    var defaultRoomName = 'pipo';

    var defaultRoomData = {
      username: 'pipo',
      name: 'pipo',
      topic: "Welcome to PiPo.",
      group: "default",
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
    })
  })
};



/**
 * New socket connected to server
 */
SocketServer.prototype.authenticate = function authenticate(data) {
  var self = this;

  User.authenticateOrCreate(data, function(err, authData) {
    if (!authData) {
      return self.socket.emit('errorMessage', {message: 'auth data provided was not sufficent to authenticate: ' + err});
    }

    var user = new User;
    user = authData.user;
    var newUser = authData.newUser;

    if (err) {
      logger.warn('Authentication error', err);
      return self.socket.emit('errorMessage', {message: 'Error authenticating you ' + err});
    }

    if (!user) {
      logger.warn("[INIT] Problem initializing connection, no error, but no user");
      return self.socket.emit('errorMessage', {message: "An unknown error has occurred"});
    }

    if (newUser) {
      logger.debug("User", data.username, " not in the master cached userlist so adding them");
      // This helps keep track of when users sign up so that we can emit the new user data to all clients
      self.updateUserList({scope: 'all'});
    }

    // Add the user's socketId to the socket map
    self.namespace.socketMap[self.socket.id] = {
      username: user.username,
      userId: user._id.toString(),
      publicKey: user.publicKey
    };

    // Add the user to the userMap if they do not exist
    if (!self.namespace.userMap[user._id.toString()])
      self.namespace.userMap[user._id.toString()] = [];

    // Push the current socket to the users socketMap arary
    self.namespace.userMap[user._id.toString()].push(self.socket.id);

    logger.debug("[socketServer.authenticate] userMap for " + user.username + " is: ",self.namespace.userMap[user._id.toString()]);

    self.socket.user = user;
    logger.debug("[INIT] Init'd user " + user.username);

    var favoriteRooms = [];
    User.populate(user, { path: 'membership._favoriteRooms' }, function(err, populatedUser) {
      if (populatedUser.membership._favoriteRooms.length > 0) {
        logger.debug("[socketServer.authenticate] Building favorite rooms for " + user.username);
        Object.keys(populatedUser.membership._favoriteRooms).forEach(function(key) {
          logger.info("Adding " + populatedUser.membership._favoriteRooms[key].name + " to auto join array");
          favoriteRooms.push(populatedUser.membership._favoriteRooms[key].name);
        })
      }

      // Get complete userlist to send to client on initial connection
      logger.debug("[INIT] getting userlist for user...");
      self.getDefaultRoom(function(defaultRoom) {
        logger.debug("[socketServer.authenticate] defaultRoom.name: " + defaultRoom.name);
        logger.debug("[socketServer.authenticate] sanatizeRoomForClient 1");
        self.sanatizeRoomForClient(defaultRoom, function(sanatizedRoom) {
          logger.debug("Sanatized default room #",sanatizedRoom.name,"running User.getAllUsers");
          User.getAllUsers({}, function(userlist) {
            logger.debug("[socketServer.authenticate] Got all users, running User.buildUserIdMap");
            User.buildUserNameMap({ userlist: userlist}, function(userNameMap) {
              logger.debug("[socketServer.authenticate] Built user ID Map, running user.buildProfile");
              User.buildProfile({ user: user }, function(userProfile) {
                // Should send userProfile separate from userlist
                logger.debug("[socketServer.authenticate] Done building users profile, sending 'authenticated' to " + user.username);
                self.socket.emit('authenticated', {message: 'ok', userProfile: userProfile, favoriteRooms: favoriteRooms, userlist: userlist, userNameMap: userNameMap, defaultRoomId: sanatizedRoom.id });
              });
            });
          });
        });

        logger.debug("[socketServer.authenticate] getting available room list for ", user.username);

        // Send the available rooms to the user
        User.availableRooms({ userId: user._id }, function(err, roomData) {
          if (err) {
            logger.error("[socketServer.authenticate] Authentication failed getting available rooms: ", err);
            return self.socket.emit('roomUpdate', { err: "Room update failed: " + err });
          }

          logger.debug("[socketServer.authenticate] availableRooms returned: ", Object.keys(roomData.rooms));

          logger.debug("[socketServer.authenticate] **********************************************");
          self.sanatizeRoomsForClient(roomData.rooms, function(sanatizedRooms) {
            logger.debug("[socketServer.authenticate] ******************************DONE***********************");
            logger.debug("[socketServer.authenticate] Finsihed sanatizing rooms for " + user.username + " and sending roomUpdate with ",sanatizedRooms);
            self.socket.emit('roomUpdate', { rooms: sanatizedRooms });
          });


          logger.debug("[INIT] Emitting user connect for",user.username);
          return self.namespace.emit('user connect', {
            username: user.username,
            publicKey: user.publicKey
          })
        })
      })
    })
  })
};


SocketServer.prototype.sanatizeRoomsForClient = function sanatizeRoomsForClient(rooms, callback) {
  var self = this;
  var sanatizedRooms = {};
  var roomCount = rooms.length;
  var count = 0;

  logger.debug("[socketServer.sanatizeRoomsForClient] Sanatizing " + rooms.length + " rooms");

  rooms.forEach(function(room) {
    logger.debug("[socketServer.sanatizeRoomsForClient] Sanatizing room '" + room.name + "'");

    self.sanatizeRoomForClient(room, function(sanatizedRoom) {
      logger.debug("[socketServer.sanatizeRoomsForClient] Done sanatizing room and pushing '" + sanatizedRoom.name + "' to array...");
      sanatizedRooms[sanatizedRoom.id] = sanatizedRoom;
      count += 1;

      logger.debug("[socketServer.sanatizeRoomsForClient] Total rooms: " + roomCount + " count: " + count);

      if (count == roomCount) {
        logger.debug("[socketServer.sanatizeRoomsForClient] Sanatized " + Object.keys(sanatizedRooms).length + " rooms and returning");
        return callback(sanatizedRooms);
      };
    });

  });
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
SocketServer.prototype.onMessage = function onMessage(data) {
  var self = this;
  var chatId = data.chatId;

  if (!self.socket.user) {
    logger.info("[MSG] Ignoring message from unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  logger.info("[MSG] Server got chat message from " + self.socket.user.username);

  //TODO: Log messages
  Room.findOne({ _id: chatId }, function(err, room) {
    // Confirm that user has permission to send message to this room
    if (err) {
      return logger.error("[socketServer.onMessage] Error when finding room to send message: ", err);
    };

    if (!room) {
      return logger.error("[socketServer.onMessage] No room found for message");
    };

    User.findOne({ username: self.socket.user.username }, function(err, user) {
      // Add message to room.messages
      if (room.keepHistory) {
        var message = new Message({
          _fromUser: user,
          date: new Date(),
          fromUser: user._id.toString(),
          encryptedMessage: data.pgpMessage
        });

        message.save(function(err) {
          logger.debug("[MSG] Pushing message to room message history");
          room._messages.push(message);
          room.save();
        })
      }

      self.namespace.emit('roomMessage', {
        chatId: room.id,
        fromUserId: user._id.toString(),
        message: data.pgpMessage
      });
    });
  })

  logger.info("[MSG] Server emitted chat message to users");
};


/**
 * Private message from client
 */
SocketServer.prototype.onPrivateMessage = function onPrivateMessage(data) {
  var self = this;
  var targetSockets = [];

  if (!self.socket.user) {
    logger.info("[MSG] Ignoring message from unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  var fromUser = self.socket.user._id.toString();
  var chatId = data.chatId;
  var toUserIds = data.toUserIds;

  // Need to get the target socket using user id!
  // BUG
  // SUPER HACKY FIX
  logger.debug("[socketServer.onPrivateMessage] data is: ", data);
  logger.debug("[socketServer.onPrivateMessage] Object.keys(self.namespace.userMap): ", Object.keys(self.namespace.userMap));
  logger.debug("[socketServer.onPrivateMessage] Handling private message from " + fromUser + " to " + chatId + ".");

  // Where should we store private message chats?
  var message = new Message({
    _fromUser: self.socket.user,
    _toUsers: toUserIds,
    _toChat: chatId,
    date: new Date(),
    encryptedMessage: data.pgpMessage
  });



  // Get the socketId's for each participant
  toUserIds.forEach(function(toUserId) {
    targetSockets = targetSockets.concat(self.namespace.userMap[toUserId]);
  });

  var emitData = {
    fromUserId: self.socket.user._id.toString(),
    chatId: chatId,
    toUserIds: toUserIds,
    date: message.date,
    message: data.pgpMessage,
    signature: data.signature
  };

  logger.debug("[socketServer.onPrivateMessage] emitData: ", emitData);

  var userMapKeys = Object.keys(self.namespace.userMap);

  logger.debug("[socketServer.onPrivateMessage] targetSockets: ", targetSockets);

  message.save(function(err) {
    if (err) {
      return logger.error("[ERROR] Error saving message: ", err);
    }

    logger.debug("[onPrivateMessage] Saved private message");

    // Add this message to the appropriate chat
    logger.debug("Finding chat with participants ", toUserIds);
    Chat.findOne({ type: 'chat', _participants: { $in: toUserIds }}, function(err, chat) {
      // If there is not a chat with these participants create one
      if (err) {
        return logger.error("[onPrivateMessage] Error finding Chat with participantIds: ", toUserIds);
      };

      if (!chat) {
        logger.debug("[socketServer.onPrivateMessage] No chat found with requested participants. Creating new chat.");
        var chat = new Chat({
          type: "chat",
          _participants: toUserIds,
        });
      }

      chat._messages.push(message);

      if (chat.id) {
        emitData.chatId = chat.id.toString();
        emitToSockets(targetSockets, emitData);
        chat.save();
      } else {
        chat.save(function(err, chat) {
          emitData.chatId = chat.id.toString();
          emitToSockets(targetSockets, emitData);
        });
      };
    });
  });

  var emitToSockets = function emitToSockets(targetSockets, emitData) {
    if (!targetSockets) {
      logger.info("[socketServer.onPrivateMessage] No participants of this chat are on line");
      return self.socket.emit('errorMessage', {message: "User is not online"});
    }

    targetSockets.forEach(function(targetSocket) {
      self.socket.broadcast.to(targetSocket).emit('privateMessage', emitData);
    });
  };
};


/*
 * Handle request from client to get chat history between two or more users
 */
SocketServer.prototype.getChat = function getChat(data) {
  var self = this;
  var data = data;
  // BOOKMARK

  // How do we find the chat using the participants (or some other thing)?
  var chatId = data.chatId;
  var participantIds = data.participantIds;

  logger.debug("[getChat] Got socket 'getChat' request");

  if (participantIds) {
    // Get the chat
    logger.debug("[getChat] Getting chat for participant ids: ", participantIds);

    Chat.findOne({ _participants: { $in: participantIds } }).populate('_participants _messages').exec(function(err, chat) {
      if (chat) {
        logger.debug("[getChat] Finished finding chat for participant id's and got chat with ID: '" + chat._id);
      }

      if (err) {
        self.socket.emit('chatUpdate', null);
        return logger.debug("Error finding chat by participants: " + err);
      };

      logger.debug("[getChat] Finishing (participantIds)...");
      finish(chat);
    });
  };

  if (chatId) {
    // Get the chat by id
    logger.debug("[getChat] Getting chat for client - ", chatId);

    Chat.findOne({ _id: chatId}).populate('_participants _messages _messages._fromUser _messages._toUsers _messages._toChat').exec(function(err, chat) {
      if (err) {
        self.socket.emit('chatUpdate', null);
        return logger.debug("Error finding chat by participants: " + err);
      };

      logger.debug("[getChat] Finishing (chatId)...");
      finish(chat);
    });
  };

  var finish = function finish(chat) {
    // Sanatize the chat
    var chat = chat;

    logger.debug("[getChat finish] Starting to finish...");
    if (chat) {
      logger.debug("[getChat finish] Have a chat, sanatizing now...");
      Chat.sanatize(chat, function(sanatizedChat) {
        logger.debug("[getChat finish] Finishing with a valid chat");
        return self.socket.emit('chatUpdate', { chat: sanatizedChat });
      })
    } else {
      logger.debug("[getChat finish] Finishing without a chat");

      // Create a new chat
      var newChat = new Chat({
        _participants: participantIds,
        _messages: [],
        type: 'chat',
      });

      // Save it
      newChat.save(function(err, savedChat) {
        logger.debug("[getChat] saved chat: ",savedChat._id);
        Chat.findOne({ _id: savedChat._id }).populate("_messages _participants").exec(function(err, populatedChat) {
          //logger.debug("[getChat] Created new chat with _participants:",populatedChat._participants);
          Chat.sanatize(populatedChat, function(sanatizedChat) {
            logger.debug("[getChat] Sending 'chatUpdate' to client");
            return self.socket.emit('chatUpdate', { chat: sanatizedChat });
          });
        });
        // Get the new chat object
        //Chat.findOne({ _id: chat._id}, function(err, new
        // Sanatize the chat object
        // Emit chatUpdate with the new chat object
      });

      // TODO: Need to send back some data about what chat we were searching for here
      //return self.socket.emit('chatUpdate', { chat: { participantIds: participantIds } });
    };
  };
};


/*
 * Send masterKeyPair to user
 */
SocketServer.prototype.sendMasterKeyPair = function sendMasterKeyPair(userId, room, masterKeyPair) {
  var self = this;
  var targetSockets = self.namespace.userMap[userId];
  if (targetSockets) {
    targetSockets.forEach(function(targetSocket) {
      self.socket.broadcast.to(targetSocket).emit('newMasterKey', {
        room: room,
        masterKeyPair: masterKeyPair
      });
    })
  };
};

SocketServer.prototype.onServerCommand = function onServerCommand(data) {
  var self = this;
  var socket = this.socket;
  var command = data.command;
  var username = self.socket.user.username;
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
SocketServer.prototype.joinRoom = function joinRoom(data) {
  var self = this;

  logger.debug("[JOIN ROOM] data is ",data);

  if (!self.socket.user) {
    logger.info("Ignoring join attempt by unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  var username = self.socket.user.username;
  var roomId = data.roomId;

  logger.info("[JOIN ROOM] User '" + username + "' joining room with id "+ roomId);

  // Ensure that user has the most recent master key for this room if in masterKey mode
  if (config.encryptionScheme == 'masterKey') {
    logger.debug("[JOIN ROOM] encryptionScheme: masterKey - checking masterKey");
    KeyId.getMasterKeyId(roomName, function(err, currentKeyId) {
      User.getMasterKeyPair(username, roomName, function(err, masterKeyPair) {
        if (masterKeyPair.id !== currentKeyId) {
          self.initMasterKeyPair(function(err) {
            // Should probably return and call self here
            User.getMasterKeyPair(username, roomName, function(err, newMasterKeyPair) {
              self.socket.emit('joinComplete', { encryptionScheme: 'masterKey', room: roomName, masterKeyPair: newMasterKeyPair });
              self.namespace.to(root).emit('newMasterKey', { room: roomName, keyId: currentKeyId });
              self.socket.join(roomId);
              Room.join({username: username, name: roomName}, function(err, data) {
                var auth = data.auth;
                if (err) {
                  return logger.info("Error joining room " + roomName + " with error: " + err);
                }
                if (!auth) {
                  return logger.warning("Failed to join room " + roomName);
                }
              })
              logger.info("[SOCKET SERVER] (joinRoom) Sending updateActiveUsers for room " + roomName);
              self.updateActiveUsers(roomId);
            });
          });
        } else {
          //logger.info("[JOIN ROOM] Clients master key is up to date");
          self.socket.join(roomName);

          self.socket.emit('joinComplete', { encryptionScheme: 'masterKey', room: sanatizedRoom, masterKeyPair: masterKeyPair });
          logger.info("[SOCKET SERVER] (joinRoom) Sending updateActiveUsers for room " + room.name + " with member list of ", membersArray);
          self.updateActiveUsers(roomId);
        };
      });
    });
  } else {
    // Using client key encryption scheme
    // Move this to its own function (sanatizeRoomForClient)
    // BOOKMARK
    Room.join({id: roomId, username: username}, function(err, data) {
      var auth = data.auth;
      var room = data.room;
      var roomUpdated = data.updated;

      if (!room) {
        if (err) {
          return self.socket.emit('joinComplete', { err: "Error joining room:" + err });
        }

        if (!auth) {
          return self.socket.emit('joinComplete', { err: "Sorry, you are not authorized to join this room" });
        }
      }

      room._members.forEach(function(member) {
        logger.debug("[socketServer.joinRoom] Room has member: ",member.username);
      });

      logger.debug("[socketServer.joinRoom] sanatizeRoomForClient 3");
      self.sanatizeRoomForClient(room, function(sanatizedRoom) {
        if (err) {
          return self.socket.emit('joinComplete', { err: "Error while joining room " + room.name + ": "+ err });
        }

        //logger.debug("[SOCKET SERVER] (joinRoom) Sanatized room is:",sanatizedRoom);
        self.socket.join(room._id.toString());
        logger.debug("[SOCKET SERVER] (joinRoom) Sending joinComplete in clientKey mode");
        var rooms = {};
        rooms[room.id] = sanatizedRoom;
        logger.debug("[socketServer.joinRoom] Sending roomUpdate before joinComplete");

        // TODO: Should only do one of these probably
        //self.socket.emit('roomUpdate', { rooms: rooms } );
        // Emit roomUpdate to the namespace so existing users receive the change if there is one
        // We should eventually only do this if there are changes in the room...

        // joinComplete and roomUpdate should be ensured that they are called in the same order
        self.socket.emit('joinComplete', { encryptionScheme: 'clientKey', room: sanatizedRoom });

        if (roomUpdated) {
          self.namespace.emit('roomUpdate', { rooms: rooms });
        }

        logger.debug("[SOCKET SERVER] (joinRoom) Sending updateActiveUsers for room " + room.name);

        // Emit room update to the namespace

        // Is this needed?
        self.updateActiveUsers(room._id);
      })
    })
  };
};

/*
 * Convert all mongoose objects to arrays or hashes
 * Users will be looked up on the client side using username or id
 */
SocketServer.prototype.sanatizeRoomForClient = function sanatizeRoomForClient(room, callback) {
  var self = this;

  if (room._owner) {
    var ownerusername = room._owner.username;
  } else {
    logger.debug("[SOCKET SERVER] (sanatizeRoomForClient) room owner does not exist");
    var ownerusername = null;
  }

  var membersLength = room._members.length;
  var adminsLength = room._admins.length;
  var activeUsersLength = room._activeUsers.length;
  var subscribersLength = room._subscribers.length;

  var membersArray = [];
  var adminsArray = [];
  var subscribersArray = [];
  var activeUsersArray = [];
  var messagesArray = [];

  logger.debug("[sockerServer.sanatizeRoomForClient] room._members.length: ", room._members.length);
  logger.debug("[socketServer.sanatizeRoomForClient] room._members[0]: " + room._members[0]);

  if (membersLength > 0) {
    room._members.forEach(function(member) {
      logger.debug("[socketServer.sanatizeRoomForClient] Pushing ", member.username," to membersArray");
      logger.debug("[socketServer.sanatizeRoomForClient] Looping member: ",member._id);
      membersArray.push(member._id.toString());
    });
  };

  if (subscribersLength > 0) {
    room._subscribers.forEach(function(subscriber) {
      //logger.debug("[socketServer.sanatizeRoomForClient] Pushing ", subscriber.id, " to subscribersArray");
      subscribersArray.push(subscriber._id.toString());
    });
  };

  if (activeUsersLength > 0) {
    room._activeUsers.forEach(function(activeUser) {
      //logger.debug("[socketServer.sanatizeRoomForClient] Pushing ", activeUser.username, " to activeUsers");
      activeUsersArray.push(activeUser._id.toString());
    });
  };

  if (adminsLength > 0) {
    room._admins.forEach(function(admin) {
      //logger.debug("[socketServer.sanatizeRoomForClient] Pushing ", admin.username," to adminsArray");
      adminsArray.push(admin._id.toString());
    });
  };

  if (room._messages.length > 0) {
    var processedMessages = 0;
    room._messages.forEach(function(message) {
      if (message._toUsers && message._toUsers.length > 0) {
        var toUsersArray = [];
        message._toUsers.forEach(function(toUser) {
          //logger.debug("[socketServer.sanatizeRoomForClient] Looping toUsers, _toUser._id is: " + toUser._id.toString());
          toUsersArray.push(toUser._id.toString());
        });
      };

      // Should be able to remove this?
      // bug when I do, i can't see finish() from this context... :-\
      message.populate('_fromUser', function() {

        //logger.debug("[socketServer.sanatizeRoomForClient] Looping messages, from user is : " + message._fromUser._id.toString());

        var sanatizedMessage = {
          date: message.date,
          fromUser: message._fromUser.id.toString(),
          toUsers: toUsersArray,
          encryptedMessage: message.encryptedMessage
        };

        messagesArray.push(sanatizedMessage);
        processedMessages++;

        if (processedMessages == room._messages.length) {
          finish();
        };
      });
    });
  };

  var finish = function finish() {
    logger.debug("[socketServer.sanatizeRoomForClient] Finishing...");

    var sanatizedRoom = {
      id: room._id.toString(),
      type: 'room',
      name: room.name,
      topic: room.topic,
      group: room.group,
      messageCache: '',
      messages: messagesArray.sort(dynamicSort("date")),
      encryptionScheme: room.encryptionScheme,
      keepHistory: room.keepHistory,
      membershipRequired: room.membershipRequired,
      members: membersArray,
      activeUsers: activeUsersArray,
      subscribers: subscribersArray,
      admins: adminsArray,
      owner: room._owner._id.toString()
    };

    return callback(sanatizedRoom);
  }

  if (room._messages.length == 0) {
    finish();
  };
}

function dynamicSort(property) {
    var sortOrder = 1;
    if(property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a,b) {
        var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}

/*
 * Create a room if user has permission
 */
SocketServer.prototype.createRoom = function createRoom(data) {
  var self = this;
  var roomData = {
    username: self.socket.user.username,
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  }

  logger.info("User " + self.socket.user.username + " is trying to create room " + data.name);
  logger.info("New room data: ",data);
  Room.create(roomData, function(err, newRoom) {
    if (err) {
      return logger.info("Error creating room: " + err);
    }
    self.socket.emit('createRoomComplete', { room: { id: newRoom.id }});
    logger.info("Room created : " + JSON.stringify(newRoom));
    var rooms = {};
    logger.debug("[socketServer.createRoom] sanatizeRoomForClient 4");
    self.sanatizeRoomForClient(newRoom, function(sanatizedRoom) {
      rooms[newRoom._id.toString()] = sanatizedRoom;
      if (roomData.membershipRequired) {
        // Emit membership update to user who created private room
        self.socket.emit('roomUpdate', { rooms: rooms });
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
SocketServer.prototype.updateRoom = function updateRoom(data) {
  var self = this;
  var roomData = {
    id: data.id,
    username: self.socket.user.username,
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  }

  logger.info("User " + self.socket.user.username + " is trying to update room " + data.name);
  Room.update(roomData, function(err, updatedRoom) {
    if (err) {
      return logger.info("Error creating room: " + err);
    }
    // TODO: This needs to emit room update with ID instead of name
    self.socket.emit('updateRoomComplete', { name: data.name });
    logger.debug("Room updated : " + JSON.stringify(updatedRoom));
    var rooms = {};
    rooms[updatedRoom.name] = updatedRoom;
    // TODO: Need to emit to members, not just the one who created the room
    if (roomData.membershipRequired) {
      // Emit membership update to user who created private room
      self.socket.emit('roomUpdate', { rooms: rooms });
    } else {
      // Emit membership update to all users
      self.namespace.emit('roomUpdate', { rooms: rooms });
    }
  })
}

SocketServer.prototype.membership = function membership(data) {
  var self = this;

  var type = data.type;
  var chatId = data.chatId;
  var memberName = data.memberName;
  var membership = data.membership;
  var username = self.socket.user.username;

  logger.debug("[MEMBERSHIP] Caught membership SOCKET event with type '" + type + "'");

  if (type == 'add') {
    var addData = ({
      username: username,
      memberName: memberName,
      membership: membership,
      chatId: chatId,
    })

    logger.debug("[MEMBERSHIP] membership data is:", addData);

    Room.addMember(addData, function(addResultData) {
      var success = addResultData.success;
      var message = addResultData.message;

      if (!success) {
        self.socket.emit('membershipUpdateComplete', addResultData);
        return logger.warn("Failed to add member:", message);
      }

      logger.debug("[socketServer.membership] Member added, finding room with '" + chatId + "' to return...");

      Room.findOne({ _id: chatId }).populate('_members _admins _owner _subscribers _activeUsers _messages _messages._fromUser _messages._toUsers').exec(function(err, room) {
        logger.debug("[socketServer.membership] sanatizeRoomForClient 5");
        self.sanatizeRoomForClient(room, function(sanatizedRoom) {
          var rooms = {};
          rooms[room._id.toString()] = sanatizedRoom;
          addResultData.rooms = rooms;

          logger.debug("[MEMBERSHIP] Found room, emitting roomUpdate to namespace for ",room.name);
          self.namespace.emit('roomUpdate', addResultData);

          logger.debug("[MEMBERSHIP] Member added successfully. Emitting membershipUpdateComplete");
          return self.socket.emit('membershipUpdateComplete', addResultData);
        })
      })
    })
  }
  if (type == 'modify') {
    modifyData = ({
      memberName: data.member,
      chatId: data.chatId,
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
        logger.debug("[socketServer.membership] sanatizeRoomForClient 6");
        self.sanatizeRoomForClient(room, function(sanatizedRoom) {
          logger.debug("[SOCKET SERVER] (membership) Room sanatized. Adding to rooms list and sending roomUpdate to namespace");
          rooms[room._id.toString()] = sanatizedRoom;

          var roomData = {
            rooms: rooms
          };

          logger.debug("[SOCKET SERVER] (membership) Emitting roomUpdate to namespace with roomData:",roomData)
          self.namespace.emit('roomUpdate', roomData);
          return self.socket.emit('membershipUpdateComplete', resultData);
        })
      })
    })
  }
}



/*
 * Client part room
 */
SocketServer.prototype.partRoom = function partRoom(data) {
  var self = this;
  var chatId = data.chatId;
  var userId = self.socket.user.id;
  var username = self.socket.user.username;

  // Check if user has already initiated parting this room
  //

  logger.info("[PART ROOM] Parting room for",self.socket.user.username);

  if (!self.socket.user) {
    logger.info("Ignoring part attempt by unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
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

    // Remove the user from the rooms namespace
    self.socket.leave(chatId);

    // Update the active users for the chat and emit the change to all users in that namespace
    self.updateActiveUsers(chatId);

    // Emit part complete to the parting user
    self.socket.emit('partComplete', { chatId: chatId });
  })
};



/*
 * Update the master userlist and send results to everyone
 */
SocketServer.prototype.updateUserList = function updateUserList(data) {
  var self = this;
  var scope = data.scope;
  User.getAllUsers({}, function(userlist) {
    logger.debug("[socketServer.updateUserList] Got data for userlist update with scope '"+scope);
    User.buildUserNameMap({userlist: userlist}, function(userNameMap) {
      logger.debug("[socketServer.updateUserList] Returning userIdMap");
      if (scope == 'all') {
        self.namespace.emit("userlistUpdate", {
          userlist: userlist,
          userNameMap: userNameMap
        })
      } else if (scope == 'self') {
        self.socket.emit("userlistUpdate", {
          userlist: userlist,
          userNameMap: userNameMap
        })
      }
    });
  })
};



/**
 * Update userlist for a room
 */
SocketServer.prototype.updateActiveUsers = function updateActiveUsers(chatId) {
  var self = this;
  self.getActiveUsers(chatId, function(err, activeUsers) {
    logger.debug("[socketServer.updateActiveUsers] Sending 'roomUsersUpdate' to namespace '" + chatId + "' after updating active members");
    logger.debug("[socketServer.updateActiveUsers] Active users is: ", activeUsers);
    // Is this emitting to the right ID?
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
  var activeUsers = [];

  if (typeof this.namespace.adapter.rooms[chatId] !== 'undefined') {
    activeUsers = this.namespace.adapter.rooms[chatId];

    logger.debug("[socketServer.getActiveUsers] activeUsers: ", activeUsers);

    activeUsers = Object.keys(this.namespace.adapter.rooms[chatId]).filter(function(sid) {
      logger.debug("[socketServer.getActiveUsers] Looping filter namespace.adapter.rooms[chatId] - sid: ", sid);
      return activeUsers[sid];
    });

    logger.debug("[socketServer.getActiveUsers] Got member SID's: ", activeUsers);

    //Map sockets to users
    activeUsers = activeUsers.map(function(sid) {
      return self.namespace.socketMap[sid].userId;
    });

    logger.debug("[socketServer.getActiveUsers] Mapped members to sockets: ", activeUsers);

  } else {
    logger.info("[GET USER LIST] User list is empty");
  };

  logger.debug("[socketServer.getActiveUsers] Active activeUsers for chatId: '" + chatId + "' is: ", activeUsers);

  callback(null, activeUsers);
};



SocketServer.prototype.disconnect = function disconnect() {
  var self = this;
  if (!self.socket) {
    return logger.info("unknown socket");
  }

  logger.info("[DISCONNECT] socket.id: " + self.socket.id);
  self.socket.leaveAll();

  if (self.socket.user && self.socket.user.id) {
    var userId = self.socket.user.id;
    var username = self.socket.user.username;

    logger.info("[SOCKET SERVER] (disconnect) username: "+username);

    User.findOne({ _id: userId }).populate('membership.rooms._room').exec(function(err, user) {
      if (err) {
        return logger.info("ERROR finding user while parting room");
      }

      if (!user) {
        return logger.info("ERROR finding user while parting room");
      }

      logger.info("[DISCONNECT] Found user, disconnecting...");

      user.membership.rooms.forEach(function(roomMembership) {
        if (roomMembership.active) {
          var currentRoom = roomMembership._room;

          Room.part({ userId: userId, chatId: roomMembership._room._id }, function(err, success) {
            if (err) {
              return logger.info("ERROR parting room: " + err);
            }

            if (!success) {
              return logger.info("User " + username + " failed to part room " + currentRoom.name);
            }

            //BOOKMARK
            logger.info("User " + username + " successfully parted room " + currentRoom.name);
            // TODO: Should update all appropritae rooms here
            logger.info("Updating room users!");
            self.updateActiveUsers(currentRoom._id.toString());
          })
        }
      })
    })

    // Delete disconnecting users socket from socket array
    // TODO: May be better to find a way to use socketIO's namespace and the users username to check all active sockets
    if (self.namespace.userMap && self.namespace.userMap[self.socket.user._id.toString()]) {
      var indexOfSocketId = self.namespace.userMap[self.socket.user._id.toString()].indexOf(self.socket.id);
      if (indexOfSocketId > -1) {
        self.namespace.userMap[self.socket.user._id.toString()].splice(indexOfSocketId, 1);
      };
    };

    // If there are no more sockets in the array, delete the usermap entry for that user
    if (Object.keys(self.namespace.userMap[self.socket.user._id.toString()]).length == 0) {
      delete self.namespace.userMap[self.socket.user._id.toString()];
    }
  } else {
    logger.info("WARNING! Someone left the room and we don't know who it was...");
  }
};



module.exports = SocketServer;
