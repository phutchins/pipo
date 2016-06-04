'use strict'
/*
 * Modal for sending a file to another user
 */

var SendFileModal = {};

SendFileModal.init = function init(successCallback) {
  // Do we need to create and destroy this to avoid memory leak?
  var fileManager = FileManager();

  var sendfileFormSettings = {
    fields: { },
    onSuccess: function() {
      console.log("[sendFileModal.init] Form success!");

      // Get the files object from the dom element
      var files = document.getElementById('sendfile-file-input').files;

      fileManager.readFiles(files, function(err) {
        if (err) {
          successCallback(err);
        }

        successCallback();
      });
      return false;
    }
  };

  console.log("[sendFileModal.init] Running init for sendFileModal");

  SendFileModal.build(function() {
    console.log("[sendFileModal.init] Done building modal")
  });

  $('.ui.form.sendfile').form(sendfileFormSettings);

};

SendFileModal.build = function build(callback) {
  var self = this;

  var sendFileModalSettings = {
    detachable: true,
    closable: true,
    transition: 'fade up',
    onApprove: function() {
      $('.ui.form.sendfile').submit();
      return false;
    }
  };

  console.log("[sendFileModal.build] Building send file modal");

  $('.modal.sendfile').modal(sendFileModalSettings);

  $('.send-file-button').unbind().click(function(e) {
    console.log("[sendFileModal.build] Got #send-file-button click");
    $('.ui.form.sendfile').trigger('reset');
    $('.ui.form.createroom .field.error').removeClass('error');
    $('.ui.form.sendfile.error').removeClass('error');
    SendFileModal.show(function(data) {

    });
  });
};

SendFileModal.show = function show(callback) {
  var self = this;

  $('.modal.sendfile').modal('show');
  return callback;
}

$(document).ready( function() {
  var self = this;
  SendFileModal.init(function() {
    if (err) {
      console.log('[sendFileModal] Error: ' + err);
      return false
    }

    console.log("[sendFileModal.documentReady] Ran init for SendFileModal");
    return false;
  });
});
