var express = require('express');
var app = express();
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
var openpgp = require('openpgp');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var fs = require('fs');
var morgan = require('morgan');
var async = require('async');
var marked = require('marked');
var events = require('events');
var winston = require('winston');

var configMD = require('./config/markdown.js');
var configDB = require('./config/database.js');
var logger = require('./config/logger.js');

var KeyPair = require('./models/keypair.js');
var User = require('./models/user.js');
var Channel = require('./models/channel.js');
var KeyId = require('./models/keyid.js');
var allClients = [];
var userMembership = {};
var socketMembership = {};

app.set('view engine', 'ejs');
app.use(express['static'](path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(morgan('dev'));

// Database
var db = mongoose.connection;
db.on('error', console.error);
db.once('open', function() {
  // Load any schemas/models here?
})

var mongoUrl = configDB.url;

var connectWithRetry = function() {
  return mongoose.connect(mongoUrl, function(err) {
    if (err) {
      console.error('Failed to connect to mongo on startup - retrying in 5 sec', err);
      setTimeout(connectWithRetry, 5000);
    }
  });
};
connectWithRetry();

// Load routes
var routePath = './routes/';
var routes = [];
fs.readdirSync(routePath).forEach(function(file) {
  var route = routePath+file;
  routeName = file.split('.')[0]
  console.log("[SERVER] Loading route: "+routeName);
  routes[routeName] = require(route)(app);
})

io.on('connection', function(socket) {
  console.log("[CONNECTION] Got connection to default socket");
});

var ioMain = io.of('/main');

ioMain.on('connection', function(socket) {
  console.log("[CONNECTION] User connected!");

  socket.on('init', function(data) {
    userName = data.userName;
    User.findOneAndUpdate({ userName: userName }, { $push: { socketIds: socket.id }}, { upsert: true }, function(err, user) {
      if (err) {
        console.log("[INIT] Error finding user: "+err);
      } else {
        console.log("[INIT] Got user "+user.userName+" with socketId "+user.socketIds.toString());
      }
    });
    console.log("[INIT] Init'd user "+userName);
  });

  socket.on('chat message', function(data) {
    var userName = data.userName;
    var pgpMessage = data.pgpMessage;
    console.log("[MSG] Server got chat message from "+userName);
    ioMain.emit('chat message', data);
    console.log("[MSG] Server emitted chat message to users");
  });

  socket.on('regen master key', function() {
    console.log("Got socket 'regen master key'");
    regenerateMasterKeyPair();
  });

  socket.on('privmsg', function(data) {
    var toUser = data.toUser;
    User.findOne({ socketIds: socket.id }, function(err, user) {
      if (err) {
        return console.log("[PRIVMSG] Error sending pivmsg: "+err);
      } else if (user == null) {
        return console.log("[PRIVMSG] Could not find user");
      } else {
        var fromUser = user.userName;
        var toUserSocketIds = user.socketIds;
        var id = data.id;
        var message = data.message;
        if (typeof toUserSocketIds !== 'undefined') {
          console.log("[PRIVMSG] To user socket ids is: "+toUserSocketIds.toString());
          data = {
            toUser: toUser,
            fromUser: fromUser,
            message: message
          };
          toUserSocketIds.each(function(socketId) {
            socket.broadcast.to(toUserSocketId).emit('privmsg', data);
            sentData = {
              id: id,
              error: null
            };
          });
        } else {
          // TODO: Should save and queue private message here
          console.log("[PRIVMSG] User "+toUser+" does not seem to be connected so cannot relay private message");
        };
      };
    });
  });

  socket.on('server command', function(data) {
    var command = data.command;
    var currentChannel = data.currentChannel;
    console.log("Received command '"+command+"' from user '"+socket.name+"'");
    var splitCommand = command.split(" ");
    if (splitCommand[0] == "who") {
      console.log("[SERVER] Responding to 'who' request from '"+socket.name+"'");
      getChannelUsersArray(channel, function(err, channelUsersArray) {
        console.log("[SERVER COMMAND] Checking channel #"+currentChannel);
        console.log("[SERVER COMMAND] Broadcasting user list for #"+currentChannel+" to socket.id "+socket.id+" with data ( "+channelUsersArray.toString()+" )");
        ioMain.to(socket.id).emit('chat status', { statusType: "WHO", statusMessage: "Current users of #"+currentChannel+" are ( "+channelUsersArray.toString()+" )"});
      });
    } else if (splitCommand[0] == "help") {
      // Output help here
    } else {
      console.log("[SERVER COMMAND] Unable to parse server command...");
    };
  });

  socket.on('join', function(data) {
    var userName = data.userName;
    var channel = data.channel;
    socket.join(channel);
    socket.name = userName;

    var timestamp = new Date().toString();
    console.log("["+timestamp+"] [JOIN] Adding user "+userName+" to channel #"+channel);
    addUserToChannel(userName, channel, function(err) {
      if (err) return console.log("[JOIN] Error adding user to channel: "+err);
      getChannelUsersArray(channel, function(err, channelUsersArray) {
        if (err) {
    var timestamp = new Date().toString();
          console.log("["+timestamp+"] [JOIN] Error getting channel users: "+err);
        } else {
          var userListData = {
            userList: channelUsersArray,
            joinUser: userName,
            channel: channel
          }
    var timestamp = new Date().toString();
          console.log("["+timestamp+"] Sending userlist update!");
          ioMain.emit("userlist update", userListData);
        };
      });
    });

    //console.log("[JOIN] Socket id: "+socket.id);
    var timestamp = new Date().toString();
    console.log("["+timestamp+"] [JOIN] "+userName+" has joined channel #"+channel);
    var timestamp = new Date().toString();
    console.log("["+timestamp+"] [JOIN] Generating new master key pair.");

    // something between here ...
    //if (keyPair.pubKey == remotePubKey) {
      console.log("User '"+userName+"' client public key up to date");
    //} else {
      //generateMasterKeyPair(function(err, masterKeyPair) {
      //  var timestamp = new Date().toString();
      //  console.log("["+timestamp+"] [JOIN][DEBUG] about to update master keypair");
      //  updateMasterKeyPairForAllUsers(masterKeyPair, function(err) {
      //    var timestamp = new Date().toString();
      //    if (err) { console.log("["+timestamp+"] [JOIN] Error encrypting master key for all users: "+err); };
      //    var timestamp = new Date().toString();
      //    console.log("["+timestamp+"] [JOIN] Encrypted master key for all users!");
      //  });
      //  var timestamp = new Date().toString();
      //  console.log("["+timestamp+"] [JOIN] After updateMasterKeyPairForAllUsers...");
      //});
    //};
    // ... and here is blocking everything
    var timestamp = new Date().toString();
    console.log("["+timestamp+"] [JOIN][DEBUG] before addUserIfNotExist");

    addUserIfNotExist(userName, function(err) {
      var timestamp = new Date().toString();
      if (err) { return console.log("["+timestamp+"] Error checking user: "+err); };
      var timestamp = new Date().toString();
      console.log("["+timestamp+"] [JOIN] User check complete");
      KeyId.findOne({ type: 'master' }, function(err, masterKeyId, count) {
        User.findOne({ userName: userName }, function(err, user, count) {
          console.log("[DEBUG] (addUserIfNotExist) user.userName: "+user.userName+" user.masterKey.id: "+user.masterKey.id+ " masterKeyId.id: "+masterKeyId.id);
          if (user.masterKey.encPrivKey && user.masterKey.id == masterKeyId.id) {
            var timestamp = new Date().toString();
            console.log("["+timestamp+"] [JOIN] User has master key, emitting ready to client");
            //io.emit('new master key');
          } else {
            var timestamp = new Date().toString();
            console.log("["+timestamp+"] [JOIN] User does not have master key, regenerating for all users");
            generateMasterKeyPair(function(err, masterKeyPair, id) {
              updateMasterKeyPairForAllUsers(masterKeyPair, id, function(err) {
                var timestamp = new Date().toString();
                if (err) { console.log("["+timestamp+"] [JOIN] Error encrypting master key for all users: "+err); };
                var timestamp = new Date().toString();
                console.log("["+timestamp+"] [JOIN] Encrypted master key for all users!");
              });
            });
          };
        });
      });
    });
    var timestamp = new Date().toString();
    console.log("["+timestamp+"] [JOIN][DEBUG] after addUserIfNotExist");
    var channel = data.channel;
    var statusMessage = userName+" has joined the channel";
    console.log(statusMessage);
    var data = {
      statusType: "JOIN",
      statusMessage: statusMessage
    };
    ioMain.emit('chat status', data);
  });

  socket.on('part', function(data) {
    var channel = data.channel;
    var userName = data.userName;
  });

  socket.on('disconnect', function() {
    var userName = '';
    console.log("[DISCONNECT] socket.id: "+socket.id);
    disconnectUser(socket.id, function(err, userName) {
      if (err) return console.log("Error disconnecting user: "+err);
      console.log("User "+userName+" disconnected");
    });
  });
});

function getMasterKeyId(callback) {
  KeyId.findOne({ type: 'master' }, function(err, keyId, count) {
    if (err) {
      return callback(err, null);
    } else if (typeof keyId == 'undefined' || keyId == null) {
      new KeyId({
        type: 'master',
        id: 0
      }).save(function(err, keyId) {
        if (err) {
          return callback(err, null);
        } else {
          console.log("Added master key id '"+keyId.id+"' as it did not exist yet");
          return callback(null, keyId.id);
        };
      });
    } else {
      console.log("keyId is: "+keyId);
      return callback(null, keyId.id);
    };
  });
};

function incrementMasterKeyId(callback) {
  KeyId.findOne({ type: 'master' }, function(err, keyId, count) {
    if (typeof keyId == 'undefined') {
      return callback("Cannot find master key ID while trying to increment", null);
    } else {
      var id = keyId.id + 1;
      keyId.id = id;
      keyId.save(function(err, keyId, count) {
        if (err) {
          return callback("Error saving key id");
        } else {
          return callback(null, keyId.id);
        }
      });
    };
  });
};

function findUserBySocketId(socketId, callback) {
  User.findOne({ socketIds: socketId }, function(err, user) {
    if (err) {
      return callback(err);
    } else if (user == null) {
      return callback("No user found with this socketId");
    } else {
      return callback(null, user);
    };
  });
};


function disconnectUser(socketId, callback) {
  findUserBySocketId(socketId, function(err, user) {
    if (err) {
      callback(err);
    } else {
      var userName = user.userName;
      removeUserFromAllChannels(socketId, function(err, userName) {
        if (err) {
          return console.log("[DISCONNECT USER] Error removing user "+userName+" from all channels");
          callback(err);
        } else {
          sendUserListUpdate("general", function(err) {
            console.log("[DISCONNECT USER] Error getting channel users: "+err);
          });
          // Should only send this to the channels the user has parted from
          var statusMessage = user.userName+" has left the channel";
          var statusData = {
            statusType: "PART",
            statusMessage: statusMessage
          }
          ioMain.emit('chat status', statusData);
          console.log("[DISCONNECT] User "+userName+" disconnected...");
          callback(null);
        }
      });
    };
  });
};

function sendUserListUpdate(channel, callback) {
  if (channel != null) {
    getChannelUsersArray(channel, function(err, channelUsersArray) {
      if (err) {
        callback(err);
      } else {
        var userListData = {
          userList: channelUsersArray
        }
        ioMain.emit("userlist update", userListData);
        callback(null);
      };
    });
  } else {
    // update all channels
  };
};

function removeUserFromAllChannels(socketId, callback) {
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

start();

function start() {
  // If there is no keypair generated generate one and encrypt it to each user using their public key
  //bootstrapUsers(function(err) {
    //if (err) { return console.log("Error bootstrapping users: "+err); }
    //console.log("[START] Done bootstrapping users");
    //KeyPair.findOne({ type: 'master'}, function(err, masterKeyPair) {
    //  if (typeof masterKeyPair === 'undefined' || masterKeyPair === null) {
    //    console.log("[START] Master keyPair not found, creating new one");
    //    generateMasterKeyPair(function(err, masterKeyPair, id) {
    //      updateMasterKeyPairForAllUsers(masterKeyPair, id, function(err) {
    //        if (err) { console.log("[START] Error encrypting master key for all users: "+err); };
    //        console.log("[START] Encrypted master key for all users!");
    //      });
    //    });
    //  } else {
        checkMasterKeyPairForAllUsers(function(err, response) {
          console.log("Checking master key pair for all users");
          if (err) { console.log("[START] Error checking master key for all users: "+err); };
          if (response == 'update') {
            console.log("Users keypair needs updating so generating new master key pair");
            generateMasterKeyPair(function(err, masterKeyPair, id) {
              console.log("[START] New master keyPair generated with id '"+id+"'");
              updateMasterKeyPairForAllUsers(masterKeyPair, id, function(err) {
                if (err) { return console.log("[START] Error encrypting master key for all users: "+err); };
                console.log("[START] Encrypted master key for all users!");
              });
            });
          } else if (response == 'ok') {
            console.log("All users master key matches current version");
            //io.emit('new master key', masterKeyPair);
          }
        });
        //console.log("[START] Using existing master keyPair version: "+masterKeyPair.version);
        //io.emit('new master key', masterKeyPair);
     // };
    //});
  //});
};

function regenerateMasterKeyPair() {
  console.log("Running regenerateMasterKeyPair");
  generateMasterKeyPair(function(err, masterKeyPair, id) {
    console.log("[START] New master keyPair generated...");
    updateMasterKeyPairForAllUsers(masterKeyPair, id, function(err) {
      if (err) { return console.log("[START] Error encrypting master key for all users: "+err); };
      console.log("[START] Encrypted master key for all users!");
    });
  });
};

function findClientsSocket(roomId, namespace) {
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

function findClientsSocketByRoomId(roomId) {
  var res = [];
  var room = io.sockets.adapter.rooms[roomId];
  if (room) {
    for (var id in room) {
      res.push(io.sockets.adapter.nsp.connected[id]);
    };
  };
  return res;
};

// var clients = io.of('/chat').clients();
// becomes
//var clients = findClientsSocket(null, '/chat') ;

// var clients = io.of('/chat').clients('room'); // all users from room `room`
// becomes
//var clients = findClientsSocket('room', '/chat') ;

function generateMasterKeyPair(callback) {
  console.log("Generating master key pair start");
  generateKeyPair(2048, 'master keypair', 'pipo', function(err, newMasterKeyPair) {
    console.log("Generated master key pair!");
    if (err) {
      callback(err, null, null);
    } else {
      // Should not be saving the keypair here eventually
      incrementMasterKeyId(function(err, keyId) {
        if (err) {
          return callback(err, null, null);
        } else {
          return callback(null, newMasterKeyPair, keyId);
        };
      });
    };
  });
};

function updateMasterKeyPairForAllUsers(masterKeyPair, keyId, callback) {
  var timestamp = new Date().toString();
  console.log("["+timestamp+"] [UPDATE] starting updateMasterKeyPairForAllUsers");
  User.find({}, function(err, users, count) {
    var timestamp = new Date().toString();
    console.log("["+timestamp+"] [UPDATE] found users");
    async.each(users, function(user, asyncCallback) {
      updateMasterKeyPairForUser(user, masterKeyPair, keyId, function(err) {
        if (err) { return asyncCallback(err); }
        //console.log("Update master key process for "+user.userName+" done...");
        asyncCallback(err);
      });
    }, function(err) {
        if (err) {
          console.log("Error generating key pair for all users");
          callback(err);
        } else {
          console.log("Generated encrypted master key for all users");
          ioMain.emit('new master key', masterKeyPair);
          callback(err);
        };
    });
  });
}

function checkMasterKeyPairForAllUsers(callback) {
  getMasterKeyId(function(err, currentKeyId) {
    if (err) {
      return callback(err, null);
    } else {
      var response = '';
      User.find({}, function(err, users, count) {
        users.forEach( function(user) {
          if (user.masterKey.encPrivKey && user.masterKey.id == currentKeyId) {
            response = 'ok';
          } else {
            console.log("User '"+user.userName+"' has key id "+user.masterKey.id+" and current keyId is "+currentKeyId);
            response = 'update';
          };
        });
        return callback(null, response);
      });
    };
  });
};

function bootstrapUsers(callback) {
  // Loop through all users and add to membeership?
  defaultUsers = ['philip', 'sam'];
  async.each(defaultUsers, function(userName, asyncCallback) {
    User.findOne({ userName: userName }, function(err, user, count) {
      if (err) { return asyncCallback("Error creating user: "+err); }
      if (typeof user === 'undefined' || user === null) {
        console.log("User "+userName+" not found. Creating...");
        new User({
          userName: userName,
        }).save( function( err, user, count ) {
          console.log("Added user "+userName);
          asyncCallback(null);
        });
      } else {
        //console.log("User "+userName+" exists.");
        asyncCallback(null);
      }
    });
  }, function(err) {
      if (err) { return callback(err); };
      callback(null);
     }
  );
};

function getChannelUsersArray(channel, callback) {
  Channel.findOne({ name: channel }).populate('_userList').exec(function(err, channel) {
    if (err) {
      return callback(err);
    } else if (channel == null) {
      return callback("[GETCHANNELUSERSARRAY] Channel is null");
    } else {
      var channelUsersArray = [];
      channel._userList.forEach(function(user) {
        channelUsersArray.push(user.userName);
      });
      console.log("[GETCHANNELUSERSARRAY] Channel users list arra is: "+channelUsersArray.toString());
      return callback(null, channelUsersArray);
    };
  });
};

function addUserToChannel(userName, channelName, callback) {
  User.findOne({ userName: userName }, function(err, user) {
    if (err) {
      console.log("[ADDUSERTOCHANNEL] Error finding user");
      return callback(err);
    } else {
      Channel.findOneAndUpdate( { name: channelName }, { $addToSet: { _userList: user }}, { upsert: true } ).populate('_userList').exec(function(err, channel) {
        if (err) {
          console.log("[ADDUSERTOCHANNEL] Error finding channel");
          return callback(err);
        } else if (channel == null) {
          console.log("[ADDUSERTOCHANNEL] Channel is NULL");
          return callback("Channel is NULL");
        } else {
          console.log("Added user "+userName+" to channel #"+channelName);
          getChannelUsersArray(channelName, function(err, channelUsersArray) {
            console.log("[ADDUSERTOCHANNEL] Channel users array is: "+channelUsersArray);
            return callback(null);
          });
        };
      });
    };
  });
};

function in_array(array, id) {
  for(var i=0;i<array.length;i++) {
    return (array[i][0].id === id);
  };
  return false;
};


  //if (typeof channelMembership[channel] === 'undefined' || channelMembership[channel] === null) {
  //  channelMembership[channel] = [];
  //  channelMembership[channel].push({userName: userName, socketId: socketId});
  //  console.log("[JOIN] User "+userName+" joining channel "+channel+" and channelMembership is NULL");
  //  callback(null);
  //} else if(userName in channelMembership[channel]) {
  //  console.log("User "+userName+" is already in channel #"+channel);
  //  callback(null);
  //} else {
  //  channelMembership[channel].push({userName: userName, socketId: socketId});
  //  console.log("[JOIN] Adding user "+userName+" to channel #"+channel);
  //  callback(null);
  //};

function removeUserFromChannel(userName, channel, callback) {
  console.log("Removing user "+userName+" from channel "+channel);
  Membership.findOneAndUpdate({ type: 'userList', channel: channel }, { $pull: { members: userName }}, function(err, membership, count) {
    if (err) {
      return callback(err);
    } else {
      return callback(null);
    };
  });
};

function addUserIfNotExist(userName, callback) {
  var User = require('./models/user.js');
  User.findOne({ userName: userName }, function(err, user) {
    if (err) { return callback(err); };
    if (typeof user === 'undefined' || user === null) {
      console.log("No user found in DB with username "+userName);
      new User({
        userName: userName,
      }).save( function(err, user, count) {
        if (err) { return console.log("Error adding user to DB: "+err); }
        console.log("Added user '"+userName+"' to DB");
        return callback(null);
      });
    } else {
      //console.log("User exists");
      return callback(null);
    }
  });
};

function updateMasterKeyPairForUser(user, masterKeyPair, keyId, callback) {
  //console.log("Updating master keyPair for "+user.userName);
  //console.log("[DEBUG] (updateMasterKeyPairForUser) user.pubKey: "+user.pubKey);
  //console.log("[DEBUG] (updateMasterKeyPairForUser) masterKeyPair.privKey: "+masterKeyPair.privKey);
  if (user.pubKey) {
    var pubKey = openpgp.key.readArmored(user.pubKey).keys[0];
    var masterPrivKey = openpgp.key.readArmored(masterKeyPair.privKey).keys[0];
    masterPrivKey.decrypt('pipo');
    console.log("Encrypting master key with id "+keyId+" to "+user.userName);
    openpgp.encryptMessage(pubKey, masterKeyPair.privKey).then(function(encKey) {
      user.masterKey.encPrivKey = encKey;
      user.masterKey.pubKey = masterKeyPair.pubKey;
      user.masterKey.id = keyId;
      user.save( function( err, user, count ) {
        if (err) { return callback("Error saving encrypted master key for user "+user.userName) };
        //console.log("Saved encrypted master key for user "+user.userName);
        callback(null);
      });
    });
  } else {
    console.log("User "+user.userName+" does not have a pubKey so cannot create master key for them");
    callback(null);
  }
}

function generateKeyPair(numBits, userId, passphrase, callback) {
  var options = {
    numBits: numBits,
    userId: userId,
    passphrase: passphrase
  };
  var timestamp = Date().toString();
  console.log("["+timestamp+"] [GENERATE KEY PAIR] generating keypair now...");
  openpgp.generateKeyPair(options).then(function(keyPair) {
    var timestamp = Date().toString();
    console.log("["+timestamp+"] [GENERATE KEY PAIR] in generateKeyPair then");
    privKey = keyPair.privateKeyArmored;
    pubKey = keyPair.publicKeyArmored;
    var keyPair = {
      privKey: privKey,
      pubKey: pubKey
    };
    return callback(null, keyPair);
  }).catch(function(err) {
    console.log("Error generating key pair: "+err);
    return callback(err, null);
  });
};

function showKeys(privkey, pubkey) {
  console.log("PGP PrivKey: "+privkey+" pubkey: "+pubkey);
}

http.listen(3030, function() {
  console.log('[SERVER] listening on *:3030');
});
