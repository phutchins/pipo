'use strict'

window.FlipStream = require('flip-stream-js');

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

  var binSocketClient = new window.BinSocketClient(options);

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


    window.encryptionManager.rmd160(file).then(function(dataHash) {
      console.log('[fileManager.sendFile] Payload hash before encryption is ' + dataHash);

      console.log('[fileManager.sendFile] calling getFileCipher');
      window.encryptionManager.getFileCipher({
        chatId: toChatId
      }, function(err, data) {
        var cipher = data.cipher;
        var encryptedKey = data.encryptedKey;
        var iv = data.iv;

        // Need to find a way to pipe the encrypted file through the sha256 method on the way out
        //window.encryptionManager.sha256(encryptedFileStream).then(function(encHash) {
        //console.log('[fileManager.sendFile] Payload hash after encryption is ' + encHash);

        var streamData = {
          fileName: fileName,
          chunkHash: dataHash,
          //encHash: encHash,
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

        fileReader.pipe(cipher).pipe(binStream);

        var tx = 0;
        binStream.on('data', function(data) {
          var progressPercent = Math.round(tx+=data.rx*100);
          console.log('Progress: ' + progressPercent + '%');

          if (progressPercent >= 100) {
            binStream.end();

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

	EncryptionManager.getFileDecipher(decipherData, function(err, decipher) {
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

		chunkStream.pipe(decipher).on('data', function(data) {
			// Create hash to compare to the provided hash to ensure data integrity
		});

		chunkStream.on('end', function() {
			var self = this;
			console.log('[binSocketClient.addBinListeners] Got chunkStream END');
			file = new Blob(parts);
			self.reader = new FileReader();

			// This method causes a 'Maximum call stack size exceeded' for some reason
			function ab2str(buf) {
					return String.fromCharCode.apply(null, new Uint8Array(buf));
			}

			function _arrayBufferToBinary( buffer ) {
				var binary = '';
				var bytes = new Uint8Array( buffer );
				var len = bytes.byteLength;
				for (var i = 0; i < len; i++) {
					binary += String.fromCharCode( bytes[ i ] );
				}
				//return window.btoa( binary );
				return binary;
			}


			// Really should just update the kbpgp library to accept and decrypt buffers
			console.log('[binSocketClient.addBinListeners] Adding loadend event listener');

			self.reader.addEventListener('loadend', function() {
				//var encryptedFile = _arrayBufferToBinary(self.reader.result);
				var encryptedFile = self.reader.result;

				console.log('[binSocketClient.addBinListeners] About to decrypt message');

				// Really need to stream the downloaded file directly to disk then decrypt optionally
				// This would keep us from having to store the file in memory
				// Could also stream to a localStorage file
			 encryptionManager.decryptFile({
					file: encryptedFile,
					keyRing: encryptionManager.keyRing
				}, function(err, fileBuffer) {
					if (err) {
						// Should alert the client of an error here
						return console.log('[binSocketClient.addBinListeners.end] Error decrypting message: ' + err);
					}

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
				});
			});

			console.log("[socketClient.addBinListeners] Reading file as array buffer");
			self.reader.readAsArrayBuffer(file);
		});
  });
};

FileManager.prototype.readFiles = function readFiles(files, callback) {
  var self = this;

  if (!files.length) {
    return console.log('[sendFileModal.readblob] Need to select a file silly');
  }

  var options = {};
  var binSocketClient = window.BinSocketClient(options);

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
  binSocketClient.listenForFile(self.handleIncomingFileStream);

  // Call binSocketClient.listenForFile from here?
  // That way we could pass it a callback method from fileManager without having a circular dependency

  window.socketClient.socket.emit('getFile', { id: data.id });

  // TODO: Need to clsoe the binSocketClient after we get the file we asked for here
};

window.FileManager = FileManager;
