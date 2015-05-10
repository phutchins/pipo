var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var keyPair = new Schema({
  type: { type: String },
  encryptedTo: { type: mongoose.SchemaTypes.ObjectId,ref: "User" },
  privKey: { type: String },
  pubKey: { type: String },
  version: { type: Number, default: 0 }
});
