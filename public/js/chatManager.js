var userMap = {};
var roomUsers = {};

var ChatManager = {};

$('#main-input-form').form('setting', {
  onSuccess: function () {
    ChatManager.sendMessage();
    return false;
  }
});

// Sends a notification that expires after a timeout. If timeout = 0 it does not expire
ChatManager.sendNotification = function sendNotification(image, title, message, timeout, showOnFocus) {
  this.getNotifyPermissions(function(permission) {
    if (permission) {
      console.log("[NOTIFICATION] Attempting to display notification");
      // Default values for optional params
      timeout = (typeof timeout !== 'undefined') ? timeout : 0;
      showOnFocus = (typeof showOnFocus !== 'undefined') ? showOnFocus : false;
      // Check if the browser window is focused
      var isWindowFocused = document.querySelector(":focus") !== null;
      // Check if we should send the notification based on the showOnFocus parameter
      var shouldNotify = !isWindowFocused || isWindowFocused && showOnFocus;
      console.log("[NOTIFICATION] shouldNotify is "+shouldNotify);
      if (shouldNotify) {
        console.log("[NOTIFCATION] Sending notification now...");
        var notification = new Notification(title, { body: message });
        if (timeout > 0) {
          // Hide the notification after the timeout
          setTimeout(function(){
            notification.close();
          }, timeout);
        }
      }
    } else {
      console.log("Don't have permission to display notification");
    }
  });
};

ChatManager.getNotifyPermissions = function getNotifyPermissions(callback) {
  // check for notification compatibility
  if(!window.Notification) {
    // if browser version is unsupported, be silent
    return callback(false);
  }
  // log current permission level
  console.log(Notification.permission);
  // if the user has not been asked to grant or deny notifications from this domain
  if(Notification.permission === 'default') {
    Notification.requestPermission(function() {
      // callback this function once a permission level has been set
      return callback(true);
    });
  }
  // if the user has granted permission for this domain to send notifications
  else if(Notification.permission === 'granted') {
    return callback(true);
  }
  // if the user does not want notifications to come from this domain
  else if(Notification.permission === 'denied') {
    return callback(false);
  }
};

ChatManager.enableChat = function enableChat() {
  var self = this;

  if (self.enabled) {
    return;
  }

  self.enabled = true;

  //Make input usable
  $('#message-input').attr('placeHolder', 'Type your message here...').prop('disabled', false);
  $('#send-button').prop('disabled', false);
  $('#loading-icon').hide();

  $('textarea').keydown(function (event) {
    var element = this;

    //Prevent shift+enter from sending
    if (event.keyCode === 13 && event.shiftKey) {
      var content = element.value;
      var caret = self.getCaret(this);

      element.value = content.substring(0, caret) + "\n" + content.substring(caret, content.length);
      event.stopPropagation();

      var $messageInput = $('#message-input');
      $messageInput[0].scrollTop = $messageInput[0].scrollHeight;
      return false;
    }
    else if (event.keyCode === 13) {
      $('#main-input-form').submit();
      return false;
    }
  });
};

ChatManager.disableChat = function disableChat() {
  self.enabled = false;
  $('textarea').off("keydown", "**");
  $('#message-input').attr('placeHolder', '         Waiting for connection...').prop('disabled', true);
  $('#send-button').prop('disabled', true);
  $('#loading-icon').show();
};

ChatManager.getCaret = function getCaret(el) {
  if (el.selectionStart) {
    return el.selectionStart;
  } else if (document.selection) {
    el.focus();
    var r = document.selection.createRange();
    if (r === null) {
      return 0;
    }
    var re = el.createTextRange(),
        rc = re.duplicate();
    re.moveToBookmark(r.getBookmark());
    rc.setEndPoint('EndToStart', re);
    return rc.text.length;
  }
  return 0;
};

ChatManager.prepareMessage = function prepareMessage(message, callback) {
  var parsedMessage = window.marked(message);
  var container = $('<div>').html(parsedMessage);

  // Check the hostname to make sure that it's not a local link...
  container.find('a').attr('target','_blank');
  container.find('code').addClass('hljs');

  callback(null, container.html());
};

ChatManager.handleMessage = function handleMessage(message, fromUser) {
  var messages = $('#messages');
  var messageLine = "["+fromUser+"] "+message;

  this.localMsg({ type: null, message: messageLine });
  messages[0].scrollTop = messages[0].scrollHeight;
};

ChatManager.handlePrivateMessage = function handleMessage(message, fromUser, toUser) {
  var messages = $('#messages');
  var messageLine = "[" + fromUser + " > " + toUser + "] " + message;

  this.localMsg({ type: null, message: messageLine });
  messages[0].scrollTop = messages[0].scrollHeight;
};

ChatManager.localMsg = function localMsg(data) {
  var type = data.type;
  var message = data.message;
  var id = data.id;

  //Add timestamp
  var time = new Date().toISOString();
  message += ' <span style="float:right;" title="' + time + '" data-livestamp="' + time + '"></span>';

  if (type !== null && id !== null) {
    $('#messages').append($('<li id="'+id+'">').html("["+type+"] "+message));
  } else if (type !== null) {
    $('#messages').append($('<li>').html("["+type+"] "+message));
  } else {
    $('#messages').append($('<li>').html(message));
  }
};

