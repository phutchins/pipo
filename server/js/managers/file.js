'use strict';

var NotifyManager = require('./notify');
var EncryptionManager = require('./encryption');
var logger = require('../../../config/logger');
var PFile = require('../../models/pfile');
var ss = require('socket.io-stream');
var fs = require('fs');
var crypto = require('crypto');

function FileManager(managers) {
  if (!(this instanceof FileManager)) {
    return new FileManager(managers);
  }
}

FileManager.prototype.init = function() {
  var managers = {
    fileManager: this
  };

  this.notifyManager = new NotifyManager(managers, {});
  this.socketServer = managers.socketServer;
  this.encryptionManager = managers.encryptionManager;
};

FileManager.prototype.notifyNewFile = function(data) {
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
  }

  chatId = pfile.toChatId;

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
};

// TODO: This should create a popup or something, not send message to the room...
FileManager.prototype.notifyError = function(data) {
  var err = data.err;
  var socketServer = data.socketServer;
  var pfile = data.pfile;
  var signingKeyManager = data.signingKeyManager;
  var fileName = data.fileName;
  var chatType = data.chatType;
  var chatId = data.chatId;

  // Create the message to be displayed
  // TODO: Should specify the user here...
  var pfileMessage = 'Sorry, there was an error while uploading ' + fileName + '. Error: ' + err;

  var messageData = {
    chatType: chatType,
    chatId: chatId,
    message: pfileMessage,
    socketServer: socketServer,
    signingKeyManager: signingKeyManager
  };

  NotifyManager.sendToChat(messageData);
};

FileManager.prototype.handleFileStream = function(fileStream, data, callback) {
  var self = this;

  logger.debug('[file.handleFileStream] Handling file stream');

  // Should add a way to track each users usage via file size in pfiles
  var dataDir = 'files/';
  var tmpFileName = crypto.randomBytes(16).toString('hex');

  // Write temp file first, then rename when done
  var tmpFile = fs.createWriteStream(dataDir + tmpFileName, { autoClose: true });

  var fileHash = crypto.createHash('rmd160').setEncoding('hex');
  var socketServer = data.socketServer;
  var fileName = data.fileName;
  logger.debug('this.encryptionManager.systemUser: ', this.encryptionManager.systemUser);
  var systemUser = this.encryptionManager.systemUser;
  var chatType = data.chatType;
  var chatId = data.toChatId;
  var chunkNumber = data.chunkNumber;
  var chunkCount = data.chunkCount;
  var tx = 0;

  // Report back with percentage of file received
  fileStream.on('data', function(chunkBuffer) {
    logger.debug('[socketServer.onBinarySocketConnection] Got data from stream...');

    fileHash.update(chunkBuffer);

    fileStream.write({rx: chunkBuffer.length / data.size});
  });

  // When the stream has ended,
  fileStream.on('end', function() {
    logger.debug('[socketServer.onBinarySocketConnection] fileStream ended');

    fileStream.write({ end: true });

    fileHash.end();

    var sysPubKey = self.systemUser.publicKey.toString();
    var sysPrivKey = self.systemUser.privateKey.toString();
    var sysUsername = 'pipo';

    // fileHash.on('finish', function() {
    this.encryptionManager.buildKeyManager(sysPubKey, sysPrivKey, sysUsername, function(err, pipoKeyManager) {
      logger.debug('[socketServer.handleFileStream] fileHash finsihed. Renaming temp file');

      var fileHashString = fileHash.read().toString('hex');

      // Rename tmp chunk to hash
      fs.rename(dataDir + tmpFileName, dataDir + fileHashString, function(err) {
        if (err) {
          var errorData = {
            err: err,
            chatType: chatType,
            fileName: fileName,
            chatId: chatId,
            socketServer: socketServer,
            signingKeyManager: pipoKeyManager
          };
          self.notifyError(errorData);
          return callback(err);
        }

        data.fileHash = fileHashString;
        data.encHash = fileHashString;

        PFile.addChunk(data, function(err, pfile) {
          logger.debug('[file.handleChunk] Returned from addChunk');

          if (err) {
            var errorData = {
              err: err,
              chatType: chatType,
              fileName: fileName,
              chatId: chatId,
              socketServer: socketServer,
              signingKeyManager: pipoKeyManager
            };
            logger.error('[file.handleFileStream] Error adding chunk to pfile: %s', err);
            self.notifyError(errorData);
            return callback(err);
          }

          logger.debug("[file.handleChunk] Callback called in PFile.addChunk");

          if (err) {
            logger.error("[file.handleChunk] Error getting keyManager: " + err);
            return callback(err);
          }

          if (err) {
            var errorData = {
              err: err,
              chatType: chatType,
              fileName: fileName,
              chatId: chatId,
              socketServer: socketServer,
              signingKeyManager: pipoKeyManager
            };

            self.notifyError(errorData);

            return logger.error("[file.handleChunk] Error saving file: " + err);
          }

          if (!pfile) {
            return logger.warning("[file.handleChunk] No pfile returned... Something bad happened.");
          }

          logger.debug("[file.handleChunk] About to try to send notification to clients...");

          // Should create some sort of timer to make sure all chunks get uploaded in
          // a reasonable time and notify the user of fail if not
          logger.debug('[file.handleChunk] pfile.isComplete is: %s', pfile.isComplete);

          if (pfile && pfile.isComplete) {
            logger.debug('PFile is complete!');
            // Get the pipo user (should move this to an init method in
            // encryption manager and save it to state)
            self.notifyNewFile({
              signingKeyManager: pipoKeyManager,
              socketServer: socketServer,
              pfile: pfile
            });
          }
        });
      });
    });
  });

  // Save the file stream to disk
  fileStream.pipe(tmpFile);
};

