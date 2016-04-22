var EncryptionManager = require('./encryption');
var SocketServer = require('../socketServer');
var Chat = require('../../models/chat');

function NotifyManager() {
  this.sendToChat = function(data) {
    var message = data.message;
    var chatId = data.chatId;
    var socket = data.socket;
    var signingKeyManager = data.signingKeyManager;

    Chat.getPubKeys(chatId, function(keyRing) {
      // encrypt message to users in chat
      EncryptionManager.encryptChatMessage(keys, signingKeyManager, message, function(err, encryptedMessage) {
        var messageData = {
          chatId: chatId,
          pgpMessage: encryptedMessage,
          socket: socket
        };

        // emit message to users in chat using onMessage
        SocketServer.onMessage(messageData);

      })
    })
  }
};

module.exports = new NotifyManager();
