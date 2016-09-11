'use strict';

var masterUserlist = {};

/*
 * Update the master userlist
 */
masterUserlist.update = function update(ChatManager, userlist, callback) {
  ChatManager.userlist = userlist;

  // Update key instance for all users
  Object.keys(userlist).forEach(function(userId) {
    var userPubKey = userlist[userId].publicKey;
    if (userPubKey) {
      window.encryptionManager.getKeyInstance(
        userPubKey,
        function(keyInstance) {
          ChatManager.userlist[userId].keyInstance = keyInstance;
        }
      );
    }
  });

  return callback(null);
};

module.exports = masterUserlist;
