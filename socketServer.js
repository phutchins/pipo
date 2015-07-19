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


/*
 * Create the default room if it does not exist
 */
SocketServer.prototype.getDefaultRoom = function getDefaultRoom(callback) {
  var self = this;
  // get the default room name
  // This needs to be set in the config somewhere and passed to the client in a config block
  var defaultRoomName = 'pipo';

  var defaultRoomData = {
    name: 'pipo',
    topic: "Welcome to PiPo.",
    group: "default",
    membershipRequired: false,
    keepHistory: true,
    encryptionScheme: 'clientkey',
    messages: [],
    _owner: null,
    _admins: [],
    _members: []
  };

  // create the default room object
  Room.findOneAndUpdate({ name: defaultRoomName }, defaultRoomData, { upsert: true, new: true }).populate('_members _owner _admins').exec(function(err, defaultRoom) {
    if (err) { return console.log("[getDefaultRoom] ERROR - Problem creating or finding default room:",err) }
    if (defaultRoom == null) {
      console.log("[getDefaultRoom] ERROR - Default room is NULL");
      return callback(null);
    } else {
      console.log("Found default room: #",defaultRoom.name);
      //console.log("Default room is :",defaultRoom);
      return callback(defaultRoom);
    }
  });
};

/**
 * New socket connected to server
 */
