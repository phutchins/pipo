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
var logger = new winston.Logger();

var configMD = require('./config/markdown.js');
var configDB = require('./config/database.js');

var KeyPair = require('./models/keypair.js');
var User = require('./models/user.js');
var allClients = [];
var channelMembership = {};
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
    userMembership[userName.toLowerCase()] = {};
    userMembership[userName.toLowerCase()].socketId = socket.id;
    socketMembership[socket.id] = {};
    socketMembership[socket.id].userName = userName;
    console.log("[INIT] Init'd user "+userName);
  });

  socket.on('chat message', function(data) {
    var userName = data.userName;
    var pgpMessage = data.pgpMessage;
    console.log("[MSG] Server got chat message from "+userName);
    ioMain.emit('chat message', data);
    console.log("[MSG] Server emitted chat message to users");
  });

  socket.on('privmsg', function(data) {
    var toUser = data.toUser;
    var toUserSocketId = userMembership[toUser.toLowerCase()].socketId;
    var fromUser = socketMembership[socket.id].userName;
    var id = data.id;
    var message = data.message;
    data = {
      toUser: toUser,
      fromUser: fromUser,
      message: message
    };
    socket.broadcast.to(toUserSocketId).emit('privmsg', data);
    sentData = {
      id: id,
      error: null
    };
    //socket.broadcast.to(socket.id).emit('privmsg status', sentData);
  });

  socket.on('server command', function(data) {
    var command = data.command;
    var currentChannel = data.currentChannel;
    console.log("Received command '"+command+"' from user '"+socket.name+"'");
    var splitCommand = command.split(" ");
    if (splitCommand[0] == "who") {
      console.log("[SERVER] Responding to 'who' request from '"+socket.name+"'");
      var channelMembershipArray = [];
      console.log("[SERVER COMMAND] Checking channel #"+currentChannel);
      for (var key in channelMembership[currentChannel]) {
        console.log("[SERVER COMMAND] Iterating user "+channelMembership[currentChannel][key].userName);
        channelMembershipArray.push(channelMembership[currentChannel][key].userName);
      };
      console.log("[SERVER COMMAND] Broadcasting user list for #"+currentChannel+" to socket.id "+socket.id+" with data ( "+channelMembershipArray.toString()+" )");
      ioMain.to(socket.id).emit('chat status', { statusType: "WHO", statusMessage: "Current users of #"+currentChannel+" are ( "+channelMembershipArray.toString()+" )"});
      //socket.broadcast.to(socket.id).emit('chat status', "Current users of #"+currentChannel+" are ( "+channelMembershipArray.toString()+" )");
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

    console.log("[JOIN] Adding user "+userName+" to channel #"+channel);
    addUserToChannel(userName, channel, socket.id, function(err) {
      if (err) return console.log("[JOIN] Error adding user to channel: "+err);
      getChannelUsersArray(channel, function(err, channelUsersArray) {
        if (err) {
          console.log("[JOIN] Error getting channel users: "+err);
        } else {
          var userListData = {
            userList: channelUsersArray
          }
          console.log("Sending userlist update!");
          ioMain.emit("userlist update", userListData);
        };
      });
    });

    console.log("Socket id: "+socket.id);
    console.log("[JOIN] "+userName+" has joined channel #"+channel);
    console.log("[JOIN] Generating new master key pair.");

    // Remote this later when we're caching private keys and using events to kick this off
    generateMasterKeyPair(function(err, masterKeyPair) {
      updateMasterKeyPairForAllUsers(masterKeyPair, function(err) {
        if (err) { console.log("[JOIN] Error encrypting master key for all users: "+err); };
        console.log("[JOIN] Encrypted master key for all users!");
      });
    });

    addUserIfNotExist(userName, function(err) {
      if (err) { return console.log("Error checking user: "+err); };
      console.log("[JOIN] User check complete");
      User.findOne({ userName: userName }, function(err, user, count) {
        if (user.encryptedMasterPrivKey) {
          console.log("[JOIN] User has master key, emitting ready to client");
          //io.emit('new master key');
        } else {
          console.log("[JOIN] User does not have master key, regenerating for all users");
          generateMasterKeyPair(function(err, masterKeyPair) {
            updateMasterKeyPairForAllUsers(masterKeyPair, function(err) {
              if (err) { console.log("[JOIN] Error encrypting master key for all users: "+err); };
              console.log("[JOIN] Encrypted master key for all users!");
            });
          });
        };
      });
    });
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
    if (typeof socket.id !== 'undefined') {
      if (typeof channelMembership === 'undefined') {
        console.log("[DISCONNECT] Channel Membership has not been created");
      } else {
        disconnectUser(socket.id, function(err, userName) {
          if (err) return console.log("Error disconnecting user: "+err);
          console.log("User "+userName+" disconnected");
        });
      }
    } else {
      console.log("[DISCONNECT] Socket is undefined");
    };
  });
});

