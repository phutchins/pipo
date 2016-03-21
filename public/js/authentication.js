var Authentication = {};

Authentication.authenticate = function authenticate(data) {
  var socket = data.socket;

  console.log("[AUTH] Authenticating with server with username: '"+window.username+"'");

  // Generate a new unused nonce and sign it for verification
  window.encryptionManager.keyManager.sign({}, function(err) {
    window.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
      socket.emit('authenticate', {username: window.username, fullName: window.fullName, publicKey: publicKey, email: window.email});
    });
  });
};

Authentication.apiAuth = function apiAuth(data) {
  var self = this;
  var username = data.username;
  var nonce = '123456789';
  var signature = null;

  window.encryptionManager.sign(nonce, function(err, sig) {
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

    console.log("options: ", options);

    var req = http.request(options, function(res) {
      console.log(`STATUS: ${res.statusCode}`);
      console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
      res.on('data', function(chunk) {
        console.log(`BODY: ${chunk}`);
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

Authentication.getAuthHeader = function getAuthHeader(data, callback) {
  var username = window.username;
  var nonce = '123456789';
  var signature = null;

  window.encryptionManager.sign(nonce, function(err, sig) {
    signature = btoa(sig);

    var headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'username': username,
      'nonce': nonce,
      'signature': signature
    };

    callback(headers);
  });
};

Authentication.authenticated = function authenticated(data) {
  var favoriteRooms = data.favoriteRooms;
  var defaultRoomId = data.defaultRoomId;
  var userNameMap = data.userNameMap;
  var userlist = data.userlist;
  var userProfile = data.userProfile;

  // Ensure that we have permission to show notifications and prompt if we don't
  clientNotification.init();

  if (data.message !== 'ok') {
    return console.log("[SOCKET CLIENT] (addListeners) Error from server during authentication")
  };

  if (window.activeChat) {
    ChatManager.activeChat = window.activeChat;
  }

  ChatManager.defaultRoomId = data.defaultRoomId;

  //if (!ChatManager.activeChat) {
  //  ChatManager.activeChat = { id: defaultRoomId, type: 'room' };
  //}

  MasterUserlist.update(userlist, function(err) {
    console.log("[authentication.authenticated] Updated Main Userlist");
  });
  ChatManager.userNameMap = userNameMap;
  ChatManager.userProfile = userProfile;

  ChatManager.updateProfileHeader();

  window.encryptionManager.keyManager.sign({}, function(err) {
    window.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
      window.encryptionManager.verifyRemotePublicKey(window.username, publicKey, function(err, upToDate) {
        if (err) { return console.log("[INIT] Error updating remote public key: "+err) };

        if (upToDate) {
          //console.log("[INIT] Your public key matches what is on the server");
          console.log("[AUTHENTICATED] Authenticated successfully");

          // Use cilent keys and enable chat for each room user is currently in
          if (favoriteRooms.length > 0) {

            favoriteRooms.forEach(function(roomId) {
              console.log("[SOCKET] (authenticated) Joining room ",roomId);
              if (roomId && typeof roomId !== 'undefined') {
                socketClient.joinRoom(roomId, function(err) {
                  console.log("[SOCKET] (authenticated) Sent join request for room "+roomId);
                });
              }
            });
          } else {
            var defaultRoomId = ChatManager.defaultRoomId;

            //console.log("[SOCKET] (authenticated) Joining room ",defaultRoomId);

            socketClient.joinRoom(defaultRoomId, function(err) {
              console.log("[Authentication.authenticated] Joined default room becuase favoriteRooms was empty");
            })
          }
        } else {
          // Should not allow updating of remote key without signature from old key or admin making the change
          console.log("[INIT] Remote public key is not up to date so updating!");

          window.encryptionManager.updatePublicKeyOnRemote(window.username, publicKey, function(err) {
            if (err) { return console.log("[INIT] ERROR updating public key on server: "+err) };
            console.log("[AUTHENTICATED] Authenticated successfully");

            // Use cilent keys and enable chat for each room user is currently in
            favoriteRooms.forEach(function(room) {
              console.log("[SOCKET] (authenticated) Joining room ",room);

              socketClient.joinRoom(room, function(err) {
                console.log("[SOCKET] (authenticated) Sent join request for room "+room);
              });
            });
          });
        }
      });
    });
  });
};
