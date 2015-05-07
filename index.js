var express = require('express');
var app = express();
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');

app.set('view engine', 'ejs');
app.use(express['static'](path.join(__dirname, 'public')));

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/:nickName', function(req, res) {
  var nick = req.param('nickName');
  res.render('chat.ejs', {
    nick : nick
  });
})

io.on('connection', function(socket) {
  console.log("User connected!");
  socket.on('chat message', function(msg) {
    io.emit('chat message', msg);
  });
  socket.on('disconnect', function() {
    console.log("User disconnected...");
  });
});

http.listen(3030, function() {
  console.log('listening on *:3030');
});
