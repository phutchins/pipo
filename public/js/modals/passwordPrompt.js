/*
 * Password Prompt Modal
 */

var PasswordPrompt = {};

PasswordPrompt.init = function init(successCallback) {
  var buildPasswordPromptModal = function buildPasswordPromptModal() {
    $('.ui.modal.unlock .username').text(window.username);
    $('.ui.modal.unlock').modal('setting', 'closable', false);
  };

  $(document).ready(buildPasswordPromptModal);

  var passwordPromptFormSettings = {
    inline: true,
    on: 'blur',
    onApprove: function() {
      $('.ui.form.unlock').submit();
      return false;
    },
    onFailure: function(event) {
      console.log("Form Failure!");
      event.preventDefault();
      return false;
    },
    onSuccess: function(event) {
      var errorDisplay = $('.unlock #createError');
      var password = $('.unlock #password').val();

      event.preventDefault();

      // Attempt to unlock the client key
      window.encryptionManager.unlockClientKey({ passphrase: password }, function(data) {
        // If unlock fails, notify user and wait for another try
        if (data && data.err) {
          // Display error status on the modal
          console.log("Error unlocking client key: " + data.err);
          $('.ui.form.unlock').form('add errors', ['Incorrect Password. Please try again...']);
          return false;
        }
        // If unlock succeedes, hide the modal and keep going
        $('.ui.modal.unlock').modal('hide');

        successCallback();
        return false;
      });
    },
    fields: {
      password: {
        identifier: 'password',
        rules: [{
          type: 'empty',
          prompt: 'You must enter your password...'
        }]
      }
    }
  };

  $(document).ready(function() {
    $('.ui.form.unlock').form(passwordPromptFormSettings);
  });
};

PasswordPrompt.show = function show(callback) {
  var self = this;

  self.init(callback);
  $('.ui.modal.unlock').modal('show');
};
