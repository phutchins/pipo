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
});


// TODO:
// Need to move adding messages to private chats and grab them all with Message.get
// Need to check everywhere for getChat and change to Chat.get


chatSchema.statics.join = function join(chat, callback) {
  // Ensure that the user is allowed to join this chat
    // Need to do something with signature of the user that created the chat
    // Should sign the addition of the user to the chat
    // Would use this signature when a user sends a message to one of the other users
    // in the chat. How the heck do we do this? :)
  // Join the socket namespace for this chat

  //
};


chatSchema.statics.create = function create(data, callback) {
  var newChat = new Chat({
    _participants: data.participantIds,
    chatHash: data.chatHash,
    type: data.type,
  });

  // Save it
  newChat.save(function(err, savedChat) {
    logger.debug("[getChat] saved chat: ",savedChat._id);
    return callback(err, savedChat);
  });
};


chatSchema.statics.get = function getByHash(hash, callback) {
  var self = this;

  // How do we find the chat using the participants (or some other thing)?
  var chatId = data.chatId;
  var chatHash = data.chatHash;
  var participantIds = data.participantIds;

  logger.debug("[chat.get] Got socket 'getChat' request");

  if (chatHash) {
    logger.debug("[chat.get] Getting chat by chat hash: '" + chatHash + "'");

    mongoose.model('Chat').findOne({ chatHash: chatHash }).populate('_participants').exec(function(err, chat) {
      return callback(err, chat)
    });
  };
};


chatSchema.statics.getSanatied = function getSanatized(hash, callback) {


}


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
