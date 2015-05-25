var userMap = {};
var roomUsers = {};

// Sends a notification that expires after a timeout. If timeout = 0 it does not expire
function sendNotification(image, title, message, timeout, showOnFocus) {
  getNotifyPermissions(function(permission) {
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
        console.log("[NOTIFACTION] Sending notification now...");
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
}

function getNotifyPermissions(callback) {
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
}

function enableChat() {
  $('textarea').keydown(function (event) {
    var self = this;
    if (event.keyCode === 13 && event.shiftKey) {
      var content = self.value;
      var caret = getCaret(this);
      self.value = content.substring(0, caret) + "\n" + content.substring(caret, content.length);
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
}

function getCaret(el) {
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
}

function prepareMessage(message, callback) {
  var parsedMessage = window.marked(message);
  var container = $('<div>').html(parsedMessage);
  //console.log("Unparsead message: "+container.html());
  // Check the hostname to make sure that it's not a local link...
  container.find('a').attr('target','_blank');
  container.find('code').addClass('hljs');
  //console.log("Parsed message: "+container.html());
  callback(null, container.html());
}

function handleMessage(message, fromUser) {
  //console.log("raw message is: "+message);
  var messages = $('#messages');
  var messageLine = "["+fromUser+"] "+message;
  localMsg({ type: null, message: messageLine });
  messages[0].scrollTop = messages[0].scrollHeight;
  //var regexResult = new RegExp('@<%= userName %>', 'i').exec(message);
  //var mentionRegex = /@<%= userName %>/;
  //var regexResult = message.match(mentionRegex);
  //if (regexResult !== null) {
  //  sendNotification(null, fromUser+' mentioned you...', $(message).text(), 3000);
  //}
}

function localMsg(data) {
  var type = data.type;
  var message = data.message;
  var id = data.id;
  message += ' <span style="float:right;">' + new Date().toISOString() + '</span>';
  if (type !== null && id !== null) {
    $('#messages').append($('<li id="'+id+'">').html("["+type+"] "+message));
  } else if (type !== null) {
    $('#messages').append($('<li>').html("["+type+"] "+message));
  } else {
    $('#messages').append($('<li>').html(message));
  }
}