function disconnectUser(socketId, callback) {
  if (typeof socketMembership === 'undefined' || typeof socketMembership[socketId] === 'undefined') {
    callback("Could not find user with socketId '"+socketId+"' in membership");
  } else {
    var userName = socketMembership[socketId].userName;
    removeUserFromAllChannels(socketId, function(err, userName) {
      if (err) {
        return console.log("Error removing user "+userName+" from all channels");
        callback(err);
      } else {
        sendUserListUpdate("general", function(err) {
          console.log("[JOIN] Error getting channel users: "+err);
        });
        // Should only send this to the channels the user has parted from
        var statusMessage = userName+" has left the channel";
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
  Object.keys(channelMembership).forEach(function(channelIndex) {
    Object.keys(channelMembership[channelIndex]).forEach(function(userIndex) {
      if (channelMembership[channelIndex][userIndex].socketId === socketId) {
        userName = channelMembership[channelIndex][userIndex].userName;
        delete channelMembership[channelIndex][userIndex];
      };
    });
  });
  callback(null, userName);
};

start();

function start() {
  // If there is no keypair generated generate one and encrypt it to each user using their public key
  bootstrapUsers(function(err) {
    if (err) { return console.log("Error bootstrapping users: "+err); }
    console.log("[START] Done bootstrapping users");
    KeyPair.findOne({ type: 'master'}, function(err, masterKeyPair) {
      if (typeof masterKeyPair === 'undefined' || masterKeyPair === null) {
        console.log("[START] Master keyPair not found, creating new one");
        generateMasterKeyPair(function(err, masterKeyPair) {
          updateMasterKeyPairForAllUsers(masterKeyPair, function(err) {
            if (err) { console.log("[START] Error encrypting master key for all users: "+err); };
            console.log("[START] Encrypted master key for all users!");
          });
        });
      } else {
        checkMasterKeyPairForAllUsers(function(err, response) {
          if (err) { console.log("[START] Error checking master key for all users: "+err); };
          if (response == 'update') {
            generateMasterKeyPair(function(err, masterKeyPair) {
              console.log("[START] New master keyPair generated...");
              updateMasterKeyPairForAllUsers(masterKeyPair, function(err) {
                if (err) { return console.log("[START] Error encrypting master key for all users: "+err); };
                console.log("[START] Encrypted master key for all users!");
              });
            });
          } else if (response == 'ok') {
            //console.log("All users have master key");
            //io.emit('new master key', masterKeyPair);
          }
        });
        console.log("[START] Using existing master keyPair version: "+masterKeyPair.version);
        //io.emit('new master key', masterKeyPair);
      };
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

//routes.keys.on('pubkey updated', function(data) {
//  console.log("[EVENT] pubkey has been updated");
//});

function generateMasterKeyPair(callback) {
  generateKeyPair(2048, 'master keypair', 'pipo', function(err, newMasterKeyPair) {
    if (err) {
      callback(err, null);
    } else {
      // Should not be saving the keypair here eventually
      new KeyPair({
        type: 'master',
        pubKey: newMasterKeyPair.pubKey,
        privKey: newMasterKeyPair.privKey,
      }).save( function(err, masterKeyPair, count) {
        console.log("Created and saved new master keyPair");
        callback(null, newMasterKeyPair);
      });
    };
  })
}

function updateMasterKeyPairForAllUsers(masterKeyPair, callback) {
  User.find({}, function(err, users, count) {
    async.each(users, function(user, asyncCallback) {
      updateMasterKeyPairForUser(user, masterKeyPair, function(err) {
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
  User.find({}, function(err, users, count) {
    users.forEach( function(user) {
      if (user.encryptedMasterPrivKey) {
        //console.log(user.userName+" has encrypted private key");
        return callback(null, 'ok');
      } else {
        return callback(null, 'update');
      };
    });
    return callback(err, 'error');
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
  var channelUsersArray = [];
  for (var key in channelMembership[channel]) {
    channelUsersArray.push(channelMembership[channel][key].userName);
  };
  console.log("Members in #"+channel+" are ( "+channelUsersArray.toString()+" )");
  return callback(null, channelUsersArray);
};

function addUserToChannel(userName, channel, socketId, callback) {
  if (typeof channelMembership[channel] === 'undefined' || channelMembership[channel] === null) {
    channelMembership[channel] = [];
    channelMembership[channel].push({userName: userName, socketId: socketId});
    console.log("[JOIN] User "+userName+" joining channel "+channel+" and channelMembership is NULL");
    callback(null);
  } else if(userName in channelMembership[channel]) {
    console.log("User "+userName+" is already in channel #"+channel);
    callback(null);
  } else {
    channelMembership[channel].push({userName: userName, socketId: socketId});
    console.log("[JOIN] Adding user "+userName+" to channel #"+channel);
    callback(null);
  };
};

function removeUserFromChannel(userName, channel, callback) {
  if (typeof ChannelMembership[channel] !== 'undefined' && channelMembership[channel] !== null) {
    delete channelMembership[channel][userName]
  } else {
    console.log("channel membership is undefined");
  }
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

function updateMasterKeyPairForUser(user, masterKeyPair, callback) {
  //console.log("Updating master keyPair for "+user.userName);
  //console.log("[DEBUG] (updateMasterKeyPairForUser) user.pubKey: "+user.pubKey);
  //console.log("[DEBUG] (updateMasterKeyPairForUser) masterKeyPair.privKey: "+masterKeyPair.privKey);
  if (user.pubKey) {
    var pubKey = openpgp.key.readArmored(user.pubKey).keys[0];
    var masterPrivKey = openpgp.key.readArmored(masterKeyPair.privKey).keys[0];
    masterPrivKey.decrypt('pipo');
    openpgp.encryptMessage(pubKey, masterKeyPair.privKey).then(function(encKey) {
      user.encryptedMasterPrivKey = encKey;
      user.masterPubKey = masterKeyPair.pubKey;
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
  openpgp.generateKeyPair(options).then(function(keyPair) {
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
