var passport = require('passport');

module.exports = function(app) {
  app.post('/login',
    passport.authenticate('publicKey', { failureRedirect: '/login' }),
    function(req, res) {
      res.redirect('/');
    }
  );
};
