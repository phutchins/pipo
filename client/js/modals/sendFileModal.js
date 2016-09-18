'use strict'
/*
 * Modal for sending a file to another user
 */

var ProgressBar = require('progressbar.js');

function SendFileModal(options) {
  if (!(this instanceof SendFileModal)) {
    return new SendFileModal(options);
  }

  this._options = options;
  this.bar = null;
}

SendFileModal.prototype.init = function init(managers) {
  var self = this;
  // Do we need to create and destroy this to avoid memory leak?
  this.chatManager = managers.chatManager;
  this.encryptionManager = managers.encryptionManager;
  this.fileManager = managers.fileManager;

  /*
  this.fileManager.init({
    chatManager: this.chatManager,
    encryptionManager: this.encryptionManager
  });
  */

  this.sendfileFormSettings = {
    fields: { },
    onSuccess: function() {
      console.log("[sendFileModal.init] Form success!");

      // Get the files object from the dom element
      var files = document.getElementById('sendfile-file-input').files;

      self.fileManager.readFiles(files, function(err) {
        if (err) {
          successCallback(err);
        }

        successCallback();
      });
      return false;
    }
  };

  console.log("[sendFileModal.init] Running init for sendFileModal");

  this.build(function() {
    console.log("[sendFileModal.init] Done building modal");
  });

  $('.ui.form.sendfile').form(this.sendfileFormSettings);

};

SendFileModal.prototype.finish = function(err) {
  if (err) {
    console.log('[sendFileModal] Error sending file: ' + err);
    return false;
  }

  console.log("[sendFileModal.documentReady] SendFileModal complete success");
  $('.modal.sendfile').modal('hide');
  return false;
};

SendFileModal.prototype.build = function build(callback) {
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
    self.show(function(data) {
      self.finish(e);
    });
  });
};

SendFileModal.prototype.showProgress = function() {
  var container = $('.sendfile .header .progress')[0];
  debugger;

  this.bar = new ProgressBar.Circle(container, {
		color: '#aaa',
		// This has to be the same size as the maximum width to
		// prevent clipping
		strokeWidth: 4,
		trailWidth: 1,
		easing: 'easeInOut',
		duration: 1400,
		text: {
			autoStyleContainer: false
		},
		from: { color: '#aaa', width: 1 },
		to: { color: '#333', width: 4 },
		// Set default step function for all animate calls
		step: function(state, circle) {
			circle.path.setAttribute('stroke', state.color);
			circle.path.setAttribute('stroke-width', state.width);

			var value = Math.round(circle.value() * 100);
			if (value === 0) {
				circle.setText('');
			} else {
				circle.setText(value);
			}

		}
	});
	this.bar.text.style.fontFamily = '"Raleway", Helvetica, sans-serif';
	this.bar.text.style.fontSize = '2rem';

};

SendFileModal.prototype.updateProgress = function(progress) {
	this.bar.animate(progress);  // Number from 0.0 to 1.0
};

SendFileModal.prototype.show = function show(callback) {
  var self = this;

  $('.modal.sendfile').modal('show');
  return callback;
};

module.exports = SendFileModal;
