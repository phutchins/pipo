'use strict'

window.FlipStream = require('flip-stream-js');
var BinSocketClient = require('./binSocketClient');

function FileManager(options) {
  if (!(this instanceof FileManager)) {
    return new FileManager(options);
  }
}

FileManager.prototype.sendFile = function sendFile(data, callback) {
  var self = this;

  console.log('[FileManager.sendFile] Sending file...');

  var file = data.file;
  var fileName = data.file.name;
  var toChatId = data.toChatId;
  var description = data.description;
  var chatType = data.chatType;
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
    uploadedBy: ChatManager.userProfile.id,
    description: description
  };

  console.log('[fileManager.sendFile] Waiting for binSocket to OPEN');
  binSocketClient.binSocket.on('open', function() {
    var binSelf = this;

    console.log('[fileManager.sendFile] binSocket is now OPEN');


    console.log('[fileManager.sendFile] calling getFileCipher');
    window.encryptionManager.getFileCipher({
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
        uploadedBy: ChatManager.userProfile.id,
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

      fileReader.pipe(dataHash).pipe(cipher).pipe(encryptedDataHash).pipe(binStream);;

      var tx = 0;
      binStream.on('data', function(data) {
        var progressPercent = Math.round(tx+=data.rx*100);
        console.log('Progress: ' + progressPercent + '%');

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
};


/*
 * Bind the binsocket context to this when calling
 */
FileManager.prototype.handleIncomingFileStream = function handleIncomingFileStream(fileStream, data) {
  //binSocket.on('stream', function(fileStream, data) {

    var id = data.id;
    var fileName = data.fileName;
    var chunkCount = data.chunkCount;
    var chunkNumber = data.chunkNumber;
    var encryptedKey = data.encryptedKey;
    var iv = data.iv;
    var description = data.description;

    var decipherData = {
      encryptedKey: encryptedKey,
      iv: iv
    };

    window.encryptionManager.getFileDecipher(decipherData, function(err, decipher) {
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

      console.log('[fileManager.handleIncomingFileStream] Got file decipher, preparing to decrypt file');

      var fileBuffer = new Buffer([], 'binary');

      fileStream.resume();

      fileStream.pipe(decipher).on('data', function(data) {
        // Create hash to compare to the provided hash to ensure data integrity
        console.log('[fileManager.handleIncomingFileStream] Got on data from fileStream');

        fileBuffer = Buffer.concat([fileBuffer, Buffer(data, 'binary')]);
      }).on('end', function() {
        var self = this;

        console.log('[binSocketClient.addBinListeners] Got fileStream END');

        // ******************************
        // Moev all of this to flip-stream and create a writer that we can steram to
        // ******************************

        var blob = new Blob([fileBuffer], { type: 'octet/stream' });
        var url = URL.createObjectURL(blob);
        window.open(url);

      /*
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
    });
  //});
};

FileManager.prototype.readFiles = function readFiles(files, callback) {
  var self = this;

  if (!files.length) {
    return console.log('[sendFileModal.readblob] Need to select a file silly');
  }

  var options = {};
  var binSocketClient = BinSocketClient(options);

  var description = "this is the files description";
  var chatType = ChatManager.chats[ChatManager.activeChat].type;
  var toChatId = ChatManager.chats[ChatManager.activeChat].id;

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

// Send socket request to the server asking for the pfile by id
// Should set some bits here to show that we're waitijng for the incoming file and reset it when we get the incoming file message

  var options = {};
  var binSocketClient = BinSocketClient(options);
  binSocketClient.listenForFileStream(self.handleIncomingFileStream);

  // Call binSocketClient.listenForFile from here?
  // That way we could pass it a callback method from fileManager without having a circular dependency

  window.socketClient.socket.emit('getFile', { id: data.id });

  // TODO: Need to clsoe the binSocketClient after we get the file we asked for here
};

window.FileManager = FileManager;
