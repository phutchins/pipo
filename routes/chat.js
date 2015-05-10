// routes/chat.js

module.exports = function(app) {

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/:nickName', function(req, res) {
  var nick = req.param('nickName');
  res.render('chat.ejs', {
    nick : nick,
    pubkey : pubkey.replace(/(\r\n|\n|\r)/gm,"\\n"),
    privkey: privkey.replace(/(\r\n|\n|\r)/gm,"\\n")
  });
})

}
