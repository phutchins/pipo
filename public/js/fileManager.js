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
  var binSocketClient = BinSocketClient(options);

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


  //
  // LEFT OFF HERE!!!!!!
  // Need to add chunkCount and chunkNumber which would both be 1 for now while we're simply
  // streaming the whole file...
  // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  //

  // Create readable stream from the file that we're sending
  // Send the readable stream through encryptionManager.encryptFileSTream
  // Pipe the returned stream to binjs stream
  // Send that binjs stream to binjs server

  console.log('[fileManager.sendFile] Waiting for binSocket to OPEN');
  binSocketClient.binSocket.on('open', function() {
    var binSelf = this;
    console.log('[fileManager.sendFile] binSocket is now OPEN');


    window.encryptionManager.sha256(file).then(function(dataHash) {
      console.log('[fileManager.sendFile] Payload hash before encryption is ' + dataHash);

      // TODO: This is broken here...
      // need to pass the file data with maybe a fileReader or something to tne encrypt file method here
      console.log('[fileManager.sendFile] calling getFileCipher');
      window.encryptionManager.getFileCipher({
        chatId: toChatId
      }, function(err, data) {
        var cipher = data.cipher;
        var encryptedFileCreds = data.encryptedFileCreds;

        // Need to find a way to pipe the encrypted file through the sha256 method on the way out
        //window.encryptionManager.sha256(encryptedFileStream).then(function(encHash) {
          //console.log('[fileManager.sendFile] Payload hash after encryption is ' + encHash);

          var streamData = {
            fileName: fileName,
            dataHash: dataHash,
            //encHash: encHash,
            size: file.size,
            type: file.type,
            toChatId: toChatId,
            chunkNumber: 1,
            chunkCount: 1,
            chatType: chatType,
            uploadedBy: ChatManager.userProfile.id,
            description: description
          };

          var binStream = binSelf.createStream(streamData);

          fileReader.pipe(cipher).pipe(binStream);

          var tx = 0;
          binStream.on('data', function(data) {
            console.log('Progress(raw): ' + data.rx + ' tx: ' + tx);
            console.log('Progress: ' + Math.round(tx+=data.rx*100) + '%');

            // Once stream is 100%, binStream.end() here instead
          });

          //binStream.end();
        //});
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

  var fileData = {
    file: file,
    toChatId: toChatId,
    chatType: chatType,
    description: description,
  };

  this.sendFile(fileData, function(err) {
    if (err) {
      return console.log('Error sending file: %s', err);
    }
    console.log('File sent!');
  });
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
