require('../config/database');

module.exports = function(app) {
  app.post('/user/data', function(req, res) {
    var userName = req.param('userName');
    var fullName = req.param('fullName');
    var email = req.param('email');
  });
};
