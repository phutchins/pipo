var Authentication = {};

Authentication.authenticate = function authenticate(data) {
  var socket = data.socket;

  console.log("[AUTH] Authenticating with server with username: '"+window.username+"'");

  window.encryptionManager.keyManager.sign({}, function(err) {
    window.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
      socket.emit('authenticate', {username: window.username, publicKey: publicKey, email: window.email});
    });
  });
};


Authentication.authenticated = function authenticated(data) {
  var favoriteRooms = data.favoriteRooms;
  var defaultRoomName = data.defaultRoomName;
  var userIdMap = data.userIdMap;
  var userlist = data.userlist;

  // Ensure that we have permission to show notifications and prompt if we don't
  clientNotification.init();

  if (data.message !== 'ok') {
    return console.log("[SOCKET CLIENT] (addListeners) Error from server during authentication")
  };

  if (window.activeChat) {
    ChatManager.activeChat = window.activeChat;
  }

  ChatManager.defaultRoomName = data.defaultRoomName;

  if (!ChatManager.activeChat) {
    ChatManager.activeChat = { name: defaultRoomName, type: 'room' };
  }

  ChatManager.userlist = userlist;
  ChatManager.userIdMap = userIdMap;

  ChatManager.updateProfileHeader();

  window.encryptionManager.keyManager.sign({}, function(err) {
    window.encryptionManager.keyManager.export_pgp_public({}, function(err, publicKey) {
      window.encryptionManager.verifyRemotePublicKey(window.username, publicKey, function(err, upToDate) {
        if (err) { return console.log("[INIT] Error updating remote public key: "+err) };

        if (upToDate) {
          console.log("[INIT] Your public key matches what is on the server");
          console.log("[AUTHENTICATED] Authenticated successfully");

          // Use cilent keys and enable chat for each room user is currently in
          if (favoriteRooms.length > 0) {
            console.log("[SOCKET] (authenticated) Joining room ",room);

            favoriteRooms.forEach(function(room) {
              if (room && typeof room !== 'undefined') {
                socketClient.joinRoom(room, function(err) {
                  console.log("[SOCKET] (authenticated) Sent join request for room "+room);
                });
              }
            });
          } else {
            var defaultRoomName = ChatManager.defaultRoomName;

            console.log("[SOCKET] (authenticated) Joining room ",defaultRoomName);

            socketClient.joinRoom(defaultRoomName, function(err) {
              console.log("[SOCKET] (authenticated) Joined default room becuase favoriteRooms was empty");
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