ChatManager.sendMessage = function sendMessage() {
  var input = $('#message-input').val();
  var commandRegex = /^\/(.*)$/;
  var regexResult = input.match(commandRegex);

  if (input === "") {
    return false;
  }
  else if (regexResult !== null) {
    // Catch commands here and encrypt data to users as needed
    var command = regexResult[1];
    var splitCommand = command.split(" ");

    // Locally parsed commands
    if (splitCommand[0] === "msg") {
      var message = command.split(" ").slice(2).join(" ");
      ChatManager.sendPrivateMessage(splitCommand[1], message);
    }
    else {
      // Not a locally parsed command so sending unencrypted to server (server might should have its own key to decrypt server commands)
      socket.emit('server command', {command: regexResult[1], currentChannel: currentChannel});
      console.log("Sending command '" + regexResult[1] + "' to server");
      $('#message-input').val('');
    }
  }
  else {
    window.socketClient.sendMessage('general', input);
  }
};

ChatManager.sendPrivateMessage = function sendPrivateMessage(username, message) {
  if (!userMap[username]) {
    console.log("user does not exist");
    return false;
  }
  socketClient.sendPrivateMessage(username, message);
};

ChatManager.promptForCredentials = function promptForCredentials() {
  var self = this;

  $(".ui.modal.initial")
    .modal('setting', 'closable', false)
    .modal("show");

  $('.ui.modal.create')
    .modal("attach events", ".ui.modal.initial .button.generate")
    .modal('setting', 'closable', false)
    .modal('setting', 'debug', true)
    .modal("setting", {
      onApprove: function() {
        $('.ui.form.create').submit();
      }
    });
  $('.ui.form.create').form('setting', {
    onSuccess: function() {
      var errorDisplay = $('.create #createError');
      var username = $('.create.form #username').val();
      var password = $('.create.form #password').val();
      var confirmPassword = $('.create #confirmPassword').val();

      if (!username) {
        if (errorDisplay.text().toLowerCase().indexOf('username') !== -1) {
          return false;
        }
        if (errorDisplay.transition('is visible')) {
          errorDisplay.transition({
            animation: 'fade up',
            duration: '0.5s',
            onComplete: function() {
              errorDisplay.text("Password is required");
            }
          });
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        else {
          errorDisplay.text("Username is required");
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        return false;
      }
      else if(!password) {
        if (errorDisplay.text().toLowerCase().indexOf('password is required') !== -1) {
          return false;
        }
        if(errorDisplay.transition('is visible')) {
          errorDisplay.transition({
            animation: 'fade up',
            duration: '0.5s',
            onComplete: function() {
              errorDisplay.text("Password is required");
            }
          });
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        else {
          errorDisplay.text("Password is required");
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        return false;
      }
      else if (password !== confirmPassword) {
        if (errorDisplay.text().toLowerCase().indexOf('passwords do not match') !== -1) {
          return false;
        }
        if(errorDisplay.transition('is visible')) {
          errorDisplay.transition({
            animation: 'fade up',
            duration: '0.5s',
            onComplete: function() {
              errorDisplay.text("Passwords do not match");
            }
          });
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        else {
          errorDisplay.text("Passwords do not match");
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        return false;
      }

      //TODO: Check for username collision

      $('.ui.modal.generate').modal('show');
      window.encryptionManager.generateClientKeyPair(2048, username, password, function(err, generatedKeypair) {
        if (err) {
          console.log("Error generating client keypair: "+err);
        } else {
          console.log("Generated client key pair.");
          window.username = username;
          localStorage.setItem('username', username);
          localStorage.setItem('keyPair', JSON.stringify(generatedKeypair));
          $('.ui.modal.generate').modal('hide');
          socketClient.init();
        }
      });
      return false;
    }
  });

  $('.ui.modal.generate').modal('setting', 'closable', false);
};

ChatManager.promptForPassphrase = function(callback) {
  $('.ui.modal.unlock')
    .modal('setting', 'closable', false)
    .modal('setting', {
      onApprove: function() {
        $('.ui.form.unlock').submit();
      }
    })
    .modal('show');

  $('.ui.form.unlock').form('setting', {
    onSuccess: function() {
      var errorDisplay = $('.unlock #createError');
      var password = $('.unlock #password').val();
      if (!password) {
        if (errorDisplay.text().toLowerCase().indexOf('password is required') !== -1) {
          return false;
        }
        if (errorDisplay.transition('is visible')) {
          errorDisplay.transition({
            animation: 'fade up',
            duration: '0.5s',
            onComplete: function () {
              errorDisplay.text("Password is required");
            }
          });
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        else {
          errorDisplay.text("Password is required");
          errorDisplay.transition({
            animation: 'fade up',
            duration: '1s'
          });
        }
        return false;
      }
      else {
        $('.ui.modal.unlock').modal('hide');
        callback(password);
        return false;
      }
    }
  });
};