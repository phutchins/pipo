'use strict'

/**
 * @module pipo/users/user
 * @license LGPL-3.0
 */

/**
 * Things relating to managing users
 */

function User() {
  if (!(this instanceof User)) {
    return new User();
  }
}

User.prototype.init = function init(managers) {
  this.socketClient = managers.socketClient;
};

User.prototype.checkAvailability = function checkAvailability(username, callback) {
  var self = this;
  var usernameCallback = callback;

  // Create a listener tied to the username we are checking
  self.socketClient.socket.on('availability-' + username, function(data) {
    console.log("[socketClient.checkUsernameAvailability] Got availability callback");
    var available = data.available;
    var error = data.error;

    if (error) {
      console.log("[socketClient.checkUsernameAvailability] There was an error while checking username availability");

      // Show error on modal
    };

    self.socketClient.socket.removeListener('availability-' + username);
    usernameCallback({ available: available });
  });

  // Send the socket request to check the username
  self.socketClient.socket.emit('checkUsernameAvailability', { username: username, socketCallback: 'availability-' + username });
};

module.exports = User;
