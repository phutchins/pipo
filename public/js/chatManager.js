var userMap = {};
var roomUsers = {};

var ChatManager = {};

// Chats are rooms that the user has currently joined
ChatManager.chats = [];
// Rooms are all available for user to join
ChatManager.rooms = {};
// Users is a list of all users that exist on the server
//   This will be paginated and populated as needed in the future
ChatManager.userlist = {};
// Private chats are conversations outside of a room between two or more users
ChatManager.activePrivateChats = [];
// activeChat is data on the currently focused chat which would be a room or private message
ChatManager.activeChat = null;

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

$('#edit-profile-button').on('click', function() {
  console.log("Editing users profile");
  ChatManager.editProfile();
  return false;
});

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
 * Create Room Modal Setup
 */
var buildCreateRoomModal = function() {
  console.log("Building create room modal");
  $('.modal.createroom').modal({
    detachable: true,
    //By default, if click outside of modal, modal will close
    //Set closable to false to prevent this
    closable: false,
    transition: 'fade up',
    //Callback function for the submit button, which has the class of "ok"
    onApprove : function() {
      //Submits the semantic ui form
      //And pass the handling responsibilities to the form handlers, e.g. on form validation success
      $('.ui.form.createroom').submit();
      //Return false as to not close modal dialog
      return false;
    }
  });
  $('#add-room-button').click(function(e) {
    //Resets form input fields
    $('.ui.form.createroom').trigger("reset");
    //Resets form error messages
    $('.ui.form.createroom .field.error').removeClass( "error" );
    $('.ui.form.createroom.error').removeClass( "error" );
    $('.modal.createroom').modal('show');
  });
};

$(document).ready( buildCreateRoomModal );

var formValidationRules = {
  name: {
    identifier : 'name',
    rules: [
    {
      type   : 'empty',
      prompt : 'Please enter a valid room name'
    }
    ]
  },
  topic: {
    identifier : 'topic',
    //Below line sets it so that it only validates when input is entered, and won't validate on blank input
    optional   : true,
    rules: [
    {
      type   : 'empty',
      prompt : 'Please enter a valid room topic'
    }
    ]
  },
}

var createRoomFormSettings = {
  onSuccess : function()
  {
    //Hides modal on validation success
    $('.modal.createroom').modal('hide');
    var data = {
      roomName: $('.ui.form.createroom input[name="name"]').val(),
      topic: $('.ui.form.createroom input[name="topic"]').val(),
      encryptionScheme: $('.dropdown.encryptionscheme .selected').data().value,
      keepHistory: $('.dropdown.messagehistory .selected').data().value,
      membershipRequired: $('.dropdown.membershiprequired .selected').data().value
    };
    socketClient.createRoom(data, function(err) {
      if (err) {
        return console.log("Error creating room: " + err);
      }
      console.log("Sent request to create room " + data.roomName);
    })
    return false;
  }
}

$('.ui.form.createroom').form(formValidationRules, createRoomFormSettings);


var buildRoomListModal = function() {
  $('.modal.join-room-list-modal').modal({
    detachable: true,
    closable: true,
    transition: 'fade up'
  })
  $('#room-list-button').click(function(e) {
    var roomListModalHtml = '';
    Object.keys(ChatManager.rooms).forEach(function(roomName) {
      roomListModalHtml += "<div class='item'>\n";
      if (ChatManager.rooms[roomName].membershipRequired) {
        roomListModalHtml += "  <i class='ui avatar huge lock icon room-list-avatar'></i>\n";
      } else {
        roomListModalHtml += "  <i class='ui avatar huge unlock alternate icon room-list-avatar'></i>\n";
      }
      roomListModalHtml += "  <div class='content'>\n";
      roomListModalHtml += "    <a id='" + roomName + "' class='header'>" + roomName + "</a>\n";
      roomListModalHtml += "    <div class='description'>" + ChatManager.rooms[roomName].topic + "</div>\n";
      roomListModalHtml += "  </div>\n";
      roomListModalHtml += "</div>\n";
    })
    $('.modal.join-room-list-modal .join-room-list').html(roomListModalHtml);
    Object.keys(ChatManager.rooms).forEach(function(roomName) {
      $('.modal.join-room-list-modal a[id="' + roomName + '"]').click(function() {
        socketClient.joinRoom(roomName, function(err) {
          $('.modal.join-room-list-modal').modal('hide');
          if (err) {
            return console.log("Error joining room: " + err);
          }
          console.log("Joined room " + roomName);
        })
      })
    })
    $('.modal.join-room-list-modal').modal('show');
  })
};

