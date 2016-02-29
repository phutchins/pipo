var passport = require('passport');
//var passportPublicKey = require('passport-publickey');

module.exports = function(app) {
  app.post('/login',
    passport.authenticate('publickey', { failureRedirect: '/login' }),
    function(req, res) {
      console.log("IT WORKEEEDDDDD");
      res.redirect('/');
    }
  );
};
