var passport = require('passport');

module.exports = function(app) {
  app.post('/user/data',
  passport.authenticate('keyverify', { session: false }),
  function(req, res) {
    var userName = req.param('userName');
    var fullName = req.param('fullName');
    var email = req.param('email');

    return res.sendStatus(404);
  });
};
