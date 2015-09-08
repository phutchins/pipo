var userMap = {};
var roomUsers = {};

var ChatManager = {};

// Chats are rooms or private chats that the user is currently participating in
// chats['chatname'] = { type: 'room', name: 'chatname', messages: [ { fromuser: 'username', message: 'hi there' } ] }
ChatManager.chats = {};

// userlist is a list of all users that exist on the server
//   This will be paginated and populated as needed in the future
ChatManager.userlist = {};
// Private chats are conversations outside of a room between two or more users
ChatManager.userIdMap  = {};

ChatManager.activePrivateChats = [];
// activeChat is data on the currently focused chat which would be a room or private message
ChatManager.activeChat = null;
ChatManager.lastActiveChat = null;

var systemUsername = 'pipo';
var host = window.location.host;
var socket = io(host+'/main');
var clientKeyPassword = null;
var masterKeyPassword = 'pipo';
var amountOfSpaceNeeded = 5000000;
var defaultRoomName = null;
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


function fitToContent(id, maxHeight) {
  var text = id && id.style ? id : document.getElementById(id);
  if ( !text )
    return;

  /* Accounts for rows being deleted, pixel value may need adjusting */
  if (text.clientHeight == text.scrollHeight) {
    text.style.height = "30px";
  }

  var adjustedHeight = text.clientHeight;
  if ( !maxHeight || maxHeight > adjustedHeight ) {
    adjustedHeight = Math.max(text.scrollHeight, adjustedHeight);
    if ( maxHeight )
      adjustedHeight = Math.min(maxHeight, adjustedHeight);
    if ( adjustedHeight > text.clientHeight )
      text.style.height = adjustedHeight + "px";
  }
}


