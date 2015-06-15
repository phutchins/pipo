var userMap = {};
var roomUsers = {};

var ChatManager = {};

ChatManager.chats = [];
ChatManager.activeChatType = null;

ChatManager.activeRoom = null;
ChatManager.activePrivateMessage = null;

var host = window.location.host;
var socket = io(host+'/main');
var clientKeyPassword = null;
var masterKeyPassword = 'pipo';
var amountOfSpaceNeeded = 5000000;
var keyPair = ({
  publicKey: null,
  privateKey: null
});
var encryptedMasterKeyPair = ({
  publicKey: null,
  privateKey: null
});
var masterKeyPair = ({
  publicKey: null,
  privateKey: null
});
var userName = null;

marked.setOptions({
  renderer: new marked.Renderer(),
  gfm: true,
  tables: true,
  breaks: true,
  pedantic: false,
  sanatize: true,
  smartLists: true,
  smartypants: false,
  highlight: function (code) {
    return hljs.highlightAuto(code).value;
  }
});

//$('#main-input-form').form('setting', {
//  onSuccess: function () {
//    ChatManager.sendMessage();
//    return false;
//  }
//});

//TODO: This should probably replace the one above
$('#message-input').keydown(function (event) {
  if (event.keyCode == 13 && event.shiftKey) {
    var content = this.value;
    var caret = ChatManager.getCaret(this);
    this.value = content.substring(0,caret)+"\n"+content.substring(caret,content.length);
    event.stopPropagation();
    console.log("got shift+enter");
    var $messageInput = $('#message-input');
    $messageInput[0].scrollTop = $messageInput[0].scrollHeight;
    return false;
  } else if(event.keyCode == 13) {
    ChatManager.sendMessage();
    return false;
  }
});

$('.dropdown')
  .dropdown({
    transition: 'drop'
  })
;

$('#generate-keypair-button').on('click', function() {
  console.log("Regenerating client keypair");
  ChatManager.promptForCredentials();
});

$('#import-keypair-button').on('click', function() {
  console.log("Loading keypair from file...");
  ChatManager.promptForImportKeyPair(function(err, data) {
    var keyPair = {
      privateKey: data.privateKey,
      publicKey: data.publicKey
    };
    var userName = data.userName;
    window.encryptionManager.saveClientKeyPair({ userName: userName, keyPair: keyPair }, function(err) {
      if (err) {
        return console.log("Error saving client keyPair");
      };
      console.log("Client keypair saved to local storage");
      window.encryptionManager.clientCredentialsLoaded = false;
      window.socketClient.init();
    })
  })
});

/*
 * Triggered when user clicks the 'Export Key Pair button'
 */
$('#export-keypair-button').on('click', function() {
  console.log("Exporting keypair to file");
  var keyPairData = window.localStorage.getItem('keyPair');

  if (!keyPairData) {
    console.log("No keypair data to export to file");
    return ChatManager.showError("No keypair data exists to export to file");
  }

  var keyPair = JSON.parse(keyPairData);
  console.log("Got keyPair data to export");

  var get_blob = function() {
    return window.Blob;
  }

  var BB = get_blob();
  saveAs(
      new BB(
        [keyPair.publicKey.toString()]
      , {type: "text/plain;charset=" + document.characterSet}
    )
    , (window.userName + ".pub")
  );

  var BB = get_blob();
  saveAs(
      new BB(
        [keyPair.privateKey.toString()]
      , {type: "text/plain;charset=" + document.characterSet}
    )
    , (window.userName + ".key")
  );

});

/*
 * Show an error to the user
 */
ChatManager.showError = function showError(message) {
  $(".ui.modal.error")
    .modal('setting', 'closable', false)
    .modal("show");

  $(".ui.modal.error .content").text(message);
};

// Assists in splitting line in the case of shift+enter
ChatManager.getCaret = function getCaret(el) {
  if (el.selectionStart) {
    return el.selectionStart;
  } else if (document.selection) {
    el.focus();
    var r = document.selection.createRange();
    if (r == null) {
      return 0;
    };
    var re = el.createTextRange(),
    rc = re.duplicate();
    re.moveToBookmark(r.getBookmark());
    rc.setEndPoint('EndToStart', re);
    return rc.text.length;
  };
  return 0;
};

