var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = new Schema({
  userName: { type: String },
  pubKey: { type: String },
  encryptedMasterPrivKey: { type: String },
  masterPubKey: { type: String },
  access: { type: Array, default: [] }
});

module.exports = mongoose.model('User', userSchema);
