var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var bcrypt = require('bcrypt-nodejs');
var md5 = require('md5');
var Room = require('./room')

var userSchema = new Schema({
  userName: { type: String },
  userNameLowerCase: { type: String },
  fullName: { type: String },
  title: { type: String },
  email: { type: String },
  emailHash: { type: String },
  publicKey: { type: String },
  socketIds: [{ type: String }],
  membership: {
    rooms: [{
      _room: { type: mongoose.SchemaTypes.ObjectId, ref: "Room" },
      active: { type: Boolean, default: false },
      lastSeen: { type: Date },
      accessLevel: { type: String, default: 'none' }
    }],
    _autoJoin: [{ type: mongoose.SchemaTypes.ObjectId, ref: "Room" }],
    _currentRooms: [{ type: mongoose.SchemaTypes.ObjectId, ref: "Room" }]
  },
  masterKeyPair: {
    // masterKey: [{ type: mongoose.SchemaTypes.ObjectId, ref: "KeyPair" }],
    // latestId: { type: String },
    id: { type: Number },
    publicKey: { type: String },
    privateKey: { type: String },
    encryptedPrivateKey: { type: String }
  }
});

userSchema.statics.create = function createUser(userData, callback) {
  console.log("[USER] Creating user with userName: "+userData.userName+" userNameLowerCase: "+userData.userName.toLowerCase());
  new this({
    userName: userData.userName,
    //TODO: Is there a better way to find users case insensitive?
    userNameLowerCase: userData.userName.toLowerCase(),
    publicKey: userData.publicKey
  }).save(callback);
};

/**
 * Authenticates or creates a new user
 * @param data
 * @param callback
 */
userSchema.statics.authenticateOrCreate = function authOrCreate(data, callback) {
  console.log("[USER] authenticateOrCreate");
  var self = this;
  if (typeof data != 'object' || !Object.keys(data).length) {
    return callback(new Error("No user data included in request"));
  }
  if (!data.userName) {
    return callback(new Error("userName is required"));
  }
  if (!data.publicKey) {
    return callback(new Error("publicKey is required"));
  }
  if (!data.signature) {
    //TODO: Check signature
    //return callback(new Error("signature is required"))
  }
  this.findOne({userName: data.userName}).populate('membership.rooms._room').populate('membership._autoJoin').exec(function(err, user) {
    if (err) {
      return callback(err);
    }
    if (!user) {
      console.log("[USER AUTHENTICATEORCREATE] User '"+data.userName+"' not found so creating");
      console.log("[DEBUG] User did not exist so creating user with data: "+ data);
      data.userNameLowerCase = data.userName.toLowerCase();
      return self.create(data, callback);
    }
    if (user) {
      console.log("[USER] Found user '"+data.userName+"'");
      //console.log("[USER] user.publicKey: "+user.publicKey);
      // TODO: Need to change all references to publicKey
      //console.log("[USER] data.publicKey: "+data.publicKey);
      if ( user.publicKey == data.publicKey ) {
        console.log("[USER] User '"+data.userName+"' has a public key that matches userName");
        //TODO: Check signature
        return callback(null, user);
      }
      else {
        return callback(new Error("userName and publicKey mismatch"));
      }
    }
  });
};

userSchema.statics.setEmail = function setEmail(data, callback) {
  var username = data.username;
  var email = data.email;
  var emailHash = this.generateEmailHash(email);
  this.findOne({ userName: username }).exec(function(err, user) {
    if (err) { return callback(err) }
    user.email = email;
    user.emailHash = emailHash;
    user.save();
    return callback(null);
  })
};

userSchema.statics.addAutoJoin = function addAutoJoin(data, callback) {
  var userName = data.userName;
  var roomName = data.roomName;
  this.findOne({ userName: data.userName }).populate('membership._autoJoin').exec(function(err, user) {
    Room.findOne({ name: data.roomName }, function(err, room) {
      user.membership.autoJoin.push(room);
      user.save();
      return callback(err);
    })
  })
};

userSchema.statics.removeAutoJoin = function removeAutoJoin(data, callback) {
  var userName = data.userName;
  var roomName = data.roomName;
  this.findOne({ userName: userName }).populate('membership._autoJoin').exec(function(err, user) {
    Room.findOne({ name: roomName }, function(err, room) {
      user.membership.autoJoin.pull(room);
      user.save();
      return callback(err);
    })
  })
};

/*
 * Get the list of rooms that a user is a member of or able to join
 */
userSchema.statics.availableRooms = function getRoomsForMember(data, callback) {
  var userName = data.userName;
  this.findOne({ userName: userName }, function(err, user) {
    Room.find({ $or: [ { members: user }, { membershipRequired: false } ] }, function(err, rooms) {
      if (err) {
        return callback(err, { rooms: null });
      }
      if (!rooms) {
        console.log("No rooms found for member");
        return callback(null, { rooms: null });
      }
      console.log("Found rooms for member " + userName + " : " + Object.keys(rooms).toString());
      return callback(null, { rooms: rooms });
    })
  })
};

/*
 * Get users email hash
 * TODO: This may should be a generic getter to which you pass the field that you want to get
 */
userSchema.statics.getEmailHash = function getEmailHash(data, callback) {
  var username = data.username;
  this.findOne({ userName: username }, function(err, user) {
    if (err) { return callback(err, null) }
    return callback(null, user.emailHash);
  })
};

userSchema.statics.getAllUsers = function getAllUsers(data, callback) {
  var userlist = {};
  this.find({}, function(err, users) {
    if (err) { return callback(err, null) }
    users.forEach(function(user) {
      console.log("Looping user ", user.userName);
      userlist[user.userName] = { fullName: user.fullName, email: user.email, emailHash: user.emailHash, title: user.title };
    })
    return callback(null, userlist);
  })
};

// TODO: Decide if these are needed still
userSchema.statics.addUserIfNotExists = function addUserIfNotExist(userName, callback) {
  var User = require('./models/user.js');
  this.findOne({ userName: userName }, function(err, user) {
    if (err) { return callback(err); };
    if (typeof user === 'undefined' || user === null) {
      console.log("No user found in DB with userName "+userName);
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

userSchema.statics.getMasterKeyPair = function getMasterKeyPair(userName, room, callback) {
  this.findOne({ userName: userName }, function(err, user) {
    if (err) {
      return callback(err);
    } else if (user == null) {
      return callback("No user found with this userName");
    } else {
      // TODO: Master keys need to be stored per room in user
      //console.log("Returning masterKeyPair: "+JSON.stringify(user.masterKeyPair));
      console.log("[USER] (getMasterKeyPair) Returning masterKeyPair.id: "+user.masterKeyPair.id);
      return callback(null, user.masterKeyPair);
    }
  });
};

userSchema.statics.findBySocketId = function findUserBySocketId(socketId, callback) {
  this.findOne({ socketIds: socketId }, function(err, user) {
    if (err) {
      return callback(err);
    } else if (user == null) {
      return callback("No user found with this socketId");
    } else {
      return callback(null, user);
    };
  });
};

userSchema.statics.disconnect = function disconnectUser(socketId, callback) {
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

userSchema.methods.generateEmailHash = function(emailAddress) {
  return md5(emailAddress);
};

userSchema.methods.generateHash = function(publicKey) {
  return bcrypt.hashSync(publicKey, bcrypt.genSaltSync(8), null);
};

userSchema.methods.checkPublicKey = function(publicKey) {
  return bcrypt.CompareSync(publicKey, this.local.publicKey);
};

module.exports = mongoose.model('User', userSchema);
