var ChatHeader = {};

ChatHeader.updateFavoriteButton = function updateFavoriteButton(data) {
  var favorite = data.favorite;

  if (favorite) {
    $('.chat-header__buttons .star.icon').removeClass('empty');
  };

  if (!favorite) {
    $('.chat-header__buttons .star.icon').addClass('empty');
  };

};


ChatHeader.update = function update(chatId) {
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

  var isFavorite = function(chatId) {
    var userProfile = ChatManager.userProfile;
    if (userProfile && userProfile.favoriteRooms && ( userProfile.favoriteRooms.length > 0 )) {
      return (userProfile.membership.favoriteRooms.indexOf(chatId) > -1);
    } else {
      return false;
    }
  }

  self.updateFavoriteButton({ favorite: isFavorite(chatId) });

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
