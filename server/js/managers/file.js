function FileManager() {
  this.notifyNewFile = function(data) {
    var socket = data.socket;
    var pfile = data.pfile;

    // Create the message to be displayed
    var pfileMessage = "Hey, there is a file for you named '" + pfile.name + "'";

    // Notify the users that this file was encrypted to that they have a file waiting

    // - Should add a message to the appropriate chat with a clickable link
    //   - This link should open up a modal asking if the user wants to download encrypted or decrypt on reciept
    var messageData = {
      chatId: pfile.toChat.id,
      message: pfileMessage
    };

    // Server should let users of a chat know that a file has been uploaded (in case the user fails to notify after success upload)
    socketClient.sendMessage(messageData);
  }
};

module.exports = new FileManager();
