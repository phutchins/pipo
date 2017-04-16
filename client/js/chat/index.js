'use strict';

var ChatHeader = require('./header.js');
var clientNotification = require('../notification/index.js');
var Userlist = require('../users/userlist.js');
var utils = require('../utils.js');
var FileManager = require('../files/index.js');

// Modals
var RegisterUserPrompt = require('../modals/registerUserPrompt.js');
var unlockClientKeyPairModal = require('../modals/unlockClientKeyPairModal.js');
var createRoomModal = require('../modals/createRoomModal.js');
var editRoomModal = require('../modals/editRoomModal.js');

/**
 * Handles pretty much everything related to chat
 * @constructor
 * @license LGPL-3.0
 * @see https://github.com/phutchins/pipo
 * @param {Object} encryptionManager
 * @param {Object} options
 */
function ChatManager(options) {
  if (!(this instanceof ChatManager)) {
    return new ChatManager(options);
  }

  // Import managers (this should be done better)
  this.encryptionManager = options.managers.encryptionManager;
  this.socketClient = options.managers.socketClient;

  // Init state
  this.chats = {};
  this.userlist = {};
  this.userNameMap  = {};
  this.userMap = {};
  this.roomUsers = {};
  this.userProfile = {};
  this.activeChat = null;
  this.lastActiveChat = null;

  var userlistUtilOptions = {};
  this.userlistUtil = new Userlist(userlistUtilOptions);
  this.fileManager = new FileManager();
  this.registerUserPrompt = new RegisterUserPrompt({});

  // Network config
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
}

// Need to make sure this init is being called after $(document).ready so
// that we can run init on all of the modals from here, passing in managers
ChatManager.prototype.init = function(callback) {
  var self = this;

  console.log('Running init on chatManager');

  if (window.username) {
    self.updateProfileHeader();
  }

  var managers = {
    chatManager: self,
    encryptionManager: self.encryptionManager
  };

  self.userlistUtil.init(managers);
  self.fileManager.init(managers);
  self.registerUserPrompt.init(managers);

  // When the DOM is ready, init the modals
  $(document).ready(function() {
    self.initDOM();

    if (callback) {
      callback();
    }
  });
};

