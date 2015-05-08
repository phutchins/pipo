var express = require('express');
var app = express();
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
var openpgp = require('openpgp');

var allClients = [];

app.set('view engine', 'ejs');
app.use(express['static'](path.join(__dirname, 'public')));

app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

var pubkey = '';
var privkey = '';

console.log("Generating Key Pair, please wait...");
console.time("genkeypair");
generateKeyPair(2048, "Test User <test@test.com>", "superawesomesecretpassphrase", function(keyPair) {
  console.log("KeyPair created...");
  console.timeEnd("genkeypair");
  //showKeys(keyPair.privkey, keyPair.pubkey);
});

app.get('/:nickName', function(req, res) {
  var nick = req.param('nickName');
  res.render('chat.ejs', {
    nick : nick,
    pubkey : pubkey.replace(/(\r\n|\n|\r)/gm,"\\n"),
    privkey: privkey.replace(/(\r\n|\n|\r)/gm,"\\n")
  });
})

io.on('connection', function(socket) {
  console.log("User connected!");
  socket.on('chat message', function(data) {
    var nick = data.nick;
    var pgpMessage = data.pgpMessage;
    console.log("Server got chat message from "+nick);
    io.emit('chat message', data);
    console.log("Server emitted chat message to users");
  });
  socket.on('join', function(data) {
    var nick = data.nick;
    socket.name = nick;
    client = socket;
    allClients.push(client);
    var channel = data.channel;
    var statusMessage = client.name+" has joined channel #"+channel;
    console.log(statusMessage);
    var data = {
      statusType: "JOIN",
      statusMessage: statusMessage
    };
    io.emit('chat status', data);
  });
  socket.on('disconnect', function() {
    var client = allClients.indexOf(socket);
    console.log("User disconnected...");
    var statusMessage = client.name+" has left the channel...";
    console.log("client: "+client);
    var statusData = {
      statusType: "PART",
      statusMessage: statusMessage
    }
    io.emit('chat status', statusData);
    allClients.splice(client, 1);
  });
});


function generateKeyPair(numBits, userId, passphrase, callback) {
  var options = {
    numBits: numBits,
    userId: userId,
    passphrase: passphrase
  }
  openpgp.generateKeyPair(options).then(function(keyPair) {
    privkey = keyPair.privateKeyArmored;
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
