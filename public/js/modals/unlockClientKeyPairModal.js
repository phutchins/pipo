/*
 * Password Prompt Modal
 */

var UnlockClientKeyPairModal = {};

UnlockClientKeyPairModal.init = function init(callback) {

  console.log("[unlockClientKeyPairModal] Running unlockClientKeyPairModal init...");

  var UnlockClientKeyPairModalFormSettings = {
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
      var password = $('.unlock #password').val();

      // Do we need this and return false?
      //event.preventDefault();

      // Attempt to unlock the client key
      console.log("[unlockClientKeyPairModal] Unlocking client key");

      window.encryptionManager.unlockClientKey({ passphrase: password }, function(data) {
        // If unlock fails, notify user and wait for another try
        if (data && data.err) {
          // Display error status on the modal
          console.log("Error unlocking client key: " + data.err);
          $('.ui.form.unlock').form('add errors', ['Incorrect Password. Please try again...']);
          callback(data.err, false);
        }
        // If unlock succeedes, hide the modal and keep going
        $('.ui.modal.unlock').modal('hide');

        callback();
      });
      return false;
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

  var buildUnlockClientKeyPairModal = function buildUnlockClientKeyPairModal() {
    console.log("[unlockClientKeyPairModal] buildUnlockClientKeyPairModal function running!");
    $('.ui.modal.unlock .username').text(window.username);
    $('.ui.modal.unlock').modal('setting', 'closable', false);
    $('.ui.modal.unlock').form(UnlockClientKeyPairModalFormSettings);
  };

  $(document).ready(buildUnlockClientKeyPairModal);

  //$(document).ready(function() {
  //  $('.ui.form.unlock').form(UnlockClientKeyPairModalFormSettings);
  //});
};

UnlockClientKeyPairModal.show = function show(callback) {
  var self = this;

  self.init(callback);
  $('.ui.modal.unlock').modal('show');
};
