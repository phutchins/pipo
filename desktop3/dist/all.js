var Authentication = {};

Authentication.authenticate = function authenticate(data) {
  var socket = data.socket;

  console.log("[AUTH] Authenticating with server with username: '"+window.username+"'");

  window.encryptionManager.keyManager.sign({}, function(err) {
    window.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
      socket.emit('authenticate', {username: window.username, fullName: window.fullName, publicKey: publicKey, email: window.email});
    });
  });
};


Authentication.authenticated = function authenticated(data) {
  var favoriteRooms = data.favoriteRooms;
  var defaultRoomId = data.defaultRoomId;
  var userNameMap = data.userNameMap;
  var userlist = data.userlist;
  var userProfile = data.userProfile;

  // Ensure that we have permission to show notifications and prompt if we don't
  clientNotification.init();

  if (data.message !== 'ok') {
    return console.log("[SOCKET CLIENT] (addListeners) Error from server during authentication")
  };

  if (window.activeChat) {
    ChatManager.activeChat = window.activeChat;
  }

  ChatManager.defaultRoomId = data.defaultRoomId;

  //if (!ChatManager.activeChat) {
  //  ChatManager.activeChat = { id: defaultRoomId, type: 'room' };
  //}

  ChatManager.updateUserlist(userlist);
  ChatManager.userNameMap = userNameMap;
  ChatManager.userProfile = userProfile;

  ChatManager.updateProfileHeader();

  window.encryptionManager.keyManager.sign({}, function(err) {
    window.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
      window.encryptionManager.verifyRemotePublicKey(window.username, publicKey, function(err, upToDate) {
        if (err) { return console.log("[INIT] Error updating remote public key: "+err) };

        if (upToDate) {
          console.log("[INIT] Your public key matches what is on the server");
          console.log("[AUTHENTICATED] Authenticated successfully");

          // Use cilent keys and enable chat for each room user is currently in
          if (favoriteRooms.length > 0) {

            favoriteRooms.forEach(function(roomId) {
              console.log("[SOCKET] (authenticated) Joining room ",roomId);
              if (roomId && typeof roomId !== 'undefined') {
                socketClient.joinRoom(roomId, function(err) {
                  console.log("[SOCKET] (authenticated) Sent join request for room "+roomId);
                });
              }
            });
          } else {
            var defaultRoomId = ChatManager.defaultRoomId;

            console.log("[SOCKET] (authenticated) Joining room ",defaultRoomId);

            socketClient.joinRoom(defaultRoomId, function(err) {
              console.log("[SOCKET] (authenticated) Joined default room becuase favoriteRooms was empty");
            })
          }
        } else {
          // Should not allow updating of remote key without signature from old key or admin making the change
          console.log("[INIT] Remote public key is not up to date so updating!");

          window.encryptionManager.updatePublicKeyOnRemote(window.username, publicKey, function(err) {
            if (err) { return console.log("[INIT] ERROR updating public key on server: "+err) };
            console.log("[AUTHENTICATED] Authenticated successfully");

            // Use cilent keys and enable chat for each room user is currently in
            favoriteRooms.forEach(function(room) {
              console.log("[SOCKET] (authenticated) Joining room ",room);

              socketClient.joinRoom(room, function(err) {
                console.log("[SOCKET] (authenticated) Sent join request for room "+room);
              });
            });
          });
        }
      });
    });
  });
};

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
  var enabled = false;
  var joined = false;
  var unread = false;
  var unreadCount = 0;
  console.log("Running initRoom for " + room.name);

  // TODO: Should store online status for members and messages in an object or array also

  // If room already exists locally, don't overwrite settings that should persist
  if (self.chats[room.id]) {
    enabled = self.chats[room.id].enabled;
    joined = self.chats[room.id].joined;
    unread = self.chats[room.id].unreadCount;
    unreadCount = self.chats[room.id].unread;
  };

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
    messages: room.messages,
    messageCache: '',
    name: room.name,
    owner: room.owner,
    subscribers: room.subscribers,
    type: 'room',
    topic: room.topic,
    unread: unread,
    unreadCount: unreadCount,
  };

  // Decrypt messages and HTMLize them
  var messages = self.chats[room.id].messages.sort(dynamicSort("date"));
  var count = 0;
  var messageArray = Array(messages.length);

  /*
   * Need a better way to detect when done decrypting all messages
   * and add them to the chat after done
   * Also we should only send messages to each user starting at their join date or
   * the date/time that they were added to a room
   */

  /*
   * Should only buldChatKeyRing for private rooms
   * Should build allUserKeyRing once and use that for public rooms
   */
  encryptionManager.buildChatKeyRing({ chatId: room.id }, function(keyRing) {
    ChatManager.chats[room.id].keyRing = keyRing;

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
          ChatManager.setChatEnabled([room.id]);
          ChatManager.updateChatStatus();
        };
      });
    });

    // If there are no messages, we still need to enable chat
    // Better way to do this?
    if (messages.length == 0) {
      ChatManager.setChatEnabled([room.id]);
      ChatManager.updateChatStatus();
    }
  });

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

    ChatManager.setChatEnabled([chatId]);
    ChatManager.updateChatStatus();

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
            //ChatManager.addMessageToChat({ type: 'chat', chatId: chatId, messageString: decryptedMessageString, date: date, fromUserId: fromUserId });
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

  if (ChatManager.chats[id].type == 'room') {
    ChatManager.updateRoomUsers({ chatId: id });
  } else if (type == 'chat') {

  }

  ChatManager.refreshChatContent(id);
  ChatManager.updateChatStatus();

  // TODO:
  // Enabling chat here but only we are in a good state which consists of
  // - Connected to the server
  // - All messages have been decrypted and displayed
  // - You are signed in and your key has been decrypted
  // -
  // Each one of these things needs to know how to enable and disable the main chat status or request a recheck of all statuses
  // so that it can set the main status on a change
  //debugger;
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
  console.log("[chatManager.updateRoomList] Chats: ", ChatManager.chats);

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
 * Update the user list on the right bar
 */
ChatManager.updateRoomUsers = function updateRoomUsers(data) {
  var self = this;

  var chatId = data.chatId;
  var socket = data.socket;

  var members = ChatManager.chats[chatId].members;
  var subscribers = ChatManager.chats[chatId].subscribers;

  var userListHtml = "";

  console.log("[CHAT MANAGER] (updateRoomUsers) members: "+JSON.stringify(members));
  console.log("[CHAT MANAGER] (updateRoomUsers) chats: ", Object.keys(ChatManager.chats));

  var isActive = function(userId) {
    if (ChatManager.chats[chatId].activeUsers.indexOf(userId) > -1) {
      console.log("[chatManager.updateRoomUsers] Looping activeUsers for '" + userId + "' and indexOf is true");
      return true;
    }
    console.log("[chatManager.updateRoomUsers] Looping activeUsers for '" + userId + "' and indexOf is false");
    return false;
  };

  // Make sure that activeUsers for the chat is updated before we build the userlist for the room below

  if (subscribers.length > 0) {
    subscribers.forEach(function(userId) {
      var username = ChatManager.userlist[userId].username;

      console.log("[chatManager.updateRoomUsers] activeUsers is: ", ChatManager.chats[chatId].activeUsers);
      var active = isActive(userId);

      // FIgure out why active is set ot true when users are not active

      var user = ChatManager.userlist[userId];

      console.log("[CHAT MANAGER] (updateRoomUsers) looping user:",username);

      if ( !ChatManager.chats[userId] && username != window.username ) {
        console.log("chat for ",username," was empty so initializing");
        //console.log("[updateRoomUsers] GETCHAT - calling getChat from updateRoomUsers");

        //socket.emit('getChat', { participantIds: [ ChatManager.userlist[username].id, ChatManager.userlist[window.username].id ]});

        // Create the chat so that is iready for the new data we are getting from getChat
        //ChatManager.chats[userId] = { name: username, type: 'chat', group: 'pm', messages: '', messageCache: '', topic: "One to one encrypted chat with " + username };

        //ChatManager.updateChatList();
      }

      var emailHash = "0";

      if (user && user.emailHash) {
        var emailHash = user.emailHash;
      }

      // If user is active class = active
      if (active) {
        userListHtml += "<li class='user-list-li user-active' userId='" + userId + "' id='userlist-" + userId + "' name='" + username + "' data-content='" + username + "'>\n";
      } else {
        // If user is not active class = inactive
        userListHtml += "<li class='user-list-li user-inactive' userId='" + userId + "' id='userlist-" + userId + "' name='" + username + "' data-content='" + username + "'>\n";
      }
      userListHtml += "  <div class=\"user-list-avatar avatar-m avatar\" style=\"background-image: url('https://www.gravatar.com/avatar/" + emailHash + "?s=64')\" data-original-title=''>\n";
      userListHtml += "  </div>\n";
      userListHtml += "</li>\n";
    });
  }

  $('#user-list').html(userListHtml);

  if (subscribers.length > 0) {
    subscribers.forEach(function(userId) {
      console.log("Setting up User Popup for '#userlist-" + userId + " .user-list-avatar'");
      $('#userlist-' + userId + ' .user-list-avatar').popup({
        inline: true,
        position: 'left center',
        hoverable: true,
        target: '#userlist-' + userId,
        popup: $('.ui.popup.userPopup'),
        on: 'click'
      })

      $('#userlist-' + userId + ' .user-list-avatar').click(function() {
        var userId = $( this ).parent().attr('userid');

        console.log("Populating user popup for", username);
        ChatManager.populateUserPopup({ userId: userId, socket: socket });
      });
    });
  }
};

