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

var configMD = require('./config/markdown.js');
var configDB = require('./config/database.js');

var KeyPair = require('./models/keypair.js');
var User = require('./models/user.js');
var allClients = [];

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
fs.readdirSync(routePath).forEach(function(file) {
  var route = routePath+file;
  console.log("Loading route: "+route);
  require(route)(app);
})

io.on('connection', function(socket) {
  console.log("[CONNECT] User connected!");
  socket.on('chat message', function(data) {
    var userName = data.userName;
    var pgpMessage = data.pgpMessage;
    console.log("[MSG] Server got chat message from "+userName);
    io.emit('chat message', data);
    console.log("[MSG] Server emitted chat message to users");
  });
  socket.on('join', function(data) {
    var userName = data.userName;
    socket.name = userName;
    client = socket;
    allClients.push(client);
    console.log("[JOIN] Confirming that user "+userName+" exists.");
    addUserIfNotExist(userName, function(err) {
      if (err) { return console.log("Error checking user: "+err); };
      console.log("[JOIN] User check complete");
      User.findOne({ userName: userName }, function(err, user, count) {
        if (user.encryptedMasterPrivKey) {
          console.log("[JOIN] User has master key, emitting ready to client");
          io.emit('master key ready');
        } else {
          console.log("[JOIN] User does not have master key, regenerating for all users");
          generateMasterKeyPair(function(err, masterKeyPair) {
            updateMasterKeyPairForAllUsers(masterKeyPair, function(err) {
              if (err) { console.log("[JOIN] Error encrypting master key for all users: "+err); };
              console.log("[JOIN] Encrypted master key for all users!");
              io.emit('master key ready', masterKeyPair);
            });
          });
        };
      });
    });
    var channel = data.channel;
    var statusMessage = client.name+" has joined channel #"+channel;
    console.log(statusMessage);
    var data = {
      statusType: "JOIN",
      statusMessage: statusMessage
    };
    io.emit('chat status', data);
  });
  socket.on('disconnect', function() {
    var client = allClients.indexOf(socket);
    console.log("User disconnected...");
    var statusMessage = client.name+" has left the channel...";
    console.log("client: "+client);
    var statusData = {
      statusType: "PART",
      statusMessage: statusMessage
    }
    io.emit('chat status', statusData);
    allClients.splice(client, 1);
  });
});

start();

function start() {
  // If there is no keypair generated generate one and encrypt it to each user using their public key
  bootstrapUsers(function(err) {
    if (err) { return console.log("Error bootstrapping users: "+err); }
    console.log("Done bootstrapping users");
    KeyPair.findOne({ type: 'master'}, function(err, masterKeyPair) {
      if (typeof masterKeyPair === 'undefined' || masterKeyPair === null) {
        console.log("Master keyPair not found, creating new one");
        generateMasterKeyPair(function(err, masterKeyPair) {
          updateMasterKeyPairForAllUsers(masterKeyPair, function(err) {
            if (err) { console.log("Error encrypting master key for all users: "+err); };
            console.log("Encrypted master key for all users!");
            io.emit('master key ready', masterKeyPair);
          });
        });
      } else {
        checkMasterKeyPairForAllUsers(function(err, response) {
          if (err) { console.log("Error checking master key for all users: "+err); };
          if (response == 'update') {
            generateMasterKeyPair(function(err, masterKeyPair) {
              updateMasterKeyPairForAllUsers(masterKeyPair, function(err) {
                if (err) { return console.log("Error encrypting master key for all users: "+err); };
                console.log("Encrypted master key for all users!");
                io.emit('master key ready', masterKeyPair);
              });
            });
          } else if (response == 'ok') {
            console.log("All users have master key");
            io.emit('master key ready', masterKeyPair);
          }
        });
        console.log("Using existing master keyPair version: "+masterKeyPair.version);
        io.emit('master key ready', masterKeyPair);
      };
    });
  });
};

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
        console.log("Update master key process for "+user.userName+" done...");
      });
    }, function(err) {
        console.log("Generated encrypted master key for all users");
    });
  });
}

function checkMasterKeyPairForAllUsers(callback) {
  User.find({}, function(err, users, count) {
    users.forEach( function(user) {
      if (user.encryptedMasterPrivKey) {
        console.log(userName+" has encrypted private key");
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
        console.log("User "+userName+" exists.");
        asyncCallback(null);
      }
    });
  }, function(err) {
      if (err) { return callback(err); };
      callback(null);
     }
  );
}

function addUserIfNotExist(userName, callback) {
  var User = require('./models/user.js');
  User.findOne({ userName: userName }, function(err, user) {
    if (typeof user === 'undefined' || user === null) {
      console.log("No user found in DB with username "+userName);
      new User({
        userName: userName,
      }).save( function(err, user, count) {
        if (err) { return console.log("Error adding user to DB: "+err); }
        console.log("Added user '"+userName+"' to DB");
      });
    } else {
      console.log("User exists");
    }
  });
};

function updateMasterKeyPairForUser(user, masterKeyPair, callback) {
  console.log("Updating master keyPair for "+user.usrName);
  if (user.pubKey) {
    openpgp.encryptMessage(user.pubKey, masterKeyPair.privKey).then(function(encKey) {
      user.encryptedMasterPrivKey = encKey;
      user.masterPubKey = masterKeyPair.pubKey;
      user.save( function( err, user, count ) {
        if (err) { return callback("Error saving encrypted master key for user "+user.userName) };
        console.log("Saved encrypted master key for user "+user.userName);
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
  console.log('listening on *:3030');
});
