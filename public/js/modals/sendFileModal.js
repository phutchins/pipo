/*
 * Modal for sending a file to another user
 */

var exports = module.exports = {};

exports.init = function(successCallback) {

};

var build = function(callback) {
  var self = this;
  console.log("[sendFileModal.build] Building send file modal");

  $('.modal.sendfile').modal({
    detachable: true,
    closable: true,
    transition: 'fade up',
    onApprove: function() {
      $('.ui.form.sendfile').submit();
      return false;
    }
  });
  $('#sendfile-button').unbind().click(function(e) {
    $('.ui.form.sendfile').trigger('reset');
    $('.ui.form.createroom .field.error').removeClass('error');
    $('ui.form.sendfile.error').removeClass('error');
    self.show(function(data) {

    });
  });
};