/*
 * Populates the popup when mousing over a users name or avatar on the user list
 */
ChatManager.populateUserPopup = function populateUserPopup(data) {
  var self = this;

  var userId = data.userId;
  var userObject = ChatManager.userlist[userId];

  var username = userObject.username;;
  var fullName = userObject.fullName;
  var emailHash = userObject.emailHash;
  var email = userObject.email;

  var socket = data.socket;
  var participantIds = [ userId, ChatManager.userNameMap[window.username] ];

  var avatarHtml = "<img src='https://www.gravatar.com/avatar/" + emailHash + "?s=256' class='avatar-l'>";

  $('.userPopup .avatar').html(avatarHtml);
  $('.userPopup .fullName').text(fullName);
  $('.userPopup .username').text(username);
  $('.userPopup .email').text(email);
  $('.userPopup .email').attr('href', 'mailto:' + email);

  var usernameHtml = "<a href='http://pipo.chat/users/" + username + "' target='_blank'>" + username + "</a>";

  $('.userPopup .username').html(usernameHtml);

  $('.userPopup .privateChatButton').unbind().click(function() {
    if (username !== window.username) {
      // Should save this to the user profile object and push that to the server also so it can be re-opened on reconnect
      ChatManager.arrayHash(participantIds, function(chatHash) {
        // Add to awaitingInit
        //ChatManager.waitForInit(chatHash);

        // Need to ensure that we're requesting the correct participantId's from the server here

        window.socketClient.socket.emit('getChat', { chatHash: chatHash, participantIds: participantIds });

        window.socketClient.socket.on('chatUpdate-' + chatHash, function(data) {
          console.log("[chatManager.populateUserPopup] Got chatUpdate for chatHash '" + chatHash + "', running handleChatUpdate");
          self.setActiveChat(chatHash);
          self.handleChatUpdate(data, function() {
          });

          window.socketClient.socket.removeListener('chatUpdate-' + chatHash);
        });

        //socket.emit('getChat', { participantIds: participantIds });
      });


      $('.userPopup').removeClass('popover').addClass('popover-hidden');

      //ChatManager.focusChat({ id: userId }, function(err) {
      //  if ( !ChatManager.chats[userId] ) {
      //    console.log("chat for " + username + " was empty so initializing");
      //    ChatManager.chats[userId] = { name: username, id: userId, type: 'chat', group: 'pm', messages: "", topic: "One to one encrypted chat with " + username };
      //  }
      //  ChatManager.updateChatList();
      //  // Done
      //});
    }
  })
};


ChatManager.setChatEnabled = function setChatEnabled(roomIds) {
  if (!roomIds) {
    // Should change this to currently joined chats? (is this the same as ChatManager.chats?
    var roomIds = Object.keys(ChatManager.chats);
  };

  roomIds.forEach(function(id) {
    var enabled = ChatManager.chats[id].enabled;

    if (enabled) {
      console.log("[setChatEnabled] Trying to enable chat when it is already enabled");
      return;
    };

    ChatManager.chats[id].enabled = true;
    //
    // If the chat we're looping is active, update the UI to reflect
    if (ChatManager.activeChat == id) {
      ChatManager.enableChat();
    };
  });
};


ChatManager.setChatDisabled = function setChatDisabled(roomIds) {
  if (!roomIds) {
    var roomIds = Object.keys(ChatManager.chats);
  };

  // Determine why enabled is not defined here sometimes

  roomIds.forEach(function(id) {
    var enabled = ChatManager.chats[id].enabled;

    if (!enabled) {
      console.log("[setChatDisabled] Trying to disable chat when it is already disabled");
      return;
    };

    ChatManager.chats[id].enabled = false;

    if (ChatManager.activeChat == id) {
      ChatManager.disableChat();
    };
  });
};


ChatManager.updateChatStatus = function updateChatStatus() {
  if (ChatManager.activeChat) {
    var id = ChatManager.activeChat;

    if (ChatManager.chats[id].enabled) {
      return ChatManager.enableChat();
    };

    if (!ChatManager.chats[id].enabled) {
      return ChatManager.disableChat();
    };

    console.log("[chatManager.updateChatStatus] ERROR: chat.enabled not set?");
  } else {
    console.log("[ChatManager.updateChatStatus] Currently no active chat...");
  };
};



ChatManager.enableChat = function enableChat() {
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

ChatManager.disableChat = function disableChat() {
  var self = this;

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

  this.addMessageToChat({ type: 'room', chatId: chatId, messageString: messageString, fromUserId: fromUserId, date: date });
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

      ChatManager.addMessageToChat({ type: 'chat', fromUserId: fromUserId, chatId: chatId, messageString: message, date: date });
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
        ChatManager.addMessageToChat({ type: 'chat', fromUserId: fromUserId, chatId: chatId, messageString: message, date: date });
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
  var chatId = data.chatId;
  var type = ChatManager.chats[chatId].type;
  var messageString = data.messageString;
  var fromUserId = data.fromUserId;
  var date = data.date;

  // Need to add functionality to addMessageToChat to have the message confirmed or not
  ChatManager.addMessageToChat({ type: type, fromUserId: fromUserId, chatId: chatId, messageString: messageString, date: date });
};



ChatManager.addMessageToChat = function addMessageToChat(data) {
  var type = data.type;
  var messageString = data.messageString;
  var date = data.date;
  var fromUserId = data.fromUserId;
  var fromUsername = ChatManager.userlist[fromUserId].username;
  var chatId = data.chatId;
  var chatContainer = $('#chat');

  //Add timestamp
  var time = date || new Date().toISOString();

  ChatManager.formatChatMessage({ messageString: messageString, fromUserId: fromUserId, fromUsername: fromUsername, date: date }, function(formattedMessage) {
    ChatManager.chats[chatId].messageCache = ChatManager.chats[chatId].messageCache.concat(formattedMessage);
  });

  if (ChatManager.activeChat == chatId) {
    ChatManager.refreshChatContent(chatId);
    chatContainer[0].scrollTop = chatContainer[0].scrollHeight;
  } else {
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
      ChatManager.formatChatMessage({ messageString: message.decryptedMessage, fromUserId: message.fromUser, fromUsername: fromUsername }, function(formattedMessage) {
        ChatManager.chats[chatId].messageCache = ChatManager.chats[chatId].messageCache.concat(formattedMessage);
      });
    });
  };
};

