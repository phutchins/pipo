var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var logger = require('../config/logger');

var messageSchema = new Schema({
  date: { type: Date, default: new Date() },
  _user: { type: mongoose.SchemaTypes.ObjectId, ref: "User" },
  encryptedMessage: { Type: String }
});

module.exports = mongoose.model('Message', messageSchema);
