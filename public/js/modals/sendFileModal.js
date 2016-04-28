/*
 * Modal for sending a file to another user
 */

//var exports = module.exports = {};
var SendFileModal = {};

SendFileModal.init = function init(successCallback) {
  var self = this;

  readFileAndUpload = function readFileAndUpload(file) {
    var reader = new FileReader();
    var file = file;

    readSuccess = function readSuccess(evt) {
      //console.log("[sendFileModal.init] User submitted " + sendFiles.length + " files.");
      //for (var i = 0, numFiles = sendFiles.length; i < numFiles; i++) {
        //var file = sendFiles[i];
      var description = "this is the files description";
      var chatType = ChatManager.chats[ChatManager.activeChat].type;
      var filesProcessed = 0;
      // Should make this handle more than one file
      var toChatId = ChatManager.chats[ChatManager.activeChat].id;
      //var sendFiles = document.getElementById('sendfile-file-input').files;
      //
      //Should read in as binary or blob or somethign else
      var file = evt.target.result;
      var metadata = document.getElementById('sendfile-file-input').files[0];

      var fileData = {
        file: file,
        metadata: metadata,
        toChatId: toChatId,
        chatType: chatType,
        description: description
      };

      sendFile(fileData);
    };
  };

  readBlob = function readBlob() {
    files = document.getElementById('sendfile-file-input').files;

    if (!files.length) {
      return console.log('[sendFileModal.readblob] Need to select a file silly');
    }

    var file = files[0];
    var chunkSize = 512;
    var fileSize = file.size - 1;
    // Need to create start and stop dynamically instead
    //var start = parseInt(startByte) || 0;
    //var stop = parseInt(stopByte) || file.size - 1;
    var chunkCount = fileSize/chunkSize;
    var finalChunk = fileSize%chunkSize;
    var chunkRemainder = chunkCount % 1
    var wholeChunks = chunkCount - chunkRemainder;
    var currentChunk = 0;

    var reader = new FileReader();

    reader.onloadend = function(evt) {
      if (evt.target.readyState == FileReader.DONE) {
        console.log("Sending chunk");

        sendFile(evt.target.result);
      }
    };

    // While we are in a chunk range that is not longer than the file, keep sending chunks
    while (currentChunk <= wholeChunks) {
      // Otherwise, upload a whole chunk which is ( currentChunk * chunkSize )
      if (currentChunk < wholeChunks) {
        var start = ( currentChunk * chunkSize );
        var end = (( currentChunk  + 1 ) * chunkSize );
      };

      // If this is the last chunk, set final bytes to ( currentChunk * chunkSize ) + finalChunk
      if (currentChunk == wholeChunks) {
        var start = ( currentChunk * chunkSize );
        var end = ( currentChunk * chunkSize ) + finalChunk;
      };

      currentChunk++;

      debugger;

      var blob = file.slice(start, end);

      debugger;

      reader.readAsBinaryString(blob);
    };

    sendFile = function sendFile(fileData) {
      // Send file
      FileManager.sendFile(fileData, function(err) {
        if (err) {
          return console.log("[sendFileModal.init] Error processing file: " + err);
        }

        console.log("[sendFileModal.init] Got callback from FileManager.sendFile");

        // Should show progress, stats, etc... before closing this modal. Add upload button, cancel, and done
        $('.modal.sendfile').modal('hide');
      });
    };

    //reader.onload = readSuccess;

    // If it's an image read it as a data url so we can do fun things with it
    //if (file.type.match('image.*')) {
    //  reader.readAsDataURL(file);
    //} else {
    //  reader.readAsText(file);
    //}
  };

  var sendfileFormSettings = {
    fields: { },
    onSuccess: function() {
      console.log("[sendFileModal.init] Form success!");


      var file = document.getElementById('sendfile-file-input').files[0];

      //readFileAndUpload(file);
      readBlob();

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
