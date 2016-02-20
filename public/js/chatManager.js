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
ChatManager.userNameMap  = {};

// Stores the users profile information
ChatManager.userProfile = {};

// activeChat is the chatId of the currently active chat
ChatManager.activeChat = null;
ChatManager.lastActiveChat = null;

var host = window.location.host;
var socket = io(host+'/main');
var clientKeyPassword = null;
var masterKeyPassword = 'pipo';
var amountOfSpaceNeeded = 5000000;
var defaultRoomId = null;
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
var username = null;

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


$('#message-input').unbind().keyup(function (event) {
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
    console.log("[ChatManager.message-input.keyup] Calling ChatManager.sendMessage");
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

$('#edit-profile-button').unbind().on('click', function() {
  console.log("Editing users profile");
  ChatManager.editProfile();
  return false;
});

$('#generate-keypair-button').unbind().on('click', function() {
  console.log("Regenerating client keypair");
  // Warn the user that this will clear their current key and they should export it if they
  // want to keep it

  ChatManager.promptForCredentials(function() {
    // Do something after the prompt is shown
  });
});

$('#import-keypair-button').unbind().on('click', function() {
  console.log("Loading keypair from file...");
  ChatManager.promptForImportKeyPair(function(err, data) {
    var keyPair = {
      privateKey: data.privateKey,
      publicKey: data.publicKey
    };
    var username = data.username;
    window.encryptionManager.saveClientKeyPair({ username: username, keyPair: keyPair }, function(err) {
      if (err) {
        return console.log("Error saving client keyPair");
      };
      console.log("Client keypair saved to local storage");
      window.encryptionManager.unloadClientKeyPair(function() {
        window.socketClient.init();
      });
    })
  })
});

/*
 * Triggered when user clicks the 'Export Key Pair button'
 */
$('#export-keypair-button').unbind().on('click', function() {
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
    , (window.username + ".pub")
  );

  var BB = get_blob();
  saveAs(
      new BB(
        [keyPair.privateKey.toString()]
      , {type: "text/plain;charset=" + document.characterSet}
    )
    , (window.username + ".key")
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
  $('#add-room-button').unbind().click(function(e) {
    //Resets form input fields
    $('.ui.form.createroom').trigger("reset");
    //Resets form error messages
    $('.ui.form.createroom .field.error').removeClass( "error" );
    $('.ui.form.createroom.error').removeClass( "error" );
    $('.modal.createroom').modal('show');
  });
};

$(document).ready( buildCreateRoomModal );

var createRoomFormSettings = {
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

$('.ui.form.createroom').form(createRoomFormSettings);


var buildRoomListModal = function() {
  $('.modal.join-room-list-modal').modal({
    detachable: true,
    closable: true,
    transition: 'fade up'
  })
  $('#room-list-button').unbind().click(function(e) {
    var roomListModalHtml = '';
    var roomName;

    Object.keys(ChatManager.chats).forEach(function(chatId) {
      roomName = ChatManager.chats[chatId].name;
      if (ChatManager.chats[chatId].type == 'room') {
        roomListModalHtml += "<div class='item'>\n";
        if (ChatManager.chats[chatId].membershipRequired) {
          roomListModalHtml += "  <i class='ui avatar huge lock icon room-list-avatar'></i>\n";
        } else {
          roomListModalHtml += "  <i class='ui avatar huge unlock alternate icon room-list-avatar'></i>\n";
        }
        roomListModalHtml += "  <div class='content'>\n";
        roomListModalHtml += "    <a id='" + chatId + "' class='header'>" + roomName + "</a>\n";
        roomListModalHtml += "    <div class='description'>" + ChatManager.chats[chatId].topic + "</div>\n";
        roomListModalHtml += "  </div>\n";
        roomListModalHtml += "</div>\n";
      }
    })
    $('.modal.join-room-list-modal .join-room-list').html(roomListModalHtml);
    Object.keys(ChatManager.chats).forEach(function(chatId) {
      if (ChatManager.chats[chatId].type == 'room') {
        $('.modal.join-room-list-modal a[id="' + chatId + '"]').unbind().click(function() {
          socketClient.joinRoom(chatId, function(err) {
            $('.modal.join-room-list-modal').modal('hide');
            if (err) {
              return console.log("Error joining room: " + err);
            }
            // Set the active chat to the currently joined room so that it is displayed when the join is complete
            ChatManager.lastActiveChat = ChatManager.activeChat;
            ChatManager.activeChat = chatId;

            console.log("Joined room " + ChatManager.chats[chatId].name);
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
$('.chat-header__settings .room-options.leave-room').unbind().click(function(e) {
  var chatId = ChatManager.activeChat;
  var chatName = ChatManager.chats[chatId].name;

  if (ChatManager.chats[chatId].type == 'chat') {
    console.log("Destroying chat '", chatName, "'");

    ChatManager.destroyChat(chatId, function(err) {
      console.log("Chat destroyed. Updating private chats...");
      ChatManager.updateChatList();
    });

  } else {

    socketClient.partRoom({ chatId: chatId }, function(err) {
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
  $('.chat-header__settings .room-options.edit-room').unbind().click(function(e) {
    var chatId = ChatManager.activeChat;
    var populateFormData = {
      id: chatId,
      name: ChatManager.chats[chatId].name,
      group: ChatManager.chats[chatId].group,
      topic: ChatManager.chats[chatId].topic,
      encryptionScheme: ChatManager.chats[chatId].encryptionScheme,
      keepHistory: ChatManager.chats[chatId].keepHistory,
      membershipRequired: ChatManager.chats[chatId].membershipRequired
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
  },
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
$('.ui.form.editroom').form(editRoomFormSettings);




$('.chat-header__settings .room-options.manage-members').unbind().click(function(e) {
  ChatManager.populateManageMembersModal({ chatId: ChatManager.activeChat, clearMessages: true });

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

/*
 * Create the manage members modal for manage users
 */
ChatManager.populateManageMembersModal = function populateManageMembersModal(data) {
  if (!data) { data = {} }

  // There are circumstances where this is populating a modal for a private chat which does not currently have an owner
  // There might should be at least two owners for a private chat which would default to the first two participants

  if (!ChatManager.activeChat || !ChatManager.chats[ChatManager.activeChat]) {
    return;
  };

  var chatId = (typeof data.chatId === 'undefined') ? ChatManager.activeChat : data.chatId;
  var chatName = ChatManager.chats[chatId].name;
  var clearMessages = (typeof data.clearMessages === 'undefined') ? true : data.clearMessages;

  var members = ChatManager.chats[chatId].members || [];
  var admins = ChatManager.chats[chatId].admins || [];
  var ownerId = ChatManager.chats[chatId].owner;

  // Clear notifications
  if (clearMessages) {
    $('.manage-members-modal #manageMembersError').text('');
    $('.manage-members-modal #manageMembersMessage').text('');
  }

  var manageMembersList = $('.manage-members-modal .manage-members-list');
  $('.manage-members-modal .chatname').val(chatName);
  $('.manage-members-modal').attr('id', chatId);

  manageMembersList.empty();

  var memberDropdownTypes = ['admin', 'member'];

  var memberList = {};

  var autoCompleteUsers = [];
  Object.keys(ChatManager.userNameMap).forEach(function(username) {
    autoCompleteUsers.push({title: username});
  });

  //var autoCompleteArray = Object.keys(ChatManager.userNameMap);
  $('.ui.modal.manage-members-modal .ui.search').search({
    source: autoCompleteUsers,
  });

  members.forEach(function(memberId) {
    memberList[memberId] = 'member';
  });

  if (ownerId) {
    memberList[ownerId] = 'owner';
  };

  admins.forEach(function(adminId) {
    memberList[adminId] = 'admin';
  });

  Object.keys(memberList).forEach(function(memberId) {
    var membershipType = memberList[memberId];
    var memberName = ChatManager.userlist[memberId].username;
    var dropdownHtml = '';

    var li = $('<li/>')
      .addClass('manage-members-list-item')
      .addClass(memberName)
      .appendTo(manageMembersList);

    var memberSpan = $('<span/>')
      .addClass('manage-members-list-member')
      .text(memberName)
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
      .attr('id', memberId)
      .addClass('ui')
      .addClass('primary')
      .addClass('button')
      .addClass('save')
      .addClass(memberId)
      .text('Save')
      .appendTo(optionsDiv);

    $('.manage-members-list-item.' + memberName + ' .' + membershipType).prop('selected', 'true');

    /*
     * Catch click on membership save button
     */
    // TODO: Need to add the users ID to the userlist object
    $('.manage-members-list .button.save.' + memberId).unbind().click(function(e) {
      console.log("[ADD MEMBER] Caught membership save button click");

      // TODO: need to allow for change of room name
      var chatName = $('.manage-members-modal .chatname').val();
      var chatId = $('.manage-members-modal').attr('id');
      var modifyMember = e.currentTarget.id;
      var newMembership = e.currentTarget.previousSibling.value;

      var membershipData = ({
        type: 'modify',
        member: modifyMember,
        chatId: chatId,
        membership: newMembership
      });

      socketClient.membership(membershipData);
      // TODO: Create a waiting for update method to add "Please wait..." or something similar to the modal while we wait for response from server
    })
  })
};


// Catch click on .button.addmember
$('.manage-members-modal .button.addmember').unbind().click(function(e) {
  console.log("[ADD MEMBER] Caught add member button click");
  var memberName = $('.manage-members-modal .membername').val();
  var chatId = $('.manage-members-modal').attr('id');
  var membership = $('.manage-members-modal .membership .selected').text();

  // Get memberId from local array
  var memberId = ChatManager.userNameMap[memberName.toLowerCase()]

  var membershipData = ({
    type: 'add',
    memberId: memberId,
    memberName: memberName,
    chatId: chatId,
    membership: membership
  });

  console.log("[ADD MEMBER] Sending membership data to socketClient");
  socketClient.membership(membershipData);

  $('.manage-members-modal .membername').val('');
})


ChatManager.init = function() {
  if (window.username) {
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

  if (ChatManager.userlist[ChatManager.userNameMap[window.username]]) {
    emailHash = ChatManager.userlist[ChatManager.userNameMap[window.username]].emailHash || "0";
  }

  $('#menu-header-profile .ui.dropdown').dropdown({ action: 'select' });

  $('#menu-header-profile .ui.dropdown .avatar').attr("style", "background-image: url('https://www.gravatar.com/avatar/" + emailHash + "?s=64')");
  $('#menu-header-profile .ui.dropdown .text.username').text(window.username);
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


ChatManager.updateUserlist = function updateUserlist(userlist) {
  ChatManager.userlist = userlist;

  Object.keys(userlist).forEach(function(userId) {
    if (userlist[userId].publicKey) {
      window.encryptionManager.getKeyInstance(userlist[userId].publicKey, function(keyInstance) {
        ChatManager.userlist[userId].keyInstance = keyInstance;
      });
    };
  });
};


/*
 * Create the room and give it focus
 */
ChatManager.initRoom = function initRoom(room, callback) {
  var self = this;
  var enabled = 'initializing';
  var joined = false;
  var unread = false;
  var unreadCount = 0;
  console.log("[ChatManager.initRoom] Running initRoom for " + room.name);

  // TODO: Should store online status for members and messages in an object or array also

  // If room already exists locally, don't overwrite local settings that should persist
  // should probably stick these in a chats[id].local or a completely separate object all together
  if (self.chats[room.id]) {
    // We're going to have to decrypt all messages again to ensure that we are up to date so we shouldn't keep enabled
    //enabled = self.chats[room.id].enabled;
    joined = self.chats[room.id].joined;
    unread = self.chats[room.id].unreadCount;
    unreadCount = self.chats[room.id].unread;
  };

  // Find a better way to only use passed attributes for a room if they exist, but also
  // handle the case where the room isnt' created yet

  var messages = (typeof room.messages === 'undefined') ? self.chats[room.id].messages : room.messages;

  self.chats[room.id] = { id: room.id,
    activeUsers: room.activeUsers,
    admins: room.admins,
    decryptedMessages: '',
    enabled: enabled,
    encryptionScheme: room.encryptionScheme,
    group: room.group,
    joined: joined,
    keepHistory: room.keepHistory,
    members: room.members,
    membershipRequired: room.membershipRequired,
    messages: messages,
    messageCache: '',
    name: room.name,
    owner: room.owner,
    subscribers: room.subscribers,
    type: 'room',
    topic: room.topic,
    unread: unread,
    unreadCount: unreadCount,
  };

  ChatManager.updateChatStatus();

  // Decrypt messages and HTMLize them
  var messages = self.chats[room.id].messages.sort(dynamicSort("date"));
  var count = 0;
  var messageArray = Array(messages.length);

  /*
   * Also we should only send messages to each user starting at their join date or
   * the date/time that they were added to a room
   */

  /*
   * Should only buldChatKeyRing for private rooms
   * Should build allUserKeyRing once and use that for public rooms
   */
  encryptionManager.buildChatKeyRing({ chatId: room.id }, function(keyRing) {
    ChatManager.chats[room.id].keyRing = keyRing;

    console.log("[ChatManager.initRoom] Starting to decrypt messages for room #" + room.name);
    // Display notice in the chatContainer that we are decrypting messages
    // ...or display an encrypted message representing each message and replace as they are decrypted

    // BOOKMARK
    console.log("[ChatManager.initRoom] (1) Running ChatManager.updateChatStatus();");
    ChatManager.updateChatStatus({ chatId: room.id, status: 'decrypting' });

    messages.forEach(function(message, key) {
      window.encryptionManager.decryptMessage({
        keyRing: ChatManager.chats[room.id].keyRing,
        encryptedMessage: message.encryptedMessage
      }, function(err, decryptedMessage) {
        var encryptedMessage = message.encryptedMessage;
        var decryptedMessage = decryptedMessage;
        var myFingerprint = window.encryptionManager.keyManager.get_pgp_key_id().toString('hex');

        if (err) {
          decryptedMessage = 'This message was not encrypted to you...\n';
          console.log("Error decrypting message : ");
        }

        // Cache the decrypted message
        messageArray[key] = decryptedMessage.toString();
        count++;
        if (messages.length === count) {
          messageArray.forEach(function(decryptedMessageString, key) {
            var fromUserId = self.chats[room.id].messages[key].fromUser;
            var date = self.chats[room.id].messages[key].date;

            self.chats[room.id].messages[key].decryptedMessage = decryptedMessageString;
          });

          ChatManager.populateMessageCache(room.id);

          var isAutoJoin = (ChatManager.userProfile.membership.favoriteRooms.indexOf(room.id) > -1)

          // If there is no active chat and this room is set to auto join, set it as active
          if (!ChatManager.activeChat && isAutoJoin) {
            ChatManager.setActiveChat(room.id);
          };

          if (ChatManager.activeChat == room.id) {
            var chatContainer = $('#chat');

            ChatManager.refreshChatContent(room.id);
            chatContainer[0].scrollTop = chatContainer[0].scrollHeight;
          }
          // BOOKMARK ***

          console.log("[ChatManager.initRoom] Done decrypting messages for room #" + room.name);

          // Do this inside of updateChatStatus
          //ChatManager.setChatEnabled([room.id]);

          console.log("[ChatManager.initRoom] (2) Running ChatManager.updateChatStatus();");
          ChatManager.updateChatStatus({ chatId: room.id, status: 'enabled' });
        };
      });
    });

    // If there are no messages, we still need to enable chat
    // Better way to do this?
    if (messages.length == 0) {
      //ChatManager.setChatEnabled([room.id]);
      console.log("[ChatManager.initRoom] (3) Running ChatManager.updateChatStatus();");
      ChatManager.updateChatStatus({ chatId: room.id, status: 'enabled' });
    }
  });

  // DOES THIS BELONG HERE???!? FIX ME!!! :D
  if (ChatManager.activeChat == room.id) {
    window.Userlist.update({ chatId: room.id });
  }

  self.updateRoomList(function(err) {
    console.log("Update room list done...");
    callback(null);
  });
};

ChatManager.initChat = function initChat(chat, callback) {
  var self = this;
  var enabled = false;
  var chatId = chat.id;
  var myUserId = ChatManager.userNameMap[window.username];
  var chatName = '';
  var unread = false;
  var unreadCount = 0;
  //var messages = chat.messages || [];
  var messages = chat.messages.sort(dynamicSort("date"));
  var participants = chat.participants || [];

  console.log("Running init on chat " + chatId);

  // Persist certain values through an init chat if we've already constructed a chat object
  if (ChatManager.chats[chatId]) {
    unread = ChatManager.chats[chatId].unread;
    unreadCount = ChatManager.chats[chatId].unreadCount;
    enabled = ChatManager.chats[chatId].enabled;
  }

  // Private chat between two users
  if (chat.participants.length == 2) {
    chat.participants.forEach(function(participantId) {
      // Set the chatName to the name of the user with this userid
      if  (participantId !== myUserId) {
        chatName = ChatManager.userlist[participantId].username;
      }
    });
  }

  console.log("[chatManager.initChat] chatName set to: " + chatName);

  // Group chat between 3 or more users
  if (participants.length > 2) {

  }

  // Need to save and pull unread bits here too
  self.chats[chatId] = {
    enabled: enabled,
    id: chatId,
    messages: messages,
    messageCache: '',
    name: chatName,
    participants: participants,
    type: 'chat',
    unread: unread,
    unreadCount: unreadCount,
  };

  var count = 0;
  var messageArray = Array(messages.length);

  var finish = function finish() {
    ChatManager.populateMessageCache(chatId);

    self.updateChatList();

    if (ChatManager.activeChat == chatId) {
      var chatContainer = $('#chat');

      ChatManager.refreshChatContent(chatId);
      chatContainer[0].scrollTop = chatContainer[0].scrollHeight;
    }

    //ChatManager.setChatEnabled([chatId]);
    console.log("[ChatManager.initChat] (1) Running ChatManager.updateChatStatus();");
    ChatManager.updateChatStatus({ chatId: chatId, status: 'enabled' });

    return callback(null);

  };

  encryptionManager.buildChatKeyRing({ chatId: chatId }, function(keyRing) {
    ChatManager.chats[chatId].keyRing = keyRing;

    if (messages.length == 0) {
      finish();
    };

    messages.forEach(function(message, key) {

      window.encryptionManager.decryptMessage({
        keyRing: ChatManager.chats[chatId].keyRing,
        encryptedMessage: message.encryptedMessage
      }, function(err, decryptedMessage) {
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

            var fromUserId = messages[key].fromUser;
            var date = messages[key].date;

            self.chats[chatId].messages[key].decryptedMessage = decryptedMessageString;
          });
          finish();
        };
      })
    });
  });
};


/*
 * This is being replaced by listeners with ids
ChatManager.waitForInit = function waitForInit(chatHash) {
  ChatManager.activeChat.awaitingInit = chatHash;
}
*/


ChatManager.arrayHash = function arrayHash(array, callback) {
  // Sort participantIds
  var orderedArray = array.sort();

  // MD5 participantIds
  encryptionManager.sha256(orderedArray.toString()).then(function(arrayHash) {
    return callback(arrayHash);
  });
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



ChatManager.updateFavoriteButton = function updateFavoriteButton(data) {
  var favorite = data.favorite;

  if (favorite) {
    $('.chat-header__buttons .star.icon').removeClass('empty');
  };

  if (!favorite) {
    $('.chat-header__buttons .star.icon').addClass('empty');
  };

};


ChatManager.updateChatHeader = function updateChatHeader(chatId) {
  var self = this;
  var chat = ChatManager.chats[chatId];
  var headerAvatarHtml = '';
  var chatTopic = '';
  var chatHeaderTitle = '';
  var activeChatId = ChatManager.activeChat;

  if (chat.type == 'chat') {
    headerAvatarHtml = '<i class="huge spy icon"></i>';
    chatTopic = 'One to one encrypted chat with ' + chat.name;
    chatHeaderTitle = 'pm' + '/' + chat.name;
  } else {
    headerAvatarHtml = '<i class="huge comments outline icon"></i>';
    chatTopic = ChatManager.chats[chatId].topic;
    chatHeaderTitle = ChatManager.chats[chatId].group + '/' + chat.name;
  }

  var isFavorite = (ChatManager.userProfile.membership.favoriteRooms.indexOf(chatId) > -1);
  self.updateFavoriteButton({ favorite: isFavorite });

  /*
   * Catch clicks on favorite room button (star)
   */
  $('.chat-header__favorite').unbind().click(function(e) {
    console.log("[chatManager.chat-header__favorite] (click) Got click on favorite button");

    socketClient.toggleFavorite({ chatId: activeChatId });
  });

  $('.chat-topic').text(chatTopic);
  $('.chat-header__title').text(chatHeaderTitle);
  $('.chat-header__avatar').html(headerAvatarHtml);
}


/*
 * Remove room from client
 */
ChatManager.destroyChat = function destroyChat(chatId, callback) {
  var self = this;
  delete ChatManager.chats[chatId];

  self.focusLastChat(function(err) {
    if (err) {
      return console.log("[chatManager.destroyChat] Error focusing on last active chat");
    };

    callback(null);
  });
}


/*
 * Part a chat but keep the chat data cached
 */
ChatManager.partChat = function partChat(chatId, callback) {
  var self = this;
  ChatManager.chats[chatId].joined = false;

  self.focusLastChat(function(err) {
    callback(err);
  });
};


/*
 * Focus on the last active chat
 */
ChatManager.focusLastChat = function focusLastChat(callback) {
  // Create a sorted list of chats that are joined
  var sortedChats = Object.keys(ChatManager.chats).sort().filter(function(chatId) {
    return ChatManager.chats[chatId].joined;
  });

  // Should check here for an empty chat list and do something sane if we have parted the last chat
  var lastChat = ChatManager.chats[sortedChats[sortedChats.length - 1]];
  ChatManager.activeChat = lastChat;
  // TODO: Make this focusChat and do th elogic inside of the function to determine what to do for private chats vs rooms
  ChatManager.focusChat({ id: lastChat.id }, function(err) {
    if (err) {
      return callback(err);
    };

    ChatManager.updateRoomList(function(err) {
      callback(null);
    });
  });
};


/*
 * Set the specified chat to be in focus for the user
 */
ChatManager.focusChat = function focusChat(data, callback) {
  var id = data.id;
  var type = ChatManager.chats[id].type;
  var chatName = ChatManager.chats[id].name;
  var messages = $('#chat');

  // Set the active chat to the one we're focusing on
  console.log("Setting activeChat to room: " + ChatManager.chats[id].name + " which has ID: " + id);
  ChatManager.setActiveChat(id);

  if (ChatManager.chats[id].unread) {
    ChatManager.chats[id].unread = false;
    ChatManager.chats[id].unreadCount = 0;
  };

  window.Userlist.update({ chatId: id });

  ChatManager.refreshChatContent(id);
  console.log("[ChatManager.focusChat] (1) Running ChatManager.updateChatStatus();");
  ChatManager.updateChatStatus();

  // TODO:
  // Enabling chat here but only we are in a good state which consists of
  // - Connected to the server
  // - All messages have been decrypted and displayed
  // - You are signed in and your key has been decrypted
  // -
  // Each one of these things needs to know how to enable and disable the main chat status or request a recheck of all statuses
  // so that it can set the main status on a change
  //ChatManager.chats[id].enabled = true;

  messages[0].scrollTop = messages[0].scrollHeight;

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
 * Set the active chat
 */
ChatManager.setActiveChat = function setActiveChat(id) {
  ChatManager.activeChat = id;
  window.activeChat = id;
};


/*
 * Update the list of rooms on the left bar
 */
ChatManager.updateRoomList = function updateRoomList(callback) {
  //console.log("[chatManager.updateRoomList] Chats: ", ChatManager.chats);

  $('#room-list').empty();
  console.log("Updating room list!");

  var chatIds = Object.keys(ChatManager.chats)

  chatIds.forEach(function(id) {
    if (ChatManager.chats[id].type == 'room' && ChatManager.chats[id].joined) {
      var roomName = ChatManager.chats[id].name;
      var unreadMessages = ChatManager.chats[id].unread;

      if ( !$('#room-list #' + id).length ) {

        var roomListItemClasses = [];
        var unreadIconClasses = [];

        if ( ChatManager.activeChat == id ) {
          console.log("Active chat is " + ChatManager.activeChat);

          roomListItemClasses.push('chat-list-item-selected');
        } else {
          roomListItemClasses.push('chat-list-item');
        };

        if ( !unreadMessages ) {
          unreadIconClasses.push('hidden');
        }

        var roomListHtml = '<li class="room ' + roomListItemClasses.join() + '" id="' + id + '">' + roomName + '<i class="icon idea ' + unreadIconClasses.join() + '"></i></li>';


        $('#room-list').append(roomListHtml);
        console.log("Added " + roomName + " to room-list");
      }

      $("#" + id).unbind().click(function() {
        // Catch clicks on the room list to update room focus
        ChatManager.focusChat({ id: id }, function(err) {
          // Room focus complete
          // We need to update the room list here to update the read/unread marker
          ChatManager.updateRoomList(function() {
            // Room list updated
          });
        });
      });
    }
  });
  callback(null);
};



ChatManager.updateChatList = function updateChatList() {
  var self = this;
  var userListHtml = "";

  // Get a list of all chats that are type private message
  var chatIds = Object.keys(ChatManager.chats).filter(function(id) {
    console.log("Looping chat id: " + id + " and type is: " + ChatManager.chats[id].type);
    return ChatManager.chats[id].type == 'chat';
  });

  // Add the html elements for each chat to a string
  chatIds.forEach(function(id) {
    console.log("[chatManager.updateChatList] Adding chat with ID: " + id + " to the chat list");
    var privateChat = ChatManager.chats[id];
    var unread = ChatManager.chats[id].unread;
    var chatListItemClasses = [];
    var unreadIconClasses = [];

    if ( !unread ) {
      unreadIconClasses.push('hidden');
    }

    if ( ChatManager.activeChat == id ) {
      chatListItemClasses.push('chat-list-item-selected');
    } else {
      chatListItemClasses.push('chat-list-item');
    };

    userListHtml += '<li class="private-chat ' + chatListItemClasses.join() + '" id="' + id + '">' + privateChat.name + '<i class="icon idea ' + unreadIconClasses.join() + '"></i></li>\n';

  });

  // Push the newly generated chat list to the chat-list
  $('#chat-list').html(userListHtml);

  // Bind click events to each chat list entry to focus that chat
  chatIds.forEach(function(id) {
    console.log("[chatManager.updateChatList] Setting on click for chat with ID: " + id);
    if (id !== ChatManager.userNameMap[window.username]) {
      $('#' + id).unbind().click(function() {
        console.log("[chatManager.updateChatList] Got click on id: " + id);
        ChatManager.focusChat({ id: id }, function(err) {
          ChatManager.updateChatList(function() {
            // Room list updated
          });
        });
      });
    };
  });

};



/*
 * This should receive updates regarding the status of the individual chats and the chat server as a whole
 * The conneciton status should be stored in a main object and the decrypting (or other statuses related to
 * the room itself) should be stored in the room object on the client side
 */
ChatManager.updateChatStatus = function updateChatStatus(data) {
  var chatId;
  var status;

  if (data) {
    if (data.chatId) {
      chatId = data.chatId;
    };

    if (data.status) {
      status = data.status;
    };
  };

  if (chatId && !status) {
    console.log("[ChatManager.updateChatStatus] ERROR: You must specify a status when providing a chatId");
  };

  // If we have a chatId, change the status for that chat
  if (chatId && status) {
    if (ChatManager.chats[chatId].status != status) {
      ChatManager.chats[chatId].status = status;
    };
  };

  // If we have no chatId but have a stauts, set that status for all chats
  if (!chatId && status) {
    var allRoomIds = Object.keys(ChatManager.chats);

    allRoomIds.forEach(function(id) {
      if (ChatManager.chats[id].status != status) {
        ChatManager.chats[id].status = status;
      };
    });
  };

  // Always run the update for the activeChat
  if (ChatManager.activeChat) {
    var activeChatId = ChatManager.activeChat;

    if (chatId == activeChatId) {
      if (ChatManager.chats[activeChatId].status == 'enabled') {
        return ChatManager.enableMessageInput();
      };

      if (ChatManager.chats[activeChatId].status != 'enabled') {
        return ChatManager.disableMessageInput({ status: ChatManager.chats[activeChatId].status });
      };
      console.log("[chatManager.updateChatStatus] ERROR: chat.enabled not set?");
    };
  } else {
    console.log("[ChatManager.updateChatStatus] Currently no active chat...");
  };
};


ChatManager.enableMessageInput = function enableMessageInput() {
  var self = this;

  // Add conditional to check if the generate modal is displayed
  $('.ui.modal.generate').modal('hide');

  //Make input usable
  $('#message-input').attr('placeHolder', 'Type your message here...').prop('disabled', false);
  $('#send-button').prop('disabled', false);
  $('#loading-icon').hide();

  $("#input-container").find('textarea.message-input').keydown(function (event) {
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

  $('#send-button').unbind().on('click', function() {
    console.log("Got send button click!");

    ChatManager.sendMessage(function() {
      fitToContent('message-input', 156);
      return false;
    })
    return false;
  });
};

ChatManager.disableMessageInput = function disableMessageInput(data) {
  var self = this;
  var status = data.status;

  var statusMessages = {
    'disconnected': '          Waiting for connection... Please wait...',
    'initializing': '          Initializing chat... Please wait...',
    'decrypting': '          Decrypting messages... Please wait...',
    'generating': '          Generating key pair... Please wait...'
  };

  $('textarea').off("keydown", "**");
  $('#message-input').attr('placeHolder', statusMessages[status]).prop('disabled', true);
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
  var messageId = data.messageId;
  var fromUserId = data.fromUserId;
  var fromUserName = ChatManager.userlist[fromUserId].username;
  var messageString = data.messageString;
  var chatId = data.chatId;
  var messages = $('#chat');
  var date = data.date || new Date().toISOString();

  var mentionRegexString = '.*@' + window.username + '.*';
  var mentionRegex = new RegExp(mentionRegexString);
  console.log("Running mention regex: " + messageString.match(mentionRegex));
  if (messageString.match(mentionRegex)) {
    clientNotification.send(null, 'You were just mentioned by ' + fromUserName + ' in room #' + ChatManager.chats[chatId].name, messageString, 3000);
  };

  this.addMessageToChat({ confirmed: true, messageId: messageId, type: 'room', chatId: chatId, messageString: messageString, fromUserId: fromUserId, date: date });
};



/*
 * Handle an incoming one to one message (privateMessage)
 *
 * When receiving a message that we sent, we should change the message that we already
 * added to our local chat from grey to black to show that it has been sent or received
 * by the other user
 */
ChatManager.handlePrivateMessage = function handlePrivateMessage(data) {
  var self = this;
  //var socket = data.socket;

  var messageId = data.messageId;
  var encryptedMessage = data.message;
  var chatId = data.chatId;
  var fromUserId = data.fromUserId;
  var fromUsername = ChatManager.userlist[fromUserId].username;
  var myUserId = ChatManager.userNameMap[window.username];
  var toUserIds = data.toUserIds;
  var date = data.date;
  var participantIds = [ ChatManager.userlist[fromUserId].id, myUserId];
  var chatName;

  var decrypt = function decrypt(chatId, encryptedMessage, callback) {
    window.encryptionManager.decryptMessage({
      keyRing: ChatManager.chats[chatId].keyRing,
      encryptedMessage: encryptedMessage
    }, function(err, message) {
      if (err) {
        console.log(err);
      };

      callback(message);
    });
  };

  if (ChatManager.chats[chatId]) {
    decrypt(chatId, encryptedMessage, function(message) {
      clientNotification.send(null, 'Private message from ' + fromUsername, message, 3000);

      ChatManager.addMessageToChat({ confirmed: true, messageId: messageId, type: 'chat', fromUserId: fromUserId, chatId: chatId, messageString: message, date: date });
    });
  };

  // If we don't have a private chat created for this
  if (!ChatManager.chats[chatId]) {
    chatName = fromUsername;
    // Should save and pull unreadCount from the DB
    ChatManager.chats[chatId] = { id: chatId, type: 'chat', name: chatName, messageCache: '', unread: true, unreadCount: 0, messages: [] };

    // Set unread to true for now. When these windows are cached open, we need a better way to determine if it is an unread message or not.
    ChatManager.chats[chatId].unreadCount++;

    console.log("[chatManager.handlePrivateMessage] unreadCount: " + ChatManager.chats[chatId].unreadCount);

    console.log("Updating private chats");

    ChatManager.updateChatList();

    ChatManager.arrayHash(participantIds, function(chatHash) {
      decrypt(chatId, encryptedMessage, function(message) {
        clientNotification.send(null, 'Private message from ' + fromUsername, message, 3000);
        ChatManager.addMessageToChat({ type: 'chat', fromUserId: fromUserId, confirmed: true, messageId: messageId, chatId: chatId, messageString: message, date: date });
      });

      window.socketClient.socket.emit('getChat', { chatHash: chatHash, participantIds: participantIds });

      window.socketClient.socket.on('chatUpdate-' + chatHash, function(data) {
        self.handleChatUpdate(data, function() {
        });
        window.socketClient.socket.removeListener('chatUpdate-' + chatHash);
      });
    });
  };
};



/*
 * Display an outgoing message locally greyed out then wait for it to be confirmed as sent by the server
 */
ChatManager.handleLocalMessage = function handleLocalMessage(data) {
  var messageId = data.messageId;
  var chatId = data.chatId;
  var type = ChatManager.chats[chatId].type;
  var messageString = data.messageString;
  var fromUserId = data.fromUserId;
  var date = data.date;

  // Should set the message to unconfirmed here (only if it's a local message tho)
  ChatManager.addMessageToChat({ messageId: messageId, confirmed: false, type: type, fromUserId: fromUserId, chatId: chatId, messageString: messageString, date: date });
};



ChatManager.addMessageToChat = function addMessageToChat(data) {
  var messageId = data.messageId;
  var confirmed = data.confirmed;
  var type = data.type;
  var messageString = data.messageString;
  var date = data.date;
  var fromUserId = data.fromUserId;
  var fromUsername = ChatManager.userlist[fromUserId].username;
  var chatId = data.chatId;
  var chatContainer = $('#chat');

  //Add timestamp
  var time = date || new Date().toISOString();

  // If the message is confirmed (comes from the server), it has an ID, and it is from me, find it in the message cache
  // and mark it as confirmed
  if (confirmed && messageId && (fromUserId == ChatManager.userNameMap[window.username])) {
    // Update teh message in message cache to be confirmed
    ChatManager.confirmChatMessage({ chatId: chatId, messageId: messageId }, function(modifiedMessageCache) {
      if (!modifiedMessageCache) {
        // Was not able to find and confirm the message
        return console.log("[ChatManager.addMessageToChat] Returned no messageCache");
      }
      ChatManager.chats[chatId].messageCache = modifiedMessageCache;
    });
  } else {

    // Need to figure out how to change the class of a message after it's in the message cache
    ChatManager.formatChatMessage({ messageId: messageId, messageString: messageString, fromUserId: fromUserId, fromUsername: fromUsername, date: date, confirmed: confirmed }, function(formattedMessage) {
      // Is it really taking this long to get the message displayed locally?
      ChatManager.chats[chatId].messageCache = ChatManager.chats[chatId].messageCache.concat(formattedMessage);
    });

    if (ChatManager.activeChat == chatId) {
      ChatManager.refreshChatContent(chatId);
      chatContainer[0].scrollTop = chatContainer[0].scrollHeight;
    };
  };


  if (!ChatManager.activeChat == chatId) {
    ChatManager.chats[chatId].unread = true;
    ChatManager.chats[chatId].unreadCount++;

    console.log("[chatManager.handlePrivateMessage] unreadCount: " + ChatManager.chats[chatId].unreadCount);
    ChatManager.updateRoomList(function() {
      return;
    });
    ChatManager.updateChatList(function() {
      return;
    });
  }
};




/*
 * Take the message array obtained from the server and add them to the cache for the appropriate chat
 * This is instead of using addMessageToChat to add them one by one
 * TODO: Should pass messages around the same way everywhere instead of a string some places and object others
 */
ChatManager.populateMessageCache = function populateMessageCache(chatId) {
  var messages = ChatManager.chats[chatId].messages;
  var messageCount = messages.length;
  //var sortedMessages = [];

  ChatManager.chats[chatId].messageCache = '';

  if (messageCount > 0) {
    //sortedMessages = messages.sort(function(a,b) {
    //  return new Date(b.date) - new Date(a.date);
    //});

    messages.forEach(function(message) {
      var fromUsername = ChatManager.userlist[message.fromUser].username;
      ChatManager.formatChatMessage({ confirmed: true, messageString: message.decryptedMessage, fromUserId: message.fromUser, fromUsername: fromUsername }, function(formattedMessage) {
        ChatManager.chats[chatId].messageCache = ChatManager.chats[chatId].messageCache.concat(formattedMessage);
      });
    });
  };
};

ChatManager.formatChatMessage = function formatChatMessage(data, callback) {
  var messageId = data.messageId;
  var messageString = data.messageString;
  var fromUserId = data.fromUserId;
  var fromUsername = data.fromUsername;
  var confirmed = data.confirmed;
  var date = data.date;
  var emailHash = ChatManager.userlist[fromUserId].emailHash || "00000000000";

  var time = date || new Date().toISOString();

  var messageIdHtml = '';

  if (messageId) {
    var messageIdHtml = ' data-messageId="' + messageId + '"';
  };

  var confirmedClass = '';
  if (!confirmed) {
    confirmedClass = 'unconfirmedMessage';
  };

  var messageHtml = '<div class="chat-item"><div class="chat-item__container ' + confirmedClass + '"' + messageIdHtml + '> <div class="chat-item__aside"> <div class="chat-item__avatar"> <span class="widget"><div class="trpDisplayPicture avatar-s avatar" style="background-image: url(\'https://www.gravatar.com/avatar/' + emailHash + '?s=64\')" data-original-title=""> </div> </span> </div> </div> <div class="chat-item__actions js-chat-item-actions"> <i class="chat-item__icon chat-item__icon--read icon-check js-chat-item-readby"></i> <i class="chat-item__icon icon-ellipsis"></i> </div> <div class="chat-item__content"> <div class="chat-item__details"> <div class="chat-item__from js-chat-item-from">' + fromUsername + '</div> <div class="chat-item__time js-chat-item-time chat-item__time--permalinkable"> <span style="float:right;" title="' + time + '" data-livestamp="' +  time + '"></span> </div> </div> <div class="chat-item__text js-chat-item-text">' + messageString + '</div> </div> </div></div>';
  return callback(messageHtml);
};


/*
 * Once we receive a message from the server, we need to check the sent messages array (need to create this)
 * for ID's that match the incoming message. If the incoming message ID is in that array, we should confirm it
 * by searching the message cache for an item with that ID and changing it's class from unconfirmed to
 * confirmed (need to create these classes)
 */
ChatManager.confirmChatMessage = function confirmChatMessage(data, callback) {
  var chatId = data.chatId;
  var messageId = data.messageId;
  var messageCache = ChatManager.chats[chatId].messageCache;

  container = $('<div>').html(messageCache);
  container.find('[data-messageId="' + messageId + '"].unconfirmedMessage').removeClass('unconfirmedMessage');
  $('.chat-window').find('[data-messageId="' + messageId + '"].unconfirmedMessage').removeClass('unconfirmedMessage');

  return callback(container.html());
};



/*
 * Displays room messages in the chat window
 */
ChatManager.refreshChatContent = function refreshChatContent(chatId) {
  var self = this;
  var messageCache = ChatManager.chats[chatId].messageCache;

  console.log("Refreshing chat content for ", ChatManager.chats[chatId].name);

  $('#chat').html(messageCache);
  ChatManager.updateChatHeader(chatId);
}



ChatManager.handleChatUpdate = function handleChatUpdate(data, callback) {
  var chat = data.chat;
  var self = this;

  console.log("[handleChatUpdate] got 'chatUpdate' from server");

  // Init the chat
  ChatManager.initChat(chat, function() {

    self.updateChatList();
    self.updateRoomList(function() {
    });

    if (chat.participants) {
      if (ChatManager.activeChat == chat.id) {
        console.log("[chatManager.handleChatUpdate] Focusing chat with id '" + chat.id + "'");
        self.focusChat({ id: chat.id }, function(err) {
          console.log("Room focus for " + chat.id + " done");
        });
      };
    };

    console.log("[handleChatUpdate] initChat done.");
    return callback();
  });

};


ChatManager.sendMessage = function sendMessage(callback) {
  var input = $('#message-input').val();

  // Is one of these faster? Both seem to work just fine...
  //$('#message-input').val('');
  document.getElementById('message-input').value='';

  setTimeout(function() {
    console.log("1 sendMessage input: " + input);

    //input = input.replace(/(<p>|<\/p>)/g, '');
    //console.log("2 sendMessage input: " + input);

    var commandRegex = /^\/(.*)$/;
    var regexResult = input.match(commandRegex);

    if (input === "") {
      return callback();
    }

    else if (regexResult !== null) {
      ServerCommand.parse(regexResult, function() {
        return callback();
      });
    }

    else {

      ChatManager.prepareMessage(input, function(err, preparedInput) {
        var activeChatId = ChatManager.activeChat;
        var activeChatType = ChatManager.chats[activeChatId].type;
        var activeChatName = ChatManager.chats[activeChatId].name;

        console.log("Active chat type is: " + activeChatType);
        var date = new Date().toISOString();

        // Create a message ID using the current time and a random number
        var timeString = (new Date().getTime()).toString();
        var rand = Math.floor((Math.random() * 1000) + 1).toString();
        var messageId = timeString.concat(rand);

        if (activeChatType == 'room') {
          console.log("Sending message to room #"+ activeChatName);

          // Add the message to the chat locally and wait for it to be confirmed
          ChatManager.handleLocalMessage({
            messageId: messageId,
            chatId: activeChatId,
            messageString: preparedInput,
            fromUserId: ChatManager.userNameMap[window.username],
            date: date
          });

          window.socketClient.sendMessage({ messageId: messageId, chatId: activeChatId, message: preparedInput });
          return callback();
        }
        else if (activeChatType == 'chat') {
          var sendToIds = ChatManager.chats[activeChatId].participants;

          // Need to get the private message ID here to pass to sendPrivateMessage so we can encrypt to the keyRing
          console.log("[chatManager.sendMessage] Sending private message for chatId '" + activeChatId + "'");

          socketClient.sendPrivateMessage({ messageId: messageId, chatId: activeChatId, toUserIds: sendToIds, message: preparedInput });

          // Add the message to the chat locally and wait for it to be confirmed
          ChatManager.handleLocalMessage({
            messageId: messageId,
            chatId: activeChatId,
            messageString: preparedInput,
            fromUserId: ChatManager.userNameMap[window.username],
            date: date
          });

          return callback();
        }
        else {
          return console.log("ERROR: No activeChatType!");
        }
      })
    }
  }, 0);
};



ChatManager.showHelp = function showHelp() {
  var activeChatId = ChatManager.activeChat;
  var activeChatType = ChatManager.chats[activeChatId].type;

  var helpTextArray = [ "** ROOM Commands **", "/room [room] member add [member]" ];
  helpTextArray.forEach(function(msg) {
    ChatManager.addMessageToChat({ type: activeChatType, messageString: msg, chat: activeChatId });
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

  $('.ui.button.register').unbind().click(function(e) {
    RegisterUserPrompt.show(function(data) {
      // Do something when registration is succcessful
    });
  });

};

ChatManager.promptForCredentials = function promptForCredentials(callback) {
  var self = this;
  console.log("Prompting for credentials!");
  RegisterUserPrompt.show(function(data) {
    return callback()
  });
}

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
    var username = document.getElementById('username-input').value;

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
            username: username,
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
