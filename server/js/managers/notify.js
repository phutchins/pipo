var EncryptionManager = require('./encryption');
var Chat = require('../../models/chat');
var Room = require('../../models/room');
var logger = require('../../../config/logger');

function NotifyManager() {
  this.sendToChat = function(data) {
    var message = data.message;
    var chatId = data.chatId;
    var socketServer = data.socketServer;
    var chatType = data.chatType;
    var signingKeyManager = data.signingKeyManager;

    logger.debug("[notify.sendToChat] chatType is: " + chatType);
    if (chatType == 'chat') {
      logger.debug("[notify.sendToChat] Getting pubkeys for Chat with id: " + chatId);
      Chat.getPubKeys(chatId, function(err, keyRing) {
        finish(keyRing, signingKeyManager);
      });
    }

    if (chatType == 'room') {
      logger.debug("[notify.sendToChat] Getting pubkeys for Room with id: " + chatId);
      Room.getPubKeys(chatId, function(err, keyRing) {
        finish(keyRing, signingKeyManager);
      });
    };

    var finish = function finish(keyRing, signingKeyManager) {
      // encrypt message to users in chat

      var keys = [];

      Object.keys(keyRing._kms).forEach(function(id) {
        keys.push(keyRing._kms[id]);
      });

      EncryptionManager.encryptChatMessage(keys, signingKeyManager, message, function(err, encryptedMessage) {
        if (err) {
          return logger.debug("[notify.sendToChat] Error encrypting message: " + err);
        };

        var messageData = {
          chatId: chatId,
          pgpMessage: encryptedMessage
        };

        // emit message to users in chat using onMessage
        logger.debug("[NotifyManager.sendToChat] Sending notification to a '" + chatType + "' with id '" + chatId + "'");

        if (chatType == 'chat') {
          return socketServer.onPrivateMessage(messageData);
        }

        if (chatType == 'room') {
          return socketServer.onMessage(messageData);
        }

        logger.debug("[NotifyManager.sendToChat] chatType was not during finish");
      })
    };
  }
};

module.exports = new NotifyManager();