$(document).ready( buildRoomListModal );

/*
 * Catch clicks on room options dropdown
 */
$('.chat-header__settings .room-options.leave-room').click(function(e) {
  var chatName = ChatManager.activeChat.name;

  if (ChatManager.activeChat.type == 'privatechat') {
    var privateChatIndex = ChatManager.activePrivateChats.indexOf(chatName);

    if (privateChatIndex > -1) {
      ChatManager.activePrivateChats.splice(privateChatIndex, 1);
    }

    console.log("Destroying chat '", chatName, "'");

    ChatManager.destroyChat(chatName, function(err) {
      console.log("Chat destroyed. Updating private chats...");
      ChatManager.updatePrivateChats();
    });

  } else {

    socketClient.partRoom({ roomName: chatName }, function(err) {
      console.log("Sent request to part room " + chatName);
    })

  }
});

$('.chat-header__settings .room-options.edit-room').click(function(e) {
  var chatName = ChatManager.activeChat.name;
  var populateFormData = {
    name: chatName,
    group: ChatManager.chats[chatName].group,
    topic: ChatManager.chats[chatName].topic,
    encryptionScheme: ChatManager.chats[chatName].encryptionScheme,
    keepHistory: ChatManager.chats[chatName].keepHistory,
    membershipRequired: ChatManager.chats[chatName].membershipRequired
  };

  $('.edit-room-modal .edit-room-form').trigger('reset');

  ChatManager.populateEditRoomModal(populateFormData);

  $('.edit-room-modal').modal('show');
});

$('.chat-header__settings .room-options.manage-members').click(function(e) {
  var chatName = ChatManager.activeChat.name;
  var populateData = {
    name: chatName,
    members: ChatManager.chats[chatName].members
  };

  ChatManager.populateManageMembersModal(populateData);

  $('.manage-members-modal').modal('show');
});

/*
 * Populate edit-room modal
 */
ChatManager.populateEditRoomModal = function populateEditRoomModal(data) {
  $('.edit-room-modal [name="name"]').val(data.name);
  $('.edit-room-modal [name="group"]').val(data.group);
  $('.edit-room-modal [name="topic"]').val(data.topic);
  $('.edit-room-modal [name="encryption-scheme"]').val(data.encryptionScheme);
  $('.edit-room-modal .keep-history').dropdown('set selected', data.keepHistory);
  $('.edit-room-modal .membership-required').dropdown('set selected', data.membershipRequired);
};

ChatManager.populateManageMembersModal = function populateManageMembersModal(data) {
  var members = data.members;
  var admins = data.admins;
  var owner = data.owner;

  var manageMembersList = $('.manage-members-modal .manage-members-list');

  manageMembersList.empty();

  members.forEach(function(member) {

    var li = $('<li/>')
      .addClass('manage-members-list-item')
      .appendTo(manageMembersList);

    var member = $('<span/>')
      .addClass('manage-members-list-member')
      .text(member)
      .appendTo(li);

    var membershipDropdown = $('<select/>')
      .addClass('ui')
      .addClass('dropdown')
      .addClass('manage-members-list-membership-dropdown')
      .html('<option value="member">member</option><option class="admin">admin</option>')
      .appendTo(li);
  })
};

/*
 * Show an error to the user
 */
ChatManager.showError = function showError(message) {
  $(".ui.modal.error")
    .modal('setting', 'closable', false)
    .modal("show");

  $(".ui.modal.error .content").text(message);
};

