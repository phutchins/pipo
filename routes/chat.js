// routes/chat.js

module.exports = function(app) {

  app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
  });

  app.get('/:nickName', function(req, res) {
    var userName = req.param('userName');
    res.render('chat.ejs', {
      userName : userName,
      //pubkey : pubkey.replace(/(\r\n|\n|\r)/gm,"\\n"),
    });
  })

}
