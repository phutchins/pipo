var FileManager = {};

FileManager.sendFile = function sendFile(data, callback) {
  console.log("[FileManager.sendFile] Sending file...");

  var chunk = data.chunk;
  var chunkNumber = data.chunkNumber;
  var totalChunks = data.totalChunks;
  var fileMetadata = data.fileMetadata;
  var fileName = data.fileMetadata.name;
  var toChatId = data.toChatId;
  var description = data.description;
  var chatType = data.chatType;

  var fileData = {
    fileName: fileName,
    chunkNumber: chunkNumber,
    totalChunks: totalChunks,
    lastModified: fileMetadata.lastModified,
    size: fileMetadata.size,
    type: fileMetadata.type,
    toChatId: toChatId,
    chatType: chatType,
    uploadedBy: ChatManager.userProfile.id,
    description: description
  };

  // TODO: This is broken here...
  // need to pass the file data with maybe a fileReader or something to tne encrypt file method here
  window.encryptionManager.encryptFile({
    file: chunk,
    chatId: toChatId
  }, function(err, encryptedChunk) {
    fileData.fileBuffer = new window.buffer.Buffer(encryptedChunk);
    window.socketClient.socket.emit('sendFile', fileData);
  });

  callback(null);
};

