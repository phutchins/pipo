// routes/chat.js

module.exports = function(app, pipo) {

  app.get('/', function(req, res) {
    var userName = 'default';
    res.render('chat.ejs', {
      userName : userName,
      //pubkey : pubkey.replace(/(\r\n|\n|\r)/gm,"\\n"),
    });
  });

  app.get('/:userName', function(req, res) {
    var userName = req.param('userName');
    res.render('chat.ejs', {
      userName : userName,
      //pubkey : pubkey.replace(/(\r\n|\n|\r)/gm,"\\n"),
    });
  })

}
