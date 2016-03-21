require('../../config/database');
var passport = require('passport');

module.exports = function(app) {
  app.get('/membership/userlist/:channel', passport.authenticate('keyverify', { session: false }), function(req, res) {

  });
};