ChatManager.userSignedIn = function userSignedIn() {
  // TODO: This should be smarter and have a sane default in the DB as well as a better default image
  var emailHash = ChatManager.userlist[window.userName].emailHash || "00000000000";
  $('#menu-header-profile .ui.dropdown .avatar').attr("style", "background-image: url('https://www.gravatar.com/avatar/" + emailHash + "?s=64')");
  $('#menu-header-profile .ui.dropdown .text.username').text(window.userName);
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
  var self = this;
  console.log("Adding room " + room.name + " to the room list");
  // TODO: Should store online status for members and messages in an object or array also
  self.chats[room.name] = { name: room.name, members: [], type: 'room', topic: room.topic, group: room.group, messages: "", encryptionScheme: room.encryptionScheme, keepHistory: room.keepHistory, membershipRequired: room.membershipRequired, members: room.members, admins: room.admins, owner: room.owner };

  self.focusChat({ id: room.name }, function(err) {
    self.updateRoomList(function(err) {
    // Set focus to room
    console.log("About to set room focus to " + room.name);
      console.log("Room focus for " + room.name + " done");
      callback(null);
    });
  });
};

ChatManager.updateChatHeader = function updateChatHeader(room) {
  var self = this;
  // update p chat-header__title
  var chat = ChatManager.chats[room];
  var headerAvatarHtml = '';

  if (chat.type == 'privatechat') {
    headerAvatarHtml = '<i class="huge spy icon"></i>';
  } else {
    headerAvatarHtml = '<i class="huge comments outline icon"></i>';
  }
  $('.chat-header__avatar').html(headerAvatarHtml);
  $('.chat-header__title').text(chat.group + '/' + chat.name);
  // update p chat-topic
  $('.chat-topic').text(chat.topic);
}

/*
 * Remove room from client
 */
ChatManager.destroyChat = function destroyChat(chat, callback) {
  delete ChatManager.chats[chat];
  var sortedChats = Object.keys(ChatManager.chats).sort();
  var lastChat = ChatManager.chats[sortedChats[sortedChats.length - 1]];
  ChatManager.activeChat = lastChat;
  // TODO: Make this focusChat and do th elogic inside of the function to determine what to do for private chats vs rooms
  ChatManager.focusChat({ id: lastChat.name }, function(err) {
    ChatManager.updateRoomList(function(err) {
      callback(null);
    });
  });
}

/*
 * Set the specified chat to be in focus for the user
 */
ChatManager.focusChat = function focusChat(data, callback) {
  var id = data.id;
  if (ChatManager.chats[id].type == 'room') {
    var messages = $('#chat');

    console.log("Setting activeChat to room: " + id + " type: room");
    ChatManager.activeChat = { name: id, type: 'room' };

    // Update the content in the room for the desired room to be in focus
    ChatManager.refreshChatContent(id);

    // Scroll to the most recent message
    // TODO: This should remember the last position the window was scrolled to
    messages[0].scrollTop = messages[0].scrollHeight;

    ChatManager.updateRoomUsers({ room: id });
  }
  else if (ChatManager.chats[id].type == 'privatechat') {

    ChatManager.activeChat = { name: id, type: 'privatechat' };

    // Init private message for user if it does not exist
    if (ChatManager.chats[id] == null) {
      console.log("WARNING!! Shouldn't be init'ing chat here!");
      ChatManager.chats[id] = { name: user, type: 'privatechat', messages: "", topic: 'Private conversation...', group: 'PM' };
    }

    // Display private messages for user in the room element
    ChatManager.refreshChatContent(id);
  }

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
  console.log("Updating room list!");
  var chatNames = Object.keys(ChatManager.chats)
  chatNames.forEach(function(chatName) {
    if (ChatManager.chats[chatName].type == 'room') {
      // Catch clicks on the room list to update room focus
      if ( !$('#room-list #' + chatName).length ) {
        if ( ChatManager.activeChat.name && ChatManager.activeChat.name == chatName ) {
          console.log("Active chat is " + ChatManager.activeChat.name);
          var roomListHtml = '<li class="room chat-list-item-selected" id="' + chatName + '">' + chatName + '</li>';
        } else {
          var roomListHtml = '<li class="room chat-list-item" id="' + chatName + '">' + chatName + '</li>';
        }
        $('#room-list').append(roomListHtml);
        console.log("Added " + chatName + " to room-list");
      }
      $("#" + chatName).click(function() {
        ChatManager.focusChat({ id: chatName }, function(err) {
          // Room focus complete
        });
      });
    }
  });
  callback(null);
};