/*
 * Create the room and give it focus
 */
ChatManager.initRoom = function initRoom(room, callback) {
  // Add div to window in namespace of channel
  var self = this;
  console.log("Adding room " + room + " to the room list");
  // TODO: Should store online status for members and messages in an object or array also
  ChatManager.chats[room] = { members: [], type: 'room', messages: "" };

  self.updateRoomList(function(err) {
    // Set focus to room
    console.log("About to set room focus to " + room);
    ChatManager.focusRoom(room, function(err) {
      console.log("Room focus for " + room + " done");
      callback(null);
    });
  });
};

/*
 * Set focus for a room
 */
ChatManager.focusRoom = function focusRoom(room, callback) {
  ChatManager.activeRoom = room;
  ChatManager.activeChatType = 'room';

  // Update the content in the room for the desired room to be in focus
  $('#chat').html(ChatManager.chats[room].messages);

  ChatManager.updateUserList({ room: room });
  ChatManager.focusChat({ id: room }, function(err) {
    callback(err);
  })
}

/*
 * Set focus for a private chat
 */
ChatManager.focusPrivateChat = function focusPrivateChat(user, callback) {
  ChatManager.activePrivateMessage = user;
  console.log("Setting active chat type to privatechat");
  ChatManager.activeChatType = 'privatechat';

  // Init private message for user
  if (ChatManager.chats[user] == null) {
    ChatManager.chats[user] = { type: 'privatechat', messages: "" };
  }

  // Display private messages for user in the room element
  $('#chat').html(ChatManager.chats[user].messages);

  ChatManager.focusChat({ id: user }, function(err) {
    callback(err);
  })
}

/*
 * Set the specified chat to be in focus for the user
 */
ChatManager.focusChat = function focusChat(data, callback) {
  var id = data.id;

  // Update the room list to reflect the desired room to be infocus
  $('.chat-list-item-selected')
    .addClass('chat-list-item')
    .removeClass('chat-list-item-selected');

  $('#' + id)
    .removeClass('chat-list-item')
    .addClass('chat-list-item-selected');

  callback(null);
};

/*
 * Update the list of rooms on the left bar
 */
ChatManager.updateRoomList = function updateRoomList(callback) {
  $('#room-list').empty();
  var chats = Object.keys(ChatManager.chats)
  chats.forEach(function(chat) {
    //if (chat.type == 'room') {
      // Catch clicks on the room list to update room focus
      if ( !$('#' + chat).length ) {
        var roomListHtml = '<li class="room chat-list-item" id="' + chat + '">' + chat + '</li>';
        $('#room-list').append(roomListHtml);
        console.log("Added " + chat + " to room-list");
      }
      $("#" + chat).click(function() {
        ChatManager.focusRoom(chat, function(err) {
          // Room focus complete
        });
      });
    //}
  });
  callback(null);
};

// Sends a notification that expires after a timeout. If timeout = 0 it does not expire
ChatManager.sendNotification = function sendNotification(image, title, message, timeout, showOnFocus) {
  this.getNotifyPermissions(function(permission) {
    if (permission) {
      console.log("[NOTIFICATION] Attempting to display notification");
      // Default values for optional params
      timeout = (typeof timeout !== 'undefined') ? timeout : 0;
      showOnFocus = (typeof showOnFocus !== 'undefined') ? showOnFocus : false;
      // Check if the browser window is focused
      var isWindowFocused = document.querySelector(":focus") !== null;
      // Check if we should send the notification based on the showOnFocus parameter
      var shouldNotify = !isWindowFocused || isWindowFocused && showOnFocus;
      console.log("[NOTIFICATION] shouldNotify is "+shouldNotify);
      if (shouldNotify) {
        console.log("[NOTIFCATION] Sending notification now...");
        var notification = new Notification(title, { body: message });
        if (timeout > 0) {
          // Hide the notification after the timeout
          setTimeout(function(){
            notification.close();
          }, timeout);
        }
      }
    } else {
      console.log("Don't have permission to display notification");
    }
  });
};

