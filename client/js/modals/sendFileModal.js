'use strict'
/*
 * Modal for sending a file to another user
 */

var ProgressBar = require('progressbar.js');

function SendFileModal(options) {
  if (!(this instanceof SendFileModal)) {
    return new SendFileModal(options);
  }

  console.log('Running constructor for sendFileModal');

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
          self.finish(err);
        }

        self.finish();
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

  console.log('[sendFileModal.documentReady] SendFileModal complete success');
  //$('.modal.sendfile').modal('hide');
  // Reset the modal view to done mode
  this.setStatus('done');
  return false;
};

SendFileModal.prototype.setStatus = function(status) {

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
    self.show();
  });
};

SendFileModal.prototype.showProgress = function(callback) {
  //var container = $('.sendfile .progress')[0];
  var self = this;

  this.bar = new ProgressBar.Line(progress, {
    strokeWidth: 4,
    easing: 'easeInOut',
    duration: 10,
    color: '#FFEA82',
    trailColor: '#eee',
    trailWidth: 1,
    svgStyle: { width: '100%', height: '100%'},
    text: {
      style: {
        color: '#999',
        position: 'absolute',
        right: '0',
        top: '30px',
        padding: 0,
        margin: 0,
        transform: null
      },
      autoStyleContainer: false
    },
    from: { color: '#FFEA82' },
    to: { color: '#ED6A5A' },
    // Set default step function for all animate calls
    step: function(state, bar) {
      bar.setText(Math.round(bar.value() * 100) + ' %');
    }
  });

  //this.bar.text.style.fontFamily = '"Raleway", Helvetica, sans-serif';
  //this.bar.text.style.fontSize = '2rem';

  return callback();
};

SendFileModal.prototype.updateProgress = function(progress) {
  var self = this;
  console.log('Updating progress to %s', progress);
  self.bar.animate(progress);  // Number from 0.0 to 1.0
};

SendFileModal.prototype.show = function show(callback) {

  $('.modal.sendfile').modal('show');
};

module.exports = SendFileModal;