ChatManager.updatePrivateChats = function updatePrivateChats() {
  var self = this;

  // Get a list of all chats that are type private message
  var userListHtml = "";

  //Object.keys(ChatManager.chats).forEach(function(key) {
  //  if (ChatManager.chats[key].type == 'privatechat') {
  //    privateChatNames.push(ChatManager.chats[key].name);
  //  }
  //})

  ChatManager.activePrivateChats.forEach(function(userName) {
    var privateChat = ChatManager.chats[userName];
    var emailHash = ChatManager.userlist[window.userName].emailHash || "00000000000";

    if ( ChatManager.activeChat.name && ChatManager.activeChat.name == userName ) {
      userListHtml += "<li class='private-chat chat-list-item-selected' id='" + userName + "'><div class='private-chat-list-avatar' style=\"background-image: url('https://www.gravatar.com/avatar/" + emailHash + "?s=64')\" data-original-title=\"\"></div>" + userName + "</li>\n";
    } else {
      userListHtml += "<li class='private-chat chat-list-item' id='" + userName + "'><div class='private-chat-list-avatar' style=\"background-image: url('https://www.gravatar.com/avatar/" + emailHash + "?s=64')\" data-original-title=\"\"></div>" + userName + "</li>\n";
    }
  });

  $('#chat-list').html(userListHtml);

  ChatManager.activePrivateChats.forEach(function(userName) {
    if (userName !== window.userName) {
      $('#' + userName).unbind().click(function() {
        ChatManager.focusChat({ id: userName }, function(err) {
          // Done
        });
      });
    }
  });
}

/*
 * Update the user list on the left bar
 */
ChatManager.updateRoomUsers = function updateRoomUsers(data) {
  var room = data.room;

  // BUG: This is null sometimes
  var members = ChatManager.chats[room].members;

  //debugger;
  //if (data.userlist) {
  //  ChatManager.chats[room].members = data.userlist;
  //  members = data.userlist;
  //}
  // BUG: members is not being looped over properly here

  var userListHtml = "";
  console.log("[CHAT MANAGER] (updateRoomUsers) members: "+JSON.stringify(members));
  console.log("[CHAT MANAGER] (updateRoomUsers) chats: ", Object.keys(ChatManager.chats));
  members.forEach(function(username) {
    //debugger;
    var user = ChatManager.userlist[username];
    if ( !ChatManager.chats[username] ) {
      console.log("chat for " + username + " was empty so initializing");
      ChatManager.chats[username] = { name: username, type: 'privatechat', group: 'pm', messages: "", topic: "One to one encrypted chat with " + username };
      ChatManager.updatePrivateChats();
    }
    var emailHash = "0";
    if (user && user.emailHash) {
      var emailHash = user.emailHash;
    }
    userListHtml += "<li class='user-list-li' id='userlist-" + username + "' name='" + username + "' data-content='" + username + "'>\n";
    userListHtml += "  <div class=\"user-list-avatar avatar-m avatar\" style=\"background-image: url('https://www.gravatar.com/avatar/" + emailHash + "?s=64')\" data-original-title=''>\n";
    userListHtml += "  </div>\n";
    userListHtml += "</li>\n";
  });
  $('#user-list').html(userListHtml);
  members.forEach(function(username) {
    $('#userlist-' + username).popup({
      inline: true
    })

    $('.user-list-li').click(function() {
      var username = $( this ).attr('name');
      console.log("Populating user popup for", username);
      ChatManager.populateUserPopup(username);
      $('.userPopup').removeClass('popover-hidden').addClass('popover');
      $(document).mouseup(function (e)
      {
          var container = $('.userPopup');
          if (!container.is(e.target)
            && container.has(e.target).length === 0)
          {
            $('.userPopup').removeClass('popover').addClass('popover-hidden');
            //container.hide();
          }
      });
    });
  });
};

