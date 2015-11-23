/*
 * Register New User Modal Setup
 */
var buildRegisterModal = function() {
  console.log("Building register new user modal");

  $('.ui.modal.register').modal({
    detachable: true,
    //By default, if click outside of modal, modal will close
    //Set closable to false to prevent this
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
        //type : "regExp[^[a-z0-9_-]{3,16}$]",
        type : "empty",
        prompt : 'Please enter a properly formatted username'
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
        type: 'empty',
        prompt : 'You must enter an email address'
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
    //Hides modal on validation success
    $('.ui.modal.register').modal('hide');

    var errorDisplay = $('.register #createError');
    var username = $('.register.form .username').val().toString();
		var fullName = $('.register.form .name').val().toString();
    var password = $('.register.form .registerPassword').val().toString();
    var email = $('.register.form .email').val().toString();
    //var confirmPassword = $('.register .confirmPassword').val().toString();

    $('.ui.modal.generate').modal('show');

    ChatManager.disableChat();

    window.encryptionManager.generateClientKeyPair(2048, username, password, function(err, generatedKeypair) {
      if (err) {
        console.log("Error generating client keypair: "+err);
      } else {
        window.username = username;
        window.email = email;
        window.fullName = fullName;

        //console.log("[CHAT MANAGER] (promptForCredentials) username: "+username+" window.username: "+window.username);
        localStorage.setItem('username', username);
				localStorage.setItem('fullName', fullName);
        localStorage.setItem('keyPair', JSON.stringify(generatedKeypair));
        localStorage.setItem('email', email);
        //console.log("[CHAT MANAGER] (promptForCredentials) Saved clientKeyPair to localStorage");
        ChatManager.enableChat();
        socketClient.init();
      }
    });

	  event.preventDefault();
    return false;
  }
}

$(document).ready(function() {
	$('.ui.form.register').form(registerFormSettings);
});
