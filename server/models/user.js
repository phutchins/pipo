var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var bcrypt = require('bcrypt-nodejs');
var crypto = require('crypto');
var Room = require('./room');
var Chat = require('./chat');
var logger = require('../../config/logger');

/*
 * User Status Definitions
 * active - If the user is currently connected to the server or not
 * lastSeen - Last time the user was connected to the server (should be set on connection and disconnection?)
 *
 * User Membership Definitions
 * _favoriteRooms - Rooms that should be joined upon sign-in
 *
 * Questions?
 * rooms._room - Do we need to keep track of the room here for any reason?
 * - Joining a public room?
 *   If you're a member, you can leave the room and not auto join by not having it in _favoriteRooms
 *   If you want to autojoin a room that you're a member of, just join it and click favorite
 *
 *   If the room is public, simply join it
 *   Add to _favoriteRooms to set it to auto join
 */

var userSchema = new Schema({
  username: { type: String },
  usernameLowerCase: { type: String },
  fullName: { type: String },
  title: { type: String },
  email: { type: String },
  nonce: { type: String },
  active: { type: Boolean, default: false },
  lastSeen: { type: Date },
  emailHash: { type: String },
  publicKey: { type: String },
  socketIds: [{ type: String }],
  _chats: [{ type: mongoose.SchemaTypes.ObjectId, ref: "Chat" }],
  membership: {
    _currentRooms: [{ type: mongoose.SchemaTypes.ObjectId, ref: "Room", default: [] }],
    _favoriteRooms: [{ type: mongoose.SchemaTypes.ObjectId, ref: "Room", default: [] }]
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

  var username = userData.username;
  var email = userData.email;
  var fullName = userData.fullName;
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
    fullName: fullName,
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
  var AuthenticationManager = require('../js/managers/authentication');
  var nonce = data.nonce;
  var signature = data.signature;

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
  this.findOne({username: data.username}).populate('membership.rooms._room').populate('membership._autoJoin').exec(function(err, user) {
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

      if ( user.publicKey == data.publicKey ) {
        logger.debug("[USER] User '"+data.username+"' has a public key that matches username");

        // Check thte users signature on provided nonce
        // Need to get the nonce from the socket.io call above somewhere
        AuthenticationManager.verify(user.username, nonce, signature, function(err, verified) {
          logger.debug("[user.authenticateOrCreate] Verifying user signature. Verified is '" + verified + "'");

          if (verified) {
            return callback(null, { user: user } );
          } else {
            return callback("Authentication failure", null);
          }
        });
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
  var self = this;
  var userlist = {};
  this.find({}, function(err, users) {
    if (err) { return logger.error("[GET ALL USERS] Error getting all users: ",err) }
    users.forEach(function(user) {
      self.sanatize(user, function(sanatizedUser) {
        userlist[user._id.toString()] =  sanatizedUser;
      });
    });
    return callback(userlist);
  })
};

userSchema.statics.sanatize = function sanatize(user, callback) {
  var favoriteRoomIds = [];

  if (user.membership._favoriteRooms.length > 0) {
    favoriteRoomIds = user.membership._favoriteRooms.map(function(room) {
      return room.id;
    });
  };

  var sanatizedUser = {
    id: user._id.toString(),
    username: user.username,
    active: user.active,
    publicKey: user.publicKey,
    fullName: user.fullName,
    email: user.email,
    emailHash: user.emailHash,
    title: user.title,
    membership: {
      favoriteRooms: favoriteRoomIds
    }
  };

  return callback(sanatizedUser);
};

userSchema.statics.buildUserNameMap = function buildUserNameMap(data, callback) {
  var userlist = data.userlist;
  var userNameMap = {};
  if (!userlist) {
    return callback(userNameMap);
  }

  Object.keys(userlist).forEach(function(key) {
    var user = userlist[key];
    userNameMap[user.username.toLowerCase()] = user.id;
  });

  return callback(userNameMap);
};


userSchema.statics.buildProfile = function buildProfile(data, callback) {
  var self = this;
  var user = data.user;

  this.sanatize(user, function(sanatizedUser) {
    logger.debug("[user.buildProfile] User profile built for " + user.username + ", returning profile.");
    return callback(sanatizedUser);
  });
};


/*
 * Set the user as active
 *
 * This is independent of channels. The user should have an active status and that combined
 * with the users user membership (should rename?) which kees track of which rooms the user
 * is currently joined in. We don't want to use the actual membership in the room object because
 * to leave the room, their permisison to join it would be removed. Should also track membership required
 * rooms and public rooms the same way.
 *
 * Should be set to TRUE when the user has active sockets
 * Should be set to FALSE after a user has had no active sockets for
 * a certain amount of time
 *
 * Should be used for online status and userlist
 */
userSchema.statics.setActive = function setActive(data, callback) {
  var userId = data.userId;
  var active = data.active;

  // Check this in this current context to see if we have the user we were passed
  logger.debug("[user.setActive] userId: " + userId + " active: " + active);

  this.findOne({ _id: userId }, function(err, user) {
    if (!user) {
      var err = "User not found";

      logger.error("[user.setActive] User not found");
      return callback(err);
    }

    user.active = active;
    user.save(function(err) {
      if (err) {
        var err = "Error saving user";

        logger.error("[user.setActive] Error while saving user after setting active");
        return callback(err);
      }
      logger.debug("[user.setActive] Set user active for '" + user.username + "' to '" + active + "'");
      return callback(null);
    });
  })
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

userSchema.statics.findByUsername = function(username, callback) {
  this.findOne({ username: username }, function(err, user) {
    if (!user) {
      logger.debug("[user.findByUsername] No user found");
      return callback(err, null);
    }

    if (user) {
      logger.debug("Found user '" + user.username + "'");
      return callback(err, user);
    }
  });
};

module.exports = mongoose.model('User', userSchema);
