var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var logger = require('../../config/logger');
var Message = require('./message');

var chatSchema = new Schema({
  type: { type: String },
  name: { type: String },
  topic: { type: String, default: 'Default topic' },
  group: { type: String, default: 'GRP' },
  chatHash: { type: String },
  _participants: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User" }],
  _messages: [{ type: mongoose.SchemaTypes.ObjectId, ref: "Message" }]
});


chatSchema.statics.join = function join(chat, callback) {
  // Ensure that the user is allowed to join this chat
    // Need to do something with signature of the user that created the chat
    // Should sign the addition of the user to the chat
    // Would use this signature when a user sends a message to one of the other users
    // in the chat. How the heck do we do this? :)
  // Join the socket namespace for this chat

  //
};


/*
 * Sanatize a Chat object for sending to the client
*/
chatSchema.statics.sanatize = function sanatize(chat, callback) {
  var self = this;
  var callback = callback;
  var chatId = chat.chatHash;

  logger.debug("Sanatizing chat: ", chat._id.toString());

  var participantIds = [];
  var messagesArray = [];

  if (chat._participants.length > 0) {
    logger.debug("[Chat.sanatize] We have " + chat._participants.length + " participants");
    chat._participants.forEach(function(participant) {
      participantIds.push(participant._id.toString());
    })
  }

  if (!chat.chatHash) {
    return logger.error("[chat.sanatize] No chatHash!");
  }

  logger.debug("[Chat.sanatize] participantIds is: ",participantIds);

  var finish = function finish(callback) {
    var sanatizedChat = {
      id: chatId,
      topic: chat.topic,
      type: chat.type,
      group: chat.group,
      participants: participantIds,
      messages: messagesArray
    };

    logger.debug("[Chat.sanatize] Returning sanatized Chat: ", sanatizedChat.id.toString());

    return callback(sanatizedChat);
  };

  var messageCount = 0;
  if (chat._messages.length > 0) {
    chat._messages.forEach(function(message) {
      Message.sanatize(message, function(sanatizedMessage) {
        messagesArray.push(sanatizedMessage);
        messageCount++;
        if (chat._messages.length == messageCount) {
          finish(callback);
        }
      })
    })
  } else {
    finish(callback);
  }
};

module.exports = mongoose.model('Chat', chatSchema);
