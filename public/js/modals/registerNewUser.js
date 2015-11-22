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
    transition: 'fade up',
    //Callback function for the submit button, which has the class of "ok"
    onSuccess : function(event) {
      //Submits the semantic ui form
      //And pass the handling responsibilities to the form handlers, e.g. on form validation success
			console.log("Approved! Submitting registration form!");
      $('.ui.form.register').submit();

			$('.ui.button.register').unbind().click(function(e) {
				//Resets form input fields
				$('.ui.form.register').trigger("reset");
				//Resets form error messages
				$('.ui.form.register .field.error').removeClass( "error" );
				$('.ui.form.register.error').removeClass( "error" );
				$('.ui.modal.register').modal('show');
			});

      //Return false as to not close modal dialog
      return false;
    }
  });

	//$('.ui.button.register.submit').unbind().click(function(e) {
//		$('.ui.form.register').submit();
//		return false;
//	});
};

$(document).ready( buildRegisterModal );

//$('.ui.form.register').form({
//	fields: {
var registerFormValidationRules = {
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
		password : {
			identifier : 'password',
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
				type: 'match[password]',
				prompt : 'Your passwords do not match'
			}]
		}
	};
//});

var registerFormSettings = {
  inline: true,
  on: 'blur',
  debug: true,
  onFailure: function(event) {
		console.log("FAILURE!!!");
	},
  onSuccess : function(event) {
		console.log("Form submitted success 1!");
    //Hides modal on validation success
    $('.ui.modal.register').modal('hide');

    var errorDisplay = $('.create #createError');
    var username = $('.create.form #username').val().toString();
		var fullName = $('.register.form #name').val().toString();
    var password = $('.create.form #password').val().toString();
    var email = $('.create.form #email').val().toString();
    var confirmPassword = $('.create #confirmPassword').val().toString();

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

    return false;
	  event.preventDefault();
  }
}

$(document).ready(function() {
	$('.ui.form.register').form(registerFormValidationRules, registerFormSettings);
});

