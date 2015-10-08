var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var bcrypt = require('bcrypt-nodejs');
var crypto = require('crypto');
var Room = require('./room');
var Chat = require('./chat');
var logger = require('../config/logger');

var userSchema = new Schema({
  username: { type: String },
  usernameLowerCase: { type: String },
  fullName: { type: String },
  title: { type: String },
  email: { type: String },
  emailHash: { type: String },
  publicKey: { type: String },
  socketIds: [{ type: String }],
  _chats: [{ type: mongoose.SchemaTypes.ObjectId, ref: "Chat" }],
  membership: {
    rooms: [{
      _room: { type: mongoose.SchemaTypes.ObjectId, ref: "Room" },
      active: { type: Boolean, default: false },
      lastSeen: { type: Date },
      accessLevel: { type: String, default: 'none' }
    }],
    _favoriteRooms: [{ type: mongoose.SchemaTypes.ObjectId, ref: "Room" }],
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
  var self = this;
  if (!userData || userData == null) {
    return callback("no userdata provided to create user", null);
  }
  if (!userData.username || !userData.publicKey || !userData.email) {
    return callback("Missing username, publickey or email", null);
  }

  logger.debug("[USER] Creating user with username: "+userData.username+" usernameLowerCase: "+userData.username.toLowerCase(),"email:",userData.email);
  logger.debug("[USER] userData is", userData);

  var username = userData.username;
  var email = userData.email;
  var emailHash = null;
  if (email) {
    emailHash = crypto.createHash('md5').update(email).digest('hex');
  }
  var usernameLowerCase = username.toLowerCase();
  var publicKey = userData.publicKey;
  var createUserCallback = callback;
  logger.debug("[USER] created emailHash",emailHash,"from email",email);

  var newUser = new this({
    username: username,
    email: email,
    emailHash: emailHash,
    usernameLowerCase: usernameLowerCase,
    publicKey: publicKey
  });

  mongoose.model('User').findOne({ username: username }, function(err, user) {
    if (!user) {
      logger.debug("[USER] Saving user...");
      newUser.save(function(err) {
        logger.debug("[USER] Saved user!");
        if (err) {
          return callback("error saving new user", null);
        }
        logger.debug("[USER] saved new user");
        mongoose.model('User').findOne({ username: username }, function(err, user) {
          return callback(null, {user: user, newUser: true});
        })
      })
    } else {
      return callback(null, {user: user, newUser: false});
    }
  })
};

/**
 * Authenticates or creates a new user
 * @param data
 * @param callback
 */
userSchema.statics.authenticateOrCreate = function authOrCreate(data, callback) {
  logger.debug("[USER] authenticateOrCreate");
  var self = this;
  if (typeof data != 'object' || !Object.keys(data).length || data == null) {
    return callback(new Error("No user data included in request"));
  }
  if (!data.username) {
    return callback(new Error("username is required"));
  }
  if (!data.publicKey) {
    return callback(new Error("publicKey is required"));
  }
  if (!data.signature) {
    //TODO: Check signature
    //return callback(new Error("signature is required"))
  }
  logger.debug("About to find user...");
  this.findOne({username: data.username}).populate('membership.rooms._room').populate('membership._autoJoin').exec(function(err, user) {
    logger.debug("done finding user");
    if (err) {
      logger.error("Error finding or creating user: ",err);
      return callback(err);
    }
    if (!user) {
      logger.debug("[USER] User '"+data.username+"' not found so creating");
      data.usernameLowerCase = data.username.toLowerCase();
      return self.create(data, callback);
    }
    if (user) {
      logger.debug("[USER] Found user '"+data.username+"'");
      // TODO: Need to change all references to publicKey
      if ( user.publicKey == data.publicKey ) {
        logger.debug("[USER] User '"+data.username+"' has a public key that matches username");
        //TODO: Check signature
        return callback(null, { user: user } );
      }
      else {
        return callback(new Error("username and publicKey mismatch"));
      }
    }
  });
};

userSchema.statics.setEmail = function setEmail(data, callback) {
  var username = data.username;
  var email = data.email;
  var emailHash = this.generateEmailHash(email);
  this.findOne({ username: username }).exec(function(err, user) {
    if (err) { return callback(err) }
    user.email = email;
    user.emailHash = emailHash;
    user.save();
    return callback(null);
  })
};

userSchema.statics.addAutoJoin = function addAutoJoin(data, callback) {
  var username = data.username;
  var roomName = data.roomName;
  this.findOne({ username: data.username }).populate('membership._autoJoin').exec(function(err, user) {
    Room.findOne({ name: data.roomName }, function(err, room) {
      user.membership.autoJoin.push(room);
      user.save();
      return callback(err);
    })
  })
};

userSchema.statics.removeAutoJoin = function removeAutoJoin(data, callback) {
  var username = data.username;
  var roomName = data.roomName;
  this.findOne({ username: username }).populate('membership._autoJoin').exec(function(err, user) {
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
userSchema.statics.availableRooms = function availableRooms(data, callback) {
  logger.debug("[user.availableRooms] Data: ", data);
  logger.debug("[user.availableRooms] Building available rooms list for user '" + data.userId + "'...");
  var userId = data.userId;
  // TODO: This may should just return room ids
  this.findOne({ _id: userId }).exec(function(err, user) {
    logger.debug("[user.availableRooms] Found user ",user.username," for which we are building the room list");
    Room.find({ $or: [ { _members: user._id }, { _admins: user._id }, { _owner: user._id }, { membershipRequired: false } ] }).populate('_members _admins _owner _subscribers _activeUsers _messages _messages._fromUser').exec(function(err, rooms) {
      if (err) {
        return callback(err, { rooms: null });
      }
      if (!rooms) {
        logger.debug("[user.availableRooms] No rooms found for member");
        return callback(null, { rooms: null });
      }
      logger.debug("[user.availableRooms] Found rooms for member " + user.username + " : " + Object.keys(rooms).toString());
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
  this.findOne({ username: username }, function(err, user) {
    if (err) { return callback(err, null) }
    return callback(null, user.emailHash);
  })
};

userSchema.statics.getAllUsers = function getAllUsers(data, callback) {
  var userlist = {};
  this.find({}, function(err, users) {
    if (err) { return logger.error("[GET ALL USERS] Error getting all users: ",err) }
    users.forEach(function(user) {
      userlist[user._id.toString()] = { id: user._id.toString(), username: user.username, publicKey: user.publicKey, fullName: user.fullName, email: user.email, emailHash: user.emailHash, title: user.title };
    })
    return callback(userlist);
  })
};

userSchema.statics.buildUserNameMap = function buildUserNameMap(data, callback) {
  var userlist = data.userlist;
  var userNameMap = {};
  if (!userlist) {
    return callback(userNameMap);
  }

  Object.keys(userlist).forEach(function(key) {
    var user = userlist[key];
    userNameMap[user.username] = user.id;
  });

  return callback(userNameMap);
};


userSchema.statics.buildProfile = function buildProfile(data, callback) {
  var user = data.user;

  var profile = {
    username: user.username,
  };

  logger.debug("[user.buildProfile] User profile built for " + user.username + ", returning profile.");
  return callback(profile);
};



// TODO: Decide if these are needed still
userSchema.statics.addUserIfNotExists = function addUserIfNotExist(username, callback) {
  var User = require('./models/user.js');
  this.findOne({ username: username }, function(err, user) {
    if (err) { return callback(err); };
    if (typeof user === 'undefined' || user === null) {
      logger.debug("No user found in DB with username "+username);
      new User({
        username: username,
      }).save( function(err, user, count) {
        if (err) { return logger.error("Error adding user to DB: "+err); }
        logger.debug("Added user '"+username+"' to DB");
        return callback(null);
      });
    } else {
      logger.debug("User exists");
      return callback(null);
    }
  });
};

userSchema.statics.getMasterKeyPair = function getMasterKeyPair(username, room, callback) {
  this.findOne({ username: username }, function(err, user) {
    if (err) {
      return callback(err);
    } else if (user == null) {
      return callback("No user found with this username");
    } else {
      // TODO: Master keys need to be stored per room in user
      logger.debug("[USER] (getMasterKeyPair) Returning masterKeyPair.id: "+user.masterKeyPair.id);
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
      var username = user.username;
      removeUserFromAllChannels(socketId, function(err, username) {
        if (err) {
          logger.error("[DISCONNECT USER] Error removing user "+username+" from all channels");
          return callback(err);
        }

        // Should only send this to the channels the user has parted from
        var statusMessage = user.username+" has left the channel";
        var statusData = {
          statusType: "PART",
          statusMessage: statusMessage
        }
        ioMain.emit('chat status', statusData);
        logger.info("[DISCONNECT] User "+username+" disconnected...");
        callback(null);
      });
    };
  });
};

userSchema.methods.generateEmailHash = function(emailAddress) {
  if (emailAddress && emailAddress !== '' && typeof emailaddress !== 'undefined') {
    return crypto.createHash('md5').update(emailAddress).digest('hex');
  } else {
    return null
  }
};

userSchema.methods.generateHash = function(publicKey) {
  return bcrypt.hashSync(publicKey, bcrypt.genSaltSync(8), null);
};

userSchema.methods.checkPublicKey = function(publicKey) {
  return bcrypt.CompareSync(publicKey, this.local.publicKey);
};

module.exports = mongoose.model('User', userSchema);
