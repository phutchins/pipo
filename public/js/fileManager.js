var FileManager = {};

FileManager.sendFile = function sendFile(data, callback) {
  console.log("[FileManager.sendFile] Sending file...");

  var file = data.file;
  var fileName = data.file.name;
  var toChat = data.toChat;
  var params = {foo: 'bar'};

  window.encryptionManager.encryptFile({
    file: file,
    chatId: toChat
  }, function(err, encryptedFile) {
    var fileBuffer = new window.buffer.Buffer(encryptedFile);
    debugger;
    window.socketClient.socket.emit('sendFile', { buffer: fileBuffer, fileName: fileName, params: params });
    //window.delivery.sendAsText(encryptedFile, params);
  });

  callback(null);
};

