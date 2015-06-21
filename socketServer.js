var User = require('./models/user');
var KeyId = require('./models/keyid');
var KeyPair = require('./models/keypair');
var Room = require('./models/room');
var config = require('./config/pipo');

/**
 * Handles all socket traffic
 * @param namespace
 * @returns {Function}
 * @constructor
 */
function SocketServer(namespace) {
  this.namespace = namespace;
  if (!this.namespace.socketMap) {
    this.namespace.socketMap = {};
  }
  if (!this.namespace.userMap) {
    this.namespace.userMap = {};
  }
}

SocketServer.prototype.onSocket = function(socket) {
  var self = this;
  this.socket = socket;
  this.init();

  console.log("[CONNECTION] Socket connected to main");

  socket.on('authenticate', self.authenticate.bind(self));

  socket.on('updateClientKey', self.updateClientKey.bind(self));
  socket.on('disconnect', self.disconnect.bind(self));

  socket.on('join', self.joinRoom.bind(self));
  socket.on('part', self.partRoom.bind(self));

  socket.on('createRoom', self.createRoom.bind(self));

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
        return console.log("[INIT] Error updating master key pair: "+err);
      }
      console.log("[INIT] Finsihed updating master key pair");
    });
  } else {
    // Do client key things
  }
};

/**
 * New socket connected to server
 */
