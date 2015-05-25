var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var keyPairSchema = new Schema({
  type: { type: String },
  encryptedTo: { type: mongoose.SchemaTypes.ObjectId,ref: "User" },
  username: { type: String },
  privKey: { type: String },
  pubKey: { type: String },
  version: { type: Number, default: 0 }
});

module.exports = mongoose.model('KeyPair', keyPairSchema);
