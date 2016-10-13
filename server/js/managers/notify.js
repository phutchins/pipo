'use strict';

var EncryptionManager = require('./encryption');
var Chat = require('../../models/chat');
var Room = require('../../models/room');
var logger = require('../../../config/logger');

function NotifyManager(managers, options) {
  if (!(this instanceof NotifyManager)) {
    return new NotifyManager(managers, options);
  }

  this.encryptionManager = managers.encryptionManager;
  this._opitons = options || {};
}

NotifyManager.prototype.sendToChat = function(data) {
  var self = this;
  var message = data.message;
  var chatId = data.chatId;
  var fromUserId = self.encryptionManager.systemUser.id;
  var socketServer = data.socketServer;
  var chatType = data.chatType;
  var signingKeyManager = data.signingKeyManager;
  var err = data.err;

  logger.debug("[notify.sendToChat] chatType is: " + chatType);
  if (chatType === 'chat') {
    logger.debug("[notify.sendToChat] Getting pubkeys for Chat with id: " + chatId);
    Chat.getPubKeys(chatId, function(err, keyRing) {
      finish(keyRing, signingKeyManager);
    });
  }

  if (chatType === 'room') {
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

    // Should break this out into its own method but need to expose it
    var sendMessage = function(err, encryptedMessage) {
      if (err) {
        return logger.debug('[notify.sendToChat] Error encrypting: %s', err);
      }

      var messageData = {
        chatId: chatId,
        pgpMessage: encryptedMessage
      };

      // emit message to users in chat using onMessage
      logger.debug('[NotifyManager.sendToChat] Sending notification to a ' +
                   '%s with id %s', chatType, chatId);

      var socket = {
        user: socketServer.namespace.userMap[fromUserId]
      };

      console.log('encryptionManager.systemUser is: %j', self.encryptionManager.systemUser);
      console.log('Looking for user %s socket', fromUserId);
      console.log('userMap is: %j', socketServer.namespace.userMap);

      if (chatType === 'chat') {
        return socketServer.onPrivateMessage(socket, messageData);
      }

      if (chatType === 'room') {
        return socketServer.onMessage(socket, messageData);
      }

      logger.debug('[NotifyManager.sendToChat] chatType was not during finish');
    };

    var encryptParams = [
      keys,
      signingKeyManager,
      message
    ];

    //logger.debug('[notify.sendToChat] encrypt keys is: ', keys);
    //logger.debug('[notify.sendToChat] encrypt signingKeyManager is: ', signingKeyManager);

    self.encryptionManager.encryptChatMessage(keys, signingKeyManager, message, sendMessage);
  };
};

NotifyManager.prototype.sendToUser = function(data) {

};

module.exports = NotifyManager;
