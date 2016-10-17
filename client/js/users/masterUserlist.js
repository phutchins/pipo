'use strict';

var masterUserlist = {};

function MasterUserlist(socketClient, options) {
  if (!(this instanceof MasterUserlist)) {
    return new MasterUserlist(socketClient, options);
  }

  this.chatManager = socketClient.chatManager;
  this.encryptionManager = socketClient.encryptionManager;
  this._options = options;
}

/*
 * Update the master userlist
 */
MasterUserlist.prototype.update = function update(userlist, callback) {
  var self = this;
  self.chatManager.userlist = userlist;

  // Update key instance for all users
  Object.keys(userlist).forEach(function(userId) {
    var userPubKey = userlist[userId].publicKey;
    if (userPubKey) {
      self.encryptionManager.getKeyInstance(
        userPubKey,
        function(keyInstance) {
          self.chatManager.userlist[userId].keyInstance = keyInstance;
        }
      );
    }
  });

  return callback(null);
};

module.exports = MasterUserlist;
