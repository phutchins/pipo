'use strict';

var Userlist = {};

/*
 * Update the user list on the right bar
 */
Userlist.update = function update(data) {
  var self = this;
  var chatId = data.chatId;
  var socket = window.socketClient.socket;
  var chat = ChatManager.chats[chatId];
  var type = chat.type;
  var members = chat.members;
  var participants = chat.participants;
  var subscribers = chat.subscribers;

  console.log("[userlist.update] members: "+JSON.stringify(members));
  console.log("[userlist.update] chats: ", Object.keys(ChatManager.chats));

  if (type == 'room') {
    if (subscribers && subscribers.length > 0) {
      var userIdArray = [];
      var subscriberCount = subscribers.length;
      var count = 0;
      subscribers.forEach(function(userId) {
        userIdArray.push(userId);
        count++;
      });
      if (subscriberCount == count) {
        this.build({ userIdArray: userIdArray, chatId: chatId, type: 'room' });
        this.initPopups({ userIdArray: userIdArray });
      }
    }
  }

  if (type == 'chat') {
    if (participants && participants.length > 0) {
      var userIdArray = [];
      var participantCount = participants.length;
      var count = 0;
      participants.forEach(function(userId) {
        userIdArray.push(userId);
        count++;
      });
      if (participantCount == count) {
        this.build({ userIdArray: userIdArray, chatId: chatId, type: 'chat' });
        this.initPopups({ userIdArray: userIdArray });
      }
    }
  }
}


Userlist.build = function build(data) {
  var userIdArray = data.userIdArray;
  var chatId = data.chatId;
  var type = data.type;
  var userListHtml = "";

  var isActive = function(userId) {
    // If this is a room, get the chat status from the rooms active users

    // Is type defined here? Do we need a default??
    console.log('[userlist.build] type in isActive for %s is %s', ChatManager.userlist[userId].username, type);
    if ( type == 'room' ) {
      if (ChatManager.chats[chatId].activeUsers && ChatManager.chats[chatId].activeUsers.indexOf(userId) > -1) {
        console.log("[userlist.update] activeUsers for '" + userId + "' and indexOf is true");
        return true;
      }
      console.log("[userlist.update] activeUsers for '" + userId + "' and indexOf is false");
      return false;
    }

    if ( type == 'chat' ) {
      if (ChatManager.userlist[userId].active) {
        return true;
      }
      return false;
    }
  };

  userIdArray.forEach(function(userId) {
    var username = ChatManager.userlist[userId].username;
    var active = isActive(userId);
    var user = ChatManager.userlist[userId];

    if ( !ChatManager.chats[userId] && username != window.username ) {
      console.log("chat for ",username," was empty so initializing");
    }

    var emailHash = "0";

    if (user && user.emailHash) {
      var emailHash = user.emailHash;
    }

    if (active) {
      userListHtml += "<li class='user-list-li user-active' userId='" + userId + "' id='userlist-" + userId + "' name='" + username + "' data-content='" + username + "'>\n";
    } else {
      userListHtml += "<li class='user-list-li user-inactive' userId='" + userId + "' id='userlist-" + userId + "' name='" + username + "' data-content='" + username + "'>\n";
    }

    userListHtml += "  <div class=\"user-list-avatar avatar-m avatar\" style=\"background-image: url('https://www.gravatar.com/avatar/" + emailHash + "?s=64')\" data-original-title=''>\n";
    userListHtml += "  </div>\n";
    userListHtml += "</li>\n";
  });

  // Looks like the HTML may be right, but its not getting refreshed or set???
  $('#user-list').html(userListHtml);
};

Userlist.initPopups = function initPopups(data) {
  var userIdArray = data.userIdArray;

  if (userIdArray && userIdArray.length > 0) {
    userIdArray.forEach(function(userId) {
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
        window.Userlist.populateUserPopup({ userId: userId });
      });
    });
  }
};


/*
 * Populates the popup when mousing over a users name or avatar on the user list
 */
Userlist.populateUserPopup = function populateUserPopup(data) {
  var self = this;

  var userId = data.userId;
  var userObject = ChatManager.userlist[userId];

  var username = userObject.username;;
  var fullName = userObject.fullName;
  var emailHash = userObject.emailHash;
  var email = userObject.email;

  var socket = window.socketClient.socket;
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
        console.log("[userlist.populateUserPopup] Emitting getChat for private message");

        window.socketClient.socket.emit('getChat', { chatHash: chatHash, participantIds: participantIds });

        window.socketClient.socket.on('chatUpdate-' + chatHash, function(data) {
          console.log("[chatManager.populateUserPopup] Got chatUpdate for chatHash '" + chatHash + "', running handleChatUpdate");
          ChatManager.setActiveChat(chatHash);
          ChatManager.handleChatUpdate(data, function() {
          });

          window.socketClient.socket.removeListener('chatUpdate-' + chatHash);
        });
      });


      $('.userPopup').removeClass('popover').addClass('popover-hidden');

    }
  })
};

module.exports = Userlist;