$('#message-input').keyup(function (event) {
  if (event.keyCode == 13 && event.shiftKey) {
    var content = this.value;
    var caret = ChatManager.getCaret(this);
    this.value = content.substring(0,caret)+content.substring(caret,content.length);
    event.stopPropagation();
    console.log("got shift+enter");
    var $messageInput = $('#message-input');
    fitToContent('message-input', 156);
    $messageInput[0].scrollTop = $messageInput[0].scrollHeight;
    return false;
  } else if(event.keyCode == 13) {
    ChatManager.sendMessage(function() {
      fitToContent('message-input', 156);
      return false;
    })
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
      name: $('.ui.form.createroom input[name="name"]').val(),
      topic: $('.ui.form.createroom input[name="topic"]').val(),
      encryptionScheme: $('.dropdown.encryptionscheme .selected').data().value,
      keepHistory: ($('.dropdown.messagehistory .selected').data().value === 'keep'),
      membershipRequired: ($('.dropdown.membershiprequired .selected').data().value === 'private')
    };

    socketClient.createRoom(data, function(err) {
      if (err) {
        return console.log("Error creating room: " + err);
      }
      console.log("Sent request to create room " + data.name);
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
    Object.keys(ChatManager.chats).forEach(function(roomName) {
      roomListModalHtml += "<div class='item'>\n";
      if (ChatManager.chats[roomName].type == 'room' && ChatManager.chats[roomName].membershipRequired) {
        roomListModalHtml += "  <i class='ui avatar huge lock icon room-list-avatar'></i>\n";
      } else {
        roomListModalHtml += "  <i class='ui avatar huge unlock alternate icon room-list-avatar'></i>\n";
      }
      roomListModalHtml += "  <div class='content'>\n";
      roomListModalHtml += "    <a id='" + roomName + "' class='header'>" + roomName + "</a>\n";
      roomListModalHtml += "    <div class='description'>" + ChatManager.chats[roomName].topic + "</div>\n";
      roomListModalHtml += "  </div>\n";
      roomListModalHtml += "</div>\n";
    })
    $('.modal.join-room-list-modal .join-room-list').html(roomListModalHtml);
    Object.keys(ChatManager.chats).forEach(function(roomName) {
      if (ChatManager.chats[roomName].type == 'room') {
        $('.modal.join-room-list-modal a[id="' + roomName + '"]').click(function() {
          socketClient.joinRoom(roomName, function(err) {
            $('.modal.join-room-list-modal').modal('hide');
            if (err) {
              return console.log("Error joining room: " + err);
            }
            // Set the active chat to the currently joined room so that it is displayed when the join is complete
            ChatManager.lastActiveChat = activeChat;
            ChatManager.activeChat = ({ type: 'room', name: roomName });

            console.log("Joined room " + roomName);
          })
        })
      }
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

  if (ChatManager.activeChat.type == 'chat') {
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

    socketClient.partRoom({ name: chatName }, function(err) {
      console.log("Sent request to part room " + chatName);
    })

  }
});


/*
 * Builds the edit room modal
 */
var buildEditRoomModal = function() {
  $('.modal.editroom').modal({
    detachable: true,
    //By default, if click outside of modal, modal will close
    //Set closable to false to prevent this
    closable: false,
    transition: 'fade up',
    //Callback function for the submit button, which has the class of "ok"
    onApprove : function() {
      //Submits the semantic ui form
      //And pass the handling responsibilities to the form handlers, e.g. on form validation success
      $('.ui.form.editroom').submit();
      //Return false as to not close modal dialog
      return false;
    }
  });

  // Opens the edit room modal when edit room is clicked
  $('.chat-header__settings .room-options.edit-room').click(function(e) {
    var roomName = ChatManager.activeChat.name;
    var populateFormData = {
      id: ChatManager.chats[roomName].id,
      name: roomName,
      group: ChatManager.chats[roomName].group,
      topic: ChatManager.chats[roomName].topic,
      encryptionScheme: ChatManager.chats[roomName].encryptionScheme,
      keepHistory: ChatManager.chats[roomName].keepHistory,
      membershipRequired: ChatManager.chats[roomName].membershipRequired
    };

    // Reset the form before we show it
    $('.modal.editroom .form').trigger('reset');

    // Populate the fields of the form
    ChatManager.populateEditRoomModal(populateFormData);

    // Show modal
    $('.modal.editroom').modal('show');
  });
};

$(document).ready( buildEditRoomModal );

var editRoomFormSettings = {
  onSuccess : function()
  {
    //Hides modal on validation success
    $('.modal.editroom').modal('hide');
    var data = {
      id: $('.ui.form.editroom input[name="id"]').val(),
      name: $('.ui.form.editroom input[name="name"]').val(),
      topic: $('.ui.form.editroom input[name="topic"]').val(),
      encryptionScheme: $('.ui.form.editroom .dropdown.encryptionscheme .selected').data().value,
      keepHistory: $('.ui.form.editroom .dropdown.keephistory .selected').data().value,
      membershipRequired: $('.ui.form.editroom .dropdown.membershiprequired .selected').data().value
    };
    console.log("Sending room update socket request with data:", data);
    socketClient.updateRoom(data, function(err) { if (err) {
        return console.log("Error creating room: " + err);
      }
      console.log("Sent request to update room " + data.name);
    })
    return false;
  }
}

var editRoomFormValidationRules = {
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

// Binds the validation rules and form settings to the form
$('.ui.form.editroom').form(editRoomFormValidationRules, editRoomFormSettings);




$('.chat-header__settings .room-options.manage-members').click(function(e) {
  ChatManager.populateManageMembersModal({ roomName: ChatManager.activeChat.name, clearMessages: true });

  $('.manage-members-modal').modal('show');
});


/*
 * Populate edit-room modal
 */
ChatManager.populateEditRoomModal = function populateEditRoomModal(data) {
  $('.modal.editroom [name="id"]').val(data.id);
  $('.modal.editroom [name="name"]').val(data.name);
  $('.modal.editroom [name="group"]').val(data.group);
  $('.modal.editroom [name="topic"]').val(data.topic);
  $('.modal.editroom [name="encryptionscheme"]').val(data.encryptionScheme);
  $('.modal.editroom .keephistory').dropdown('set selected', data.keepHistory);
  $('.modal.editroom .membershiprequired').dropdown('set selected', data.membershipRequired);
};

ChatManager.populateManageMembersModal = function populateManageMembersModal(data) {
  if (!data) { data = {} }

  var roomName = (typeof data.roomName === 'undefined') ? ChatManager.activeChat.name : data.roomName;
  var clearMessages = (typeof data.clearMessages === 'undefined') ? true : data.clearMessages;

  var members = ChatManager.chats[roomName].members;
  var admins = ChatManager.chats[roomName].admins;
  var owner = ChatManager.chats[roomName].owner;


  // Clear notifications
  if (clearMessages) {
    $('.manage-members-modal #manageMembersError').text('');
    $('.manage-members-modal #manageMembersMessage').text('');
  }

  var manageMembersList = $('.manage-members-modal .manage-members-list');
  $('.manage-members-modal .roomname').val(roomName);

  manageMembersList.empty();

  var memberDropdownTypes = ['admin', 'member'];

  var allMembers = {
    "owner": [ owner ],
    "admin": admins,
    "member": members
  };

  Object.keys(allMembers).forEach(function(key) {
    var memberSet = allMembers[key];

    if (memberSet) {
      memberSet.forEach(function(member) {

        var dropdownHtml = '';

        var li = $('<li/>')
          .addClass('manage-members-list-item')
          .addClass(member)
          .appendTo(manageMembersList);

        var memberSpan = $('<span/>')
          .addClass('manage-members-list-member')
          .text(member)
          .appendTo(li);

        var optionsDiv = $('<div/>')
          .addClass('manage-members-list-options')
          .appendTo(li);

        var membershipDropdown = $('<select/>')
          .addClass('ui')
          .addClass('dropdown')
          .addClass('manage-members-list-membership-dropdown')
          .html('<option class="member">member</option><option class="admin">admin</option><option class="owner">owner</option><option class="remove">remove</option>')
          .appendTo(optionsDiv);

        var membershipChangeSave = $('<button/>')
          .attr('id', member)
          .addClass('ui')
          .addClass('primary')
          .addClass('button')
          .addClass('save')
          .addClass(member)
          .text('Save')
          .appendTo(optionsDiv);

        $('.manage-members-list-item.' + member + ' .' + key).prop('selected', 'true');

        /*
         * Catch click on membership save button
         */
        // TODO: Need to add the users ID to the userlist object
        $('.manage-members-list .button.save.' + member).click(function(e) {
          console.log("[ADD MEMBER] Caught membership save button click");

          var roomName = $('.manage-members-modal .roomname').val();
          var modifyMember = e.currentTarget.id;
          var newMembership = e.currentTarget.previousSibling.value;

          var membershipData = ({
            type: 'modify',
            member: modifyMember,
            roomName: roomName,
            membership: newMembership
          });

          socketClient.membership(membershipData);
          // TODO: Create a waiting for update method to add "Please wait..." or something similar to the modal while we wait for response from server
        })
      })
    }
  })
};

// Catch click on .button.addmember
$('.manage-members-modal .button.addmember').click(function(e) {
  console.log("[ADD MEMBER] Caught add member button click");
  var member = $('.manage-members-modal .membername').val();
  var roomName = $('.manage-members-modal .roomname').val();
  var membership = $('.manage-members-modal .membership .selected').text();

  var membershipData = ({
    type: 'add',
    member: member,
    roomName: roomName,
    membership: membership
  });

  console.log("[ADD MEMBER] Sending membership data to socketClient");
  socketClient.membership(membershipData);

  $('.manage-members-modal .membername').val('');
})


ChatManager.init = function() {
  if (window.userName) {
    ChatManager.updateProfileHeader();
  };
};




/*
 * Show an error to the user
 */
ChatManager.showError = function showError(message) {
  // TODO: Add property for which modal to show error on
  $(".ui.modal.error")
    .modal('setting', 'closable', false)
    .modal("show");

  $(".ui.modal.error .content").text(message);
};

ChatManager.showErrorOnModal = function showErrorOnModal(data) {
  var message = data.message;
  var modal = data.modal;

};


ChatManager.updateProfileHeader = function updateProfileHeader() {
  // TODO: This should be smarter and have a sane default in the DB as well as a better default image
  var emailHash = "0";

  if (ChatManager.userlist[window.userName]) {
    emailHash = ChatManager.userlist[window.userName].emailHash || "0";
  }

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
  console.log("Room is : ",room);

  // Decrypt room messages

  // Format room messages
  self.chats[room.name] = { id: room.id,
    name: room.name,
    type: 'room',
    topic: room.topic,
    group: room.group,
    messages: room.messages,
    decryptedMessages: '',
    messageCache: '',
    encryptionScheme: room.encryptionScheme,
    keepHistory: room.keepHistory,
    membershipRequired: room.membershipRequired,
    members: room.members,
    admins: room.admins,
    owner: room.owner
  };

  console.log("About to set room focus to " + room.name);

  // Decrypt messages and HTMLize them
  var messages = self.chats[room.name].messages.sort(dynamicSort("date"));
  var count = 0;
  var messageArray = Array(messages.length);

  /*
   * Need a better way to detect when done decrypting all messages
   * and add them to the chat after done
   * Also we should only send messages to each user starting at their join date or
   * the date/time that they were added to a room
   */
  messages.forEach(function(message, key) {
    window.encryptionManager.decryptMessage(message.encryptedMessage, function(err, decryptedMessage) {
      var encryptedMessage = message.encryptedMessage;
      var decryptedMessage = decryptedMessage;
      var myFingerprint = window.encryptionManager.keyManager.get_pgp_key_id().toString('hex');
      if (err) {
        decryptedMessage = 'Unable to decrypt...\n';
        console.log("Error decrypting message : ");
      }

      // Cache the decrypted message
      messageArray[key] = decryptedMessage.toString();
      count++;
      if (messages.length === count) {
        messageArray.forEach(function(decryptedMessageString, key) {
          var fromUser = self.chats[room.name].messages[key].fromUser;
          var date = self.chats[room.name].messages[key].date;

          self.chats[room.name].messages[key].decryptedMessage = decryptedMessageString;
          ChatManager.addMessageToChat({ type: 'room', messageString: decryptedMessageString, date: date, fromUser: fromUser, chat: room.name });
        });
      };
    })
  })

  self.updateRoomList(function(err) {
    console.log("Update room list done...");
    callback(null);
  });

  if (ChatManager.activeChat && ChatManager.activeChat.name == room.name) {
    self.focusChat({ id: room.name }, function(err) {
      console.log("Room focus for " + room.name + " done");
    });
  }
};

ChatManager.initChat = function initChat(chat, callback) {
  var self = this;
  var messages = new Array();
  var participants = new Array();
  var chatName = '';
  var id = '';

  if (chat !== null) {
    messages = chat.messages || [];
    participants = chat.participants || [];
    id = chat.id;
  };

  console.log("Running init on chat '" + chat.id);

  // Private chat between two users
  if (chat.participants.length == 2) {
    chat.participants.forEach(function(participantId) {
      // Set the chatName to the name of the user with this userid
      if  (participantId !== ChatManager.userlist[window.userName].id) {
        console.log("[initChat] Set chatName to '" + chatName + "'");
        chatName = ChatManager.userIdMap[participantId];
      }
    });
  }

  // Group chat between 3 or more users
  if (participants.length > 2) {

  }

  self.chats[chatName] = {
    id: chat.id,
    type: 'chat',
    participants: participants,
    messages: messages,
    messageCache: ''
  };

  var count = 0;
  var messageArray = Array(messages.length);

  messages.forEach(function(message, key) {
    window.encryptionManager.decryptMessage(message.encryptedMessage, function(err, decryptedMessage) {
      var encryptedMessage = message.encryptedMessage;
      var decryptedMessage = decryptedMessage;

      count++;

      if (err) {
        decryptedMessage = 'Unable to decrypt...\n';
        console.log("Error decrypteing message: ", err);
      }

      messageArray[key] = decryptedMessage.toString();
      console.log("[initChat] messages.length '" + messages.length + "' count '" + count + "'");
      if (messages.length === count) {
        messageArray.forEach(function(decryptedMessageString, key) {

          var fromUser = messages[key].fromUser;
          var date = messages[key].date;

          self.chats[chatName].messages[key].decryptedMessage = decryptedMessageString;
          ChatManager.addMessageToChat({ type: 'chat', messageString: decryptedMessageString, date: date, fromUser: fromUser, chat: chatName });
        });
      };
    })
  });

  self.updateRoomList(function(err) {
    console.log("Update room list for initChat done...");
    callback(null);
  })

  if (ChatManager.activeChat && ChatManager.activeChat.name == chat.id) {
    self.focusChat({ id: chat.id }, function(err) {
      console.log("Room focus for " + chat.id + " done");
    });
  }
};


function dynamicSort(property) {
    var sortOrder = 1;
    if(property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a,b) {
        var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}

ChatManager.updateChatHeader = function updateChatHeader(chatName) {
  var self = this;
  var chat = ChatManager.chats[chatName];
  var headerAvatarHtml = '';
  var chatTopic = '';
  var chatHeaderTitle = '';

  if (chat.type == 'chat') {
    headerAvatarHtml = '<i class="huge spy icon"></i>';
    chatTopic = 'One to one encrypted chat with ' + chat.name;
    chatHeaderTitle = 'pm' + '/' + chat.name;
  } else {
    headerAvatarHtml = '<i class="huge comments outline icon"></i>';
    chatTopic = ChatManager.chats[chatName].topic;
    chatHeaderTitle = ChatManager.chats[chatName].group + '/' + chat.name;
  }

  $('.chat-topic').text(chatTopic);
  $('.chat-header__title').text(chatHeaderTitle);
  $('.chat-header__avatar').html(headerAvatarHtml);
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
  var type = ChatManager.chats[id].type;

  if (ChatManager.chats[id].type == 'room') {
    var messages = $('#chat');

    console.log("Setting activeChat to room: " + id + " type: room");
    ChatManager.activeChat = { name: id, type: 'room' };
    window.activeChat = ChatManager.activeChat;

    // Update the content in the room for the desired room to be in focus
    ChatManager.refreshChatContent(id);

    // Scroll to the most recent message
    // TODO: This should remember the last position the window was scrolled to
    messages[0].scrollTop = messages[0].scrollHeight;

    ChatManager.updateRoomUsers({ room: id });
  } else if (type == 'chat') {

    ChatManager.activeChat = { name: id, type: 'chat' };

    // Init private message for user if it does not exist
    if (ChatManager.chats[id] == null) {
      console.log("WARNING!! Shouldn't be init'ing chat here!");
      ChatManager.chats[id] = { name: user, type: 'chat', messages: "", topic: 'Private conversation...', group: 'PM' };
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
  var self = this;

  var room = data.room;
  var socket = data.socket;

  var members = ChatManager.chats[room].members;
  var userListHtml = "";

  console.log("[CHAT MANAGER] (updateRoomUsers) members: "+JSON.stringify(members));
  console.log("[CHAT MANAGER] (updateRoomUsers) chats: ", Object.keys(ChatManager.chats));

  if (members.length > 0) {
    members.forEach(function(username) {
      console.log("[CHAT MANAGER] (updateRoomUsers) looping user:",username);
      var user = ChatManager.userlist[username];

      if ( !ChatManager.chats[username] && username != window.userName ) {
        console.log("chat for ",username," was empty so initializing");
        console.log("[updateRoomUsers] GETCHAT - calling getChat from updateRoomUsers");

        socket.emit('getChat', { participantIds: [ ChatManager.userlist[username].id, ChatManager.userlist[window.userName].id ]});

        // Create the chat so that is iready for the new data we are getting from getChat
        ChatManager.chats[username] = { name: username, type: 'chat', group: 'pm', messages: "", messageCache: "", topic: "One to one encrypted chat with " + username };

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
  }

  $('#user-list').html(userListHtml);

  if (members.length > 0) {
    members.forEach(function(username) {
      $('#userlist-' + username).popup({
        inline: true
      })

      $('.user-list-li').click(function() {
        var username = $( this ).attr('name');
        console.log("Populating user popup for", username);
        ChatManager.populateUserPopup({ username: username, socket: socket });
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
  }
};

/*
 * Populates the popup when mousing over a users name or avatar on the user list
 */
ChatManager.populateUserPopup = function populateUserPopup(data) {
  var self = this;
  var username = data.username;
  var socket = data.socket;

  // Get full name from users object here
  var fullName = 'Default Name';
  var emailHash = ChatManager.userlist[username].emailHash || "00000000000";
  var avatarHtml = "<img src='https://www.gravatar.com/avatar/" + emailHash + "?s=256' class='avatar-l'>";

  $('.userPopup .avatar').html(avatarHtml);
  $('.userPopup .fullName').text(fullName);

  var usernameHtml = "<a href='http://pipo.chat/users/" + username + "' target='_blank'>" + username + "</a>";

  $('.userPopup .username').html(usernameHtml);

  $('.userPopup .privateChatButton').unbind().click(function() {
    if (username !== window.userName) {
      ChatManager.activePrivateChats.push(username);
      $('.userPopup').removeClass('popover').addClass('popover-hidden');

      console.log("[DEBUG] Emitting 'getChat' to get chat with '" + ChatManager.userlist[username].id + "' and '" + ChatManager.userlist[window.userName].id + "'");

      // BOOKMARK
      //socket.emit('getChat', { participantIds: [ ChatManager.userlist[username].id, ChatManager.userlist[window.userName].id ] });

      ChatManager.focusChat({ id: username }, function(err) {
        if ( !ChatManager.chats[username] ) {
          console.log("chat for " + username + " was empty so initializing");
          ChatManager.chats[username] = { name: username, type: 'chat', group: 'pm', messages: "", topic: "One to one encrypted chat with " + username };
        }
        ChatManager.updatePrivateChats();
        // Done
      });
    }
  })
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
  var messageString = data.messageString;
  var room = data.room;
  var messages = $('#chat');
  var date = data.date || new Date().toISOString();

  var mentionRegexString = '.*@' + window.userName + '.*';
  var mentionRegex = new RegExp(mentionRegexString);
  console.log("Running mention regex: " + messageString.match(mentionRegex));
  if (messageString.match(mentionRegex)) {
    clientNotification.send(null, 'You were just mentioned by ' + fromUser + ' in room #' + room, messageString, 3000);
  };

  this.addMessageToChat({ type: 'room', messageString: messageString, fromUser: fromUser, chat: room, date: date });
  messages[0].scrollTop = messages[0].scrollHeight;
};

ChatManager.handlePrivateMessage = function handlePrivateMessage(data) {
  var messageString = data.messageString;
  var fromUser = data.fromUser;
  var toUser = data.toUser;
  var date = data.date;

  // If we're the ones sending the message we should add it to the correct place
  if (fromUser == window.userName) {
    var chat = toUser;
  // If we're receiving the message...
  } else {
    var privateChatIndex = ChatManager.activePrivateChats.indexOf(fromUser);
    if (privateChatIndex == -1) {
      ChatManager.activePrivateChats.push(fromUser);
    }
    var chat = fromUser;
  }

  if (ChatManager.activeChat.name !== fromUser) {
    clientNotification.send(null, 'Private message from ' + fromUser, messageString, 3000);
  }

  ChatManager.addMessageToChat({ type: 'chat', fromUser: fromUser, chat: chat, messageString: messageString, date: date });
  // TODO: Show chat here and add to chat list if it does not exist there already
  // BOOKMARK
  //
  console.log("Updating private chats");
  ChatManager.updatePrivateChats();
};

ChatManager.addMessageToChat = function addMessageToChat(data) {
  var type = data.type;
  var messageString = data.messageString;
  var id = data.id;
  var date = data.date;
  var fromUser = data.fromUser;
  var chat = data.chat;
  var chatContainer = $('#chat');

  //Add timestamp
  var time = date || new Date().toISOString();

  ChatManager.formatChatMessage({ messageString: messageString, fromUser: fromUser, date: date }, function(formattedMessage) {
    ChatManager.chats[chat].messageCache = ChatManager.chats[chat].messageCache.concat(formattedMessage);

    if (ChatManager.activeChat.name == chat) {
      ChatManager.refreshChatContent(chat);
      chatContainer[0].scrollTop = chatContainer[0].scrollHeight;
    }
  })
};


/*
 * Take the message array obtained from the server and add them to the cache for the appropriate chat
 * This is instead of using addMessageToChat to add them one by one
 * TODO: Should pass messages around the same way everywhere instead of a string some places and object others
 */
ChatManager.populateMessageCache = function populateMessageCache(data) {
  var chat = data.chat;
  var messages = data.messages;

  messages.forEach(function(message) {
    ChatManager.formatChatMessage({ messageString: message.decryptedMessage, fromUser: message.fromUser }, function(formattedMessage) {
      ChatManager.chats[chat].messageCache = ChatManager.chats[chat].messageCache.concat(formattedMessage);
    })
  })
};

ChatManager.formatChatMessage = function formatChatMessage(data, callback) {
  var messageString = data.messageString;
  var fromUser = data.fromUser;
  var date = data.date;
  var emailHash = ChatManager.userlist[fromUser].emailHash || "00000000000";

  var time = date || new Date().toISOString();
  var messageHtml = '<div class="chat-item"><div class="chat-item__container"> <div class="chat-item__aside"> <div class="chat-item__avatar"> <span class="widget"><div class="trpDisplayPicture avatar-s avatar" style="background-image: url(\'https://www.gravatar.com/avatar/' + emailHash + '?s=64\')" data-original-title=""> </div> </span> </div> </div> <div class="chat-item__actions js-chat-item-actions"> <i class="chat-item__icon chat-item__icon--read icon-check js-chat-item-readby"></i> <i class="chat-item__icon icon-ellipsis"></i> </div> <div class="chat-item__content"> <div class="chat-item__details"> <div class="chat-item__from js-chat-item-from">' + fromUser + '</div> <div class="chat-item__time js-chat-item-time chat-item__time--permalinkable"> <span style="float:right;" title="' + time + '" data-livestamp="' +  time + '"></span> </div> </div> <div class="chat-item__text js-chat-item-text">' + messageString + '</div> </div> </div></div>';
  return callback(messageHtml);
};

/*
 * Displays room messages in the chat window
 */
ChatManager.refreshChatContent = function refreshChatContent(chatName) {
  var self = this;
  var messageCache;

  console.log("Refreshing chat content for ", chatName);

  if (typeof ChatManager.chats[chatName] == 'undefined' || typeof ChatManager.chats[chatName].messageCache == 'undefined') {
    if (ChatManager.chats[chatName].type == 'chat') {
      // Get the cached chat history for this chat
      socket.emit('getChat', chatData);
    };

    ChatManager.chats[chatName].messageCache = '';
  }

  messageCache = ChatManager.chats[chatName].messageCache;

  $('#chat').html(messageCache);
  ChatManager.updateChatHeader(chatName);
}

ChatManager.handleChatUpdate = function handleChatUpdate(data) {
  var chat = data.chat;
  var participants = [];
  var messages = [];

  console.log("[handleChatUpdate] got 'chatUpdate' from server");

  // Init the chat

  ChatManager.initChat(chat, function() {
     return console.log("[handleChatUpdate] initChat done.");
  });

};


ChatManager.sendMessage = function sendMessage(callback) {
  var input = $('#message-input').val();
  console.log("1 sendMessage input: " + input);
  //input = input.replace(/(<p>|<\/p>)/g, '');
  //console.log("2 sendMessage input: " + input);
  var commandRegex = /^\/(.*)$/;
  var regexResult = input.match(commandRegex);

  if (input === "") {
    return callback();
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
      var name = splitCommand[1];
      socketClient.partRoom({ name: name }, function(err) {
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
      currentChannel = ChatManager.activeChat.name;
      socketClient.sendServerCommand({ command: regexResult[1], currentChat: ChatManager.activeChat.name });
      console.log("Sending command '" + regexResult[1] + "' to server");
    }
    $('#message-input').val('');
    return callback();
  }
  else {
    ChatManager.prepareMessage(input, function(err, preparedInput) {
      console.log("Active chat type is: " + ChatManager.activeChat.type);
      var date = new Date().toISOString();
      if (ChatManager.activeChat.type == 'room') {
        console.log("Sending message to room #"+ChatManager.activeChat.name);
        window.socketClient.sendMessage(ChatManager.activeChat.name, preparedInput);
        $('#message-input').val('');
        return callback();
      }
      else if (ChatManager.activeChat.type == 'chat') {
        var userName = ChatManager.activeChat.name;
        console.log("Sending private message to '" + userName + "' with message '" + preparedInput + "'");
        ChatManager.handlePrivateMessage({ messageString: preparedInput, fromUser: window.userName, toUser: userName, date: date });
        socketClient.sendPrivateMessage(userName, preparedInput);
        $('#message-input').val('');
        return callback();
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
    ChatManager.addMessageToChat({ type: ChatManager.activeChat.type, messageString: msg, chat: ChatManager.activeChat.name });
  })
};

ChatManager.membershipUpdateError = function membershipUpdateError(message) {
  var errorDisplay = $('.manage-members-modal #manageMembersError');
  var messageDisplay = $('.manage-members-modal #manageMembersMessage');
  console.log("[MEMBERSHIP UPDATE ERROR] Displaying error message");

  if (errorDisplay.text().toLowerCase().indexOf(message) !== -1) {
    return false;
  }
  if (errorDisplay.transition('is visible')) {
    messageDisplay.transition({
      animation: 'fade up',
      duration: '0.5s'
    });

    errorDisplay.transition({
      animation: 'fade up',
      duration: '0.5s',
      onComplete: function() {
        errorDisplay.text(message);
      }
    });

    errorDisplay.transition({
      animation: 'fade up',
      duration: '1s'
    });

  } else {
    errorDisplay.text(message);
    errorDisplay.transition({
      animation: 'fade up',
      duration: '1s'
    });
  }
  return false;
};

ChatManager.membershipUpdateMessage = function membershipUpdateMessage(message) {
  var messageDisplay = $('.manage-members-modal #manageMembersMessage');
  var errorDisplay = $('.manage-members-modal #manageMembersError');

  if (messageDisplay.text().toLowerCase().indexOf(message) !== -1) {
    return false;
  }
  if (messageDisplay.transition('is visible')) {
    messageDisplay.transition({
      animation: 'fade up',
      duration: '0.5s',
      onComplete: function() {
        messageDisplay.text(message);
      }
    });

    errorDisplay.transition({
      animation: 'fade up',
      duration: '0.5s'
    });

    messageDisplay.transition({
      animation: 'fade up',
      duration: '1s'
    });

  } else {
    messageDisplay.text(message);
    messageDisplay.transition({
      animation: 'fade up',
      duration: '1s'
    });
  }
  return false;
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
  console.log("[promptForPassphrase] Prompting for passphrase");
  $('.ui.modal.unlock .username').text(window.userName);
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
