'use strict';

var clientNotification = require('../notification/index.js');

function Authentication(managers) {
  if (!(this instanceof Authentication)) {
    return new Authentication(encryptionManager);
  }

  this.encryptionManager = managers.encryptionManager;
  this.socketClient = managers.socketClient;
  this.chatManager = managers.chatManager;
  this.masterUserlist = managers.masterUserlist;
}

Authentication.prototype.authenticate = function(data) {
  var self = this;
  var socket = data.socket;
  var username = localStorage.getItem('username');

  console.log("[AUTH] Authenticating with server with username: '"+self.username+"'");

  // Generate a new unused nonce and sign it for verification
  self.encryptionManager.keyManager.sign({}, function(err) {
    self.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
      self.getAuthData({}, function(data) {
        console.log('[authentication.authenticate] Auth Data: ', data);

        socket.emit('authenticate', {username: data.username, nonce: data.nonce, signature: data.signature, fullName: data.fullName, publicKey: publicKey, email: data.email});
      });
    });
  });
};

// This needs to be exported so that it's called every time and knows what last was
Authentication.prototype.getNonce = function(length) {
  var last = null;
  var repeat = 0;

  if (typeof length === 'undefined') {
    length = 15;
  }

  return function() {
    var now = Math.pow(10, 2) * +new Date()

    if (now === last) {
      repeat++;
    } else {
      repeat = 0;
      last = now;
    }

    var s = (now + repeat).toString();
    return +s.substr(s.length - length);
  };
};

Authentication.prototype.apiAuth = function(data) {
  var self = this;
  var username = data.username;
  var nonce = self.getNonce(8)();
  var signature;

  self.encryptionManager.sign(nonce.toString(), function(err, sig) {
    signature = btoa(sig);

    var postData = querystring.stringify({
      'msg' : 'Hello World!'
    });

    var options = {
      hostname: 'localhost',
      port: 3030,
      path: '/sessiontest',
      method: 'POST',
      encoding: 'utf8',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postData.length,
        'username': username,
        'nonce': nonce,
        'signature': signature
      }
    };

    console.log('options: ', options);

    var req = http.request(options, function(res) {
      //console.log(`STATUS: ${res.statusCode}`);
      //console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
      res.on('data', function(chunk) {
        //console.log(`BODY: ${chunk}`);
      });
      res.on('end', function() {
        console.log('No more data in response.');
      });
    });

    req.on('error', function(e) {
      console.log(`problem with request: ${e.message}`);
    });

    // write data to request body
    req.write(postData);
    req.end();
  });
};

Authentication.prototype.getAuthData = function(data, callback) {
  var self = this;
  var username = localStorage.getItem('username');
  var email = localStorage.getItem('email');
  var fullName = localStorage.getItem('fullName');
  var nonce = self.getNonce(32)();
  var signature = null;

  self.encryptionManager.sign(nonce.toString(), function(err, sig) {
    signature = btoa(sig);

    var authData = {
      'username': username,
      'fullName': fullName,
      'email': email,
      'nonce': nonce,
      'signature': signature
    };

    return callback(authData);
  });
};

Authentication.prototype.authenticated = function(data) {
  var self = this;
  var defaultRoomId = data.defaultRoomId;
  var userNameMap = data.userNameMap;
  var userlist = data.userlist;
  var userProfile = data.userProfile;
  var favoriteRooms = userProfile.membership.favoriteRooms;
  var username = localStorage.getItem('username');

  // Ensure that we have permission to show notifications and prompt if we don't
  clientNotification.init();

  if (data.message !== 'ok') {
    return console.log('[SOCKET CLIENT] (addListeners) Error from server during authentication');
  }

  if (window.activeChat) {
    self.chatManager.activeChat = window.activeChat;
  }

  self.chatManager.defaultRoomId = data.defaultRoomId;

  self.masterUserlist.update(userlist, function(err) {
    console.log("[authentication.authenticated] Updated Main Userlist");
  });
  self.chatManager.userNameMap = userNameMap;
  self.chatManager.userProfile = userProfile;

  self.chatManager.updateProfileHeader();

  self.encryptionManager.keyManager.sign({}, function(err) {
    self.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
      // The key we're verifying is not working here. Need to figure out why
      self.encryptionManager.verifyRemotePublicKey(username, publicKey, function(err, upToDate) {
        if (err) { return console.log("[INIT] Error updating remote public key: "+err) };

        if (upToDate) {
          //console.log("[INIT] Your public key matches what is on the server");
          console.log("[AUTHENTICATED] Authenticated successfully");

          // Use cilent keys and enable chat for each room user is currently in
          if (favoriteRooms && favoriteRooms.length > 0) {

            favoriteRooms.forEach(function(roomId) {
              console.log("[SOCKET] (authenticated) Joining room ",roomId);
              if (roomId && typeof roomId !== 'undefined') {
                self.socketClient.joinRoom(roomId, function(err) {
                  console.log("[SOCKET] (authenticated) Sent join request for room "+roomId);
                });
              }
            });
          } else {
            var defaultRoomId = self.chatManager.defaultRoomId;

            //console.log("[SOCKET] (authenticated) Joining room ",defaultRoomId);

            self.socketClient.joinRoom(defaultRoomId, function(err) {
              console.log("[authentication.authenticated] Joined default room becuase favoriteRooms was empty");
            });
          }
        } else {
          // Should not allow updating of remote key without signature from old key or admin making the change
          console.log("[INIT] Remote public key is not up to date so updating!");
          // Should error here and eventually give options to verify previous key and updating

          /*
          window.encryptionManager.updatePublicKeyOnRemote(window.username, publicKey, function(err) {
            if (err) { return console.log("[INIT] ERROR updating public key on server: "+err) };
            console.log("[AUTHENTICATED] Authenticated successfully");

            // Use cilent keys and enable chat for each room user is currently in
            favoriteRooms.forEach(function(room) {
              console.log("[SOCKET] (authenticated) Joining room ",room);

              self.socketClient.joinRoom(room, function(err) {
                console.log("[SOCKET] (authenticated) Sent join request for room "+room);
              });
            });
          });
          */
        }
      });
    });
  });
};

module.exports = Authentication;