ChatManager.getNotifyPermissions = function getNotifyPermissions(callback) {
  // check for notification compatibility
  if(!window.Notification) {
    // if browser version is unsupported, be silent
    return callback(false);
  }
  // log current permission level
  console.log(Notification.permission);
  // if the user has not been asked to grant or deny notifications from this domain
  if(Notification.permission === 'default') {
    Notification.requestPermission(function() {
      // callback this function once a permission level has been set
      return callback(true);
    });
  }
  // if the user has granted permission for this domain to send notifications
  else if(Notification.permission === 'granted') {
    return callback(true);
  }
  // if the user does not want notifications to come from this domain
  else if(Notification.permission === 'denied') {
    return callback(false);
  }
};

ChatManager.enableChat = function enableChat(room, encryptionScheme) {
  var self = this;

  if (self.enabled) {
    console.log("[enableChat] Trying to enable chat when it is already enabled");
    return;
  }

  self.enabled = true;

  //Make input usable
  $('#message-input').attr('placeHolder', 'Type your message here...').prop('disabled', false);
  $('#send-button').prop('disabled', false);
  $('#loading-icon').hide();

  $('textarea').keydown(function (event) {
    var element = this;

    //Prevent shift+enter from sending
    if (event.keyCode === 13 && event.shiftKey) {
      var content = element.value;
      var caret = self.getCaret(this);

      element.value = content.substring(0, caret) + "\n" + content.substring(caret, content.length);
      event.stopPropagation();

      var $messageInput = $('#message-input');
      $messageInput[0].scrollTop = $messageInput[0].scrollHeight;
      return false;
    }
    else if (event.keyCode === 13) {
      $('#main-input-form').submit();
      return false;
    }
  });
};

ChatManager.disableChat = function disableChat(room) {
  var self = this;
  self.enabled = false;
  $('textarea').off("keydown", "**");
  $('#message-input').attr('placeHolder', '         Waiting for connection...').prop('disabled', true);
  $('#send-button').prop('disabled', true);
  $('#loading-icon').show();
};

ChatManager.getCaret = function getCaret(el) {
  if (el.selectionStart) {
    return el.selectionStart;
  } else if (document.selection) {
    el.focus();
    var r = document.selection.createRange();
    if (r === null) {
      return 0;
    }
    var re = el.createTextRange(),
        rc = re.duplicate();
    re.moveToBookmark(r.getBookmark());
    rc.setEndPoint('EndToStart', re);
    return rc.text.length;
  }
  return 0;
};

ChatManager.prepareMessage = function prepareMessage(message, callback) {
  var parsedMessage = window.marked(message).replace(/(<p>|<\/p>)/g, '');
  var container = $('<div>').html(parsedMessage);

  // Check the hostname to make sure that it's not a local link...
  container.find('a').attr('target','_blank');
  container.find('code').addClass('hljs');

  callback(null, container.html());
};

ChatManager.handleMessage = function handleMessage(data) {
  var fromUser = data.user;
  var message = data.message;
  var room = data.room;
  var messages = $('#chat');
  var messageLine = "["+fromUser+"] "+message;

  this.localMsg({ type: 'room', message: messageLine, chat: room });
  messages[0].scrollTop = messages[0].scrollHeight;
};

ChatManager.handlePrivateMessage = function handlePrivateMessage(message, fromUser, toUser) {
  var chat = $('#chat');
  var messageLine = "[" + fromUser + " > " + toUser + "] " + message;

  //this.localMsg({ type: 'privatemessage', message: messageLine, chat: toUser });
  if (ChatManager.chats[chat] == null) {
    ChatManager.chats[chat] = { messages: '' };
  }
  debugger;
  ChatManager.chats[chat].messages = ChatManager.chats[chat].messages.concat("<li>" + messageLine + "</li>");
  ChatManager.refreshPrivateMessageContent(chat);
  chat[0].scrollTop = chat[0].scrollHeight;
};

ChatManager.updateUserList = function updateUserList(data) {
  var room = data.room;
  var members = ChatManager.chats[room].members;
  var userListHtml = "";
  console.log("[CHAT MANAGER] (updateUserList) members: "+JSON.stringify(members));
  members.forEach(function(userName) {
    ChatManager.chats[userName] = { messages: "" };
    userListHtml += "<li class='private-chat chat-list-item' id='" + userName + "'>" + userName + "</li>\n";
  });
  $('#user-list').html(userListHtml);
  members.forEach(function(userName) {
    $('#' + userName).click(function() {
      ChatManager.focusPrivateChat(userName, function(err) {
        // Done
      });
    });
  });
};

