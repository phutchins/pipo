var FileManager = {};

FileManager.sendFile = function sendFile(data, callback) {
  console.log("[FileManager.sendFile] Sending file...");

  var file = data.file;
  var fileName = data.file.name;
  var toChatId = data.toChatId;
  var description = data.description;
  var fileData = {
    fileName: fileName,
    toChatId: toChatId,
    uploadedBy: ChatManager.userProfile.id,
    description: description
  };

  window.encryptionManager.encryptFile({
    file: file,
    chatId: toChatId
  }, function(err, encryptedFile) {
    fileData.fileBuffer = new window.buffer.Buffer(encryptedFile);
    window.socketClient.socket.emit('sendFile', fileData);
  });

  callback(null);
};

