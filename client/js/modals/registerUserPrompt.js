/*
 * Register New User Modal Setup
 */

var user = require('../users/user.js');
var RegisterUserPrompt = {};

RegisterUserPrompt.init = function init(successCallback) {
  var buildRegisterModal = function() {
    console.log("Building register new user modal");

    $('.ui.form.register').trigger('reset');
    $('.ui.modal.register').modal({
      detachable: true,
      closable: false,
      transition: 'fade up'
    });
  };

  $(document).ready( buildRegisterModal );

  var registerFormSettings = {
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
      var username = $('.register.form .username').val().toString();
      var fullName = $('.register.form .name').val().toString();
      var password = $('.register.form .registerPassword').val().toString();
      var email = $('.register.form .email').val().toString();

      // Check with the server if the name is in use
      var checkCallback = function checkCallback(data) {
        var available = data.available;

        if (available) {
          return finish();
        }

        // Show error stating that username is not available
        $('.ui.form.register').form('add errors', ['Username is already in use. Please choose another one...']);
        return event.preventDefault();
      };

      user.checkUsernameAvailability(username, checkCallback);

      var finish = function finish() {
        //Hides modal on validation success
        $('.ui.modal.register').modal('hide');

        ChatManager.updateChatStatus({ status: 'generating' });

        $('.ui.modal.generate').modal('show');

        // Clear all local storage and window variables here?
        // This should include chat history etc...

        window.encryptionManager.generateClientKeyPair(2048, username, password, function(err, generatedKeypair) {
          if (err) {
            console.log("Error generating client keypair: "+err);
          } else {
            window.username = username;
            window.email = email;
            window.fullName = fullName;

            localStorage.setItem('username', username);
            localStorage.setItem('fullName', fullName);
            localStorage.setItem('email', email);

            // Save newly generated keypair
            localStorage.setItem('keyPair', JSON.stringify(generatedKeypair));
            // Need to unload an old keypair if it existed
            window.encryptionManager.clientCredentialsLoaded = false;

            socketClient.init();
          }
        });
      };

      // Probabally don't need both of these here
      event.preventDefault();
      return false;
    }
  }

  $(document).ready(function() {
    $('.ui.form.register').form(registerFormSettings);
  });
};

RegisterUserPrompt.show = function show(callback) {
  var self = this;

  $('.ui.modal.register').modal('show');
  self.init(callback);
};

