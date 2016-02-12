var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var logger = require('../config/logger');

var privateChatSchema = new Schema({
  date: { type: Date, default: new Date() },
  _encryptedMessages: [{ type: mongoose.SchemaTypes.ObjectId, ref: "Message" }],
});

module.exports = mongoose.model('PrivateChat', privateChatSchema);