ChatManager.localMsg = function localMsg(data) {
  var type = data.type;
  var message = data.message;
  var id = data.id;
  var fromUser = data.fromUser;
  var chat = data.chat;

  //Add timestamp
  var time = new Date().toISOString();
  message += ' <span style="float:right;" title="' + time + '" data-livestamp="' + time + '"></span>';
  console.log("Message is: " + message);

  if (type == 'status') {
    // Status message?
    ChatManager.chats[chat].messages.concat($('<li id="'+id+'">').html("["+type+"] "+message));
    ChatManager.refreshRoomContent(chat);
  } else if (type == 'room') {
    // Room message
    console.log("chats[chat]: " + ChatManager.chats[chat].messages);
    ChatManager.chats[chat].messages = ChatManager.chats[chat].messages.concat("<li>" + message + "</li>");
    ChatManager.refreshRoomContent(chat);
  } else if (type == 'privatemessage') {
    // Private message
    if (!ChatManager.chats[chat]) {
      ChatManager.chats[chat] = '';
    }
    ChatManager.chats[chat].messages = ChatManager.chats[chat].messages.concat("<li>" + message + "</li>");
    console.log("privatemessage chats is: " + ChatManager.chats[chat].messages);
    ChatManager.refreshPrivateMessageContent(chat);
  } else {
    return console.log("ERROR: Unknown localMsg type!");
  }
};

ChatManager.refreshRoomContent = function refreshRoomContent(room) {
  console.log("Refreshing room content");
  $('#chat').html(ChatManager.chats[room].messages);
}

ChatManager.refreshPrivateMessageContent = function refreshPrivateMessageContent(chat) {
  console.log("Refreshing private message content for user '" + chat+ "'");
  $('#chat').html(ChatManager.chats[chat].messages);
}

ChatManager.sendMessage = function sendMessage() {
  var input = $('#message-input').val();
  console.log("1 sendMessage input: " + input);
  //input = input.replace(/(<p>|<\/p>)/g, '');
  //console.log("2 sendMessage input: " + input);
  var commandRegex = /^\/(.*)$/;
  var regexResult = input.match(commandRegex);

  if (input === "") {
    return false;
  }
  else if (regexResult !== null) {
    // Catch commands here and encrypt data to users as needed
    var command = regexResult[1];
    var splitCommand = command.split(" ");

    // Catch local command
    if (splitCommand[0] === "local") {
      var param1 = splitCommand[1];
      var message = command.split(" ").slice(2).join(" ");
    }
    else {
      // Not a locally parsed command so sending unencrypted to server (server might should have its own key to decrypt server commands)
      socket.emit('server command', {command: regexResult[1], currentChannel: currentChannel});
      console.log("Sending command '" + regexResult[1] + "' to server");
      $('#message-input').val('');
    }
  }
  else {
    ChatManager.prepareMessage(input, function(err, preparedInput) {
      console.log("Active chat type is: " + ChatManager.activeChatType);
      if (ChatManager.activeChatType == 'room') {
        console.log("Sending message to room #"+ChatManager.activeRoom);
        window.socketClient.sendMessage(ChatManager.activeRoom, preparedInput);
      }
      else if (ChatManager.activeChatType == 'privatechat') {
        var userName = ChatManager.activePrivateMessage;
        console.log("Sending private mesage to '" + userName + "' with message '" + preparedInput + "'");
        socketClient.sendPrivateMessage(userName, preparedInput);
      }
      else {
        return console.log("ERROR: No activeChatType!");
      }
    })
  }
};

