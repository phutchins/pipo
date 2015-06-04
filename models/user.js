var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var bcrypt = require('bcrypt-nodejs');

var userSchema = new Schema({
  userName: { type: String },
  userNameLowerCase: { type: String },
  fullName: { type: String },
  email: { type: String },
  publicKey: { type: String },
  socketIds: [{ type: String }],
  masterKey: {
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
  this.findOne({userName: data.userName}).exec(function(err, user) {
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

userSchema.statics.getMasterKeyPair = function getMasterKeyPair(userName, channel, callback) {
  this.findOne({ userName: userName }, function(err, user) {
    if (err) {
      return callback(err);
    } else if (user == null) {
      return callback("No user found with this userName");
    } else {
      // TODO: Master keys need to be stored per channel in user
      return callback(null, user.masterKey);
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


userSchema.methods.generateHash = function(publicKey) {
  return bcrypt.hashSync(publicKey, bcrypt.genSaltSync(8), null);
};

userSchema.methods.checkPublicKey = function(publicKey) {
  return bcrypt.CompareSync(publicKey, this.local.publicKey);
};

module.exports = mongoose.model('User', userSchema);
