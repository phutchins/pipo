var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var logger = require('../config/logger');

var chatSchema = new Schema({
  type: { type: String },
  _participants: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User" }],
  _messages: [{ type: mongoose.SchemaTypes.ObjectId, ref: "Message" }]
});

module.exports = mongoose.model('Chat', chatSchema);
