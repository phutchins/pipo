'use strict';
/*
 * Register New User Modal Setup
 */

var User = require('../users/user.js');

function RegisterUserPrompt(options) {
  if (!(this instanceof RegisterUserPrompt)) {
    return new RegisterUserPrompt(options);
  }

  this._options = options;
  this.user = new User();
}

RegisterUserPrompt.prototype.init = function init(managers) {
  this.chatManager = managers.chatManager;
  this.encryptionManager = managers.encryptionManager;

  this.user.init({
    socketClient: this.chatManager.socketClient
  });
};

RegisterUserPrompt.prototype.initModal = function initModal() {
  var self = this;

  this.registerFormSettings = {
    inline: true,
    on: 'blur',
    debug: true,
    icon: {
      valid: 'checkmark icon',
      invalid: 'remove icon',
      vaidating: 'refresh icon'
    },
    err: {
      container: 'tooltip'
    },
    onFailure: function(event) {
      event.preventDefault();
      console.log("FAILURE!!!");
      return false;
    },
    fields : {
      username : {
        identifier: 'username',
        rules : [{
          type : 'empty',
          prompt : 'Please enter a username'
        },
        {
          type : "regExp[^[a-zA-Z0-9_-]{3,32}$]",
          prompt : 'Please enter a properly formatted username. Username can only contain regular letters and numbers, underscores and dashes and must be between 3 and 32 characters long.'
        }]
      },
      name : {
        identifier: 'name',
        rules : [{
          type: 'empty',
          prompt : 'Please enter your name'
        }]
      },
      email : {
        identifier : 'email',
        rules : [{
          type: 'email',
          prompt : 'You must enter a valid email address'
        }]
      },
      registerPassword : {
        identifier : 'registerPassword',
        rules : [{
          type: 'empty',
          prompt: 'Please enter a password'
        },
        {
          type : 'minLength[8]',
          prompt : 'Your password must be at least {ruleValue} characters'
        }]
      },
      confirmPassword : {
        identifier : 'confirmPassword',
        rules : [{
          type: 'empty',
          prompt : 'Please confirm your password'
        },
        {
          type: 'match[registerPassword]',
          prompt : 'Your passwords do not match'
        }]
      }
    },
    onSuccess : function(event) {
      console.log("Form submitted success 1!");
      self.username = $('.register.form .username').val().toString();
      self.fullName = $('.register.form .name').val().toString();
      self.password = $('.register.form .registerPassword').val().toString();
      self.email = $('.register.form .email').val().toString();

      // Check with the server if the name is in use
      var checkCallback = function checkCallback(data) {
        var available = data.available;

        if (available) {
          return self.finish();
        }

        // Show error stating that username is not available
        $('.ui.form.register').form('add errors', ['Username is already in use. Please choose another one...']);
        return event.preventDefault();
      };

      self.user.checkAvailability(self.username, checkCallback);

      // Probabally don't need both of these here
      event.preventDefault();
      return false;
    }
  }

  this.build(function() {
    console.log('[registerUserPrompt] Done building modal');
  });

  $('.ui.form.register').form('destroy');
  $('.ui.form.register').form(this.registerFormSettings);
};

RegisterUserPrompt.prototype.build = function() {
  console.log('Building register new user modal');

  $('.ui.form.register').trigger('reset');
  $('.ui.modal.register').modal({
    detachable: true,
    closable: false,
    transition: 'fade up'
  });
};


RegisterUserPrompt.prototype.show = function show(callback) {
  var self = this;

  $('.ui.modal.register').modal('show');
  self.initModal(callback);
};

RegisterUserPrompt.prototype.finish = function finish() {
  var self = this;

  //Hides modal on validation success
  $('.ui.modal.register').modal('hide');

  self.chatManager.updateChatStatus({ status: 'generating' });

  $('.ui.modal.generate').modal('show');

  // Clear all local storage and window variables here?
  // This should include chat history etc...

  self.encryptionManager.generateClientKeyPair(2048, self.username, self.password, function(err, generatedKeypair) {
    if (err) {
      console.log("Error generating client keypair: "+err);
    } else {
      window.username = self.username;
      window.email = self.email;
      window.fullName = self.fullName;

      localStorage.setItem('username', self.username);
      localStorage.setItem('fullName', self.fullName);
      localStorage.setItem('email', self.email);

      // Save newly generated keypair
      localStorage.setItem('keyPair', JSON.stringify(generatedKeypair));
      // Need to unload an old keypair if it existed
      self.encryptionManager.clientCredentialsLoaded = false;

      // Connect to the server (do we need to do this here?)
      self.chatManager.socketClient.init();
    }
  });
};

module.exports = RegisterUserPrompt;
