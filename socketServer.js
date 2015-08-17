var User = require('./models/user');
var KeyId = require('./models/keyid');
var KeyPair = require('./models/keypair');
var Room = require('./models/room');
var Message = require('./models/message');
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
 * Create the default room if it does not exist
 */
SocketServer.prototype.getDefaultRoom = function getDefaultRoom(callback) {
  var self = this;
  // get the default room name
  // This needs to be set in the config somewhere and passed to the client in a config block
  var defaultRoomName = 'pipo';

  var defaultRoomData = {
    userName: 'pipo',
    name: 'pipo',
    topic: "Welcome to PiPo.",
    group: "default",
    membershipRequired: false,
    keepHistory: true,
    encryptionScheme: 'clientkey',
  };

  // create the default room object
  Room.getByName(defaultRoomName, function(defaultRoom) {
    if (!defaultRoom) {
      Room.create(defaultRoomData, function(defaultRoom) {

        if (defaultRoom == null) {
          logger.error("[getDefaultRoom] ERROR - Default room is NULL");
          return callback(null);
        }

        logger.debug("Found default room: #",defaultRoom.name);

        return callback(defaultRoom);
      });
    }

    return callback(defaultRoom);
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
      logger.debug("User", data.userName, " not in the master cached userlist so adding them");
      // This helps keep track of when users sign up so that we can emit the new user data to all clients
      self.updateUserList({scope: 'all'});
    }

    self.namespace.socketMap[self.socket.id] = {
      userName: user.userName,
      publicKey: user.publicKey
    };

    if (!self.namespace.userMap[user.userName])
      self.namespace.userMap[user.userName] = [];

    self.namespace.userMap[user.userName].push(self.socket.id);

    self.socket.user = user;
    logger.debug("[INIT] Init'd user " + user.userName);
    // TODO: Replace this with current rooms
    var autoJoin = [];
    User.populate(user, { path: 'membership._autoJoin' }, function(err, populatedUser) {
      if (populatedUser.membership._autoJoin.length > 0) {
        Object.keys(populatedUser.membership._autoJoin).forEach(function(key) {
          logger.info("Adding " + populatedUser.membership._autoJoin[key].name + " to auto join array");
          autoJoin.push(populatedUser.membership._autoJoin[key].name);
        })
      }

      // Get complete userlist to send to client on initial connection
      logger.debug("[INIT] getting userlist for user...");
      self.getDefaultRoom(function(defaultRoom) {
        if (defaultRoom == null) { return logger.info("[AUTHENTICATE] ERROR - default room is null") }
        self.sanatizeRoomForClient(defaultRoom, function(sanatizedRoom) {
          //logger.info("Sanatized default room #",sanatizedRoom.name," with data: ",sanatizedRoom);
          User.getAllUsers({}, function(userlist) {
            logger.debug("Sending userlist to user...", userlist);
            self.socket.emit('authenticated', {message: 'ok', autoJoin: autoJoin, userlist: userlist, defaultRoomName: sanatizedRoom.name });
          })
        })

        logger.debug("[INIT] getting available room list");

        User.availableRooms({ userName: user.userName }, function(err, roomData) {
          if (err) {
            return self.socket.emit('roomUpdate', { err: "Room update failed: " + err });
          }

          var rooms = {};
          roomData.rooms.forEach(function(room) {
            logger.debug("[INIT] done getting available room list");


            self.sanatizeRoomForClient(room, function(sanatizedRoom) {
              //Object.keys(roomData.rooms).forEach(function(key) {
              logger.debug("Adding room " + sanatizedRoom.name + " to array");
              rooms[sanatizedRoom.name] = sanatizedRoom;
            })

            logger.debug("Sending membership update to user " + user.userName);
            logger.debug("[AUTHENTICATE] Membership update rooms is:",rooms);
            self.socket.emit('roomUpdate', { rooms: rooms });

            logger.info("[INIT] Emitting user connect for",user.userName);
            return self.namespace.emit('user connect', {
              userName: user.userName,
              publicKey: user.publicKey
            })
          })
        })
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
SocketServer.prototype.getMasterKeyPairForUser = function getMasterKeyPairForUser(userName, channel, callback) {
  User.getMasterKeyPair(userName, channel, function(masterKeyPair) {
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

  if (!self.socket.user) {
    logger.info("[MSG] Ignoring message from unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  logger.info("[MSG] Server got chat message from " + self.socket.user.userName);

  //TODO: Log messages
  Room.findOne({ name: data.room }, function(err, room) {
    // Confirm that user has permission to send message to this room

    User.findOne({ userName: self.socket.user.userName }, function(err, user) {
      // Add message to room.messages
      var message = new Message({
        _fromUser: user,
        fromUser: user.userName,
        encryptedMessage: data.pgpMessage
      });

      message.save(function(err) {
        logger.debug("[MSG] Pushing message to room message history");
        room._messages.push(message);
        room.save();
      })

      self.namespace.emit('roomMessage', {
        user: self.socket.user.userName,
        room: data.room,
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
  if (!self.socket.user) {
    logger.info("[MSG] Ignoring message from unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }
  logger.info('data', data)

  var fromUser = self.socket.user.userName;
  var targetUsername = data.toUser;
  var targetSockets = self.namespace.userMap[targetUsername];

  if (!targetSockets) {
    logger.info("[MSG] Ignoring private message to offline user");
    return self.socket.emit('errorMessage', {message: "User is not online"});
  }

  targetSockets.forEach(function(targetSocket) {
    self.socket.broadcast.to(targetSocket).emit('privateMessage', {
      from: self.socket.user.userName,
      to: targetUsername,
      message: data.pgpMessage,
      signature: data.signature
    });
  })
};

/*
 * Send masterKeyPair to user
 */
SocketServer.prototype.sendMasterKeyPair = function sendMasterKeyPair(userName, room, masterKeyPair) {
  var self = this;
  var targetSockets = self.namespace.userMap[userName];
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
  var userName = self.socket.user.userName;
  //TODO refactor this
  var currentChat = data.currentChat;
  logger.info("Received command '"+command+"' from user '"+socket.name+"'");
  var splitCommand = command.split(" ");
  if (splitCommand[0] == "who") {
    logger.info("[SERVER] Responding to 'who' request from '"+socket.name+"'");
    var channelMembershipArray = [];
    logger.info("[SERVER COMMAND] Checking channel #"+currentChat);
    for (var key in channelMembership[currentChat]) {
      logger.info("[SERVER COMMAND] Iterating user "+channelMembership[CurrentChat][key].username);
      channelMembershipArray.push(channelMembership[currentChat][key].username);
    }
    logger.info("[SERVER COMMAND] Broadcasting user list for #"+currentChat+" to socket.id "+socket.id+" with data ( "+channelMembershipArray.toString()+" )");
    this.namespace.to(socket.id).emit('chat status', { statusType: "WHO", statusMessage: "Current users of #"+currentChat+" are ( "+channelMembershipArray.toString()+" )"});
    //socket.broadcast.to(socket.id).emit('chat status', "Current users of #"+currentChat+" are ( "+channelMembershipArray.toString()+" )");
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

  var userName = self.socket.user.userName;
  var roomName = data.room;

  logger.info("[JOIN ROOM] User '" + userName + "' joining room #"+roomName);

  // Ensure that user has the most recent master key for this room if in masterKey mode
  if (config.encryptionScheme == 'masterKey') {
    logger.debug("[JOIN ROOM] encryptionScheme: masterKey - checking masterKey");
    KeyId.getMasterKeyId(roomName, function(err, currentKeyId) {
      User.getMasterKeyPair(userName, roomName, function(err, masterKeyPair) {
        if (masterKeyPair.id !== currentKeyId) {
          self.initMasterKeyPair(function(err) {
            // Should probably return and call self here
            User.getMasterKeyPair(userName, roomName, function(err, newMasterKeyPair) {
              self.socket.emit('joinComplete', { encryptionScheme: 'masterKey', room: roomName, masterKeyPair: newMasterKeyPair });
              self.namespace.to(root).emit('newMasterKey', { room: roomName, keyId: currentKeyId });
              self.socket.join(roomName);
              Room.join({userName: userName, name: roomName}, function(err, data) {
                var auth = data.auth;
                if (err) {
                  return logger.info("Error joining room " + roomName + " with error: " + err);
                }
                if (!auth) {
                  return logger.warning("Failed to join room " + roomName);
                }
              })
              logger.info("[SOCKET SERVER] (joinRoom) Sending updateRoomUsers for room " + roomName);
              self.updateRoomUsers(roomName);
            });
          });
        } else {
          //logger.info("[JOIN ROOM] Clients master key is up to date");
          self.socket.join(roomName);

          self.socket.emit('joinComplete', { encryptionScheme: 'masterKey', room: sanatizedRoom, masterKeyPair: masterKeyPair });
          logger.info("[SOCKET SERVER] (joinRoom) Sending updateRoomUsers for room " + room.name + " with member list of ", membersArray);
          self.updateRoomUsers(room.name);
        };
      });
    });
  } else {
    // Using client key encryption scheme
    // Move this to its own function (sanatizeRoomForClient)
    Room.join({name: roomName, userName: userName}, function(err, data) {
      var auth = data.auth;
      var room = data.room;

      logger.debug("[SOCKET SERVER] (joinRoom) Room messages for #"+room.name+" is: ",room._messages);

      //logger.debug("[SOCKET SERVER] (joinRoom) Joined room and received data:",data);
      self.sanatizeRoomForClient(room, function(sanatizedRoom) {
        //logger.info("Member trying to join room and room is: " + JSON.stringify(room));
        logger.debug("[SOCKET SERVER] (joinRoom) Sanatized room messages for #"+room.name+" is: "+room.messages);
        if (err) {
          return self.socket.emit('joinComplete', { err: "Error while joining room " + room.name + ": "+ err });
        }
        if (!auth) {
          return self.socket.emit('joinComplete', { err: "Sorry, you are not a member of room " + room.name });
        }
        //logger.debug("[SOCKET SERVER] (joinRoom) Sanatized room is:",sanatizedRoom);
        self.socket.join(room.name);
        logger.debug("[SOCKET SERVER] (joinRoom) Sending joinRoom in clientKey mode");
        self.socket.emit('joinComplete', { encryptionScheme: 'clientKey', room: sanatizedRoom });
        logger.debug("[SOCKET SERVER] (joinRoom) Sending updateRoomUsers for room " + room.name);
        self.updateRoomUsers(room.name);
      })
    })
  };
};

/*
 * Convert all mongoose objects to arrays or hashes
 * Users will be looked up on the client side using username or id
 */
SocketServer.prototype.sanatizeRoomForClient = function sanatizeRoomForClient(room, callback) {
  if (room._owner) {
    logger.debug("[SOCKET SERVER] (sanatizeRoomForClient) room owner userName is",room._owner.userName);
    var ownerUserName = room._owner.userName;
  } else {
    logger.debug("[SOCKET SERVER] (sanatizeRoomForClient) room owner does not exist");
    var ownerUserName = null;
  }

  var membersLength = room._members.length;
  var adminsLength = room._admins.length;

  var membersArray = [];
  var adminsArray = [];

  if (membersLength > 0) {
    logger.debug("[SOCKET SERVER] (sanatizeRoomForClient) Room #" + room.name + " has",room._members.length,"members");

    room._members.forEach(function(member) {
      logger.debug("[SOCKET SERVER] (sanatizeRoomForClient) Adding member " + member.userName + " to member array");
      membersArray.push(member.userName);
    })
  }

  if (adminsLength > 0) {
    room._admins.forEach(function(admin) {
      adminsArray.push(admin.userName);
    })
  }

  //logger.info("[sanatizeRoomForClient] Members array: ", membersArray);
  //logger.info("[sanatizeRoomForClient] Admins array: ", adminsArray);
  //var membersArray = room.members.map(function(member) {
  //  return member.userName;
  //});
  //var adminsArray = room.admins.map(function(member) {
  //  return member.userName;
  //});
  // TODO: Sanatize messages? Or make sure populated?

  var sanatizedRoom = {
    id: room._id.toString(),
    type: 'room',
    name: room.name,
    topic: room.topic,
    group: room.group,
    messages: room._messages,
    encryptionScheme: room.encryptionScheme,
    keepHistory: room.keepHistory,
    membershipRequired: room.membershipRequired,
    members: membersArray,
    admins: adminsArray,
    owner: ownerUserName
  };

  return callback(sanatizedRoom);
}

/*
 * Create a room if user has permission
 */
SocketServer.prototype.createRoom = function createRoom(data) {
  var self = this;
  var roomData = {
    userName: self.socket.user.userName,
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  }

  logger.info("User " + self.socket.user.userName + " is trying to create room " + data.name);
  Room.create(roomData, function(err, newRoom) {
    if (err) {
      return logger.info("Error creating room: " + err);
    }
    self.socket.emit('createRoomComplete', { name: data.name });
    logger.info("Room created : " + JSON.stringify(newRoom));
    var rooms = {};
    self.sanatizeRoomForClient(newRoom, function(sanatizedRoom) {
      rooms[newRoom.name] = sanatizedRoom;
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
    userName: self.socket.user.userName,
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  }

  logger.info("User " + self.socket.user.userName + " is trying to update room " + data.name);
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
  var roomName = data.roomName;
  var member = data.member;
  var membership = data.membership;
  var userName = self.socket.user.userName;

  logger.debug("[MEMBERSHIP] Caught membership SOCKET event with type '" + type + "'");
  logger.debug("[MEMBERSHIP] membership data is:", addData);

  if (type == 'add') {
    var addData = ({
      userName: userName,
      member: member,
      membership: membership,
      roomName: roomName,
      userName: userName
    })

    Room.addMember(addData, function(addResultData) {
      var success = addResultData.success;
      var message = addResultData.message;

      if (!success) {
        self.socket.emit('membershipUpdateComplete', addResultData);
        return logger.warn("Failed to add member:", message);
      }

      logger.debug("[MEMBERSHIP] Member added successfully. Emitting membershipUpdateComplete");

      self.socket.emit('membershipUpdateComplete', addResultData);
      Room.findOne({ name: roomName }).populate('_members _admins _owner').exec(function(err, room) {
        self.sanatizeRoomForClient(room, function(sanatizedRoom) {
          var rooms = {};
          rooms[room.name] = sanatizedRoom;
          addResultData.rooms = rooms;

          logger.debug("[MEMBERSHIP] Found room, emitting roomUpdate to namespace for ",room.name);
          return self.namespace.emit('roomUpdate', addResultData);
        })
      })
    })
  }
  if (type == 'modify') {
    modifyData = ({
      memberName: data.member,
      roomName: data.roomName,
      membership: data.membership,
      username: userName
    });

    logger.debug("[MEMBERSHIP] Attempting to modify member");
    Room.modifyMember(modifyData, function(resultData) {
      var success = resultData.success;
      var message = resultData.message;
      var roomName = resultData.roomName;
      logger.debug("[MEMBERSHIP] Member modification complete and success is ",success);

      self.socket.emit('membershipUpdateComplete', resultData);

      if (!success) {
        return logger.warn("Failed to modify member:", message);
      }

      logger.debug("[MEMBERSHIP] Finding room to send back to the user");
      Room.findOne({ name: roomName }).populate('_members _admins _owner').exec(function(err, room) {
        //logger.debug("[SOCKET SERVER] (membership) Room members: ",room._members);
        //logger.debug("[SOCKET SERVER] (membership) Room admins: ",room._admins);
        logger.debug("[SOCKET SERVER] (membership) Room owner: ",room._owner.userName);
        //var adminKeys = Object.keys(room._admins);
        var adminsArray = [];
        room._admins.forEach(function(admin) {
          adminsArray.push(admin.userName);
        })
        logger.debug("[SOCKET SERVER] (membership) Room admins: ",adminsArray);
        var rooms = {};
        self.sanatizeRoomForClient(room, function(sanatizedRoom) {
          logger.debug("[SOCKET SERVER] (membership) Room sanatized. Adding to rooms list and sending roomUpdate to namespace");
          rooms[room.name] = sanatizedRoom;

          var roomData = {
            rooms: rooms
          };

          logger.debug("[SOCKET SERVER] (membership) Emitting roomUpdate to namespace with roomData:",roomData)
          return self.namespace.emit('roomUpdate', roomData);
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

  // Check if user has already initiated parting this room
  //

  logger.info("[PART ROOM] Parting room for",self.socket.user.userName);

  if (!self.socket.user) {
    logger.info("Ignoring part attempt by unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  var userName = self.socket.user.userName;
  var name = data.name
  logger.info("[PART ROOM] User " + userName + " parting room " + name);

  Room.part({ userName: userName, name: name }, function(err, success) {
    if (err) {
      return logger.info("Error parting room " + name + " with error: " + err);
    }
    if (!success) {
      return logger.info("Failed to part room " + name);
    }
    logger.info("User " + userName + " parted room " + name);
    self.updateRoomUsers(name);

    // Update user status
    //

    self.socket.emit('partComplete', { room: name });
  })
};

SocketServer.prototype.updateUserList = function updateUserList(data) {
  var self = this;
  var scope = data.scope;
  User.getAllUsers({}, function(userlist) {
    logger.debug("[UPDATE USER LIST] Got data for userlist update with scope '"+scope+"' :",userlist);
    if (scope == 'all') {
      self.namespace.emit("userlistUpdate", {
        userlist: userlist
      })
    } else if (scope == 'self') {
      self.socket.emit("userlistUpdate", {
        userlist: userlist
      })
    }
  })
};

/**
 * Update userlist for a room
 */
SocketServer.prototype.updateRoomUsers = function updateRoomUsers(room) {
  var self = this;
  self.getRoomUsers(room, function(err, members) {
    self.namespace.to(room).emit("roomUsersUpdate", {
      room: room,
      userlist: members
    });
  });
};

SocketServer.prototype.getRoomUsers = function(room, callback) {
  var self = this;
  var members = [];
  if (typeof this.namespace.adapter.rooms[room] !== 'undefined') {
    var members = this.namespace.adapter.rooms[room];
    members = Object.keys(this.namespace.adapter.rooms[room]).filter(function(sid) {
      return members[sid];
    });
    //Map sockets to users
    members = members.map(function(sid) {
      return self.namespace.socketMap[sid];
    });
    //logger.info("(getRoomUsers) - (",room,")(",members,")")
  } else {
    logger.info("[GET USER LIST] User list is empty");
  };

  callback(null, members);
};

/**
 * Socket leave channel
 */
SocketServer.prototype.leaveChannel = function leaveChannel(data) {
  //TODO: flush out
  this.socket.leave(data.channel);
};

SocketServer.prototype.disconnect = function disconnect() {
  var self = this;
  if (!self.socket) {
    return logger.info("unknown socket");
  }

  logger.info("[DISCONNECT] socket.id: " + self.socket.id);
  self.socket.leaveAll();

  if (self.socket.user && self.socket.user.userName) {
    var userName = self.socket.user.userName;
    logger.info("[SOCKET SERVER] (disconnect) userName: "+userName);
    User.findOne({ userName: userName }).populate('membership._currentRooms').exec(function(err, user) {
      if (err) {
        return logger.info("ERROR finding user while parting room");
      }
      if (!user) {
        return logger.info("ERROR finding user while parting room");
      }
      logger.info("[DISCONNECT] Found user, disconnecting...");
      user.membership._currentRooms.forEach(function(currentRoom) {
        logger.info("User " + userName + " parting room " + currentRoom.name);
        Room.part({ userName: userName, name: currentRoom.name }, function(err, success) {
          if (err) {
            return logger.info("ERROR parting room: " + err);
          }
          if (!success) {
            return logger.info("User " + userName + " failed to part room " + currentRoom.name);
          }
          //BOOKMARK
          logger.info("User " + userName + " successfully parted room " + currentRoom.name);
          // TODO: Should update all appropritae channels here
          logger.info("Updating room users!");
          self.updateRoomUsers(currentRoom.name);
        })
      })
    })

    // Delete disconnecting users socket from socket array
    delete self.namespace.userMap[self.socket.user.userName][self.socket.id];

    // If there are no more sockets in the array, delete the usermap entry for that user
    if (Object.keys(self.namespace.userMap[self.socket.user.userName]).length == 0) {
      delete self.namespace.userMap[self.socket.user.userName];
    }
  } else {
    logger.info("WARNING! Someone left the channel and we don't know who it was...");
  }
};


//TODO: Are these still needed?
SocketServer.prototype.sendUserListUpdate = function sendUserListUpdate(room, callback) {
  if (room != null) {
    getChannelUsersArray(room, function(err, channelUsersArray) {
      if (err) {
        callback(err);
      } else {
        var userListData = {
          userList: channelUsersArray,
          room: room
        }
        ioMain.emit("userlistUpdate", userListData);
        callback(null);
      };
    });
  } else {
    // update all room
  };
};

SocketServer.prototype.removeUserFromAllChannels = function removeUserFromAllChannels(socketId, callback) {
  var userName = "";
  // TODO: fix me!
  findUserBySocketId(socketId, function(err, user) {
    if (err) {
      callback(err, null);
    } else {
      Channel.update({}, { $pull: { _userList: user.id } }, function(err, channel, count) {
        if (err) {
          callback(err, null);
        } else {
          logger.info("Removed "+user.userName+" from "+count+" channels");
          callback(null, userName);
        };
      });
    };
  });
};

//TODO: Decide to use this method or use the socket namespaces
SocketServer.prototype.findClientsSocket = function findClientsSocket(roomId, namespace) {
    var res = [];
    var ns = io.of(namespace ||"/");    // the default namespace is "/"
    if (ns) {
        for (var id in ns.connected) {
            if(roomId) {
                var index = ns.connected[id].rooms.indexOf(roomId) ;
                if(index !== -1) {
                    res.push(ns.connected[id]);
                }
            } else {
                res.push(ns.connected[id]);
            }
        }
    }
    return res;
}

SocketServer.prototype.findClientsSocketByRoomId = function findClientsSocketByRoomId(roomId) {
  var res = [];
  var room = io.sockets.adapter.rooms[roomId];
  if (room) {
    for (var id in room) {
      res.push(io.sockets.adapter.nsp.connected[id]);
    };
  };
  return res;
};

module.exports = SocketServer;