SocketServer.prototype.authenticate = function authenticate(data) {
  var self = this;
  console.log("[AUTHENTICATE] Authenticating user '"+data.userName+"'");
  User.authenticateOrCreate(data, function(err, user) {
    if (err) {
      console.log('Authentication error', err);
      return self.socket.emit('errorMessage', {message: 'Error authenticating you ' + err});
    }
    if (user) {
      self.namespace.socketMap[self.socket.id] = {
        userName: user.userName,
        publicKey: user.publicKey
      };

      self.namespace.userMap[user.userName] = self.socket.id;

      self.socket.user = user;
      console.log("[INIT] Init'd user " + user.userName);
      var autoJoin = []
      console.log("user.membership._autoJoin before populate is: " + user.membership._autoJoin);
      User.populate(user, { path: 'membership._autoJoin' }, function(err, populatedUser) {
        console.log("populatedUser.membership._autoJoin is: " + populatedUser.membership._autoJoin);
        if (populatedUser.membership._autoJoin.length > 0) {
          Object.keys(populatedUser.membership._autoJoin).forEach(function(key) {
            console.log("Adding " + populatedUser.membership._autoJoin[key].name + " to auto join array");
            autoJoin.push(populatedUser.membership._autoJoin[key].name);
          })
        }
        self.socket.emit('authenticated', {message: 'ok', autoJoin: autoJoin });

        console.log("[INIT] Emitting user connect");
        return self.namespace.emit('user connect', {
          userName: user.userName,
          publicKey: user.publicKey
        })
      })
    }
    else {
      console.log("[INIT] Problem initializing connection, no error, but no user");
      return self.socket.emit('errorMessage', {message: "An unknown error has occurred"});
    }
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
    console.log("Checked master key pair for all users. Response is '"+response+"'");
    if (err) { console.log("[START] Error checking master key for all users: "+err); };
    if (response == 'update') {
      console.log("Users keypair needs updating so generating new master key pair");
      KeyPair.regenerateMasterKeyPair(function(err, masterKeyPair, id) {
        console.log("[START] New master keyPair generated with id '"+id+"'");
        KeyPair.updateMasterKeyPairForAllUsers(masterKeyPair, id, function(err) {
          if (err) {
            console.log("[START] Error encrypting master key for all users: "+err);
            return callback(err);
          };
          console.log("[SOCKET SERVER] (initMasterKeyPair) Encrypted master key for all users!");
          self.namespace.emit('newMasterKey', { room: "general" } );
          callback(null);
        });
      });
    } else if (response == 'ok') {
      console.log("All users master key matches current version");
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
    console.log("[MSG] Ignoring message from unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  console.log("[MSG] Server got chat message from " + self.socket.user.userName);

  //TODO: Log messages
  //TODO: Room specific messages
  self.namespace.emit('roomMessage', {
    user: self.socket.user.userName,
    room: data.room,
    message: data.pgpMessage
  });

  console.log("[MSG] Server emitted chat message to users");
};


/**
 * Private message from client
 */
SocketServer.prototype.onPrivateMessage = function onPrivateMessage(data) {
  var self = this;
  if (!self.socket.user) {
    console.log("[MSG] Ignoring message from unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }
  console.log('data', data)

  var fromUser = self.socket.user.userName;
  var targetUsername = data.toUser;
  var targetSocket = self.namespace.userMap[targetUsername];

  if (!targetSocket) {
    console.log("[MSG] Ignoring private message to offline user");
    return self.socket.emit('errorMessage', {message: "User is not online"});
  }

  self.socket.broadcast.to(targetSocket).emit('privateMessage', {
    from: self.socket.user.userName,
    to: targetUsername,
    message: data.pgpMessage,
    signature: data.signature
  });
};

/*
 * Send masterKeyPair to user
 */
SocketServer.prototype.sendMasterKeyPair = function sendMasterKeyPair(userName, room, masterKeyPair) {
  var self = this;
  var targetSocket = self.namespace.userMap[userName];
  if (targetSocket) {
    self.socket.broadcast.to(targetSocket).emit('newMasterKey', {
      room: room,
      masterKeyPair: masterKeyPair
    });
  };
};

SocketServer.prototype.onServerCommand = function onServerCommand(data) {
  var self = this;
  var socket = this.socket;
  var command = data.command;
  var userName = self.socket.user.userName;
  //TODO refactor this
  var currentChat = data.currentChat;
  console.log("Received command '"+command+"' from user '"+socket.name+"'");
  var splitCommand = command.split(" ");
  if (splitCommand[0] == "who") {
    console.log("[SERVER] Responding to 'who' request from '"+socket.name+"'");
    var channelMembershipArray = [];
    console.log("[SERVER COMMAND] Checking channel #"+currentChat);
    for (var key in channelMembership[currentChat]) {
      console.log("[SERVER COMMAND] Iterating user "+channelMembership[CurrentChat][key].username);
      channelMembershipArray.push(channelMembership[currentChat][key].username);
    }
    console.log("[SERVER COMMAND] Broadcasting user list for #"+currentChat+" to socket.id "+socket.id+" with data ( "+channelMembershipArray.toString()+" )");
    this.namespace.to(socket.id).emit('chat status', { statusType: "WHO", statusMessage: "Current users of #"+currentChat+" are ( "+channelMembershipArray.toString()+" )"});
    //socket.broadcast.to(socket.id).emit('chat status', "Current users of #"+currentChat+" are ( "+channelMembershipArray.toString()+" )");
  } else if (splitCommand[0] == "room") {
    console.log("Got room command");
    if (splitCommand[2] == "member") {
      console.log("Got member sub command");
      if (splitCommand[3] == "add") {
        console.log("Got add sub sub command");
        Room.addMember({ requestingUser: userName, memberToAdd: splitCommand[4], roomName: splitCommand[1] }, function(err, success) {
          if (err) {
            return console.log("Error adding member to room: " + err);
          }
          if (!success) {
            return console.log("Was not successful when adding membe to room");
          }
          console.log("Added " + splitCommand[4] + " to room " + splitCommand[1]);
          return socket.emit('serverCommandComplete', { response: "[SERVER] Added " + splitCommand[4] + " to room " + splitCommand[1] });
        })
      }
    }
  } else if (splitCommand[0] == "help") {
    // Output help here
  } else {
    console.log("[SERVER COMMAND] Unable to parse server command...");
  }
};


/**
 * Client join room
 */
SocketServer.prototype.joinRoom = function joinRoom(data) {
  var self = this;

  if (!self.socket.user) {
    console.log("Ignoring join attempt by unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  var userName = self.socket.user.userName;
  var room = data.room;

  console.log("[JOIN ROOM] User '" + userName + "' joining room #" + room);

  // Ensure that user has the most recent master key for this room if in masterKey mode
  if (config.encryptionScheme == 'masterKey') {
    //console.log("[JOIN ROOM] encryptionScheme: masterKey - checking masterKey");
    KeyId.getMasterKeyId(room, function(err, currentKeyId) {
      User.getMasterKeyPair(userName, room, function(err, masterKeyPair) {
        if (masterKeyPair.id !== currentKeyId) {
          self.initMasterKeyPair(function(err) {
            // Should probably return and call self here
            User.getMasterKeyPair(userName, room, function(err, newMasterKeyPair) {
              self.socket.emit('joinComplete', { encryptionScheme: 'masterKey', room: room, masterKeyPair: newMasterKeyPair });
              self.namespace.to(root).emit('newMasterKey', { room: room, keyId: currentKeyId });
              self.socket.join(room);
              Room.join({userName: userName, roomName: room}, function(err, success) {
                if (err) {
                  return console.log("Error joining room " + room + " with error: " + err);
                }
                if (!success) {
                  return console.log("Failed to join room " + room);
                }
              })
              console.log("[SOCKET SERVER] (joinRoom) Sending updateUserList for room " + room.name);
              self.updateUserList(room.name);
            });
          });
        } else {
          //console.log("[JOIN ROOM] Clients master key is up to date");
          self.socket.join(room);
          self.socket.emit('joinComplete', { encryptionScheme: 'masterKey', room: room, masterKeyPair: masterKeyPair });
          console.log("[SOCKET SERVER] (joinRoom) Sending updateUserList for room " + room.name);
          self.updateUserList(room.name);
        };
      });
    });
  } else {
    // Using client key encryption scheme
    Room.join({roomName: room, userName: userName}, function(err, data) {
      var auth = data.auth;
      var room = data.room;
      console.log("Member trying to join room and room is: " + JSON.stringify(room));
      if (err) {
        return self.socket.emit('joinComplete', { err: "Error while joining room " + room.name + ": "+ err });
      }
      if (!auth) {
        return self.socket.emit('joinComplete', { err: "Sorry, you are not a member of room " + room.name });
      }
      self.socket.join(room.name);
      console.log("[SOCKET SERVER] (joinRoom) Sending joinRoom in clientKey mode");
      self.socket.emit('joinComplete', { encryptionScheme: 'clientKey', room: room });
      console.log("[SOCKET SERVER] (joinRoom) Sending updateUserList for room " + room.name);
      self.updateUserList(room.name);
    })
  };
};

/*
 * Create a room if user has permission
 */
SocketServer.prototype.createRoom = function createRoom(data) {
  var self = this;
  var roomData = {
    userName: self.socket.user.userName,
    roomName: data.roomName,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  }

  console.log("User " + self.socket.user.userName + " is trying to create room " + data.roomName);
  Room.create(roomData, function(err) {
    if (err) {
      return console.log("Error creating room: " + err);
    }
    self.socket.emit('createRoomComplete', { roomName: data.roomName });
  })
}

/*
 * Client part room
 */
SocketServer.prototype.partRoom = function partRoom(data) {
  var self = this;

  console.log("[PART ROOM] User " + userName + " parting room " + room.name);
  if (!self.socket.user) {
    console.log("Ignoring join attempt by unauthenticated user");
    return selfsocket.emit('errorMessage', {message: 401});
  }

  var userName = self.socket.user.userName;
  var room = data.room;

  Room.part({ userName: userName, room: room.name }, function(err, success) {
    if (err) {
      return console.log("Error parting room " + room.name + " with error: " + err);
    }
    if (!success) {
      return console.log("Failed to part room " + room.name);
    }
    console.log("User " + userName + " parted room " + room.name);
    self.updateUserList(room.name);
    self.socket.emit('partComplete', { room: room.name });
  })
};

/**
 * Update userlist for a room
 */
SocketServer.prototype.updateUserList = function updateUserList(room) {
  var self = this;
  self.getUserList(room, function(err, members) {
    self.namespace.to(room).emit("userlist update", {
      room: room,
      userList: members
    });
  });
};

SocketServer.prototype.getUserList = function(room, callback) {
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
  } else {
    console.log("[GET USER LIST] User list is empty");
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
    return console.log("unknown socket");
  }

  console.log("[DISCONNECT] socket.id: " + self.socket.id);
  self.socket.leaveAll();

  if (self.socket.user && self.socket.user.userName) {
    var userName = self.socket.user.userName;
    console.log("[SOCKET SERVER] (disconnect) userName: "+userName);
    User.findOne({ userName: userName }).populate('membership._currentRooms').exec(function(err, user) {
      if (err) {
        return console.log("ERROR finding user while parting room");
      }
      if (!user) {
        return console.log("ERROR finding user while parting room");
      }
      console.log("[DISCONNECT] Found user, disconnecting...");
      user.membership._currentRooms.forEach(function(currentRoom) {
        console.log("User " + userName + " parting room " + currentRoom.name);
        Room.part({ userName: userName, roomName: currentRoom.name }, function(err, success) {
          if (err) {
            return console.log("ERROR parting room: " + err);
          }
          if (!success) {
            return console.log("User " + userName + " failed to part room " + currentRoom.name);
          }
          console.log("User " + userName + " successfully parted room " + currentRoom.name);
        })
      })
    })
    delete self.namespace.userMap[self.socket.user.userName];
  } else {
    console.log("WARNING! Someone left the channel and we don't know who it was...");
  }
  // TODO: Should update all appropritae channels here
  self.updateUserList('general');
};


//TODO: Are these still needed?
SocketServer.prototype.sendUserListUpdate = function sendUserListUpdate(channel, callback) {
  if (channel != null) {
    getChannelUsersArray(channel, function(err, channelUsersArray) {
      if (err) {
        callback(err);
      } else {
        var userListData = {
          userList: channelUsersArray
        }
        //ioMain.emit("userlist update", userListData);
        callback(null);
      };
    });
  } else {
    // update all channels
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
          console.log("Removed "+user.userName+" from "+count+" channels");
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
