'use strict'

var clientNotification = {};

clientNotification.init = function init() {
  this.getPermission(function(permission) {
    if (permission) {
      console.log('Have notification permissions!');
    }
  });
};

clientNotification.getPermission = function getPermission(callback) {
  // check for notification compatibility
  if(!window.Notification) {
    // if browser version is unsupported, be silent
    return callback(false);
  }
  // log current permission level
  //console.log(Notification.permission);

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

// Sends a notification that expires after a timeout. If timeout = 0 it does not expire
clientNotification.send = function send(image, title, message, timeout, showOnFocus) {
  var self = this;
  this.getPermission(function(permission) {
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
				console.log("[clientNotification.send] Flashing title bar!");
			  self.flashTitleBar("New Messages")();
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

// Make a chat list item pulse
clientNotification.pulseChat = function pulseChat(chatId) {
  var properties = {
       backgroundColor : '#ddd'
  };

  var el = $('#' + chatId);

  el.pulse(properties, {
    duration : 3250,
    pulses   : 5,
    interval : 800
  })
};

clientNotification.flashTitleBar = function flashTitleBar(message) {
    var oldTitle = document.title;
    var timeoutId;
    var blink = function() { document.title = document.title == message ? ' ' : message; };
    var clear = function() {
        clearInterval(timeoutId);
        document.title = oldTitle;
        window.onmousemove = null;
        timeoutId = null;
    };
    return function () {
        if (!timeoutId) {
            timeoutId = setInterval(blink, 1000);
            window.onmousemove = clear;
        }
    };
};

module.exports = clientNotification;
