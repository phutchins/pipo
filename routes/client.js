// routes/chat.js

module.exports = function(app, pipo) {

  app.get('/', function(req, res) {
    var username = 'default';
    res.render('preDeps.jade', { depRoot: '' }, function(err, preDeps) {
      res.render('postDeps.jade', { depRoot: '' }, function(err, postDeps) {
        res.render('client.jade', {
          username : username,
          preDeps: preDeps,
          postDeps: postDeps
        });
      });
    });
  });

  app.get('/:username', function(req, res) {
    var username = req.param('username');
    res.render('preDeps.jade', { depRoot: '' }, function(err, preDeps) {
      res.render('postDeps.jade', { depRoot: '' }, function(err, postDeps) {
        res.render('client.jade', {
          username : username,
          preDeps: preDeps,
          postDeps: postDeps
        });
      });
    });
  })

}
