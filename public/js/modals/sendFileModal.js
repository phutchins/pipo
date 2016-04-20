/*
 * Modal for sending a file to another user
 */

//var exports = module.exports = {};
var SendFileModal = {};

SendFileModal.init = function init(successCallback) {
  var self = this;

  var sendfileFormSettings = {
    fields: { },
    onSuccess: function() {
      console.log("[sendFileModal.init] Form success!");

      // Should make this handle more than one file
      var toChatId = ChatManager.chats[ChatManager.activeChat].id;
      var sendFiles = document.getElementById('sendfile-file-input').files;
      var filesProcessed = 0;

      console.log("[sendFileModal.init] User submitted " + sendFiles.length + " files.");
      for (var i = 0, numFiles = sendFiles.length; i < numFiles; i++) {
        var file = sendFiles[i];
        var description = "this is the files description";

        console.log("[sendFileModal.init] Processing file number " + i);

        // Send file
        FileManager.sendFile({
          file: file,
          toChatId: toChatId,
          description: description
        }, function(err) {
          if (err) {
            return console.log("[sendFileModal.init] Error processing file: " + err);
          }
          filesProcessed++;
          console.log("[sendFileModal.init] Got callback from FileManager.sendFile");
          if (filesProcessed == numFiles) {
            console.log("[sendFileModal.init] Processed all files without error. Closing modal");
            // On successful start, hide the modal
            $('.modal.sendfile').modal('hide');
          }
        });
      }
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
    console.log("[sendFileModal.documentReady] Ran init for SendFileModal");
  });
});
