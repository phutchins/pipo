'use strict'

function FileManager(options) {
  if (!(this instanceof FileManager)) {
    return new FileManager(options);
  }
}

FileManager.prototype.sendFile = function sendFile(data, callback) {
  console.log('[FileManager.sendFile] Sending file...');
  var self = this;

  var fileChunkArrayBuffer = data.fileChunkArrayBuffer;
  var chunkNumber = data.chunkNumber;
  var chunkCount = data.chunkCount;
  var fileMetadata = data.fileMetadata;
  var fileName = data.fileMetadata.name;
  var toChatId = data.toChatId;
  var description = data.description;
  var chatType = data.chatType;
  var options = {};
  var binSocketClient = BinSocketClient(options);

  var fileData = {
    fileName: fileName,
    chunkNumber: chunkNumber,
    chunkCount: chunkCount,
    lastModified: fileMetadata.lastModified,
    size: fileMetadata.size,
    type: fileMetadata.type,
    toChatId: toChatId,
    chatType: chatType,
    uploadedBy: ChatManager.userProfile.id,
    description: description
  };

  // Create readable stream from the file that we're sending
  // Send the readable stream through encryptionManager.encryptFileSTream
  // Pipe the returned stream to binjs stream
  // Send that binjs stream to binjs server

  debugger;

  console.log('[fileManager.sendFile] Waiting for binSocket to OPEN');
  binSocketClient.binSocket.on('open', function() {
    console.log('[fileManager.sendFile] binSocket is now OPEN');

    window.encryptionManager.sha256(fileChunkArrayBuffer).then(function(dataHash) {
      console.log('[fileManager.sendFile] Payload hash before encryption is ' + dataHash);

      // TODO: This is broken here...
      // need to pass the file data with maybe a fileReader or something to tne encrypt file method here
      window.encryptionManager.encryptFileStream({
        file: fileChunkArrayBuffer,
        chatId: toChatId
      }, function(err, encryptedFileStream) {
        // Here encryptedChunkBuffer is a kbpgp.Buffer (which is similar to NodeJS buffer
        // Should we return the resultString from encryption for sha256 here?
        console.log('[fileManager.sendFile] encryptedChunkBuffer text: ' + String.fromCharCode.apply(null, new Uint8Array(encryptedChunkBuffer)));

        // May need to pipe this through the sha256 generator then pipe to binStream?
        window.encryptionManager.sha256(encryptedFileStream).then(function(encHash) {
          console.log('[fileManager.sendFile] Payload hash after encryption is ' + encHash);
          //fileData.fileBuffer = new window.buffer.Buffer(encryptedChunk);
          //var fileBuffer = new window.buffer.Buffer(encryptedChunk);
          //window.socketClient.socket.emit('sendFile', fileData);
          //binSocketClient.send(fileData);
          var binStream = binSocketClient.binSocket.send(encryptedFileStream, {
            fileName: fileName,
            dataHash: dataHash,
            encHash: encHash,
            chunkNumber: chunkNumber,
            chunkCount: chunkCount,
            size: fileMetadata.size,
            type: fileMetadata.type,
            toChatId: toChatId,
            chatType: chatType,
            uploadedBy: ChatManager.userProfile.id,
            description: description
          });

          var tx = 0;
          binStream.on('data', function(data) {
            console.log('Progress(raw): ' + data.rx + ' tx: ' + tx);
            console.log('Progress: ' + Math.round(tx+=data.rx*100) + '%');

            // Once stream is 100%, binStream.end() here instead
          });

          //binStream.end();
        });
      });
    });
  });

  callback(null);
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
  var chunkSize = 1048576;
  var fileSize = file.size - 1;
  console.log("[sendFileModal] File size is: " + fileSize);
  var chunkCountRaw = fileSize/chunkSize;
  var finalChunk = fileSize%chunkSize;
  var chunkRemainder = chunkCountRaw % 1
  var wholeChunks = chunkCountRaw - chunkRemainder;
  var chunkCount = Math.ceil(chunkCountRaw);
  var currentChunk = 0;

  // While we are in a chunk range that is not longer than the file, keep sending chunks
  while (currentChunk <= wholeChunks) {
    var reader = new FileReader();
    // Get the file here?
    //var reader = new InputStreamReader( new FileInputStream(file), 'binary' );
    var thisChunk = currentChunk;
    var start;
    var end;

    // Use inputStreamReader with a different listen event here
    reader.onloadend = (function(chunkNum) {
      var chunk = chunk;
      return function(evt) {
        // This returns an arrayBuffer in evt.target.result
        if (evt.target.readyState == FileReader.DONE) {
          console.log("[fileManager.readFiles] Sending chunk " + (chunkNum + 1) + " of " + chunkCount);

          self.sendFile({
            fileMetadata: file,
            fileChunkArrayBuffer: evt.target.result,
            chunkNumber: chunkNum,
            chunkCount: chunkCount,
            description: description,
            chatType: chatType,
            toChatId: toChatId
          }, function(err) {
            console.log("[fileManager.readFiles] Got callback from FileManager.sendFile");

            if (err) {
              return console.log("[fileManager.readFiles] Error processing file: " + err);
            }

            // If this was the last chunk and we finished sending, close the binSocketClient
            console.log('[fileManager.readFiles] chunkNum + 1: ' + (chunkNum + 1) + ' chunkCount: ' + chunkCount);
            // Determine if we're counting correctly

            // Need to create a listener for file complete from server and
            // have the server notify the client when the file has been completed
            // and close the binSocket
            // binSocketClient.close();

            // Should show progress, stats, etc... before closing this modal. Add upload button, cancel, and done
            $('.modal.sendfile').modal('hide');
          });
        }
      };
    })(thisChunk);

    // Upload a whole chunk which is ( currentChunk * chunkSize )
    if (currentChunk < wholeChunks) {
      start = ( currentChunk * chunkSize );
      end = (( currentChunk  + 1 ) * chunkSize );
    }

    // If this is the last chunk, set final bytes
    // to ( currentChunk * chunkSize ) + finalChunk
    if (currentChunk === wholeChunks) {
      start = ( currentChunk * chunkSize );
      end = ( currentChunk * chunkSize ) + finalChunk;
    }


    // Should read the slice into blob here as binary?
    var blob = file.slice(start, end, {type: 'application/octet-binary'});

    //reader.readAsBinaryString(blob);
    reader.readAsArrayBuffer(blob);

    // Would it be better to move this to the beginning?
    // Need to get chunk counts accurate
    currentChunk++;
  }
};



FileManager.prototype.getFile = function getFile(data) {
// Send socket request to the server asking for the pfile by id
// Should set some bits here to show that we're waitijng for the incoming file and reset it when we get the incoming file message
  var options = {};
  var binSocketClient = BinSocketClient(options);
  window.socketClient.socket.emit('getFile', { id: data.id });

  // TODO: Need to clsoe the binSocketClient after we get the file we asked for here
};

window.FileManager = FileManager;
