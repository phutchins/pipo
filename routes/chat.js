// routes/chat.js

module.exports = function(app, pipo) {

  app.get('/', function(req, res) {
    var username = 'default';
    res.render('client.ejs', {
      username : username,
      //pubkey : pubkey.replace(/(\r\n|\n|\r)/gm,"\\n"),
    });
  });

  app.get('/:username', function(req, res) {
    var username = req.param('username');
    res.render('client.ejs', {
      username : username,
      //pubkey : pubkey.replace(/(\r\n|\n|\r)/gm,"\\n"),
    });
  })

}