FileManager.prototype.handleChunk = function handleChunk(data) {
  var self = this;
  var socketServer = data.socketServer;
  var fileBuffer = data.buffer;
  var fileName = data.fileName;
  var systemUser = EncryptionManager.systemUser;
  var chatType = data.chatType;
  var chatId = data.toChatId;
  var chunkNumber = data.chunkNumber;
  var chunkCount = data.chunkCount;

  logger.debug("[file.handleChunk] Got onSendFile!");
  logger.debug("[file.handleChunk] chatType is: ", chatType, " file: " + fileName + " chunk " + chunkNumber + " out of " + chunkCount + " chunks.");

  // Add chunk to PFile (if it doesn't exist yet, add should create it (should confirm that it is the same user somehow)

  // Create PFile object to keep track of the file
  // This way all members of that chat can list files that they have access to.
  PFile.addChunk(data, function(err, pfile) {
    var addChunkErr = err;

    logger.debug("[file.handleChunk] Callback called in PFile.addChunk");
    EncryptionManager.buildKeyManager(self.systemUser.publicKey.toString(), self.systemUser.privateKey.toString(), 'pipo', function(err, pipoKeyManager) {
      if (err) {
        return logger.error("[file.handleChunk] Error getting keyManager: " + err);
      }

      if (addChunkErr) {
        var errorData = {
          err: addChunkErr,
          chatType: chatType,
          fileName: fileName,
          chatId: chatId,
          socketServer: socketServer,
          signingKeyManager: pipoKeyManager
        };

        self.notifyError(errorData);

        return logger.error("[file.handleChunk] Error saving file: " + addChunkErr);
      }

      if (!pfile) {
        return logger.warning("[file.handleChunk] No pfile returned... Something bad happened.");
      }

      logger.debug("[file.handleChunk] About to try to send notification to clients...");

      // Should create some sort of timer to make sure all chunks get uploaded in a reasonable time and notify the user of fail if not
      // then remote the bad data
      logger.debug('[file.handleChunk] pfile.isComplete is: %s', pfile.isComplete);

      if (pfile && pfile.isComplete) {
        logger.debug('PFile is complete!');
        // Get the pipo user (should move this to an init method in encryption manager and save it to state)
        self.notifyNewFile({ signingKeyManager: pipoKeyManager, socketServer: socketServer, pfile: pfile });
      };
    });
  });
};

FileManager.prototype.handleGetFile = function handleGetFile(data) {
  var self = this;
  // Get the user info from the socket
  var pfileId = data.id;
  var socket = data.socket;

  // Should this be this.binSocket = data... ?
  var binSocket = data.binSocket;
  this.binSocket = data.binSocket;

  if (!binSocket) {
    return logger.error('[fileManager.handleGetFile] binSocket is not defined!');
  }

  logger.debug("[socketServer.handleGetFile] Getting pFile with ID: " + pfileId);

  // Get the pFile
  PFile.get(pfileId, function(err, pfile) {
    var chunkCount = pfile.chunkCount;
    var currentChunk = 0;

    // Determine if the user actually has access to the requested file and that it exists
    logger.debug('[fileManager.handleGetFile] currentChunk: %s chunkCount: %s', currentChunk, chunkCount);

    // Get the number of chunks and get the file buffer for each one sending it back to the client
    while (currentChunk < chunkCount) {
      //var ssChunkStream = ss.createStream();
      //var ssChunkStream = ss.createBlobReadStream();


      pfile.getChunk(currentChunk, function(err, chunkData, chunkStream) {
        if (err) {
          return logger.error('[FileManager.handleGetFile] Error getting pFile chunk: ' + err);
        }


        // Send the decryption data for this chunk to client
        var streamData = {
          id: pfile.id,
          iv: chunkData.iv,
          encryptedKey: chunkData.encryptedKey
        }

        // Send the stream decryption data to the client
        socket.emit('streamData-' + pfileId, streamData);

        // Create a listener and wait for the client to be ready to receive this chunk
        // * Should create a replacement for binaryjs that allows you to send other types of events
        // * along the stream so we don't have to do it this way. Or just make it handle all
        // * of these types of events for you

        socket.on('confirmStreamData-' + pfileId, function() {

          var fileData = {
            id: pfile.id,
            iv: chunkData.iv,
            encryptedKey: chunkData.encryptedKey,
            fileName: pfile.name,
            chunkCount: pfile.chunkCount,
            chunkNumber: currentChunk
          }

          // Send the file to the user with socket.emit
          logger.debug("[fileManager.handleGetFile] Sending file chunk with ID '" + pfile.id + "' to user '" + socket.user.username + "'");

          if (!self.binSocket) {
            return logger.error("[fileManager.handleGetFile] binSocket is not defined!");
          }

          // Bin socket isn't coming from anywhere here!?!?
          // should we kick off listen for binsocket here
          self.binSocket.send(chunkStream, fileData);

          logger.debug("[fileManager.handleGetFile] Sent emit, piping to stream");
        });
      });

      currentChunk++;
    };
  });
};

module.exports = FileManager;
