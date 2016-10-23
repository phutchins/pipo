'use strict'

var stream = require('stream');
var through = require('through');
var nodeCrypto = require('crypto-browserify');
var SendFileModal = require('../modals/sendFileModal.js');

//var crypto = require('crypto');
var crypto = nodeCrypto;

window.FlipStream = require('flip-stream-js');
var BinSocketClient = require('../network/binSocketClient');

function FileManager(options) {
  if (!(this instanceof FileManager)) {
    return new FileManager(options);
  }

  this._options = options;
}

FileManager.prototype.init = function(managers) {
  var self = this;

  this.chatManager = managers.chatManager;
  this.encryptionManager = managers.encryptionManager;
  var sendFileModalOptions = {};
  this.sendFileModal = new SendFileModal(sendFileModalOptions);

  // Might should call sendFileModal with context of FileManager
  managers.fileManager = self;

  $(document).ready(function() {
    self.sendFileModal.init(managers);

    $('.message_input__add .add-button.send').unbind().click(function(e) {
      self.sendFileModal.show();
    });
  });
};

FileManager.prototype.sendFile = function sendFile(data, callback) {
  var self = this;

  console.log('[FileManager.sendFile] Sending file...');

  var file = data.file;
  var fileName = data.file.name;
  var toChatId = data.toChatId;
  var description = data.description;
  var chatType = data.chatType;

  // Need to add socketServer host and port to options here from a config object
  var options = {};

  var binSocketClient = new BinSocketClient(options);
  var fileReader = new window.FlipStream.Readable(file);

  var fileData = {
    fileName: fileName,
    lastModified: file.lastModified,
    size: file.size,
    type: file.type,
    toChatId: toChatId,
    chatType: chatType,
    uploadedBy: self.chatManager.userProfile.id,
    description: description
  };

  console.log('[fileManager.sendFile] Waiting for binSocket to OPEN');
  binSocketClient.binSocket.on('open', function() {
    var binSelf = this;

    console.log('[fileManager.sendFile] binSocket is now OPEN');


    console.log('[fileManager.sendFile] calling getFileCipher');
    self.encryptionManager.getFileCipher({
      chatId: toChatId
    }, function(err, data) {
      var cipher = data.cipher;
      var encryptedKey = data.encryptedKey;
      var iv = data.iv;
      var dataHash = nodeCrypto.createHash('rmd160');
      var encryptedDataHash = nodeCrypto.createHash('rmd160');
      var dataHashString;
      var encHashString;

      var streamData = {
        fileName: fileName,
        size: file.size,
        type: file.type,
        toChatId: toChatId,
        chunkNumber: 0,
        chunkCount: 1,
        chatType: chatType,
        encryptedKey: encryptedKey,
        iv: iv,
        uploadedBy: self.chatManager.userProfile.id,
        description: description
      };

      var binStream = binSelf.createStream(streamData);

      // Need to create a second transaction and send the hashes to the server here or
      // request verificaiton from the server
      /*
      dataHash.on('finish', function() {
        dataHashString = dataHash.read().toString('hex');
      });

      encryptedDataHash.on('finish', function() {
        encHashString = encryptedDataHash.read().toString('hex');
      });
      */

      // Use through stream to send the original data through to the
      // data hash instead of pipe

      fileReader.pipe(cipher).pipe(binStream);

      self.sendFileModal.showProgress(function() {
        self.sendFileModal.updateProgress(0);

        var tx = 0;
        binStream.on('data', function(data) {
          var progressPercent = Math.round(tx+=data.rx*100);
          console.log('Progress: ' + progressPercent + '%');

          if (tx) {
            self.sendFileModal.updateProgress(tx/100);
          }

          if (progressPercent >= 100) {
            binStream.end();

            return callback(null);
          }

          if (data.end) {
            dataHash.end();
            encryptedDataHash.end();

            // Send the hashes to the server signed by the client

            return callback(null);
          }
        });
      });
    });
  });
};


/*
 * Bind the binsocket context to this when calling
 */
