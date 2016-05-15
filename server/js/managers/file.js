var NotifyManager = require('./notify');
var EncryptionManager = require('./encryption');
var logger = require('../../../config/logger');
var PFile = require('../../models/pfile');
var ss = require('socket.io-stream');

function FileManager() {
  this.notifyNewFile = function(data) {
    var socketServer = data.socketServer;
    var pfile = data.pfile;
    var signingKeyManager = data.signingKeyManager;
    var chatId;

    // Create the message to be displayed
    var pfileMessage = "Hey, there is a file for you named '<a id='" + pfile.id + "' class='pfile-link'>" + pfile.name + "</a>'";

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
      pfileId: pfile.id,
      chatId: chatId,
      message: pfileMessage,
      socketServer: socketServer,
      signingKeyManager: signingKeyManager
    };

    logger.debug("[FileManager.notifyNewFile] Sending call to NotifyManager with chatId: ", chatId);

    // Server should let users of a chat know that a file has been uploaded (in case the user fails to notify after success upload)
    NotifyManager.sendToChat(messageData);
  }

  this.handleChunk = function handleChunk(data) {
    var self = this;
    var socketServer = data.socketServer;
    var fileBuffer = data.buffer;
    var fileName = data.fileName;
    var systemUser = EncryptionManager.systemUser;
    var chatType = data.chatType;
    var chunkNumber = data.chunkNumber;
    var chunkCount = data.chunkCount;

    logger.debug("[socketServer.onSendFile] Got onSendFile!");
    logger.debug("[socketServer.onSendFile] chatType is: ", chatType, " file: " + fileName + " chunk " + chunkNumber + " out of " + chunkCount + " chunks.");

    // Add chunk to PFile (if it doesn't exist yet, add should create it (should confirm that it is the same user somehow)

    // Create PFile object to keep track of the file
    // This way all members of that chat can list files that they have access to.
    PFile.addChunk(data, function(err, pfile) {
      var pfile = pfile;

      if (err) {
        console.log("[socketServer.onSendFile] Error saving file: " + err);
        // Notify the client of an error here
      }

      if (!pfile) {
        return console.log("[socketServer.onSendFile] No pfile returned... Something bad happened.");
      }

      // Should create some sort of timer to make sure all chunks get uploaded in a reasonable time and notify the user of fail if not
      // then remote the bad data

      if (pfile && pfile.isComplete) {
        // Get the pipo user (should move this to an init method in encryption manager and save it to state)
        EncryptionManager.buildKeyManager(systemUser.publicKey.toString(), systemUser.privateKey.toString(), 'pipo', function(err, pipoKeyManager) {
          self.notifyNewFile({ signingKeyManager: pipoKeyManager, socketServer: socketServer, pfile: pfile });
        });
      };
    });
  };

  this.handleGetFile = function handleGetFile(data) {
    // Get the user info from the socket
    var pfileId = data.id;
    var socket = data.socket;

    logger.debug("[socketServer.onGetFile] Getting pFile with ID: " + pfileId);

    // Get the pFile
    PFile.get(pfileId, function(err, pfile) {
      var chunkCount = pfile.chunkCount;
      var currentChunk = 0;

      // Determine if the user actually has access to the requested file and that it exists

      // Get the number of chunks and get the file buffer for each one sending it back to the client
      while (currentChunk < chunkCount) {
        var ssChunkStream = ss.createStream();

        pfile.getChunk(currentChunk, function(err, chunkStream) {
          currentChunk++;
          var fileData = {
            id: pfile.id
          }

          // Send the file to the user with socket.emit
          logger.debug("[socketServer.onGetFile] Sending file chunk with ID '" + pfile.id + "' to user '" + socket.user.username + "'");
          ss(socket).emit('file', ssChunkStream, fileData);
          ssChunkStream.pipe(chunkStream);
        });
      };
    });
  };
};

module.exports = new FileManager();
