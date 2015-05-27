function UserManager() {
  this.user = ({
    userName: null,
    fullName: null,
    email: null,
  });

  this.profileSyncDone = false;
}

/**
 * Get users data from the server
 */
UserManager.prototype.getUserData = function getUserData(data, callback) {
  var userName = data.userName;
  var fullName = data.fullName;
  var email = data.email;

  // TODO: do AJAX call to POST /user/data and push user data
  callback(null);
};

/**
 * Push users data to the server
 */
UserManager.prototype.getUserData = function getUserData(data, callback) {
  var userName = data.userName;
  var fullName = data.fullName;
  var email = data.email;

  // TODO: do AJAX call to POST /user/data and push user data
  callback(null);
};