/*
 * Populates the popup when mousing over a users name or avatar on the user list
 */
ChatManager.populateUserPopup = function populateUserPopup(username) {
  // Get full name from users object here
  var fullName = 'Default Name';
  var emailHash = ChatManager.userlist[window.userName].emailHash || "00000000000";
  var avatarHtml = "<img src='https://www.gravatar.com/avatar/" + emailHash + "?s=256' class='avatar-l'>";
  $('.userPopup .avatar').html(avatarHtml);
  $('.userPopup .fullName').text(fullName);
  var usernameHtml = "<a href='http://pipo.chat/users/" + username + "' target='_blank'>" + username + "</a>";
  $('.userPopup .username').html(usernameHtml);
  $('.userPopup .privateChatButton').unbind().click(function() {
    if (username !== window.userName) {
      ChatManager.activePrivateChats.push(username);
      ChatManager.focusChat({ id: username }, function(err) {
        if ( !ChatManager.chats[username] ) {
          console.log("chat for " + username + " was empty so initializing");
          ChatManager.chats[username] = { name: username, type: 'privatechat', group: 'pm', messages: "", topic: "One to one encrypted chat with " + username };
        }
        ChatManager.updatePrivateChats();
        // Done
      });
    }
  })
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

  var mentionRegexString = '.*@' + window.userName + '.*';
  var mentionRegex = new RegExp(mentionRegexString);
  console.log("Running mention regex: " + message.match(mentionRegex));
  if (message.match(mentionRegex)) {
    ChatManager.sendNotification(null, 'You were just mentioned by ' + fromUser + ' in room #' + room, message, 3000);
  };

  this.addMessageToChat({ type: 'room', message: message, fromUser: fromUser, chat: room });
  messages[0].scrollTop = messages[0].scrollHeight;
};

ChatManager.handlePrivateMessage = function handlePrivateMessage(message, fromUser, toUser) {
  // If we're the ones sending the message we should add it to the correct place
  if (fromUser == window.userName) {
    var chat = toUser;
  } else {
    var chat = fromUser;
  }
  if (ChatManager.activeChat.name !== fromUser) {
    ChatManager.sendNotification(null, 'Private message from ' + fromUser, message, 3000);
  }

  ChatManager.addMessageToChat({ type: 'privatechat', fromUser: fromUser, chat: chat, message: message });
  // TODO: Show chat here and add to chat list if it does not exist there already
  // BOOKMARK
  //
  ChatManager.activePrivateChats.push(fromUser);
  console.log("Updating private chats");
  debugger;
  ChatManager.updatePrivateChats();

};

ChatManager.addMessageToChat = function addMessageToChat(data) {
  var type = data.type;
  var message = data.message;
  var id = data.id;
  var fromUser = data.fromUser;
  var chat = data.chat;
  var chatContainer = $('#chat');

  //Add timestamp
  var time = new Date().toISOString();
  //message += ' <span style="float:right;" title="' + time + '" data-livestamp="' + time + '"></span>';

  ChatManager.formatChatMessage({ message: message, fromUser: fromUser }, function(messageHtml) {
    if (ChatManager.chats[chat] == null) {
      ChatManager.chats[chat] = { name: chat, messages: '' };
    }

    //ChatManager.chats[chat].messages = ChatManager.chats[chat].messages.concat("<li>" + message + "</li>");
    ChatManager.chats[chat].messages = ChatManager.chats[chat].messages.concat(messageHtml);

    if (ChatManager.activeChat.name == chat) {
      ChatManager.refreshChatContent(chat);
      chatContainer[0].scrollTop = chatContainer[0].scrollHeight;
    }
    // BOOKMARK
  })
};