ChatManager.formatChatMessage = function formatChatMessage(data, callback) {
  var messageString = data.messageString;
  var fromUserId = data.fromUserId;
  var fromUsername = data.fromUsername;
  var date = data.date;
  var emailHash = ChatManager.userlist[fromUserId].emailHash || "00000000000";

  var time = date || new Date().toISOString();
  var messageHtml = '<div class="chat-item"><div class="chat-item__container"> <div class="chat-item__aside"> <div class="chat-item__avatar"> <span class="widget"><div class="trpDisplayPicture avatar-s avatar" style="background-image: url(\'https://www.gravatar.com/avatar/' + emailHash + '?s=64\')" data-original-title=""> </div> </span> </div> </div> <div class="chat-item__actions js-chat-item-actions"> <i class="chat-item__icon chat-item__icon--read icon-check js-chat-item-readby"></i> <i class="chat-item__icon icon-ellipsis"></i> </div> <div class="chat-item__content"> <div class="chat-item__details"> <div class="chat-item__from js-chat-item-from">' + fromUsername + '</div> <div class="chat-item__time js-chat-item-time chat-item__time--permalinkable"> <span style="float:right;" title="' + time + '" data-livestamp="' +  time + '"></span> </div> </div> <div class="chat-item__text js-chat-item-text">' + messageString + '</div> </div> </div></div>';
  return callback(messageHtml);
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

      if (activeChatType == 'room') {
        console.log("Sending message to room #"+ activeChatName);

        window.socketClient.sendMessage({ chatId: activeChatId, message: preparedInput });
        $('#message-input').val('');
        return callback();
      }
      else if (activeChatType == 'chat') {
        var sendToIds = ChatManager.chats[activeChatId].participants;

        // Need to get the private message ID here to pass to sendPrivateMessage so we can encrypt to the keyRing
        console.log("[chatManager.sendMessage] Sending private message for chatId '" + activeChatId + "'");

        socketClient.sendPrivateMessage({ chatId: activeChatId, toUserIds: sendToIds, message: preparedInput });

        $('#message-input').val('');

        // Add the message to the chat locally and wait for it to be confirmed
        ChatManager.handleLocalMessage({
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

var clientNotification = {};

clientNotification.init = function init() {
  this.getPermission(function(permission) {
    if (permission) {
      console.log("Have notification permissions!");
    }
  })
}

clientNotification.getPermission = function getPermission(callback) {
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

// Sends a notification that expires after a timeout. If timeout = 0 it does not expire
clientNotification.send = function send(image, title, message, timeout, showOnFocus) {
  var self = this;
  this.getPermission(function(permission) {
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
				console.log("[clientNotification.send] Flashing title bar!");
			  self.flashTitleBar("New Messages")();
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

// Make a chat list item pulse
clientNotification.pulseChat = function pulseChat(chatId) {
  var properties = {
       backgroundColor : '#ddd'
  };

  var el = $('#' + chatId);

  el.pulse(properties, {
    duration : 3250,
    pulses   : 5,
    interval : 800
  })
};

clientNotification.flashTitleBar = function flashTitleBar(message) {
    var oldTitle = document.title;
    var timeoutId;
    var blink = function() { document.title = document.title == message ? ' ' : message; };
    var clear = function() {
        clearInterval(timeoutId);
        document.title = oldTitle;
        window.onmousemove = null;
        timeoutId = null;
    };
    return function () {
        if (!timeoutId) {
            timeoutId = setInterval(blink, 1000);
            window.onmousemove = clear;
        }
    };
};

function EncryptionManager() {
  this.keyPair = ({
    publicKey: null,
    privateKey: null
  });

  //this.masterKeyPair = ({
  //  password: 'pipo',
  //  id: null,
  //  publicKey: null,
  //  privateKey: null,
  //  encryptedPrivateKey: null
  //});

  // Should update this setting from the server using getConfig and configUpToDate
  this.encryptionScheme = {};

  this.keyManager = null;
  this.masterKeyManager = null;
  this.keyRing = new window.kbpgp.keyring.KeyRing();
  this.clientCredentialsLoaded = false;
  this.masterCredentialsLoaded = false;
  this.clientCredentailsDecrypted = false;
  this.masterCredentailsDecrypted = false;
}

/**
 * Generates a new keypair for this manager
 * @param numBits
 * @param userId
 * @param passphrase
 * @param callback
 */
EncryptionManager.prototype.generateClientKeyPair = function generateClientKeyPair(numBits, userId, passphrase, callback) {
  var self = this;
  var options = {
    numBits: numBits,
    userId: userId,
    passphrase: passphrase
  };

  console.log("Generating client keypair, please wait...");

  window.openpgp.generateKeyPair(options).then(function(keys) {
    self.keyPair = {
      privateKey: keys.privateKeyArmored,
      publicKey: keys.publicKeyArmored
    };
    return callback(null, self.keyPair);
  }).catch(function(err) {
    return callback(err, null);
  });
};


/*
 * Unload a currently loaded keypair for signing out or loading a new keypair
 * Maybe we should just reset this entire object instead of clearing things?
 */
EncryptionManager.prototype.unloadClientKeyPair = function unloadClientKeyPair(callback) {
  // Set loaded flag to false
  self.clientCredentialsLoaded = false;

  // Clear all variables related to decrypted client credentials
  // self.keyRing, localStorage.getItem('keyPair'),
  self.keyRing = new window.kbpgp.keyring.keyRing();
  return callback();
}


/**
 * Attemtps to load stored PGP key from localStorage and initalize all internal variables
 * @param callback(err, loaded)
 */
EncryptionManager.prototype.loadClientKeyPair = function loadClientKeyPair(callback) {
  var self = this;
  // If credentials are already loaded return true and move on
  if (self.clientCredentialsLoaded) {
    console.log("Client credentials already loaded...");
    return callback(null, true);
  }
  console.log("[LOAD CLIENT KEY PAIR] Loading client key pair from local storage");
  var keyPairData = localStorage.getItem('keyPair');
  var username = localStorage.getItem('username');
  // If we have a local client keypair, load it and try to parse from JSON
  if (keyPairData && username) {
    console.log("[LOAD CLIENT KEY PAIR] Loaded client key pair from local storage!");
    try {
      keyPairData = JSON.parse(keyPairData);
    }
    catch(err) {
      console.log("Error parsing keyPair data from localStorage", e);
      return callback(err, false);
    }
  } else {
    console.log("[ENCRYPTION MANAGER] (loadClientKeyPair) No keyPairData found in local storage...");
    return callback(null, false);
  };

  //Load decrypted key into keyRing
  kbpgp.KeyManager.import_from_armored_pgp({
    armored: keyPairData.publicKey
  }, function(err, keyManager) {
    if (err) {
      console.log("Error loading key", err);
      return callback(err);
    } else {
      keyManager.merge_pgp_private({
        armored: keyPairData.privateKey
      }, function(err) {
        if (!err) {
          self.keyManager = keyManager;
          if (keyManager.is_pgp_locked()) {
            UnlockClientKeyPairModal.show(function() {
              self.keyRing.add_key_manager(keyManager);
              self.clientCredentialsLoaded = true;
              return callback(null, true);
            });
          };
        };
      })
    }
  });
};

/**
 * Attemtps to load stored PGP key from localStorage and initalize all internal variables
 * @param callback(err, loaded)
 */
EncryptionManager.prototype.loadMasterKeyPair = function loadMasterKeyPair(room, masterKeyPair, callback) {
  var self = this;
  if (masterKeyPair) {
    // MasterKey mode
    console.log("[ENCRYPTION MANAGER] masterKeyPair found! client keyManager locked", self.keyManager.is_pgp_locked().toString());

    if (self.keyManager.is_pgp_locked()) {
      return console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) Client keyManager is locked! :(");
    }
    if (!masterKeyPair.encryptedPrivateKey) {
      return console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) No master key provided to loadMasterKeyPair! encryptedMasterPrivateKey is NULL");
    }

    // Decrypt master key and add to keyRing
    console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) Decrypting master key");

    self.decryptMasterKey(masterKeyPair.encryptedPrivateKey, function(err, masterPrivateKey) {
      window.encryptionManager.getKeyManager({
        publicKey: masterKeyPair.publicKey,
        privateKey: masterPrivateKey,
        passphrase: ''
      }, function(err, keyManager) {
        self.masterKeyManager = keyManager;
        // Unlock and add masterKeyManager to keyRing
        window.encryptionManager.unlockMasterKey(room, function(err) {
          if (err) {
            return callback(err, false);
          }
          self.masterCredentialsLoaded = true;
          console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) Unlock master key pair complete!");
          return callback(err, true);
        });
      });
    });
  } else {
    // ClientKey mode
    console.log("[ENCRYPTION MANAGER] (loadMasterKeyPair) CLIENT KEY MODE!");
  }
};

/*
* create a KeyManager from object containing publicKey and privateKey
*/
EncryptionManager.prototype.getKeyManager = function getKeyManager(data, callback) {
  var privateKey = data.privateKey;
  var publicKey = data.publicKey;
  var passphrase = data.passphrase;

  console.log("[ENCRYPTION MANAGER] (getKeyManager) Starting KeyManager creation with privateKey: "+privateKey+" publicKey: "+publicKey+" passphrase: "+passphrase);
  console.log("[ENCRYPTION MANAGER] (getKeyManager) Starting KeyManager creation");

  kbpgp.KeyManager.import_from_armored_pgp({
    armored: publicKey
  }, function(err, keyManager) {
    if (!err) {
      keyManager.merge_pgp_private({
        armored: privateKey
      }, function(err) {
        if (!err) {
          if (keyManager.is_pgp_locked()) {
            keyManager.unlock_pgp({
              passphrase: passphrase
            }, function(err) {
              if (err) { return callback(err) };
              keyManager.sign({}, function(err) {
                if (err) { return callback(err) };
                console.log("Loaded private key with passphrase");
                return callback(err, keyManager);
              });
            });
          } else {
            console.log("Loaded private key w/o passphrase");
            return callback(err, keyManager);
          }
        } else {
          return callback(err, null);
        }
      });
    } else {
      return callback(err, null);
    }
  });
}

EncryptionManager.prototype.promptForPassphrase = function promptForPassphrase(callback) {
  var self = this;
  UnlockClientKeyPairModal.show(callback);
};

EncryptionManager.prototype.clientKeyUnlocked = function clientKeyUnlocked() {
};

EncryptionManager.prototype.unlockClientKey = function unlockClientKey(data, callback) {
  var self = this;
  var passphrase = data.passphrase;

  console.log("[encryptionManager.unlockClientKey] Unlocking client key");

  self.keyManager.unlock_pgp({
    passphrase: passphrase
  }, function (err) {
    if (err) {
      console.log("Error unlocking key", err);
      return callback({ err: err });
    }

    console.log("[ENCRYPTION MANAGER] (unlockClientKey) Successfully decrypted client key");

    self.keyRing.add_key_manager(self.keyManager);
    self.clientCredentialsDecrypted = true;

    return callback(null);
  });
};

EncryptionManager.prototype.unlockMasterKey = function unlockMasterKey(room, callback) {
  //Unlock key with passphrase if locked
  var self = this;
  console.log("(unlockMasterKey) self.masterKeyManager.is_gpg_locked(): "+self.masterKeyManager.is_pgp_locked());
  if (self.encryptionScheme[room] == 'masterKey' && self.masterKeyManager.is_pgp_locked()) {
    var tries = 3;
    decryptMaster();

    function decryptMaster() {
      self.masterKeyManager.unlock_pgp({
        passphrase: 'pipo'
      }, function (err) {
        if (err) {
          console.log("Error unlocking key", err);
          return callback(err);
        }

        //self.masterKeyManager = masterKeyManager;
        self.keyRing.add_key_manager(self.masterKeyManager);

        self.masterCredentialsDecrypted = true;

        return callback(null);
      });
    }
  }
  else {
    self.keyRing.add_key_manager(self.masterKeyManager);
    console.log("[UNLOCK MASTER KEY] Added passwordless masterKey to keyring");
    return callback(null);
  }
};



/*
 * Builds a keyRing for the specified room
 * For private rooms, this includes all members
 * For public rooms this includes all users
 */
EncryptionManager.prototype.buildChatKeyRing = function buildChatKeyRing(data, callback) {
  var chatId = data.chatId;
  var membershipRequired = ChatManager.chats[chatId].membershipRequired;
  var keyRing = new window.kbpgp.keyring.KeyRing();

  console.log("[encryptionManager.buildChatKeyRing] Building chat keyring for #" + ChatManager.chats[chatId].name);

  if (membershipRequired) {
    ChatManager.chats[chatId].members.forEach(function(userId) {
      if (ChatManager.userlist[userId].username != window.username) {
        var keyInstance = ChatManager.userlist[userId].keyInstance;
        keyRing.add_key_manager(keyInstance);
      };
    });
  };

  if (!membershipRequired) {
    console.log("[encryptionManager.buildChatKeyRing] Building keyRing for public chat");
    Object.keys(ChatManager.userlist).forEach(function(userId) {
      if (ChatManager.userlist[userId].username != window.username) {
        var keyInstance = ChatManager.userlist[userId].keyInstance;
        var keyFingerPrint = ChatManager.userlist[userId].keyInstance.get_pgp_fingerprint_str();
        console.log("[encryptionManager.buildChatKeyRing] Adding user '" + ChatManager.userlist[userId].username + "' key with finger print '" + keyFingerPrint + "'");
        keyRing.add_key_manager(keyInstance);
      };
    });
  };

  return callback(keyRing);
};


/**
 * Encrypts a message to all keys in the room
 * @param room
 * @param message
 * @param callback
 */
EncryptionManager.prototype.encryptRoomMessage = function encryptRoomMessage(data, callback) {
  var chatId = data.chatId;
  var message = data.message;
  var self = this;

  //Encrypt the message
  if (ChatManager.chats[chatId].encryptionScheme == "masterKey") {
    console.log("[ENCRYPT ROOM MESSAGE] Using masterKey scheme");

    self.encryptMasterKeyMessage({ chatId: chatId, message: message }, function(err, pgpMessage) {
      callback(err, pgpMessage );
    });
  } else if (ChatManager.chats[chatId].encryptionScheme == "clientKey") {
    console.log("[ENCRYPT ROOM MESSAGE] Using clientKey scheme");
    console.log("[DEBUG] Encrypting message: "+message+" for room: "+chatId);

    // Make sure that we are encrypting message to the user as well as our self here

    self.encryptClientKeyMessage({ chatId: chatId, message: message }, function(err, pgpMessage) {
      callback(err, pgpMessage );
    });
  } else {
    console.log("[ENCRYPT ROOM MESSAGE] Using default scheme");

    self.encryptClientKeyMessage({ chatId: chatId, message: message }, function(err, pgpMessage) {
      callback(err, pgpMessage );
    });
  }
};

/**
 * Encrypts messages to the master key if we are using
 * master key room message encryption
 */
EncryptionManager.prototype.encryptMasterKeyMessage = function encryptMasterKeyMessage(room, message, callback) {
  var self = this;
  window.kbpgp.box({
    msg: message,
    encrypt_for: self.masterKeyManager,
    sign_with: self.keyManager,
  }, callback);
};

EncryptionManager.prototype.encryptClientKeyMessage = function encryptClientKeyMessage(data, callback) {
  var self = this;
  var chatId = data.chatId;
  var message = data.message;
  var keys = [];
  var keysTest = [];
  var keyFingerPrints = {};


  // TODO: Need to confirm the admin signature that added the user to this chat here
  // Rooms: For rooms it would be one of the admins of the room
  // Chats: For chats it would be the creator of the chat or initiator of the chat
  //

  Object.keys(ChatManager.chats[chatId].keyRing._kms).forEach(function(id) {
    keys.push(ChatManager.chats[chatId].keyRing._kms[id]);
  });

  ChatManager.chats[chatId].subscribers.forEach(function(userId) {
    keyFingerPrints[ChatManager.userlist[userId].username] = ChatManager.userlist[userId].keyInstance.get_pgp_fingerprint_str();
  });

  console.log("[encryptionManager.encryptClientKeyMessage] Encrypting client key message to users: ", keyFingerPrints);

  //Add our own key to the mix so that we can read the message as well
  keys.push(self.keyManager);

  window.kbpgp.box({
    msg: message,
    encrypt_for: keys,
    sign_with: self.keyManager
  }, callback);
};

EncryptionManager.prototype.encryptPrivateMessage = function encryptPrivateMessage(data, callback) {
  var self = this;
  var chatId = data.chatId;
  var message = data.message;
  var keys = [];
  var keyFingerPrints = {};

  /*
  toUserIds.forEach(function(userId) {
    keys.push(ChatManager.userlist[userId].keyInstance);
  });
  */

  Object.keys(ChatManager.chats[chatId].keyRing._kms).forEach(function(userId) {
    keys.push(ChatManager.chats[chatId].keyRing._kms[userId]);
  });

  ChatManager.chats[chatId].participants.forEach(function(userId) {
    keyFingerPrints[ChatManager.userlist[userId].username] = ChatManager.userlist[userId].keyInstance.get_pgp_fingerprint_str();
  });

  keys.push(self.keyManager);

  //console.log("[encryptionManager.encryptPrivateMessage] Encrypting private message to keys: ",keyFingerPrints);

  window.kbpgp.box({
    msg: message,
    encrypt_for: keys,
    sign_with: self.keyManager
  }, callback);
};

/**
 * Decrypts an incoming message with our key
 * @param encryptedMessage
 * @param callback
 */

 //TODO: Should name this appropriately for client key decryption
EncryptionManager.prototype.decryptMessage = function decryptMessage(data, callback) {
  var self = this;
  var encryptedMessage = data.encryptedMessage;
  var keyRing = data.keyRing || this.keyRing;

  Object.keys(keyRing._keys).forEach(function(keyId) {
    console.log("[ENCRYPTION MANAGER] (decryptMessage) Decrypting clientKey message with key ID '" + keyRing._keys[keyId].km.get_pgp_fingerprint().toString('hex') + "'");
  });

  // Add our own decrypted private key to the key manager so we can decrypt messages
  if (self.keyManager) {
    keyRing.add_key_manager(self.keyManager);
  };

  window.kbpgp.unbox({ keyfetch: keyRing, armored: encryptedMessage }, function(err, literals) {

    //if (err) {
    //  console.log("[encryptionManager.decryptMessage] Error decrypting message: ",err);
    //}

    return callback(err, literals);
  });
};


EncryptionManager.prototype.decryptMasterKeyMessage = function decryptMasterKeyMessage(pgpMessage, callback) {
};

//TODO: Determine if these are needed

EncryptionManager.prototype.removeClientKeyPair = function removeClientKeyPair(fs, callback) {
  fs.root.getFile('clientkey.aes', {create: false}, function(fileEntry) {
    fileEntry.remove(function() {
      console.log('File successufully removed.');
      fs.root.getFile('clientkey.pub', {create: false}, function(fileEntry) {
        fileEntry.remove(function() {
          console.log('File successufully removed.');
          callback(null);
        }, errorHandler);
      }, errorHandler);
    }, errorHandler);
  }, errorHandler);
  function errorHandler(err) {
    var msg = '';
    switch(err.name) {
      case "BAD":
        console.log("Bad");
        return callback(err.message);
      default:
        message = 'Unknown Error: '+err.name;
        return callback(err.message);
    };
    console.log("Error: "+message);
  };
};

EncryptionManager.prototype.saveClientKeyPair = function saveClientKeyPair(data, callback) {
  var keyPair = data.keyPair;
  var username = data.username;
  console.log("Saving client keyPair with username: " + username);
  // TODO: Save with username in namespace of key name?
  window.username = username;
  localStorage.setItem('username', username);
  localStorage.setItem('keyPair', JSON.stringify(keyPair));
  callback(null);
}

EncryptionManager.prototype.initStorage = function initStorage(callback) {
  //Taking care of the browser-specific prefix
  window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
  window.requestFileSystem(window.PERSISTENT, 1024*1024,onInitFs, function(err) {
    console.log("Error initStorage: "+err);
  });
  function onInitFs(fs) {
    console.log("[INIT STORAGE] Initializing storage...");
    // First check how much we can use in the Persistent storage.
    fs = fs;
    navigator.webkitPersistentStorage.queryUsageAndQuota(
      function (usage, quota) {
        var availableSpace = quota - usage;
        console.log("availableSpace: "+availableSpace);
        if (availableSpace >= amountOfSpaceNeeded) {
          console.log("Have as much space as we need!");
          return callback(null, fs);
        }
        var requestingQuota = amountOfSpaceNeeded + usage;
        navigator.webkitPersistentStorage.requestQuota(
            requestingQuota,
            function (grantedQuota) {
              console.log("Didn't have enough space so requested more. Got: "+grantedQuota);
              return callback(null, fs)
            },
            onError);
      }, onError
    );
    function onError(err) {
      console.log("Got error during init storage: "+err);
      callback(err);
    }
  };
};


EncryptionManager.prototype.decryptMasterKey = function decryptMasterKey(encryptedMasterPrivateKey, callback) {
  var self = this;
  if (!encryptedMasterPrivateKey) { console.log("[ENCRYPTION MANAGER] (decryptMasterKey) encryptedMasterPrivateKey is NULL!") };
  if (!self.keyRing) { console.log("[ENCRYPTION MANAGER] (decryptMasterKey) self.keyRing is NULL!") };
  console.log("[ENCRYPTION MANAGER] (decryptMasterKey) Start...");
  kbpgp.unbox({keyfetch: self.keyRing, armored: encryptedMasterPrivateKey}, function(err, literals) {
    if (err != null) {
      return console.log("Problem: " + err);
    } else {
      var decryptedMasterPrivateKey = null;
      console.log("[ENCRYPTION MANAGER] (decryptMasterKey) Decrypted master key");
      //console.log(literals[0].toString());
      decryptedMasterPrivateKey = literals[0].toString();
      var ds = km = null;
      ds = literals[0].get_data_signer();
      if (ds) { km = ds.get_key_manager(); }
      if (km) {
        console.log("[ENCRYPTION MANAGER] (decryptMasterKey) Signed by PGP fingerprint");
        console.log(km.get_pgp_fingerprint().toString('hex'));
        return callback(err, decryptedMasterPrivateKey);
      }
      console.log("[ENCRYPTION MANAGER] (decryptMasterKey) Unsigned key");
      return callback(err, decryptedMasterPrivateKey);
    }
  });
};



EncryptionManager.prototype.getKeyInstance = function getKeyInstance(publicKey, callback) {
  window.kbpgp.KeyManager.import_from_armored_pgp({
    armored: publicKey
  }, function (err, keyInstance) {
    if (err) {
      return console.log("[encryptionManager.getKeyInstance] Error getting key Instance");
    }

    return callback(keyInstance);
  });
};


EncryptionManager.prototype.getMasterKeyPair = function getMasterKeyPair(username, callback) {
  var timestamp = new Date().toString();
  console.log("["+timestamp+"] Getting master keyPair for "+username);
  $.ajax({
    type: "GET",
    url: "/key/masterKeyPair",
    dataType: "json",
    data: {
      username: username
    },
    statusCode: {
      404: function(err) {
        console.log("["+timestamp+"] [MASTER KEY PAIR] (404) Error getting master keypair: "+err);
        return callback(err, null);
      },
      200: function(data) {
        console.log("["+timestamp+"] [MASTER KEY PAIR] (200) Encrypted masterKeyPair retrieved and cached");
        //console.log("[GET MASTER KEY PAIR] data.keyId: "+data.keyId+" data.publicKey: "+data.publicKey+" data.encryptedPrivateKey: "+data.encryptedPrivateKey);
        //TODO: add the keys to a keyManager here and save them to self

        kbpgp.KeyManager.import_from_armored_pgp({
          armored: data.publicKey
        }, function(err, masterKeyPair) {
          if (!err) {
            masterKeyPair.merge_pgp_private({
              armored: data.privateKey
            }, function(err) {
              if (!err) {
                if (masterKeyPair.is_pgp_locked()) {
                  masterKeyPair.unlock_pgp({
                    passphrase: ''
                  }, function(err) {
                    if (!err) {
                      console.log("Loaded private key with passphrase");
                    }
                  });
                } else {
                  console.log("Loaded private key w/o passphrase");
                }
              }
              console.log("Loaded private key with passphrase");
              localStorage.setItem('masterKeyPair', JSON.stringify(data));
              self.masterKeyManager = masterKeyPair;
            });
          }
        });
        return callback(null, data);
      }
    }
  });
};

// TODO: Change references from updateRemotePublicKey to verifyRemotePublicKey
EncryptionManager.prototype.verifyRemotePublicKey = function verifyRemotePublicKey(username, publicKey, callback) {
  console.log("Verifying remote public key for user '"+username+"'");
  $.ajax({
    type: "GET",
    url: "https://pipo.chat/key/publickey",
    dataType: "json",
    data: {
      username: username
    },
    statusCode: {
      404: function(data) {
        console.log("No key found on remote");
        return callback(null, false);
      },
      200: function(data) {
        //console.log("[DEBUG] (updateRemotePublicKey) data: "+data);
        var remotePublicKey = data.publicKey;
        console.log("Key exists on remote");
        //console.log("Remote Pub Key: "+data.publicKey);
        //console.log("Local Pub Key: "+publicKey);
        var regex = /\r?\n|\r/g
        //console.log("pubKey: " + JSON.stringify(publicKey));
        //console.log("remotePubKey: " + JSON.stringify(data.publicKey));
        var parsedPublicKey = publicKey.toString().replace(regex, '');
        var parsedRemotePublicKey = data.publicKey.toString().replace(regex, '');
        if (parsedPublicKey == parsedRemotePublicKey) {
          console.log("Key on remote matches local");
          return callback(null, true);
        } else {
          console.log("parsedPublicKey: " + parsedPublicKey);
          console.log("parsedRemotePublicKey: " + parsedRemotePublicKey);
          console.log("Key on remote does not match");
          return callback(null, false);
        };
      }
    }
  });
};

//TODO: Yes... I know this is a duplicate. Will deal with it later.
EncryptionManager.prototype.updatePublicKeyOnRemote = function updatePublicKeyOnRemote(username, publicKey, callback) {
  console.log("Updating public key on remote");
  $.ajax({
    type: "POST",
    url: "/key/publickey",
    dataType: "json",
    data: {
      username: username,
      publicKey: publicKey
    },
    success: function(data, textStatus, xhr) {
    },
    statusCode: {
      404: function() {
        console.log("Got 404 when updating public key on remote");
        return callback("Error updating public key on remote");
      },
      200: function(data, textStatus, xhr) {
        console.log("Updated remote publicKey successfully");
        return callback(null);
      }
    }
  });
};

EncryptionManager.prototype.verifyCertificate = function verifyCertificate(certificate, callback) {
  var self = this;
  var rawPayload = atob(certificate.payload);
  var storedPayloadHash = localStorage.getItem('serverPayloadHash');

  self.sha256(rawPayload).then(function(payloadHash) {
    if (storedPayloadHash && payloadHash !== storedPayloadHash) {
      return alert("For security reasons we have prevented the application from attempting to authenticate as the Admin Certificate has changed!\n\nThe Admin Certificate hash does not match our previously recorded hash.\n\nIf this change was expected you may reset the hash, if not please contact the administrator of this server");
    }
    else if (storedPayloadHash) {
      console.log("Admin certificate hash matches previously stored hash, skip full verification");
      return callback();
    }

    var rawSignatures = certificate.signatures.map(function (signature) {
      return atob(signature.data);
    });

    var parsedPayload = JSON.parse(rawPayload);
    var fingerprints = parsedPayload.map(function (admin) {
      return admin.fingerprint;
    });

    self.loadAdminKeys(certificate, function (err) {
      console.log("[encryptionManager.verifyCertificate] Loaded admin keys");
      window.async.eachSeries(rawSignatures, function (signature, callback) {
        var fingerprint, index;
        self.decryptMessage({ encryptedMessage: signature }, function (err, message) {
          console.log("[encryptionManager.verifyCertificate] Decrypted Admin Certificate...");
          if (err) {
            console.log(err);
            return callback(err);
          }

          fingerprint = message[0].get_data_signer().get_key_manager().get_pgp_fingerprint_str();
          index = fingerprints.indexOf(fingerprint);

          if (index === -1) {
            return callback("Admin certificate is not valid \nUnknown admin certificate signer with fingerprint: " + fingerprint);
          }

          var regex = /\r?\n|\r/g
          var parsedMessage = message[0].toString().replace(regex, '');
          var parsedPayload = rawPayload.toString().replace(regex, '');

          if (parsedMessage !== parsedPayload) {
            return callback("Admin certificate not valid: \nAdmin signature does not match payload " + fingerprint);
          }
          fingerprints.splice(index, 1);
          callback();
        });
      }, function (err) {
        if (err) {
          return alert(err + "\n\nFor security reasons we have prevented the application from attempting to authenticate.\n\nIf you are the administrator for this server please verify your configuration files are correctly setup.\n\nIf you are an end user, please contact the administrator via secure means to determine if the server has been compromised.");
        }
        if (!storedPayloadHash) {

          localStorage.setItem('serverPayloadHash', payloadHash.toString());
        }
        console.log("Admin certificate appears to be valid");
        callback();
      });
    });
  });
};

EncryptionManager.prototype.loadAdminKeys = function loadadminKeys(certificate, callback) {
  var self = this;
  var rawAdminKeyData = localStorage.getItem('adminKeys');
  var adminKeyData;

  try {
    adminKeyData = JSON.parse(rawAdminKeyData);
  }
  catch (e) {
    console.log(e);
  }

  if (!adminKeyData) {
    adminKeyData = certificate.keys;
  }

  if (!adminKeyData) {
    return console.error("No known admin keys!", adminKeyData);
  }

  window.async.each(adminKeyData, function(keyData, callback) {
    var rawKey = atob(keyData.data);
    window.kbpgp.KeyManager.import_from_armored_pgp({
      armored: rawKey
    }, function(err, keyManager) {
      self.keyRing.add_key_manager(keyManager);
      callback();
    });
  }, callback);
};

EncryptionManager.prototype.hex = function hex(buffer) {
  var hexCodes = [];
  var view = new DataView(buffer);

  for (var i = 0; i < view.byteLength; i += 4) {
    var value = view.getUint32(i);
    var stringValue = value.toString(16);
    var padding = '00000000';
    var paddedValue = (padding + stringValue).slice(-padding.length);
    hexCodes.push(paddedValue);
  }

  return hexCodes.join("");
};

EncryptionManager.prototype.sha256 = function hash(data) {
  var self = this;
  var buffer = new TextEncoder("utf-8").encode(data);

  return window.crypto.subtle.digest("SHA-256", buffer).then(function (hash) {
    return self.hex(hash);
  });
};

window.encryptionManager = new EncryptionManager();

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


function SocketClient() {
  var self = this;
  //var host = window.location.host;
  var host = "https://pipo.chat";
  this.socket = window.io(host + '/socket');

  window.username = localStorage.getItem('username');
  window.email = localStorage.getItem('email');
  window.fullName = localStorage.getItem('fullName');

  this.socket.on('connect', function() {
    console.log("Connected to socket.io server");
  });

  this.socket.on('certificate', function(certificate) {
    console.log("[socketClient] (certificate) Got server certificate. Verifying...");
    window.encryptionManager.verifyCertificate(certificate, function(err) {
      console.log("[socketClient] (certificate) Veritifed server certificate! Authenticating with server.");
      self.init();
    });
  });

  this.socket.on('connect_error', function(err) {
    console.log('[SOCKET] (connection error) Disabling chat!', err);
    if (self.listeners) {
      ChatManager.disableChat();
    }
  });
}


SocketClient.prototype.addListeners = function() {
  var self = this;
  self.listeners = true;

  this.socket.on('authenticated', function(data) {
    console.log("[SOCKET] authenticated");
    data.socket = this;

    Authentication.authenticated(data);
  });

  this.socket.on('roomUpdate', function(data) {
    console.log("[SOCKET] roomUpdate");
    self.handleRoomUpdate(data);
  });

  this.socket.on('joinComplete', function(data) {
    console.log("[SOCKET] joinComplete");
    self.joinComplete(data);
  });

  this.socket.on('partComplete', function(data) {
    console.log("[SOCKET] partComplete");
    self.partComplete(data);
  });

  this.socket.on('createRoomComplete', function(data) {
    console.log('[SOCKET] createRoomComplete');
    self.createRoomComplete(data);
  });

  this.socket.on('updateRoomComplete', function(data) {
    self.updateRoomComplete(data);
  });

  this.socket.on('chatUpdate', function(data) {
    ChatManager.handleChatUpdate(data);
  });

  this.socket.on('serverCommandComplete', function(data) {
    console.log("[SOCKET] serverCommandComplete");
    self.serverCommandComplete(data);
  });

  this.socket.on('errorMessage', function(data) {
    console.log('errorMessage', data);
  });

  this.socket.on('user connect', function(data) {
    //console.log('user connect', data);
  });

  this.socket.on('membershipUpdateComplete', function(data) {
    self.handleMembershipUpdateComplete(data);
  });

  this.socket.on('roomMessage', function(data) {
    var message = data.message;
    var chatId = data.chatId;

    window.encryptionManager.decryptMessage({
      keyRing: ChatManager.chats[chatId].keyRing,
      encryptedMessage: data.message
    }, function(err, messageString) {
      if (err) {
        console.log(err);
      }
      ChatManager.handleMessage({ messageString: messageString.toString(), date: message.date, fromUserId: data.fromUserId, chatId: chatId });
    });
  });

  this.socket.on('privateMessage', function(data) {
    var self = this;
    var message = data.message;
    var chatId = data.chatId;

    console.log('[socketClient] (privateMessage) Got private message event. Data is: ', data);
    data.socket = self;

    ChatManager.handlePrivateMessage(data);
  });

  this.socket.on('newMasterKey', function(data) {
    console.log("[SOCKET] 'new master key'");
    var room = data.room;
    ChatManager.disableChat();
    self.joinRoom(room, function(err) {
      ChatManager.localMsg({ type: null, message: "Master key being updated. Please wait..." });
    });
  });

  this.socket.on('userlistUpdate', function(data) {
    var userlist = data.userlist;
    var userNameMap = data.userNameMap;

    console.log("[SOCKET] 'userlistUpdate'");

    ChatManager.userNameMap = userNameMap;

    ChatManager.updateUserlist(userlist);
  });

  this.socket.on('activeUsersUpdate', function(data) {
    var uniqueRoomUsersArray = [];
    var newRoomUsersArray = [];
    var chatId = data.chatId;

    if (!ChatManager.chats[chatId]) {
      return;
    }

    var chatName = ChatManager.chats[chatId].name;
    var activeUsers = data.activeUsers;
    var roomUsers = data.activeUsers;

    console.log("[SOCKET] 'roomUsersUpdate' for room #" + chatName);

    if (ChatManager.chats[chatId]) {
      ChatManager.chats[chatId].activeUsers = activeUsers;
    }

    console.log("[USERLIST UPDATE] Updating userlist");

    //
    // Need to hash out using active to update the room users list
    // Should probably do this in roomUpdate or chatUpdate instead
    // Break this up into roomUpdate, chatUpdate and key add/remove methods
    //

    if (ChatManager.activeChat == chatId) {
      ChatManager.updateRoomUsers({ chatId: chatId, socket: self.socket });
    }
  });

  this.socket.on('chatStatus', function(data) {
    console.log("Got chat status...");
    var statusType = data.statusType;
    var statusMessage = data.statusMessage;
    ChatManager.localMsg({ type: statusType, message: statusMessage });
    var $messages = $('#messages');
    $messages[0].scrollTop = $messages[0].scrollHeight;
  });

};

SocketClient.prototype.init = function() {
  var self = this;
  console.log("[INIT] Loading client keypair...");

  window.encryptionManager.loadClientKeyPair(function (err, loaded) {
    if (err) {
      //Show error somewhere
      return console.log("[INIT] Error loading client key pair: "+err);
    }
    if (!loaded) {
      console.log("[INIT] Prompting for credentials");
      return ChatManager.initialPromptForCredentials();
    } else {
      ChatManager.init();

      console.log("[INIT] Client credentials loaded");
    }
    if (!self.listeners) {
      self.addListeners();
    }
    console.log("[INIT] Authenticating");
    return Authentication.authenticate({ socket: self.socket });
  });
};



SocketClient.prototype.joinRoom = function(roomId, callback) {
  var self = this;
  if (roomId && typeof roomId !== 'undefined') {
    console.log("[JOIN ROOM] Joining room #"+roomId+" as "+window.username);
    self.socket.emit('join', { roomId: roomId } );
    return callback(null);
  } else {
    return console.log("[JOIN ROOM] roomId was null  !");
  }
};

SocketClient.prototype.createRoom = function(data, callback) {
  var self = this;
  console.log("[CREATE ROOM] Creating room");
  data = {
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  };
  self.socket.emit('createRoom', data);
  callback(null);
};

SocketClient.prototype.updateRoom = function(data, callback) {
  var self = this;
  console.log("[UPDATE ROOM] Updating room");
  var data = {
    id: data.id,
    name: data.name,
    topic: data.topic,
    encryptionScheme: data.encryptionScheme,
    keepHistory: data.keepHistory,
    membershipRequired: data.membershipRequired
  };
  console.log("[UPDATE ROOM] Updating with data:",data);
  self.socket.emit('updateRoom', data);
  callback(null);
};

SocketClient.prototype.partRoom = function(data, callback) {
  var self = this;
  var chatId = data.chatId;
  console.log("[PART ROOM] Parting room #" + ChatManager.chats[chatId].name);
  self.socket.emit('part', { chatId: chatId } );
  callback(null);
};

SocketClient.prototype.sendMessage = function(data) {
  var self = this;
  var chatId = data.chatId;
  var message = data.message;

  console.log("Encrypting message: " + message);
  window.encryptionManager.encryptRoomMessage({ chatId: chatId, message: message }, function(err, pgpMessage) {
    if (err) {
      console.log("Error Encrypting Message: " + err);
    }
    else {
      console.log("[socketClient.sendMessage] Sending encrypted message to chat ID: ", chatId);
      self.socket.emit('roomMessage', {chatId: chatId, pgpMessage: pgpMessage});
      $('#message-input').val('');
    }
  });
};

SocketClient.prototype.joinComplete = function(data) {
  var self = this;
  var err = data.err;
  var room = data.room;

  if (err) {
    console.log("Cannot join channel due to permissions");
    return ChatManager.showError(err);
  }

  // Determine what the current active chat should be
  // If we have an active chat cached locally, set it to active chat but only if it exists in our chats list
  if (!ChatManager.activeChat && window.activeChat && ChatManager.chats[window.activeChat]) {
    ChatManager.activeChat = window.activeChat;
  };

  // If there is still no active chat, set it to the one we just joined
  if (!ChatManager.activeChat) {
    ChatManager.setActiveChat(room.id);
  };

  console.log("[SOCKET] (joinComplete) room: "+room.name+" data.encryptionScheme: "+data.encryptionScheme);

  window.encryptionManager.encryptionScheme[room.name] = data.encryptionScheme;

  console.log("[SOCKET] (joinComplete) encryptionScheme: "+data.encryptionScheme);

  if (data.encryptionScheme == 'masterKey') {
    var masterKeyPair = data.masterKeyPair;

    console.log("[SOCKET] (joinComplete) Loading master key pair...");

    // TODO: Need to make sure clientKeyManager is decrypted here
    window.encryptionManager.loadMasterKeyPair(room.name, masterKeyPair, function(err, loaded) {
      if (err) { return console.log("[INIT] ERROR loading master key pair") };

      if (!loaded) { return console.log("[JOIN COMPLETE] masterKeyPair not loaded...") };

      console.log("[INIT] Done decrypting master and client credentials - ENABLEING CHAT");
    });
  } else {
    console.log("[INIT] Enabling chat in clientKey mode");
  }

  ChatManager.initRoom(room, function(err) {
    ChatManager.chats[room.id].joined = true;
    ChatManager.updateRoomList(function() {
      if (ChatManager.activeChat == room.id) {
        ChatManager.focusChat({ id: room.id }, function(err) {
          console.log("[chatManager.initRoom] Room focus for " + room.name + " done");
        });
      };
      // Should move this inside focusChat callback after moving enable/disable chats to room object
      ChatManager.enableChat(room.id);
    });
  });
};

SocketClient.prototype.partComplete = function(data) {
  var self = this;
  var chatId = data.chatId;
  ChatManager.partChat(chatId, function() {
    console.log("Done parting room");
  });
};

SocketClient.prototype.createRoomComplete = function(data) {
  var self = this;
  var room = data.room;
  self.joinRoom(room.id, function(err) {
    if (err) {
      return console.log("Error joining room after creating: " + err);
    }
    console.log("Joined room...");
  })
};

SocketClient.prototype.updateRoomComplete = function(data) {
  var self = this;
  var name = data.name;
  console.log("[UPDATE ROOM COMPLETE] Done updating room...");
};


/*
 * Toggle favorite room
 */
SocketClient.prototype.toggleFavorite = function(data) {
  var self = this;
  var chatId = data.chatId;

  console.log("[socketClient.toggleFavorite] Emitting toggle favorite for '" + chatId + "'");
  self.socket.emit('toggleFavorite', { chatId: chatId });
  self.socket.on('toggleFavoriteComplete-' + chatId, function(data) {
    console.log("[socketClient.toggleFavorite] Got toggleFavoriteComplete for '" + chatId + "'");
    self.socket.removeListener('toggleFavoriteComplete-' + chatId);
    ChatManager.updateFavoriteButton({ favorite: data.favorite });
  });
};


/*
 * Get all rooms that user is a member of or is public
 */
SocketClient.prototype.handleRoomUpdate = function(data) {
  var self = this;
  var rooms = data.rooms;
  var activeChatId = null;
  var activeChatName = null;

  if (data.err) {
    return console.log("[socketClient.handleRoomUpdate] Room update failed: ",data.err);
  };

  // We want to update one at a time in case we only receive an update for select room(s)
  Object.keys(rooms).forEach(function(id) {
    console.log("[socketClient.handleRoomUpdate] Adding room",id,"to array with data:",rooms[id]);

    //
    // BUG: This should not overwrite the entire room... It is nuking the messageCache
    //

    ChatManager.initRoom(rooms[id], function(err) {
      console.log("Init'd room " + rooms[id].name + " from room update");

      ChatManager.updateRoomList(function() {
        ChatManager.enableChat(id);
      });

      ChatManager.buildRoomListModal;

      // if manageMembersModal is currently visible don't clear any error or ok messages
      ChatManager.populateManageMembersModal({ clearMessages: false });
    });
  })

  /*
  if (ChatManager.activeChat) {
    activeChatId = ChatManager.activeChat.id;
    activeChatName = ChatManager.chats[activeChatId].name;
    console.log("[socketClient.handleRoomUpdate] Refreshing active chat '" + activeChatName + "'");
    ChatManager.refreshChatContent(activeChatId);

  }

  */
};

SocketClient.prototype.handleMembershipUpdateComplete = function(data) {
  var success = data.success;
  var message = data.message;

  if (!success) {
    // display error on membership editor modal
    ChatManager.membershipUpdateError(data.message);
    return console.log("[HANDLE MEMBERSHIP UPDATE COMPLETE] Failed to add member: ", message);
  }

   // Show OK on membership editor modal
  console.log("[HANDLE MEMBERSHIP UPDATE COMPLETE] Member added! Displaying message in modal. Message:", message);

  // This doesn't actually do anything becuase the room update has not been received by roomUpdate yet
  console.log("[socketClient.handleMembershipUpdateComplete] Running populateManageMembersModal");
  ChatManager.populateManageMembersModal({ clearMessages: false });
  ChatManager.membershipUpdateMessage(message);
};

SocketClient.prototype.sendServerCommand = function(data) {
  var self = this;
  var command = data.command;
  var currentChat = data.currentChat;
  self.socket.emit('serverCommand', { command: command, currentChat: currentChat });
};

SocketClient.prototype.serverCommandComplete = function(data) {
  var self = this;
  var response = data.response;
  var activeChatid = ChatManager.activeChat;
  console.log("Displaying response from server command in chat '" + ChatManager.chats[activeChatId].name + "'");
  ChatManager.addMessageToChat({ type: ChatManager.chats[activeChatId].type, message: response, chat: ChatManager.chats[activeChatId].name });
};

SocketClient.prototype.membership = function(data) {
  var self = this;

  console.log("[MEMBERSHIP] Emitting membership");
  self.socket.emit('membership', data);
};

SocketClient.prototype.sendPrivateMessage = function(data) {
  var self = this;
  var chatId = data.chatId;
  var toUserIds = data.toUserIds;
  var message = data.message;

  ChatManager.prepareMessage(message, function(err, preparedMessage) {
    window.encryptionManager.encryptPrivateMessage({ chatId: chatId, message: preparedMessage }, function(err, pgpMessage) {
      if (err) {
        console.log("Error Encrypting Message: " + err);
      }

      else {
        // Only leaving toUsername until I migrate the server side to tracking users by id instead of name
        self.socket.emit('privateMessage', {chatId: chatId, toUserIds: toUserIds, pgpMessage: pgpMessage });
        $('#message-input').val('');
      }
    });
  });
};

SocketClient.prototype.updateMasterKey = function updateMasterKey(callback) {
  window.encryptionManager.getMasterKeyPair(username, function(err, encryptedMasterKeyPair) {
    if (err) {
      console.log("Error getting master key pair: "+err);
      ChatManager.localMsg({ type: "ERROR", message: "Error getting master key pair" });
      return callback("Error getting master key pair");
    } else {
      pleaseWait();
      ChatManager.localMsg({ type: null, message: "Updated master key pair" });
      console.log("Got master keypair, ready to encrypt/decrypt");
      encryptedMasterKeyPair.publicKey = encMasterKeyPair.publicKey;
      encryptedMasterKeyPair.privateKey = encMasterKeyPair.privateKey;
      console.log("Ensuring that client keypair exists");
      //console.log("keyPair.privateKey at new master key is: "+keyPair.privateKey);
      if (typeof keyPair.privateKey !== 'undefined' && keyPair.privateKey !== null) {
        console.log("[new master key] Client KeyPair exists. Trying to decrypt master key for '"+username+"'...");
        console.log("encryptedMasterKeyPair.privateKey: "+encryptedMasterKeyPair.privateKey);
        console.log("encryptedMasterKeyPair.publicKey: "+encryptedMasterKeyPair.publicKey);
        decryptMasterKey(username, keyPair.privateKey, encryptedMasterKeyPair.privateKey, function(err, key) {
          console.log("(new master key) Caching master private key decrypted");
          masterKeyPair.privateKey = key;
          masterKeyPair.publicKey = encMasterKeyPair.publicKey;
          return callback(null);
        });
      } else {
        console.log("Private key does not yet exist so cannot decrypt master key");
        return callback("Private key does not exist");
      };
    };
  });
};

SocketClient.prototype.checkUsernameAvailability = function checkUsernameAvailability(username, callback) {
  var self = this;
  var usernameCallback = callback;

  // Create a listener tied to the username we are checking
  self.socket.on('availability-' + username, function(data) {
    console.log("[socketClient.checkUsernameAvailability] Got availability callback");
    var available = data.available;
    var error = data.error;

    if (error) {
      console.log("[socketClient.checkUsernameAvailability] There was an error while checking username availability");

      // Show error on modal
    };

    self.socket.removeListener('availability-' + username);
    usernameCallback({ available: available });
  });

  // Send the socket request to check the username
  self.socket.emit('checkUsernameAvailability', { username: username, socketCallback: 'availability-' + username });
}

Array.prototype.contains = function(v) {
  for(var i = 0; i < this.length; i++) {
    if(this[i] === v) return true;
  }
  return false;
};

Array.prototype.unique = function() {
  var arr = [];
  for(var i = 0; i < this.length; i++) {
    if(!arr.contains(this[i])) {
      arr.push(this[i]);
    }
  }
  return arr;
}

window.socketClient = new SocketClient();
