var NotifyManager = require('./notify');
var logger = require('../../../config/logger');

function FileManager() {
  this.notifyNewFile = function(data) {
    var socketServer = data.socketServer;
    var pfile = data.pfile;
    var signingKeyManager = data.signingKeyManager;
    var chatId;

    // Create the message to be displayed
    var pfileMessage = "Hey, there is a file for you named '" + pfile.name + "'";

    // Notify the users that this file was encrypted to that they have a file waiting

    // - Should add a message to the appropriate chat with a clickable link
    //   - This link should open up a modal asking if the user wants to download encrypted or decrypt on reciept

    if ( !pfile.chatType ) {
      return logger.error("[FileManager.notifyNewFile] No chatType specified");
    };

    // These both get the chatId from teh same place. Need to merge chat and room and collapse this code.
    if (pfile.chatType == 'room') {
      logger.debug("[FileManager.notifyNewFile] Type is room");
      chatId = pfile.toChatId;
      logger.debug("[FileManager.notifyNewFile] pfile.toRoom.id: " + pfile.toRoom.id);
      logger.debug("[FileManager.notifyNewFile] chatId: " + chatId);
    }

    if ( pfile.chatType == 'chat') {
      logger.debug("[FileManager.notifyNewFile] Type is chat");
      chatId = pfile.toChatId;
      logger.debug("[FileManager.notifyNewFile] pfile.toRoom.id: " + pfile.toRoom.id);
      logger.debug("[FileManager.notifyNewFile] chatId: " + chatId);
    }

    var messageData = {
      chatType: pfile.chatType,
      chatId: chatId,
      message: pfileMessage,
      socketServer: socketServer,
      signingKeyManager: signingKeyManager
    };

    logger.debug("[FileManager.notifyNewFile] Sending call to NotifyManager with chatId: ", chatId);

    // Server should let users of a chat know that a file has been uploaded (in case the user fails to notify after success upload)
    NotifyManager.sendToChat(messageData);
  }
};

module.exports = new FileManager();
