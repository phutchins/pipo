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
    username: userData.username,
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

userSchema.methods.generateHash = function(pubKey) {
  return bcrypt.hashSync(pubKey, bcrypt.genSaltSync(8), null);
};

userSchema.methods.checkPubKey = function(pubKey) {
  return bcrypt.CompareSync(pubKey, this.local.pubKey);
};

module.exports = mongoose.model('User', userSchema);