FileManager.prototype.handleIncomingFileStream = function handleIncomingFileStream(fileStream, data) {
  var self = this;

  var id = data.id;
  var fileName = data.fileName;
  var chunkCount = data.chunkCount;
  var chunkNumber = data.chunkNumber;
  var description = data.description;
  var decipher = data.decipher;

  // Temp hardcode
  //var sessionKey = new Buffer('93d1d1541a976333673935683f49b5e8', 'hex');
  //var iv = new Buffer('27c3465f041e046a61a6f8dc01f0db3d', 'hex');
  //var decipher = crypto.createDecipheriv('aes-128-cbc', sessionKey, iv);
  var fileBuffer = new Buffer([], 'binary');

  // Build an object locally to keep track of the parts of the file
  // if it doesn't exist
  var incomingFilesIsUndefined = typeof window.incomingFiles === 'undefined';

  if (incomingFilesIsUndefined) {
    window.incomingFiles = [];
    window.incomingFiles[id] = {
      fileName: fileName,
      chunksReceived: 0,
      chunkCount: chunkCount
    };
  }

  var logStream1 = through(function(data) {
    this.queue(new Buffer(data));
  });

  var logStream2 = through(function(data) {
    this.queue(data);
  });

  console.log('[fileManager.handleIncomingFileStream] Piped fileStream to decipher, waiting on data');

  fileStream.pipe(logStream1).pipe(decipher).pipe(logStream2).on('data', function(data) {

    // Create hash to compare to the provided hash to ensure data integrity
    console.log('[fileManager.handleIncomingFileStream] Got on data from fileStream');

    var dataString = data.toString('binary');

    fileBuffer = Buffer.concat([fileBuffer, Buffer(dataString, 'binary')]);
  }).on('end', function() {
    var self = this;

    console.log('[binSocketClient.addBinListeners] Got fileStream END');

    // ******************************
    // Move all of this to flip-stream and create a writer that we can steram to
    // ******************************

    var blob = new Blob([fileBuffer], { type: 'octet/stream' });
    var url = URL.createObjectURL(blob);

    saveAs(blob, fileName);

  /*
   * Keeping this in case we need to split the files again due
   * to inability to download as a stream to disk
   *
      // Initialize chunks array if it does not exist
      if (!window.incomingFiles[id].chunks) {
        window.incomingFiles[id].chunks = [];
      }

      // Save the chunk to local storage with a pointer in window.chunksReceived
      window.incomingFiles[id].chunksReceived++;
      console.log('[binSocketClient.addBinListeners] Decrypted message...');

      var chunkIndex = (chunkNumber - 1);

      window.incomingFiles[id].chunks[chunkIndex] = fileBuffer;

      if (window.incomingFiles[id].chunksReceived == chunkCount) {
        // Need to piece the file back together here before saving it
        var completeFileBlob = new Blob(window.incomingFiles[id].chunks);

        saveAs(completeFileBlob, fileName);

        // Close the binSocket connection since we're finished receiving the file
        console.log("[binSocketClient.addBinListeners] About to close self");
        this.close();
        console.log("[binSocketClient.addBinListeners] Closing binSocket as we're finished getting the file");

        return delete window.incomingFiles[id];
      };
      */

  });
};

FileManager.prototype.readFiles = function readFiles(files, callback) {
  var self = this;
  var activeChatId = self.chatManager.activeChat;
  var activeChat = self.chatManager.chats[activeChatId];

  if (!files.length) {
    return console.log('[sendFileModal.readblob] Need to select a file silly');
  }

  var options = {};
  var binSocketClient = BinSocketClient(options);

  var description = "this is the files description";
  var chatType = activeChat.type;
  var toChatId = activeChat.id;

  // Only work with one file at a time for now
  var file = files[0];

  var fileData = {
    file: file,
    toChatId: toChatId,
    chatType: chatType,
    description: description,
  };

  this.sendFile(fileData, function(err) {
    if (err) {
      return callback(err);
    }

    console.log('File sent!');

    return callback(null);
  });
};



FileManager.prototype.getFile = function getFile(data) {
  var self = this;

  var options = {};
  var id = data.id;
  var binSocketClient = BinSocketClient(options);
  var keyRing = data.keyRing;

  binSocketClient.binSocket.on('open', function() {
    console.log('[fileManager.getFile] binSocketClient connected, moving along...');

    socketClient.listenForStreamData(id, function(streamData) {
      // create decrypter from stream data
      var encryptedKey = streamData.encryptedKey;
      var iv = streamData.iv;

      var decipherData = {
        encryptedKey: encryptedKey,
        iv: iv
      };

      self.encryptionManager.getFileDecipher(decipherData, function(err, decipher) {
        // Start listening for the file stream itself
        // Can't make this listen for a particular id right now due to requirement to
        // listen for 'stream'

        binSocketClient.listenForFileStream(function(fileStream, metadata) {
          metadata.decipher = decipher;

          self.handleIncomingFileStream(fileStream, metadata);
        });

        // Respond to the server to confirm that we got the fileStreamData and are ready for the file stream
        window.socketClient.socket.emit('confirmStreamData-' + id);
      });
    });

    window.socketClient.socket.emit('getFile', { id: data.id });

    // TODO: Need to clsoe the binSocketClient after we get the file we asked for here
  });
};

module.exports = FileManager;
