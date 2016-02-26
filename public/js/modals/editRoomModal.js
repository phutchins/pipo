/*
 * Edit a room
 */

var EditRoomModal = {};

EditRoomModal.init = function init(successCallback) {
  /*
   * Builds the edit room modal
   */
  var buildEditRoomModal = function() {
    $('.modal.editroom').modal({
      detachable: true,
      //By default, if click outside of modal, modal will close
      //Set closable to false to prevent this
      closable: false,
      transition: 'fade up',
      //Callback function for the submit button, which has the class of "ok"
      onApprove : function() {
        //Submits the semantic ui form
        //And pass the handling responsibilities to the form handlers, e.g. on form validation success
        $('.ui.form.editroom').submit();
        //Return false as to not close modal dialog
        return false;
      }
    });

    // Opens the edit room modal when edit room is clicked
    $('.chat-header__settings .room-options.edit-room').unbind().click(function(e) {
      var chatId = ChatManager.activeChat;
      var populateFormData = {
        id: chatId,
        name: ChatManager.chats[chatId].name,
        group: ChatManager.chats[chatId].group,
        topic: ChatManager.chats[chatId].topic,
        encryptionScheme: ChatManager.chats[chatId].encryptionScheme,
        keepHistory: ChatManager.chats[chatId].keepHistory,
        membershipRequired: ChatManager.chats[chatId].membershipRequired
      };

      // Reset the form before we show it
      $('.modal.editroom .form').trigger('reset');

      // Populate the fields of the form
      ChatManager.populateEditRoomModal(populateFormData);

      // Show modal
      $('.modal.editroom').modal('show');
    });
  };

  $(document).ready( buildEditRoomModal );

  var editRoomFormSettings = {
    onSuccess : function()
    {
      //Hides modal on validation success
      $('.modal.editroom').modal('hide');
      var data = {
        id: $('.ui.form.editroom input[name="id"]').val(),
        name: $('.ui.form.editroom input[name="name"]').val(),
        topic: $('.ui.form.editroom input[name="topic"]').val(),
        encryptionScheme: $('.ui.form.editroom .dropdown.encryptionscheme .selected').data().value,
        keepHistory: $('.ui.form.editroom .dropdown.keephistory .selected').data().value,
        membershipRequired: $('.ui.form.editroom .dropdown.membershiprequired .selected').data().value
      };
      console.log("Sending room update socket request with data:", data);
      socketClient.updateRoom(data, function(err) { if (err) {
          return console.log("Error creating room: " + err);
        }
        console.log("Sent request to update room " + data.name);
      })
      return false;
    },
    fields: {
      name: {
        identifier : 'name',
        rules: [
        {
          type   : 'empty',
          prompt : 'Please enter a valid room name'
        }
        ]
      },
      topic: {
        identifier : 'topic',
        //Below line sets it so that it only validates when input is entered, and won't validate on blank input
        optional   : true,
        rules: [
        {
          type   : 'empty',
          prompt : 'Please enter a valid room topic'
        }
        ]
      }
    }
  }

  // Binds the validation rules and form settings to the form
  $('.ui.form.editroom').form(editRoomFormSettings);
}

EditRoomModal.show = function show(callback) {
  var self = this;

  $('.modal.editroom').modal('show');
  //self.init(callback);
};

$(document).ready( function() {
  EditRoomModal.init(function() {
    console.log("[chatManager.document ready] Ran init for EditRoomModal");
  });
});

