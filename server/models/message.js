var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var logger = require('../../config/logger');

/*
 * Things to add...
 * Salt
 * MD5 Hash of Original Message
 *
 * These messages could still be changed at the server so this might should be
 * based on the admin certificate in some way. Short messages would be much easier
 * to brute force without a salt but the salt would also be stored so it makes this
 * difficult.
 */

var messageSchema = new Schema({
  date: { type: Date, default: new Date() },
  messageId: { type: String },
  type: { type: String },
  _room: { type: mongoose.SchemaTypes.ObjectId, ref: "room", index: true },
  _chat: { type: mongoose.SchemaTypes.ObjectId, ref: "chat", index: true },
  _fromUser: { type: mongoose.SchemaTypes.ObjectId, ref: "User" },
  _toUsers: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User", default: [] }],
  //_toChat: { type: mongoose.SchemaTypes.ObjectId, ref: "Chat" },
  encryptedMessage: { type: String }
});


messageSchema.statics.get = function get(data, callback) {
  var self = this;
  var chatId = data.chatId;
  var type = data.type;

  if ( !type ){
    logger.error("[message.getMessages] No type provided");
    return callback("Must provide roomId or chatId", null);
  }

  var pages = data.pages || 1;
  var page = data.page || 0;
  var referenceMessageId = data.referenceMessageId;
  var messagesPerPage = data.messagesPerPage;

  if (referenceMessageId) {
    logger.debug("[message.getMessages] Getting messages using referenceMessageId '" + referenceMessageId + "'");
    if (type == 'room') {
      mongoose.model('Message').findOne({ _room: chatId, messageId: referenceMessageId }, function(err, message) {
        mongoose.model('Message').find({ _room: chatId, date: { $lt: message.date } })
          .sort('-_id')
          .limit(pages * messagesPerPage)
          .exec(function(err, messages) {
            return callback(err, messages);
          })
      });
    } else if (type == 'chat') {
      mongoose.model('Message').findOne({ _chat: chatId, messageId: referenceMessageId }, function(err, message) {
        mongoose.model('Message').find({ _chat: chatId, date: { $lt: message.date } })
          .sort('-_id')
          .limit(pages * messagesPerPage)
          .exec(function(err, messages) {
            return callback(err, messages);
          })
      });
    }
  } else {
    logger.debug("[message.getMessages] No referenceMessageId provided");
    if (type == 'room') {
      mongoose.model('Message')
        .find({ _room: chatId })
        .sort('-_id')
        .skip(page * messagesPerPage)
        .limit(pages * messagesPerPage)
        .exec(function(err, messages) {
          return callback(err, messages);
        });
    } else if (type == 'chat') {
        mongoose.model('Message')
          .find({ _chat: chatId })
          .sort('-_id')
          .skip(page * messagesPerPage)
          .limit(pages * messagesPerPage)
          .exec(function(err, messages) {
            return callback(err, messages);
          });
    }
  }
};


messageSchema.statics.sanatize = function sanatize(message, callback) {
  var toUsersArray = [];

  this.populate(message, { path: '_fromUser _toUsers' }, function(err, populatedMessage) {

    if (populatedMessage._toUsers.length > 0) {
      populatedMessage._toUsers.forEach(function(toUser) {
        toUsersArray.push(toUser._id.toString());
      });
    }

    // Consider changing messageId to id
    var sanatizedMessage = {
      date: populatedMessage.date,
      messageId: message.messageId,
      fromUser: populatedMessage._fromUser._id.toString(),
      toUsers: toUsersArray,
      //toChat: populatedMessage._toChat._id.toString(),
      encryptedMessage: populatedMessage.encryptedMessage
    };

    return callback(sanatizedMessage);
  });
};

messageSchema.statics.bulkSanatize = function bulkSanatize(messages, callback) {
  var self = this;
  var sanatizedMessages = [];
  var count = 0;

  if (!messages) {
    return callback(null);
  };

  messages.forEach(function(message) {
    self.sanatize(message, function(sanatizedMessage) {
      sanatizedMessages.push(sanatizedMessage);
      count++;

      if (count == messages.length) {
        finish();
      };
    });
  });

  var finish = function() {
    return callback(sanatizedMessages);
  };
};

module.exports = mongoose.model('Message', messageSchema);