ChatManager.prototype.initDOM = function() {
  var cmSelf = this;

  console.log('Running initDOM');


  $('.dropdown')
    .dropdown({
      transition: 'drop'
    })
  ;

  $('#edit-profile-button').unbind().on('click', function() {
    console.log("Editing users profile");
    cmSelf.editProfile();
    return false;
  });

  $('#generate-keypair-button').unbind().on('click', function() {
    console.log("Regenerating client keypair");
    // Warn the user that this will clear their current key and they should export it if they
    // want to keep it

    cmSelf.promptForCredentials(function() {
      // Do something after the prompt is shown
    });
  });

  $('#import-keypair-button').unbind().on('click', function() {
    var self = this;
    console.log("Loading keypair from file...");
    cmSelf.promptForImportKeyPair(function(err, data) {
      var userData = {
        username: data.username,
        email: data.email,
        fullName: data.fullName,
        keyPair: {
          privateKey: data.privateKey,
          publicKey: data.publicKey
        }
      };

      cmSelf.encryptionManager.saveClientKeyPair(userData, function(err) {
        if (err) {
          return console.log("Error saving client keyPair");
        };
        console.log("Client keypair saved to local storage");
        /*
        window.encryptionManager.unloadClientKeyPair(function() {
          window.socketClient.init();
        });
        */

        //window.encryptionManager.clientCredentialsLoaded = false;
        socketClient.init();
      })
    })
  });

  $('#sign-out-button').unbind().on('click', function() {
    console.log('Signing out...');

  });

  /*
   * Triggered when user clicks the 'Export Key Pair button'
   */
  $('#export-keypair-button').unbind().on('click', function() {
    console.log('Exporting keypair to file');
    var keyPairData = window.localStorage.getItem('keyPair');
    var username = window.localStorage.getItem('username');

    if (!keyPairData) {
      console.log("No keypair data to export to file");
      return cmSelf.showError("No keypair data exists to export to file");
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
      , (username + ".pub")
    );

    var BB = get_blob();
    saveAs(
        new BB(
          [keyPair.privateKey.toString()]
        , {type: "text/plain;charset=" + document.characterSet}
      )
      , (username + ".key")
    );

  });

  // Catch click on .button.addmember
  $('.manage-members-modal .button.addmember').unbind().click(function(e) {
    console.log("[ADD MEMBER] Caught add member button click");
    var memberName = $('.manage-members-modal .membername').val();
    var chatId = $('.manage-members-modal').attr('id');
    var membership = $('.manage-members-modal .membership .selected').text();

    // Get memberId from local array
    var memberId = cmSelf.userNameMap[memberName.toLowerCase()]

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

  cmSelf.buildRoomListModal();

  /*
   * Catch clicks on room options dropdown
   */
  $('.chat-header__settings .room-options.leave-room').unbind().click(function(e) {
    var chatId = cmSelf.activeChat;
    var chatName = cmSelf.chats[chatId].name;

    if (cmSelf.chats[chatId].type == 'chat') {
      console.log("Destroying chat '", chatName, "'");

      cmSelf.destroyChat(chatId, function(err) {
        console.log("Chat destroyed. Updating private chats...");
        cmSelf.updateChatList();
      });

    } else {

      socketClient.partRoom({ chatId: chatId }, function(err) {
        console.log("Sent request to part room " + chatName);
      })

    }
  });

  $('.chat-header__settings .room-options.manage-members').unbind().click(function(e) {
    cmSelf.populateManageMembersModal({ chatId: cmSelf.activeChat, clearMessages: true });

    $('.manage-members-modal').modal('show');
  });
};



ChatManager.prototype.buildRoomListModal = function buildRoomListModal() {
  var cmSelf = this;

  $('.modal.join-room-list-modal').modal({
    detachable: true,
    closable: true,
    transition: 'fade up'
  })

  $('#room-list-button').unbind().click(function(e) {
    var roomListModalHtml = '';
    var roomName;

    Object.keys(cmSelf.chats).forEach(function(chatId) {
      roomName = cmSelf.chats[chatId].name;
      if (cmSelf.chats[chatId].type == 'room') {
        roomListModalHtml += "<div class='item'>\n";
        if (cmSelf.chats[chatId].membershipRequired) {
          roomListModalHtml += "  <i class='ui avatar huge lock icon room-list-avatar'></i>\n";
        } else {
          roomListModalHtml += "  <i class='ui avatar huge unlock alternate icon room-list-avatar'></i>\n";
        }
        roomListModalHtml += "  <div class='content'>\n";
        roomListModalHtml += "    <a id='" + chatId + "' class='header'>" + roomName + "</a>\n";
        roomListModalHtml += "    <div class='description'>" + cmSelf.chats[chatId].topic + "</div>\n";
        roomListModalHtml += "  </div>\n";
        roomListModalHtml += "</div>\n";
      }
    })

    $('.modal.join-room-list-modal .join-room-list').html(roomListModalHtml);

    Object.keys(cmSelf.chats).forEach(function(chatId) {
      if (cmSelf.chats[chatId].type == 'room') {
        $('.modal.join-room-list-modal a[id="' + chatId + '"]').unbind().click(function() {
          socketClient.joinRoom(chatId, function(err) {
            $('.modal.join-room-list-modal').modal('hide');
            if (err) {
              return console.log("Error joining room: " + err);
            }
            // Set the active chat to the currently joined room so that it is displayed when the join is complete
            cmSelf.lastActiveChat = cmSelf.activeChat;
            cmSelf.activeChat = chatId;

            console.log("Joined room " + cmSelf.chats[chatId].name);
          })
        })
      }
    })
    $('.modal.join-room-list-modal').modal('show');
  })
};



/*
 * Populate edit-room modal
 */
ChatManager.prototype.populateEditRoomModal = function populateEditRoomModal(data) {
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
ChatManager.prototype.populateManageMembersModal = function populateManageMembersModal(data) {
  var self = this;

  if (!data) { data = {} }

  // There are circumstances where this is populating a modal for a private chat which does not currently have an owner
  // There might should be at least two owners for a private chat which would default to the first two participants

  if (!data.chatId && ( !self.activeChat || !self.chats[self.activeChat] )) {
    return;
  };

  var chatId = (typeof data.chatId === 'undefined') ? self.activeChat : data.chatId;
  var chatName = self.chats[chatId].name;
  var clearMessages = (typeof data.clearMessages === 'undefined') ? true : data.clearMessages;

  var members = self.chats[chatId].members || [];
  var admins = self.chats[chatId].admins || [];
  var ownerId = self.chats[chatId].owner;

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
  Object.keys(self.userNameMap).forEach(function(username) {
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
    var memberName = self.userlist[memberId].username;
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


/*
 * Show an error to the user
 */
ChatManager.prototype.showError = function showError(message) {
  // TODO: Add property for which modal to show error on
  $(".ui.modal.error")
    .modal('setting', 'closable', false)
    .modal("show");

  $(".ui.modal.error .content").text(message);
};

ChatManager.prototype.showErrorOnModal = function showErrorOnModal(data) {
  var message = data.message;
  var modal = data.modal;

};


ChatManager.prototype.updateProfileHeader = function updateProfileHeader() {
  // TODO: This should be smarter and have a sane default in the DB as well as a better default image
  var self = this;
  var emailHash = self.userProfile.emailHash;
  var username = self.userProfile.username;
  var headerTitle = username || "Sign In";


  if (self.userlist[username]) {
    emailHash = this.userlist[username].emailHash;
  }

  $('#menu-header-profile .ui.dropdown').dropdown({ action: 'select' });

  $('#menu-header-profile .ui.dropdown .avatar').attr("style", "background-image: url('https://www.gravatar.com/avatar/" + emailHash + "?s=64')");

  $('#menu-header-profile .ui.dropdown .text.username').text(headerTitle);
};


/*
 * Create the room and give it focus
 */
ChatManager.prototype.initRoom = function initRoom(room, callback) {
  var self = this;
  var enabled = 'initializing';
  var joined = false;
  var unread = false;
  var unreadCount = 0;
  var pagesLoaded = 1;
  var initialLoadedMessageId;
  var oldestLoadedMessageId;
  console.log("[ChatManager.initRoom] Running initRoom for " + room.name);

  if (room.messages && room.messages.length > 0) {
    initialLoadedMessageId = room.messages[room.messages.length - 1].messageId;
    oldestLoadedMessageId = room.messages[0].messageId;
  }

  // TODO: Should store online status for members and messages in an object or array also

  // If room already exists locally, don't overwrite local settings that should persist
  // should probably stick these in a chats[id].local or a completely separate object all together
  if (self.chats[room.id]) {
    // We're going to have to decrypt all messages again to ensure that we are up to date so we shouldn't keep enabled
    //enabled = self.chats[room.id].enabled;
    joined = self.chats[room.id].joined;
    unread = self.chats[room.id].unreadCount;
    unreadCount = self.chats[room.id].unread;
    pagesLoaded = self.chats[room.id].pagesLoaded;
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
    pagesLoaded: pagesLoaded,
    initialLoadedMessageId: initialLoadedMessageId,
    oldestLoadedMessageId: oldestLoadedMessageId,
    unread: unread,
    unreadCount: unreadCount,
  };

  self.updateChatStatus();

  // Decrypt messages and HTMLize them
  var messages = self.chats[room.id].messages.sort(utils.dynamicSort("date"));
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
  self.encryptionManager.buildChatKeyRing({ chatId: room.id }, function(keyRing) {
    self.chats[room.id].keyRing = keyRing;

    console.log("[ChatManager.initRoom] Starting to decrypt messages for room #" + room.name);

    // TODO:
    // Display notice in the chatContainer that we are decrypting messages
    // ...or display an encrypted message representing each message and replace as they are decrypted

    console.log("[ChatManager.initRoom] (1) Running ChatManager.updateChatStatus();");
    self.updateChatStatus({ chatId: room.id, status: 'decrypting' });

    messages.forEach(function(message, key) {
      self.encryptionManager.decryptMessage({
        keyRing: self.chats[room.id].keyRing,
        encryptedMessage: message.encryptedMessage
      }, function(err, decryptedMessage) {
        var encryptedMessage = message.encryptedMessage;
        var decryptedMessage = decryptedMessage;
        var myFingerprint = self.encryptionManager.keyManager.get_pgp_key_id().toString('hex');

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

          self.populateMessageCache(room.id);

          var isAutoJoin = (self.userProfile.membership.favoriteRooms.indexOf(room.id) > -1)

          // If there is no active chat and this room is set to auto join, set it as active
          if (!self.activeChat && isAutoJoin) {
            self.setActiveChat(room.id);
          };

          if (self.activeChat == room.id) {
            var chatContainer = $('#chat');

            self.refreshChatContent(room.id);
            chatContainer[0].scrollTop = chatContainer[0].scrollHeight;
          }

          console.log("[ChatManager.initRoom] Done decrypting messages for room #" + room.name);

          // Do this inside of updateChatStatus
          //ChatManager.setChatEnabled([room.id]);

          console.log("[ChatManager.initRoom] (2) Running ChatManager.updateChatStatus();");
          self.updateChatStatus({ chatId: room.id, status: 'enabled' });
        };
      });
    });

    // If there are no messages, we still need to enable chat
    // Better way to do this?
    if (messages.length == 0) {
      //ChatManager.setChatEnabled([room.id]);
      console.log("[ChatManager.initRoom] (3) Running ChatManager.updateChatStatus();");
      console.log("[ChatManager.initRoom] Done decrypting messages for room #" + room.name + ", no messages to decrypt");
      self.updateChatStatus({ chatId: room.id, status: 'enabled' });
    }
  });

  // DOES THIS BELONG HERE???!? FIX ME!!! :D
  if (self.activeChat == room.id) {
    self.userlistUtil.update({ chatId: room.id });
  }

  self.updateRoomList(function(err) {
    console.log("Update room list done...");
    callback(null);
  });
};

ChatManager.prototype.initChat = function initChat(chat, callback) {
  var self = this;
  var enabled = false;
  var chatId = chat.id;
  var myUserId = self.userNameMap[window.username];
  var chatName = '';
  var unread = false;
  var unreadCount = 0;
  var initialLoadedMessageId;
  var oldestLoadedMessageId;
  //var messages = chat.messages || [];
  var messages = chat.messages.sort(utils.dynamicSort("date"));
  var participants = chat.participants || [];

  console.log("Running init on chat " + chatId);

  if (chat.messages && chat.messages.length > 0) {
    initialLoadedMessageId = chat.messages[chat.messages.length - 1].messageId;
    oldestLoadedMessageId = chat.messages[0].messageId;
  }

  // Persist certain values through an init chat if we've already constructed a chat object
  if (self.chats[chatId]) {
    unread = self.chats[chatId].unread;
    unreadCount = self.chats[chatId].unreadCount;
    enabled = self.chats[chatId].enabled;
  }

  // Private chat between two users
  if (chat.participants.length == 2) {
    chat.participants.forEach(function(participantId) {
      if  (participantId !== myUserId) {
        chatName = self.userlist[participantId].username;
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
    initialLoadedMessageId: initialLoadedMessageId,
    oldestLoadedMessageId: oldestLoadedMessageId
  };

  var count = 0;
  var messageArray = Array(messages.length);

  var finish = function finish() {
    self.populateMessageCache(chatId);

    self.updateChatList();

    if (self.activeChat == chatId) {
      var chatContainer = $('#chat');

      self.refreshChatContent(chatId);
      chatContainer[0].scrollTop = chatContainer[0].scrollHeight;
    }

    //ChatManager.setChatEnabled([chatId]);
    console.log("[ChatManager.initChat] (1) Running ChatManager.updateChatStatus();");
    self.updateChatStatus({ chatId: chatId, status: 'enabled' });

    return callback(null);

  };

  self.encryptionManager.buildChatKeyRing({ chatId: chatId }, function(keyRing) {
    self.chats[chatId].keyRing = keyRing;

    if (messages.length == 0) {
      finish();
    };

    messages.forEach(function(message, key) {

      self.encryptionManager.decryptMessage({
        keyRing: self.chats[chatId].keyRing,
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



ChatManager.prototype.decryptMessagesArray = function decryptMessagesArray(data, callback) {
  var self = this;
  var chatId = data.chatId;
  var messagesArray = data.messages;
  var count = 0;
  var messageCount = 0;

  var finish = function finish() {
    return callback(messagesArray);
  }

  if (messagesArray) {
    messageCount = messagesArray.length;
  }

  if (messageCount == 0) {
    console.log("[chatManager.decryptMessagesArray] No messages provided for decrypting. Finishing.");
    return finish();
  }

  messagesArray.forEach(function(message, key) {
    var encryptedMessage = message.encryptedMessage;

    self.encryptionManager.decryptMessage({
      keyRing: ChatManager.chats[chatId].keyRing,
      encryptedMessage: encryptedMessage
    }, function(err, decryptedMessage) {
      count ++;

      if (err) {
        decryptedMessage = 'Unable to decrypt...\n';
        console.log("Error decrypting message: ", err);
      }

      messagesArray[key].decryptedMessage = decryptedMessage.toString();

      if (messageCount === count) {
        return finish();
      }
    })
  })
};

ChatManager.prototype.arrayHash = function arrayHash(array, callback) {
  var self = this;
  // Sort participantIds
  var orderedArray = array.sort();

  // MD5 participantIds
  self.encryptionManager.sha256(orderedArray.toString(), function(arrayHash) {
    return callback(arrayHash);
  });
};

/*
 * Remove room from client
 */
ChatManager.prototype.destroyChat = function destroyChat(chatId, callback) {
  var self = this;
  delete self.chats[chatId];

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
ChatManager.prototype.partChat = function partChat(chatId, callback) {
  var self = this;
  self.chats[chatId].joined = false;

  self.focusLastChat(function(err) {
    callback(err);
  });
};


/*
 * Focus on the last active chat
 */
ChatManager.prototype.focusLastChat = function focusLastChat(callback) {
  var self = this;

  // Create a sorted list of chats that are joined
  var sortedChats = Object.keys(self.chats).sort().filter(function(chatId) {
    return self.chats[chatId].joined;
  });

  // Should check here for an empty chat list and do something sane if we have parted the last chat
  var lastChat = self.chats[sortedChats[sortedChats.length - 1]];
  self.activeChat = lastChat;

  self.focusChat({ id: lastChat.id }, function(err) {
    if (err) {
      return callback(err);
    };

    self.updateRoomList(function(err) {
      callback(null);
    });
  });
};


/*
 * Set the specified chat to be in focus for the user
 */
ChatManager.prototype.focusChat = function focusChat(data, callback) {
  var self = this;
  var id = data.id;
  var type = self.chats[id].type;
  var chatName = self.chats[id].name;
  var messages = $('#chat');

  // Set the active chat to the one we're focusing on
  console.log("Setting activeChat to room: " + self.chats[id].name + " which has ID: " + id);
  self.setActiveChat(id);

  if (self.chats[id].unread) {
    self.chats[id].unread = false;
    self.chats[id].unreadCount = 0;
  };

  self.userlistUtil.update({ chatId: id });

  self.refreshChatContent(id, function() {

    // TODO
    // This needs to be reset every time but probably don't want to reset $(document)
    var fileLinks = $('.pfile-link');

    var downloadLinkBindClick = function(fileId, chatId) {
      console.log('Pfile link clicked, id: %s', fileId);

      var keyRing = self.chats[chatId].keyRing;

      self.fileManager.getFile({ keyRing: keyRing, id: fileId });
    };

    $(document).off("click", ".pfile-link");
    $(document).on('click', '.pfile-link', function() {
      var fileId = $(this)[0].id;
      var chatId = id;

      downloadLinkBindClick(fileId, chatId);
    });

  });

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
ChatManager.prototype.setActiveChat = function setActiveChat(id) {
  this.activeChat = id;
  window.activeChat = id;
};


/*
 * Update the list of rooms on the left bar
 */
ChatManager.prototype.updateRoomList = function updateRoomList(callback) {
  var self = this;
  var chatIds = Object.keys(self.chats)

  $('#room-list').empty();

  console.log("Updating room list!");

  chatIds.forEach(function(id) {
    if (self.chats[id].type == 'room' && self.chats[id].joined) {
      var roomName = self.chats[id].name;
      var unreadMessages = self.chats[id].unread;

      if ( !$('#room-list #' + id).length ) {

        var roomListItemClasses = [];
        var unreadIconClasses = [];

        if ( self.activeChat == id ) {
          console.log("Active chat is " + self.activeChat);

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
        self.focusChat({ id: id }, function(err) {
          // Room focus complete
          // We need to update the room list here to update the read/unread marker
          self.updateRoomList(function() {
            // Room list updated
          });
        });
      });
    }
  });
  callback(null);
};



ChatManager.prototype.updateChatList = function updateChatList() {
  var self = this;
  var userListHtml = "";

  // Get a list of all chats that are type private message
  var chatIds = Object.keys(self.chats).filter(function(id) {
    console.log("Looping chat id: " + id + " and type is: " + self.chats[id].type);
    return self.chats[id].type == 'chat';
  });

  // Add the html elements for each chat to a string
  chatIds.forEach(function(id) {
    console.log("[chatManager.updateChatList] Adding chat with ID: " + id + " to the chat list");
    var privateChat = self.chats[id];
    var unread = self.chats[id].unread;
    var chatListItemClasses = [];
    var unreadIconClasses = [];

    if ( !unread ) {
      unreadIconClasses.push('hidden');
    }

    if ( self.activeChat === id ) {
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
    if (id !== self.userNameMap[window.username]) {
      $('#' + id).unbind().click(function() {
        console.log("[chatManager.updateChatList] Got click on id: " + id);
        self.focusChat({ id: id }, function(err) {
          self.updateChatList(function() {
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
ChatManager.prototype.updateChatStatus = function updateChatStatus(data) {
  var self = this;
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
    if (self.chats[chatId].status != status) {
      self.chats[chatId].status = status;
    };
  };

  // If we have no chatId but have a stauts, set that status for all chats
  if (!chatId && status) {
    var allRoomIds = Object.keys(self.chats);

    allRoomIds.forEach(function(id) {
      if (self.chats[id].status != status) {
        self.chats[id].status = status;
      };
    });
  };

  // Always run the update for the activeChat
  if (self.activeChat) {
    var activeChatId = self.activeChat;

    if (chatId == activeChatId) {
      if (self.chats[activeChatId].status == 'enabled') {
        self.enableScrollback();
        return self.enableMessageInput();
      };

      if (self.chats[activeChatId].status != 'enabled') {
        self.disableScrollback();
        return self.disableMessageInput({ status: self.chats[activeChatId].status });
      };
      console.log("[chatManager.updateChatStatus] ERROR: chat.enabled not set?");
    };
  } else {
    console.log("[ChatManager.updateChatStatus] Currently no active chat...");
  };
};


ChatManager.prototype.enableScrollback = function enableScrollback() {
  var self = this;
	jQuery(
    function($) {
      $('.chat-window').unbind().bind('scroll', function() {
 			  if($(this).scrollTop() == 0) {
          // Load the previous page of messages
          //   May should pass the chat id that we're loading the previous page for
          //   in case we switch chats before the response comes back
          var chatId = self.activeChat;
          self.loadPreviousPage({ chatId: self.activeChat });
        }
      })
    }
  )
};

ChatManager.prototype.disableScrollback = function disableScrollback() {
  $('.chat-window').unbind();
};

ChatManager.prototype.loadPreviousPage = function loadPreviousPage(data) {
  var chatId = data.chatId;
  var type = this.chats[chatId].type;
  var oldestLoadedMessageId = this.chats[chatId].oldestLoadedMessageId;

  console.log("[chatManager.loadPreviousPage] Loading previous page of messages prior to message with id '" + oldestLoadedMessageId + "'");

  // Emit event to server asking for the previous page of messages from the server
  window.socketClient.socket.emit('getPreviousPage', {
    chatId: chatId,
    type: type,
    referenceMessageId: oldestLoadedMessageId
  });
};


ChatManager.prototype.enableMessageInput = function enableMessageInput() {
  var self = this;

  // Add conditional to check if the generate modal is displayed
  $('.ui.modal.generate').modal('hide');

  //Make input usable
  $('#message-input').attr('placeHolder', 'Type your message here...').prop('disabled', false);
  $('#add-button').prop('disabled', false);
  $('#send-button').prop('disabled', false);
  $('#loading-icon').hide();

  $('#message-input').unbind();

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

  $("#input-container").find('textarea.message-input').unbind().keydown(function (event) {
    var element = this;

    //Prevent shift+enter from sending
    if (event.keyCode === 13 && event.shiftKey) {
      // Should use element instead of the var below?
      var $messageInput = $('#message-input');

      var content = element.value;
      var caret = utils.getCaret(element);

      element.value = content.substring(0, caret) + "\n" + content.substring(caret, content.length);
      event.stopPropagation();

      fitToContent('message-input', 156);

      $messageInput[0].scrollTop = $messageInput[0].scrollHeight;
      return false;
    }
    else if (event.keyCode === 13) {
      self.sendMessage(function() {
        fitToContent('message-input', 156);

        return false;
      })

      //$('#main-input-form').submit();

      return false;
    } else {
      // Resize the input window for any keypress to catch rollover to next line
      fitToContent('message-input', 156);
    }
  });

  $('#send-button').unbind().on('click', function() {
    console.log("Got send button click!");

    self.sendMessage(function() {
      fitToContent('message-input', 156);
      return false;
    })
    return false;
  });

  $('#add-button').unbind().on('click', function() {
    console.log("Got add button click!");
  });
};

ChatManager.prototype.disableMessageInput = function disableMessageInput(data) {
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
  $('#add-button').prop('disabled', true);
  $('#send-button').prop('disabled', true);
  $('#loading-icon').show();
};

ChatManager.prototype.prepareMessage = function prepareMessage(message, callback) {
  var parsedMessage = window.marked(message).replace(/(<p>|<\/p>)/g, '');
  var container = $('<div>').html(parsedMessage);

  // Check the hostname to make sure that it's not a local link...
  container.find('a').attr('target','_blank');
  container.find('code').addClass('hljs');

  callback(null, container.html());
};


ChatManager.prototype.handleMessage = function handleMessage(data) {
  var self = this;
  var message = data.message;
  var messageId = data.messageId;
  var chatId = data.chatId;
  var fromUserId = data.fromUserId;
  var fromUserName = self.userlist[fromUserId].username;
  var date = data.date || new Date().toISOString();
  var mentionRegexString = '.*@' + window.username + '.*';
  var mentionRegex = new RegExp(mentionRegexString);

  self.encryptionManager.decryptMessage({
    keyRing: self.chats[chatId].keyRing,
    encryptedMessage: data.message
  }, function(err, messageLiterals) {
    if (err) {
      return console.log(err);
    }
    var ds = null;
    var km = null;
    ds = messageLiterals[0].get_data_signer();
    if (ds) { km = ds.get_key_manager(); }
    if (km) {
      console.log("socketClient.handleMessage] OK: Message signature valid. Fingerprint: '" + km.get_pgp_fingerprint().toString('hex') + "'");
      console.log(km.get_pgp_fingerprint().toString('hex'));

      return finish(messageLiterals);
    } else {
      return console.log("[socketClient.handleMessage] WARNING: Message signature invalid!");
    }
  });

  var finish = function(messageLiterals) {
    var messageString = messageLiterals.toString();
    console.log("Running mention regex: " + messageString.match(mentionRegex));
    if (messageString.match(mentionRegex)) {
      clientNotification.send(null, 'You were just mentioned by ' + fromUserName + ' in room #' + self.chats[chatId].name, messageString, 3000);
    };

    self.addMessageToChat({ confirmed: true, messageId: messageId, type: 'room', chatId: chatId, messageString: messageString, fromUserId: fromUserId, date: date });
  };
};



/*
* Handle an incoming one to one message (privateMessage)
*
* When receiving a message that we sent, we should change the message that we already
* added to our local chat from grey to black to show that it has been sent or received
* by the other user
*/
ChatManager.prototype.handlePrivateMessage = function handlePrivateMessage(data) {
  var self = this;
  //var socket = data.socket;

  var messageId = data.messageId;
  var encryptedMessage = data.message;
  var chatId = data.chatId;
  var fromUserId = data.fromUserId;
  var fromUsername = self.userlist[fromUserId].username;
  var myUserId = self.userNameMap[window.username];
  var toUserIds = data.toUserIds;
  var date = data.date;
  var participantIds = [ self.userlist[fromUserId].id, myUserId];
  var chatName;

  var decrypt = function decrypt(chatId, encryptedMessage, callback) {
    self.encryptionManager.decryptMessage({
      keyRing: self.chats[chatId].keyRing,
      encryptedMessage: encryptedMessage
    }, function(err, messageLiterals) {
      if (err) {
        return console.log(err);
      };
      var km = null;
      var ds = null;
      ds = messageLiterals[0].get_data_signer();
      if (ds) { km = ds.get_key_manager(); }
      if (km) {
        console.log("socketClient.handlePrivateMessage] OK: Message signature valid. Fingerprint: '" + km.get_pgp_fingerprint().toString('hex') + "'");
        console.log(km.get_pgp_fingerprint().toString('hex'));
        return callback(null, messageLiterals);
      } else {
        console.log("[socketClient.handlePrivateMessage] WARNING: Message signature invalid!");
        return callback("Invalid message signature", messageLiterals);
      }
    });
  };

  if (self.chats[chatId]) {
    decrypt(chatId, encryptedMessage, function(err, message) {
      clientNotification.send(null, 'Private message from ' + fromUsername, message, 3000);

      self.addMessageToChat({ confirmed: true, messageId: messageId, type: 'chat', fromUserId: fromUserId, chatId: chatId, messageString: message, date: date });
    });
  };

  // If we don't have a private chat created for this
  if (!self.chats[chatId]) {
    chatName = fromUsername;
    // Should save and pull unreadCount from the DB
    self.chats[chatId] = { id: chatId, type: 'chat', name: chatName, messageCache: '', unread: true, unreadCount: 0, messages: [] };

    // Set unread to true for now. When these windows are cached open, we need a better way to determine if it is an unread message or not.
    self.chats[chatId].unreadCount++;

    console.log("[chatManager.handlePrivateMessage] unreadCount: " + self.chats[chatId].unreadCount);

    console.log("Updating private chats");

    self.updateChatList();

    self.arrayHash(participantIds, function(chatHash) {
      decrypt(chatId, encryptedMessage, function(message) {
        clientNotification.send(null, 'Private message from ' + fromUsername, message, 3000);
        self.addMessageToChat({ type: 'chat', fromUserId: fromUserId, confirmed: true, messageId: messageId, chatId: chatId, messageString: message, date: date });
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
ChatManager.prototype.handleLocalMessage = function handleLocalMessage(data) {
  var self = this;
  var messageId = data.messageId;
  var chatId = data.chatId;
  var type = self.chats[chatId].type;
  var messageString = data.messageString;
  var fromUserId = data.fromUserId;
  var date = data.date;

  // Should set the message to unconfirmed here (only if it's a local message tho)
  self.addMessageToChat({ messageId: messageId, confirmed: false, type: type, fromUserId: fromUserId, chatId: chatId, messageString: messageString, date: date });
};



ChatManager.prototype.addMessageToChat = function addMessageToChat(data) {
  var self = this;
  var messageId = data.messageId;
  var confirmed = data.confirmed;
  var type = data.type;
  var messageString = data.messageString;
  var date = data.date;
  var fromUserId = data.fromUserId;
  var fromUsername = self.userlist[fromUserId].username;
  var chatId = data.chatId;
  var chatContainer = $('#chat');

  //Add timestamp
  var time = date || new Date().toISOString();

  // If the message is confirmed (comes from the server), it has an
  // ID, and it is from me, find it in the message cache
  // and mark it as confirmed
  if (confirmed && messageId && (fromUserId == self.userNameMap[window.username])) {
    // Update teh message in message cache to be confirmed
    self.confirmChatMessage({ chatId: chatId, messageId: messageId }, function(modifiedMessageCache) {
      if (!modifiedMessageCache) {
        // Was not able to find and confirm the message
        return console.log("[ChatManager.addMessageToChat] Returned no messageCache");
      }
      self.chats[chatId].messageCache = modifiedMessageCache;
    });
  } else {

    // Need to figure out how to change the class of a message after it's in the message cache
    self.formatChatMessage({
      messageId: messageId,
      messageString: messageString,
      fromUserId: fromUserId,
      fromUsername: fromUsername,
      date: date,
      confirmed: confirmed
    }, function(formattedMessage) {
      // Is it really taking this long to get the message displayed locally?
      self.chats[chatId].messageCache = self.chats[chatId].messageCache.concat(formattedMessage);
    });

    if (self.activeChat == chatId) {
      self.refreshChatContent(chatId);
      chatContainer[0].scrollTop = chatContainer[0].scrollHeight;
    };
  };

  if (self.activeChat != chatId) {
    self.chats[chatId].unread = true;
    self.chats[chatId].unreadCount++;

    console.log("[chatManager.handlePrivateMessage] unreadCount: " + self.chats[chatId].unreadCount);
    self.updateRoomList(function() {
      return;
    });
    self.updateChatList(function() {
      return;
    });
  }
};




/*
 * Take the message array obtained from the server and add them to the cache for the appropriate chat
 * This is instead of using addMessageToChat to add them one by one
 * TODO: Should pass messages around the same way everywhere instead of a string some places and object others
 */
ChatManager.prototype.populateMessageCache = function populateMessageCache(chatId) {
  var self = this;
  var messages = self.chats[chatId].messages;
  var messageCount = messages.length;
  var sortedMessages = [];

  self.chats[chatId].messageCache = '';

  if (messageCount > 0) {

    sortedMessages = messages.sort(function(a,b) {
      return new Date(a.date) - new Date(b.date);
    });

    self.chats[chatId].oldestLoadedMessageId = sortedMessages[0].messageId;

    messages.forEach(function(message) {
      var fromUsername = self.userlist[message.fromUser].username;
      self.formatChatMessage({ confirmed: true, messageString: message.decryptedMessage, date: message.date, fromUserId: message.fromUser, fromUsername: fromUsername }, function(formattedMessage) {
        self.chats[chatId].messageCache = self.chats[chatId].messageCache.concat(formattedMessage);
      });
    });
  };
};

ChatManager.prototype.formatChatMessage = function formatChatMessage(data, callback) {
  var self = this;
  var messageId = data.messageId;
  var messageString = data.messageString;
  var fromUserId = data.fromUserId;
  var fromUsername = data.fromUsername;
  var confirmed = data.confirmed;
  var date = data.date;
  var emailHash = self.userlist[fromUserId].emailHash || "00000000000";

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
ChatManager.prototype.confirmChatMessage = function confirmChatMessage(data, callback) {
  var self = this;
  var chatId = data.chatId;
  var messageId = data.messageId;
  var messageCache = self.chats[chatId].messageCache;
  var container = '';

  container = $('<div>').html(messageCache);
  container.find('[data-messageId="' + messageId + '"].unconfirmedMessage').removeClass('unconfirmedMessage');
  $('.chat-window').find('[data-messageId="' + messageId + '"].unconfirmedMessage').removeClass('unconfirmedMessage');

  return callback(container.html());
};



/*
 * Displays room messages in the chat window
 */
ChatManager.prototype.refreshChatContent = function refreshChatContent(chatId, callback) {
  var self = this;
  var messageCache = self.chats[chatId].messageCache;

  console.log("Refreshing chat content for ", self.chats[chatId].name);

  $('#chat').html(messageCache);
  ChatHeader.update.call(self, chatId);

  // Add padding above messages if needed to keep newest message at the bottom
  // If not needed, only take up a small space for displaying pulling older messages notice

  if (callback) {
    return callback();
  }
}



ChatManager.prototype.handleChatUpdate = function handleChatUpdate(data, callback) {
  var self = this;
  var chat = data.chat;

  console.log("[handleChatUpdate] got 'chatUpdate' from server");

  // Init the chat
  self.initChat(chat, function() {

    self.updateChatList();
    self.updateRoomList(function() {
    });

    if (chat.participants) {
      if (self.activeChat == chat.id) {
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


/*
 * Should call this PageUpdate or something?
 */
ChatManager.prototype.handlePreviousPageUpdate = function handlePreviousPageUpdate(data) {
  var self = this;
  var messages = data.messages;
  var chatId = data.chatId;

  self.decryptMessagesArray({ chatId: chatId, messages: messages }, function(decryptedMessages) {
    if (decryptedMessages) {
      self.chats[chatId].messages = decryptedMessages.concat(self.chats[chatId].messages);
    }

    self.populateMessageCache(chatId);
    self.refreshChatContent(chatId);
  });
};


ChatManager.prototype.sendMessage = function sendMessage(callback) {
  var self = this;
  var input = $('#message-input').val();

  // Is one of these faster? Both seem to work just fine...
  //$('#message-input').val('');
  console.log("Clearing message-input...");
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

      self.prepareMessage(input, function(err, preparedInput) {
        var activeChatId = self.activeChat;
        var activeChatType = self.chats[activeChatId].type;
        var activeChatName = self.chats[activeChatId].name;

        console.log("Active chat type is: " + activeChatType);
        var date = new Date().toISOString();

        // Create a message ID using the current time and a random number
        var messageId = self.createMessageId();

        if (activeChatType == 'room') {
          console.log("Sending message to room #"+ activeChatName);

          // Add the message to the chat locally and wait for it to be confirmed
          self.handleLocalMessage({
            messageId: messageId,
            chatId: activeChatId,
            messageString: preparedInput,
            fromUserId: self.userNameMap[window.username],
            date: date
          });

          window.socketClient.sendMessage({ messageId: messageId, chatId: activeChatId, message: preparedInput });
          return callback();
        }
        else if (activeChatType == 'chat') {
          var sendToIds = self.chats[activeChatId].participants;

          // Need to get the private message ID here to pass to sendPrivateMessage so we can encrypt to the keyRing
          console.log("[chatManager.sendMessage] Sending private message for chatId '" + activeChatId + "'");

          socketClient.sendPrivateMessage({ messageId: messageId, chatId: activeChatId, toUserIds: sendToIds, message: preparedInput });

          // Add the message to the chat locally and wait for it to be confirmed
          self.handleLocalMessage({
            messageId: messageId,
            chatId: activeChatId,
            messageString: preparedInput,
            fromUserId: self.userNameMap[window.username],
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


ChatManager.prototype.createMessageId = function createMessageId() {
  var timeString = (new Date().getTime()).toString();
  var rand = Math.floor((Math.random() * 1000) + 1).toString();
  var messageId = timeString.concat(rand);

  return messageId;
  //return callback(messageId);
}



ChatManager.prototype.showHelp = function showHelp() {
  var self = this;
  var activeChatId = self.activeChat;
  var activeChatType = self.chats[activeChatId].type;

  var helpTextArray = [ "** ROOM Commands **", "/room [room] member add [member]" ];
  helpTextArray.forEach(function(msg) {
    self.addMessageToChat({ type: activeChatType, messageString: msg, chat: activeChatId });
  })
};

ChatManager.prototype.membershipUpdateError = function membershipUpdateError(message) {
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

ChatManager.prototype.membershipUpdateMessage = function membershipUpdateMessage(message) {
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

ChatManager.prototype.initialPromptForCredentials = function initialPromptForCredentials() {
  var self = this;
  console.log("Prompting for credentials!");

  $(".ui.modal.initial")
    .modal('setting', 'closable', false)
    .modal("show");

  $('.ui.button.register').unbind().click(function(e) {
    self.registerUserPrompt.show(function(data) {
      // Do something when registration is succcessful
    });
  });

  $('.ui.button.signin').unbind().click(function(e) {
    self.configureUIForSignin(function() {
      console.log('UI Configured for User Signin');
    });
  });
};

ChatManager.prototype.configureUIForSignin = function configureUIForSignin(callback) {
  console.log('Configuring UI for user signin');

  callback();
};


ChatManager.prototype.promptForCredentials = function promptForCredentials(callback) {
  var self = this;
  console.log("Prompting for credentials!");
  self.registerUserPrompt.show(function(data) {
    return callback()
  });
}

ChatManager.prototype.promptForImportKeyPair = function promptForImportKeyPair(callback) {
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
    var fullName = document.getElementById('fullname-input').value;
    var email = document.getElementById('email-input').value;

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
            email: email,
            fullName: fullName,
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

module.exports = ChatManager;
