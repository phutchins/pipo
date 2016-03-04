// routes/chat.js

module.exports = function(app, pipo) {

  // Serve the client code to the user
  app.get('/', function(req, res) {
    var username = 'default';

    res.render('preDeps.jade', { depRoot: '' }, function(err, preDeps) {
      if (err) { return console.log("Failed to render preDeps: " + err); }

      var preDeps = preDeps;

      res.render('postDeps.jade', { depRoot: '' }, function(err, postDeps) {
        if (err) { return console.log("Failed to render postDeps: " + err); }

        var postDeps = postDeps;

        res.render('client.jade', {
          username : username,
          preDeps: preDeps,
          postDeps: postDeps
        });
      });
    });
  });

  // Send the client code to the user
  // is this used?
  /*
  app.get('/:username', function(req, res) {
    var username = req.param('username');

    console.log("THIS IS USED!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

    res.render('preDeps.jade', { depRoot: '' }, function(err, preDeps) {
      if (err) { return console.log("Failed to render preDeps: " + err); }

      res.render('postDeps.jade', { depRoot: '' }, function(err, postDeps) {
        if (err) { return console.log("Failed to render postDeps: " + err); }

        res.render('client.jade', {
          username : username,
          preDeps: preDeps,
          postDeps: postDeps
        });
      });
    });
  })
  */

}