SocketServer.prototype.authenticate = function authenticate(data) {
  var self = this;
  console.log("[AUTHENTICATE] Authenticating user data is: ",data);
  User.authenticateOrCreate(data, function(err, authData) {
    //console.log("[AUTHENTICATE] authData is ", authData);
    var user = new User;
    user = authData.user;
    var newUser = authData.newUser;
    //console.log("[AUTHENTICATE] AuthData.user: ",authData.user);

    if (err) {
      console.log('Authentication error', err);
      return self.socket.emit('errorMessage', {message: 'Error authenticating you ' + err});
    }

    if (user) {
      if (newUser) {
        console.log("User", data.userName, " not in the mastr cached userlist so adding them");
        // This helps keep track of when users sign up so that we can emit the new user data to all clients
        self.updateUserList({scope: 'all'});
      }

      self.namespace.socketMap[self.socket.id] = {
        userName: user.userName,
        publicKey: user.publicKey
      };

      self.namespace.userMap[user.userName] = self.socket.id;

      self.socket.user = user;
      console.log("[INIT] Init'd user " + user.userName);
      // TODO: Replace this with current rooms
      var autoJoin = [];
      User.populate(user, { path: 'membership._autoJoin' }, function(err, populatedUser) {
        if (populatedUser.membership._autoJoin.length > 0) {
          Object.keys(populatedUser.membership._autoJoin).forEach(function(key) {
            console.log("Adding " + populatedUser.membership._autoJoin[key].name + " to auto join array");
            autoJoin.push(populatedUser.membership._autoJoin[key].name);
          })
        }

        // Get complete userlist to send to client on initial connection
        console.log("getting userlist for user...");
        self.getDefaultRoom(function(defaultRoom) {
          if (defaultRoom == null) { return console.log("[AUTHENTICATE] ERROR - default room is null") }
          self.sanatizeRoomForClient(defaultRoom, function(sanatizedRoom) {
            //console.log("Sanatized default room #",sanatizedRoom.name," with data: ",sanatizedRoom);
            User.getAllUsers({}, function(err, userlist) {
              console.log("Sending userlist to user...", userlist);
              self.socket.emit('authenticated', {message: 'ok', autoJoin: autoJoin, userlist: userlist, defaultRoomName: sanatizedRoom.name });
            })
          })

          console.log("getting available room list");
          User.availableRooms({ userName: user.userName }, function(err, roomData) {
            console.log("done getting available room list");
            if (err) {
              return self.socket.emit('membershipUpdate', { err: "Membership update failed: " + err });
            }
            var rooms = {};
            Object.keys(roomData.rooms).forEach(function(key) {
              console.log("Adding room " + roomData.rooms[key].name + " to array");
              rooms[roomData.rooms[key].name] = roomData.rooms[key];
            })
            //console.log("Rooms is: " + JSON.stringify(rooms));
            console.log("Sending membership update to user " + user.userName);
            self.socket.emit('membershipUpdate', { rooms: rooms });
          })

          console.log("[INIT] Emitting user connect");
          return self.namespace.emit('user connect', {
            userName: user.userName,
            publicKey: user.publicKey
          })
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

  console.log("[JOIN ROOM] data is ",data);

  if (!self.socket.user) {
    console.log("Ignoring join attempt by unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  var userName = self.socket.user.userName;
  var room = data.room;

  console.log("[JOIN ROOM] User '" + userName + "' joining room #",room.name);

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
              Room.join({userName: userName, name: room}, function(err, success) {
                if (err) {
                  return console.log("Error joining room " + room + " with error: " + err);
                }
                if (!success) {
                  return console.log("Failed to join room " + room);
                }
              })
              console.log("[SOCKET SERVER] (joinRoom) Sending updateRoomUsers for room " + room.name);
              self.updateRoomUsers(room.name);
            });
          });
        } else {
          //console.log("[JOIN ROOM] Clients master key is up to date");
          self.socket.join(room);


          self.socket.emit('joinComplete', { encryptionScheme: 'masterKey', room: sanatizedRoom, masterKeyPair: masterKeyPair });
          console.log("[SOCKET SERVER] (joinRoom) Sending updateRoomUsers for room " + room.name + " with member list of ", membersArray);
          self.updateRoomUsers(room.name);
        };
      });
    });
  } else {
    // Using client key encryption scheme
    // Move this to its own function (sanatizeRoomForClient)
    Room.join({name: room, userName: userName}, function(err, data) {
      var auth = data.auth;
      var room = data.room;

      self.sanatizeRoomForClient(room, function(sanatizedRoom) {
        //console.log("Member trying to join room and room is: " + JSON.stringify(room));
        if (err) {
          return self.socket.emit('joinComplete', { err: "Error while joining room " + room.name + ": "+ err });
        }
        if (!auth) {
          return self.socket.emit('joinComplete', { err: "Sorry, you are not a member of room " + room.name });
        }
        self.socket.join(room.name);
        console.log("[SOCKET SERVER] (joinRoom) Sending joinRoom in clientKey mode");
        self.socket.emit('joinComplete', { encryptionScheme: 'clientKey', room: sanatizedRoom });
        console.log("[SOCKET SERVER] (joinRoom) Sending updateRoomUsers for room " + room.name);
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
  //console.log("sanatizing room: ",room);
  if (room._owner) {
    var ownerUserName = room._owner.userName;
  } else {
    var ownerUserName = null;
  }

  var membersLength = room._members.length;
  var adminsLength = room._admins.length;

  var membersArray = [];
  var adminsArray = [];

  //console.log("[sanatizeRoomForClient] Members: ",room._members);
  //console.log("[sanatizeRoomForClient] Admins: ",room._admins);

  if (membersLength > 0) {
    //console.log("room members is: ",room._members);

    room._members.forEach(function(member) {
      //console.log("[sanatizeRoomForClient] looping members - key:",key);
      //console.log("[sanatizeRoomForClient] looping members - userName:",userName);
      membersArray.push(member.userName);
    })
  }

  if (adminsLength > 0) {
    room._admins.forEach(function(admin) {
      //console.log("[sanatizeRoomForClient] looping admins - key:",key);
      //console.log("[sanatizeRoomForClient] looping admins - userName:",userName);
      adminsArray.push(admin.userName);
    })
  }

  //console.log("[sanatizeRoomForClient] Members array: ", membersArray);
  //console.log("[sanatizeRoomForClient] Admins array: ", adminsArray);
  //var membersArray = room.members.map(function(member) {
  //  return member.userName;
  //});
  //var adminsArray = room.admins.map(function(member) {
  //  return member.userName;
  //});
  // TODO: Sanatize messages? Or make sure populated?

  var sanatizedRoom = {
    name: room.name,
    topic: room.topic,
    group: room.group,
    messages: room.messages,
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
    roomName: data.roomName,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  }

  console.log("User " + self.socket.user.userName + " is trying to create room " + data.roomName);
  Room.create(roomData, function(err, newRoom) {
    if (err) {
      return console.log("Error creating room: " + err);
    }
    self.socket.emit('createRoomComplete', { roomName: data.roomName });
    console.log("Room created : " + JSON.stringify(newRoom));
    var rooms = {};
    rooms[newRoom.name] = newRoom;
    if (roomData.membershipRequired) {
      // Emit membership update to user who created private room
      self.socket.emit('membershipUpdate', { rooms: rooms });
    } else {
      // Emit membership update to all users
      self.namespace.emit('membershipUpdate', { rooms: rooms });
    }
  })
}

/*
 * Client part room
 */
SocketServer.prototype.partRoom = function partRoom(data) {
  var self = this;

  // Check if user has already initiated parting this room
  //

  console.log("[PART ROOM] Parting room for",self.socket.user.userName);

  if (!self.socket.user) {
    console.log("Ignoring part attempt by unauthenticated user");
    return self.socket.emit('errorMessage', {message: 401});
  }

  var userName = self.socket.user.userName;
  var roomName = data.roomName
  console.log("[PART ROOM] User " + userName + " parting room " + roomName);

  Room.part({ userName: userName, roomName: roomName }, function(err, success) {
    if (err) {
      return console.log("Error parting room " + roomName + " with error: " + err);
    }
    if (!success) {
      return console.log("Failed to part room " + roomName);
    }
    console.log("User " + userName + " parted room " + roomName);
    self.updateRoomUsers(roomName);

    // Update user status
    //

    self.socket.emit('partComplete', { room: roomName });
  })
};

SocketServer.prototype.updateUserList = function updateUserList(data) {
  var self = this;
  var scope = data.scope;
  User.getAllUsers({}, function(err, data) {
    var userlist = data.userlist;
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
    //console.log("(getRoomUsers) - (",room,")(",members,")")
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
          //BOOKMARK
          console.log("User " + userName + " successfully parted room " + currentRoom.name);
          // TODO: Should update all appropritae channels here
          console.log("Updating room users!");
          self.updateRoomUsers(currentRoom.name);
        })
      })
    })
    delete self.namespace.userMap[self.socket.user.userName];
  } else {
    console.log("WARNING! Someone left the channel and we don't know who it was...");
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