ChatManager.initialPromptForCredentials = function initialPromptForCredentials() {
  var self = this;
  console.log("Prompting for credentials!");

  $(".ui.modal.initial")
    .modal('setting', 'closable', false)
    .modal("show");

  $('.ui.modal.create')
    .modal("attach events", ".ui.modal.initial .button.generate")
    .modal('setting', 'closable', false)
    .modal('setting', 'debug', false)
    .modal("setting", {
      onApprove: function() {
        $('.ui.form.create').submit();
      }
    });

  $('.ui.form.create').form('setting', {
    onSuccess: function() {
      var errorDisplay = $('.create #createError');
      var userName = $('.create.form #username').val();
      var password = $('.create.form #password').val();
      var confirmPassword = $('.create #confirmPassword').val();

      if (!username) {
        if (errorDisplay.text().toLowerCase().indexOf('username') !== -1) {
          return false;
        }
        if (errorDisplay.transition('is visible')) {
          errorDisplay.transition({
            animation: 'fade up',
            duration: '0.5s',
            onComplete: function() {
              errorDisplay.text("Password is required");
            }
          });
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        else {
          errorDisplay.text("Username is required");
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        return false;
      }
      else if(!password) {
        if (errorDisplay.text().toLowerCase().indexOf('password is required') !== -1) {
          return false;
        }
        if(errorDisplay.transition('is visible')) {
          errorDisplay.transition({
            animation: 'fade up',
            duration: '0.5s',
            onComplete: function() {
              errorDisplay.text("Password is required");
            }
          });
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        else {
          errorDisplay.text("Password is required");
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        return false;
      }
      else if (password !== confirmPassword) {
        if (errorDisplay.text().toLowerCase().indexOf('passwords do not match') !== -1) {
          return false;
        }
        if(errorDisplay.transition('is visible')) {
          errorDisplay.transition({
            animation: 'fade up',
            duration: '0.5s',
            onComplete: function() {
              errorDisplay.text("Passwords do not match");
            }
          });
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        else {
          errorDisplay.text("Passwords do not match");
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        return false;
      }

      //TODO: Check for username collision

      $('.ui.modal.generate').modal('show');
      ChatManager.disableChat();
      window.encryptionManager.generateClientKeyPair(2048, userName, password, function(err, generatedKeypair) {
        if (err) {
          console.log("Error generating client keypair: "+err);
        } else {
          console.log("[CHAT MANAGER] (promptForCredentials) Generated client key pair.");
          window.userName = userName;
          console.log("[CHAT MANAGER] (promptForCredentials) userName: "+userName+" window.userName: "+window.userName);
          localStorage.setItem('userName', userName);
          localStorage.setItem('keyPair', JSON.stringify(generatedKeypair));
          console.log("[CHAT MANAGER] (promptForCredentials) Saved clientKeyPair to localStorage");
          $('.ui.modal.generate').modal('hide');
          ChatManager.enableChat();
          socketClient.init();
        }
      });
      return false;
    }
  });

  $('.ui.modal.generate').modal('setting', 'closable', false);
};

ChatManager.promptForCredentials = function promptForCredentials() {
  var self = this;
  console.log("Prompting for credentials!");

  $('.ui.modal.create')
    .modal("attach events", ".ui.modal.initial .button.generate")
    .modal('setting', 'closable', false)
    .modal('setting', 'debug', false)
    .modal("setting", {
      onApprove: function() {
        $('.ui.form.create').submit();
      }
    })
    .modal('show');

  $('.ui.form.create').form('setting', {
    onSuccess: function() {
      var errorDisplay = $('.create #createError');
      var userName = $('.create.form #username').val();
      var password = $('.create.form #password').val();
      var confirmPassword = $('.create #confirmPassword').val();

      if (!username) {
        if (errorDisplay.text().toLowerCase().indexOf('username') !== -1) {
          return false;
        }
        if (errorDisplay.transition('is visible')) {
          errorDisplay.transition({
            animation: 'fade up',
            duration: '0.5s',
            onComplete: function() {
              errorDisplay.text("Password is required");
            }
          });
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        else {
          errorDisplay.text("Username is required");
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        return false;
      }
      else if(!password) {
        if (errorDisplay.text().toLowerCase().indexOf('password is required') !== -1) {
          return false;
        }
        if(errorDisplay.transition('is visible')) {
          errorDisplay.transition({
            animation: 'fade up',
            duration: '0.5s',
            onComplete: function() {
              errorDisplay.text("Password is required");
            }
          });
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        else {
          errorDisplay.text("Password is required");
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        return false;
      }
      else if (password !== confirmPassword) {
        if (errorDisplay.text().toLowerCase().indexOf('passwords do not match') !== -1) {
          return false;
        }
        if(errorDisplay.transition('is visible')) {
          errorDisplay.transition({
            animation: 'fade up',
            duration: '0.5s',
            onComplete: function() {
              errorDisplay.text("Passwords do not match");
            }
          });
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        else {
          errorDisplay.text("Passwords do not match");
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        return false;
      }

      //TODO: Check for username collision

      $('.ui.modal.generate').modal('show');
      ChatManager.disableChat();
      window.encryptionManager.generateClientKeyPair(2048, userName, password, function(err, generatedKeypair) {
        if (err) {
          console.log("Error generating client keypair: "+err);
        } else {
          console.log("[CHAT MANAGER] (promptForCredentials) Generated client key pair.");
          window.userName = userName;
          console.log("[CHAT MANAGER] (promptForCredentials) userName: "+userName+" window.userName: "+window.userName);
          localStorage.setItem('userName', userName);
          localStorage.setItem('keyPair', JSON.stringify(generatedKeypair));
          console.log("[CHAT MANAGER] (promptForCredentials) Saved clientKeyPair to localStorage");
          $('.ui.modal.generate').modal('hide');
          ChatManager.enableChat();
          socketClient.init();
        }
      });
      return false;
    }
  });

  $('.ui.modal.generate').modal('setting', 'closable', false);
}

ChatManager.promptForPassphrase = function(callback) {
  $('.ui.modal.unlock')
    .modal('setting', 'closable', false)
    .modal('setting', {
      onApprove: function() {
        $('.ui.form.unlock').submit();
      }
    })
    .modal('show');

  $('.ui.form.unlock').form('setting', {
    onSuccess: function() {
      var errorDisplay = $('.unlock #createError');
      var password = $('.unlock #password').val();
      if (!password) {
        if (errorDisplay.text().toLowerCase().indexOf('password is required') !== -1) {
          return false;
        }
        if (errorDisplay.transition('is visible')) {
          errorDisplay.transition({
            animation: 'fade up',
            duration: '0.5s',
            onComplete: function () {
              errorDisplay.text("Password is required");
            }
          });
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        else {
          errorDisplay.text("Password is required");
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        return false;
      }
      else {
        $('.ui.modal.unlock').modal('hide');
        callback(password);
        return false;
      }
    }
  });
};

ChatManager.promptForImportKeyPair = function promptForImportKeyPair(callback) {
  console.log("Prompting user to import existing keypair");
  $('.modal.import-keypair-modal').modal('show');
  //TODO: Use this to hide the default file open dialog and replace with more stylish bits
  //$('.basic.modal.import-keypair-modal #publickey-file-input').css('opacity', '0');
  //$('.basic.modal.import-keypair-modal #privatekey-file-input').css('opacity', '0');
  $('.import-keypair-modal #select-publickey').click(function(e) {
    e.preventDefault();
    $('#publickey-file-input').trigger('click');
  });
  $('.import-keypair-modal #select-privatekey').click(function(e) {
    e.preventDefault();
    $('#privatekey-file-input').trigger('click');
  });
  $('.import-keypair-submit-button').click(function(e) {

    var publicKeyFile = document.getElementById('publickey-file-input').files[0];
    var publicKeyContents = null;
    var privateKeyFile = document.getElementById('privatekey-file-input').files[0];
    var privateKeyContents = null;
    var userName = document.getElementById('username-input').value;

    if (publicKeyFile && privateKeyFile) {
      var regex = /\r?\n|\r/g
      var reader = new FileReader();
      reader.readAsText(publicKeyFile);
      reader.onload = function(e) {
        publicKeyContents = e.target.result
        console.log("TEST: " + publicKeyContents.toString().replace(regex, '\n'));
        reader.readAsText(privateKeyFile);
        reader.onload = function(e) {
          privateKeyContents = e.target.result.toString().replace(regex, '\n');
          var data = ({
            publicKey: publicKeyContents,
            privateKey: privateKeyContents,
            userName: userName,
          });
          callback(null, data);
        };
      };
    } else {
      err = "Error importing key pair from file";
      callback(err, null);
    };
  });

  function getNewMessageId(callback) {
    var id = new Date().getTime();
    callback(id);
  };
};
