var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = new Schema({
  username: { type: String, unique: true },
  publicKey: {type: String, unique: true },
  configuration: {
    trustedKeys: [String],
    signature: String
  }
});

userSchema.statics.create = function createUser(userData, callback) {
  new this({
    username: userData.username,
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
  this.findOne({username: data.username}).exec(function(err, user) {
    if (err) {
      return callback(err);
    }
    if (!user) {
      return self.create(data, callback);
    }
    if (user) {
      if (user.publicKey === data.publicKey) {
        //TODO: Check signature
        return callback(null, user);
      }
      else {
        return callback(new Error("username and publicKey mismatch"));
      }
    }
  });
};

module.exports = mongoose.model('User', userSchema);
