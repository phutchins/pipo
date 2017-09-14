'use strict';

function ServerCommand() {
  if (!(this instanceof ServerCommand)) {
    return new ServerCommand();
  }
}

ServerCommand.prototype.init = function init(managers) {
  this.socketClient = managers.socketClient;
  this.chatManager = managers.chatManager;
};

ServerCommand.prototype.parse = function parse(regexResult, callback) {
  //var regexResult = data.regexResult;

  //console.log('data in parse is: ', data);
  console.log('Regex result in parse is: ', regexResult);

  // Catch commands here and encrypt data to users as needed
  var command = regexResult[1];
  var splitCommand = command.split(" ");
  var currentChatId = this.chatManager.activeChat.id;
  console.log("Split command is: " + splitCommand.toString());

  // Catch join command
  if (splitCommand[0] == "join") {
    var room = splitCommand[1];
    this.socketClient.joinRoom(room, function(err) {
      console.log("Sent request to join room " + room);
    });
  }
  else if (splitCommand[0] == "part") {
    var name = splitCommand[1];
    this.socketClient.partRoom({ chatId: currentChatId }, function(err) {
      console.log("Sent request to part room " + name);
    })
  }
  else if (splitCommand[0] == "help") {
    console.log('Options length: ', splitCommand.length);

    if (splitCommand.length < 2) {
      return console.log('chatManager: ', this.chatManager);
      // Echo local help
      return callback();
    }

    var command = splitCommand[1];
    this.chatManager.showHelp();
    //var message = command.split(" ").slice(2).join(" ");
  }
  else if (splitCommand[0] == "inspect") {
    if (splitCommand.length < 3) {
      console.log('chatManager: ', this.chatManager);
      return callback();
    }

    if (splitCommand[1] == "chatManager") {
      if (splitCommand[2] == "chats") {
        console.log('Inspecting chatManager.chats: ', this.chatManager.chats);

        // echo chats here
        this.chatManager.addMessageToChat({
          confirmed: true,
          type: "room",
          fromUserId: this.chatManager.userNameMap['pipo'],
          chatId: this.chatManager.defaultRoomId,
          messageString: "Inspecting chatManager.chats: " + JSON.stringify(this.chatManager.chats),
          date: new Date().toISOString()
        });
      }
    }
  }
  else {
    // Not a locally parsed command so sending unencrypted to server (server might should have its own key to decrypt server commands)
    var currentChannel = null;
    currentChannel = this.chatManager.chats[this.chatManager.activeChat.id].name;
    this.socketClient.sendServerCommand({ command: regexResult[1], currentChat: this.chatManager.activeChat.id });
    console.log("Sending command '" + regexResult[1] + "' to server");
  }
  $('#message-input').val('');
  return callback();
};

module.exports = ServerCommand;
