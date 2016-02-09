// routes/chat.js

module.exports = function(app, pipo) {

  app.get('/', function(req, res) {
    var username = 'default';
    res.render('deps.jade', { depRoot: '' }, function(err, deps) {
      res.render('client.jade', {
        username : username,
        deps: deps
      });
    });
  });

  app.get('/:username', function(req, res) {
    var username = req.param('username');
    res.render('deps.jade', { depRoot: '' }, function(err, deps) {
      res.render('client.jade', {
        username : username,
        deps: deps
      });
    });
  })

}
