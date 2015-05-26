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

userSchema.methods.generateHash = function(pubKey) {
  return bcrypt.hashSync(pubKey, bcrypt.genSaltSync(8), null);
};

userSchema.methods.checkPubKey = function(pubKey) {
  return bcrypt.CompareSync(pubKey, this.local.pubKey);
};

module.exports = mongoose.model('User', userSchema);