ChatManager.formatChatMessage = function formatChatMessage(data, callback) {
  var message = data.message;
  var fromUser = data.fromUser;
  var emailHash = ChatManager.userlist[fromUser].emailHash || "00000000000";

  var time = new Date().toISOString();
  var messageHtml = '<div class="chat-item"><div class="chat-item__container"> <div class="chat-item__aside"> <div class="chat-item__avatar"> <span class="widget"><div class="trpDisplayPicture avatar-s avatar" style="background-image: url(\'https://www.gravatar.com/avatar/' + emailHash + '?s=64\')" data-original-title=""> </div> </span> </div> </div> <div class="chat-item__actions js-chat-item-actions"> <i class="chat-item__icon chat-item__icon--read icon-check js-chat-item-readby"></i> <i class="chat-item__icon icon-ellipsis"></i> </div> <div class="chat-item__content"> <div class="chat-item__details"> <div class="chat-item__from js-chat-item-from">' + fromUser + '</div> <div class="chat-item__time js-chat-item-time chat-item__time--permalinkable"> <span style="float:right;" title="' + time + '" data-livestamp="' +  time + '"></span> </div> </div> <div class="chat-item__text js-chat-item-text">' + message + '</div> </div> </div></div>';
  return callback(messageHtml);
};

ChatManager.refreshChatContent = function refreshChatContent(room) {
  console.log("Refreshing room content for ", room);
  $('#chat').html(ChatManager.chats[room].messages);
  ChatManager.updateChatHeader(room);
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
    console.log("Split command is: " + splitCommand.toString());

    // Catch join command
    if (splitCommand[0] == "join") {
      var room = splitCommand[1];
      socketClient.joinRoom(room, function(err) {
        console.log("Sent request to join room " + room);
      });
    }
    else if (splitCommand[0] == "part") {
      var roomName = splitCommand[1];
      socketClient.partRoom({ roomName: roomName }, function(err) {
        console.log("Sent request to part room " + roomName);
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
      currentChannel = ChatManager.activeChat.name;
      socketClient.sendServerCommand({ command: regexResult[1], currentChat: ChatManager.activeChat.name });
      console.log("Sending command '" + regexResult[1] + "' to server");
    }
    $('#message-input').val('');
  }
  else {
    ChatManager.prepareMessage(input, function(err, preparedInput) {
      console.log("Active chat type is: " + ChatManager.activeChat.type);
      if (ChatManager.activeChat.type == 'room') {
        console.log("Sending message to room #"+ChatManager.activeChat.name);
        window.socketClient.sendMessage(ChatManager.activeChat.name, preparedInput);
      }
      else if (ChatManager.activeChat.type == 'privatechat') {
        var userName = ChatManager.activeChat.name;
        console.log("Sending private mesage to '" + userName + "' with message '" + preparedInput + "'");
        ChatManager.handlePrivateMessage(preparedInput, window.userName, userName);
        socketClient.sendPrivateMessage(userName, preparedInput);
      }
      else {
        return console.log("ERROR: No activeChatType!");
      }
    })
  }
};

ChatManager.showHelp = function showHelp() {
  var helpTextArray = [ "** ROOM Commands **", "/room [room] member add [member]" ];
  helpTextArray.forEach(function(msg) {
    ChatManager.addMessageToChat({ type: ChatManager.activeChat.type, message: msg, chat: ChatManager.activeChat.name });
  })
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
      var userName = $('.create.form #username').val().toString();
      var password = $('.create.form #password').val().toString();
      var email = $('.create.form #email').val().toString();
      var confirmPassword = $('.create #confirmPassword').val().toString();

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
          //console.log("[CHAT MANAGER] (promptForCredentials) Generated client key pair.");

          window.userName = userName;
          window.email = email;
          window.fullName = fullName;

          //console.log("[CHAT MANAGER] (promptForCredentials) userName: "+userName+" window.userName: "+window.userName);
          localStorage.setItem('userName', userName);
          localStorage.setItem('keyPair', JSON.stringify(generatedKeypair));
          localStorage.setItem('email', email);
          debugger;
          //console.log("[CHAT MANAGER] (promptForCredentials) Saved clientKeyPair to localStorage");
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
