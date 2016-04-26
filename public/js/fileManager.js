var FileManager = {};

FileManager.sendFile = function sendFile(data, callback) {
  console.log("[FileManager.sendFile] Sending file...");

  var file = data.file;
  var fileName = data.file.name;
  var toChatId = data.toChatId;
  var description = data.description;
  var chatType = data.chatType;

  var fileData = {
    fileName: fileName,
    toChatId: toChatId,
    chatType: chatType,
    uploadedBy: ChatManager.userProfile.id,
    description: description
  };

  debugger;

  // TODO: This is broken here...
  // need to pass the file data with maybe a fileReader or something to tne encrypt file method here
  window.encryptionManager.encryptFile({
    file: file,
    chatId: toChatId
  }, function(err, encryptedFile) {
    fileData.fileBuffer = new window.buffer.Buffer(encryptedFile);
    window.socketClient.socket.emit('sendFile', fileData);
  });

  callback(null);
};

