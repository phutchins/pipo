var passport = require('passport');
//var passportPublicKey = require('passport-publickey');

module.exports = function(app) {
  app.post('/login',
    passport.authenticate('publickey', { failureRedirect: '/login' }),
    function(req, res) {
      console.log("IT WORKEEEDDDDD");
      return res.sendStatus(200);
    }
  );

  app.post('/sessiontest',
    passport.authenticate('keyverify', { session: false }),
    function(req, res) {
      console.log("Authentication worked!");
      return res.sendStatus(200);
    }
  );

  function isAuthenticated(req, res, next) {
    passport.authenticate('keyverify', { session: false }),

    function(req, res) {
      console.log("It worked!");
      return next();
    };

    //console.log("User is unauthenticated");
    //return res.sendStatus(401);
  };
};
