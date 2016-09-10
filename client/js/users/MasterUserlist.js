var MasterUserlist = {};

/*
 * Update the master userlist
 */
MasterUserlist.update = function update(userlist, callback) {
  ChatManager.userlist = userlist;

  // Update key instance for all users
  Object.keys(userlist).forEach(function(userId) {
    if (userlist[userId].publicKey) {
      window.encryptionManager.getKeyInstance(userlist[userId].publicKey, function(keyInstance) {
        ChatManager.userlist[userId].keyInstance = keyInstance;
      });
    };
  });

  return callback(null);
};
