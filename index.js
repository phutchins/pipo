var express = require('express');
var app = express();
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
var openpgp = require('openpgp');

app.set('view engine', 'ejs');
app.use(express['static'](path.join(__dirname, 'public')));

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

var pubkey = '';

app.get('/:nickName', function(req, res) {
  var nick = req.param('nickName');
  res.render('chat.ejs', {
    nick : nick,
    pubkey : pubkey.replace(/(\r\n|\n|\r)/gm,"\\n")
  });
})

io.on('connection', function(socket) {
  generateKeyPair(2048, "Test User <test@test.com>", "superawesomesecretpassphrase", function(keyPair) {
    showKeys(keyPair.privkey, keyPair.pubkey);
  });
  console.log("User connected!");
  socket.on('chat message', function(msg) {
    io.emit('chat message', msg);
  });
  socket.on('disconnect', function() {
    console.log("User disconnected...");
  });
});


function generateKeyPair(numBits, userId, passphrase, callback) {
  var options = {
    numBits: numBits,
    userId: userId,
    passphrase: passphrase
  }
  openpgp.generateKeyPair(options).then(function(keyPair) {
    var privkey = keyPair.privateKeyArmored;
    pubkey = keyPair.publicKeyArmored;
    var keyPair = {
      privkey: privkey,
      pubkey: pubkey
    }
    return callback(keyPair);
  }).catch(function(error) {
    console.log("Error generating key pair: "+error);
  });
}

function showKeys(privkey, pubkey) {
  console.log("PGP PrivKey: "+privkey+" pubkey: "+pubkey);
}

http.listen(3030, function() {
  console.log('listening on *:3030');
});
