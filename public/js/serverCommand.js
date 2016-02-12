var ServerCommand = {};

ServerCommand.parse = function parse(data, callback) {
  var regexResult = data.regexResult;

  // Catch commands here and encrypt data to users as needed
  var command = regexResult[1];
  var splitCommand = command.split(" ");
  var currentChatId = ChatManager.activeChat.id;
  console.log("Split command is: " + splitCommand.toString());

  // Catch join command
  if (splitCommand[0] == "join") {
    var room = splitCommand[1];
    socketClient.joinRoom(room, function(err) {
      console.log("Sent request to join room " + room);
    });
  }
  else if (splitCommand[0] == "part") {
    var name = splitCommand[1];
    socketClient.partRoom({ chatId: currentChatId }, function(err) {
      console.log("Sent request to part room " + name);
    })
  }
  else if (splitCommand[0] == "help") {
    var command = splitCommand[1];
    ChatManager.showHelp();
    //var message = command.split(" ").slice(2).join(" ");
  }
  else {
    // Not a locally parsed command so sending unencrypted to server (server might should have its own key to decrypt server commands)
    var currentChannel = null;
    currentChannel = ChatManager.chats[ChatManager.activeChat.id].name;
    socketClient.sendServerCommand({ command: regexResult[1], currentChat: ChatManager.activeChat.id });
    console.log("Sending command '" + regexResult[1] + "' to server");
  }
  $('#message-input').val('');
  return callback();
};

