'use strict';

var chatHeader = {};
var ChatManager = null;

chatHeader.updateFavoriteButton = function updateFavoriteButton(data) {
  var favorite = data.favorite;

  if (favorite) {
    $('.chat-header__buttons .star.icon').removeClass('empty');
  }

  if (!favorite) {
    $('.chat-header__buttons .star.icon').addClass('empty');
  }
};

chatHeader.isFavorite = function isFavorite(chatId) {
  var userProfile = ChatManager.userProfile;
  if (userProfile.membership && userProfile.membership.favoriteRooms && ( userProfile.membership.favoriteRooms.length > 0 )) {
    return (userProfile.membership.favoriteRooms.indexOf(chatId) > -1);
  } else {
    return false;
  }
};

chatHeader.update = function update(chatId) {
  var self = this;
  ChatManager = this;
  var chat = ChatManager.chats[chatId];
  var headerAvatarHtml = '';
  var chatTopic = '';
  var chatHeaderTitle = '';
  var activeChatId = ChatManager.activeChat;

  if (chat.type === 'chat') {
    headerAvatarHtml = '<i class="huge spy icon"></i>';
    chatTopic = 'One to one encrypted chat with ' + chat.name;
    chatHeaderTitle = 'pm' + '/' + chat.name;
  } else if (chat.type === 'room') {
    headerAvatarHtml = '<i class="huge comments outline icon"></i>';
    chatTopic = chat.topic;
    chatHeaderTitle = chat.group + '/' + chat.name;
  } else {
    return console.log('Error, unknown chat type');
  }

  chatHeader.updateFavoriteButton.call(ChatManager, { favorite: chatHeader.isFavorite(chatId) });

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
};

module.exports = chatHeader;
