var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var logger = require('../config/logger');

var chatSchema = new Schema({
  type: { type: String },
  _participants: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User" }],
  _messages: [{ type: mongoose.SchemaTypes.ObjectId, ref: "Message" }]
});


/*
 * Sanatize a Chat object for sending to the client
*/
chatSchema.statics.sanatize = function sanatize(chat, callback) {
  logger.debug("Sanatizing chat: ", chat._id);

  var sanatizedChat = {
    participants: chat._participants.toObject(),
    messages: chat._messages.toObject()
  };

  logger.debug("[Chat.sanatize] Returning sanatized Chat: ", sanatizedChat);

  return callback(sanatizedChat);
};

module.exports = mongoose.model('Chat', chatSchema);
