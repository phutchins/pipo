var userMap = {};
var roomUsers = {};

var ChatManager = {};

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
  //Make input usable
  $('#message-input').attr('placeHolder', 'Type your message here...').prop('disabled', false);
  $('#send-button').prop('disabled', false);
  $('#loading-icon').hide();

  $('textarea').keydown(function (event) {
    var element = this;
    if (event.keyCode === 13 && event.shiftKey) {
      var content = element.value;
      var caret = self.getCaret(this);

      element.value = content.substring(0, caret) + "\n" + content.substring(caret, content.length);
      event.stopPropagation();

      console.log("got shift+enter");
      var $messageInput = $('#message-input');
      $messageInput[0].scrollTop = $messageInput[0].scrollHeight;
      return false;
    }
    else if (event.keyCode === 13) {
      //console.log("got enter");
      window.socketClient.sendMessage('general', $('#message-input').val());
      return false;
    }
  });
};

ChatManager.disableChat = function disableChat() {
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
      onShow: function() {
        console.log("Showing create");
      },
      onApprove: function() {
        //TODO: Check for username collision
        username = $('#username').val();

        if (username) {
          console.log('has username, go');
          $('.ui.modal.generate').modal('show');
          return true;
        }
        console.log("no username, do nothing");
        return false;
      }
    });

  $('.ui.modal.generate')
    .modal('setting', 'closable', false)
    .modal("setting", {
      onShow: function() {
        window.encryptionManager.generateClientKeyPair(2048, username, "temporaryPassphrase", function(err, generatedKeypair) {
          if (err) {
            console.log("Error generating client keypair: "+err);
          } else {
            console.log("Generated client key pair.");
            localStorage.setItem('username', username);
            localStorage.setItem('keyPair', JSON.stringify(generatedKeypair));
            $('.ui.modal.generate').modal('hide');
            socketClient.init();
          }
        });
      }
    });
};