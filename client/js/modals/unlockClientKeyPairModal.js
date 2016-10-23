'use strict';

/*
 * Password Prompt Modal
 */

function UnlockClientKeyPairModal(encryptionManager) {
  if (!(this instanceof UnlockClientKeyPairModal)) {
    return new UnlockClientKeyPairModal(encryptionManager);
  }

  this.encryptionManager = encryptionManager;
}

UnlockClientKeyPairModal.prototype.init = function(successCallback) {
  var self = this;
  console.log('[unlockClientKeyPairModal] Running unlockClientKeyPairModal init...');

  var UnlockClientKeyPairModalFormSettings = {
    inline: true,
    closable: false,
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

      self.encryptionManager.unlockClientKey({ passphrase: password }, function(data) {
        // If unlock fails, notify user and wait for another try
        if (data && data.err) {
          // Display error status on the modal
          console.log("Error unlocking client key: " + data.err);
          $('.ui.form.unlock').form('add errors', ['Incorrect Password. Please try again...']);
          //callback(data.err, false);
          return false;
        }
        // If unlock succeedes, hide the modal and keep going
        $('.ui.modal.unlock').modal('hide');
        return successCallback();
      });
      //return false;
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
  };

  $('.ui.modal.unlock').form(UnlockClientKeyPairModalFormSettings);
};

UnlockClientKeyPairModal.prototype.update = function(callback) {
  $('.ui.modal.unlock .username').text(window.username);
  callback();
};

UnlockClientKeyPairModal.prototype.show = function(successCallback) {
  this.init(successCallback);
  this.update(function() {
    $('.ui.modal.unlock').modal('show');
  });
};

module.exports = UnlockClientKeyPairModal;
