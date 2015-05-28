var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var bcrypt = require('bcrypt-nodejs');

var userSchema = new Schema({
  userName: { type: String },
  userNameLowerCase: { type: String },
  fullName: { type: String },
  email: { type: String },
  pubKey: { type: String },
  socketIds: [{ type: String }],
  masterKey: {
    id: { type: Number },
    pubKey: { type: String },
    encPrivKey: { type: String }
  }
});

userSchema.statics.create = function createUser(userData, callback) {
  new this({
    userName: userData.username,
    //TODO: Is there a better way to find users case insensitive?
    userNameLower: userData.username.toLowerCase(),
    publicKey: userData.publicKey
  }).save(callback);
};

/**
 * Authenticates or creates a new user
 * @param data
 * @param callback
 */
userSchema.statics.authenticateOrCreate = function authOrCreate(data, callback) {
  var self = this;
  if (typeof data != 'object' || !Object.keys(data).length) {
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
  this.findOne({userName: data.username}).exec(function(err, user) {
    if (err) {
      return callback(err);
    }
    if (!user) {
      console.log("[USER AUTHENTICATEORCREATE] User '"+data.username+"' not found so creating");
      return self.create(data, callback);
    }
    if (user) {
      console.log("[USER] Found user '"+data.username+"'");
      if (user.publicKey === data.publicKey) {
        console.log("[USER] User '"+data.username+"' has a public key that matches username");
        //TODO: Check signature
        return callback(null, user);
      }
      else {
        return callback(new Error("username and publicKey mismatch"));
      }
    }
  });
};


// TODO: Decide if these are needed still
userSchema.statics.addUserIfNotExists = function addUserIfNotExist(userName, callback) {
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

userSchema.statics.findBySocketId = function findUserBySocketId(socketId, callback) {
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


userSchema.methods.generateHash = function(pubKey) {
  return bcrypt.hashSync(pubKey, bcrypt.genSaltSync(8), null);
};

userSchema.methods.checkPubKey = function(pubKey) {
  return bcrypt.CompareSync(pubKey, this.local.pubKey);
};

module.exports = mongoose.model('User', userSchema);
