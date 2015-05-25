//Native node
var fs = require('fs');
var https = require('https');
var path = require('path');

//modules
var socketIO = require('socket.io');
var express = require('express');
var bodyParser = require('body-parser');
var favicon = require('serve-favicon');
var openpgp = require('openpgp');
var mongoose = require('mongoose');
var morgan = require('morgan');
var async = require('async');
var marked = require('marked');
var events = require('events');
var winston = require('winston');
var pgp = require('kbpgp');

//configuration
var configMD = require('./config/markdown');
var configDB = require('./config/database');
var logger = require('./config/logger');
var configHttps = require('./config/https');

//Models
var KeyPair = require('./models/keypair');
var User = require('./models/user');

//Globals
var SocketServer = require('./socketServer');

//Application
var app = express();
var server = https.createServer({key: configHttps.serviceKey, cert: configHttps.certificate}, app);
var io = socketIO(server);

//Express
app.set('view engine', 'ejs');
//app.set('view cache', true);
app.set('x-powered-by', false);

//Middleware
app.use(favicon(__dirname + '/public/img/favicon.ico'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

//Static assets
app.use(express.static(path.join(__dirname, 'public')));

//Logger
app.use(morgan('dev'));

// Database
var connectWithRetry = function() {
  return mongoose.connect(configDB.url, function(err) {
    if (err) {
      console.error('Failed to connect to mongo on startup - retrying in 5 sec', err);
      setTimeout(connectWithRetry, 5000);
    }
  });
};
connectWithRetry();

// Load routes
var routePath = './routes/';
var routes = [];
fs.readdirSync(routePath).forEach(function(file) {
  var route = routePath+file;
  routeName = file.split('.')[0]
  console.log("[SERVER] Loading route: "+routeName);
  routes[routeName] = require(route)(app);
});

io.on('connection', function(socket) {
  console.log("[CONNECTION] Got connection to default socket");
});

var ioMain = io.of('/socket');

ioMain.on('connection',function (socket) {
  new SocketServer(ioMain).onSocket(socket);
});

generateOrLoadKeyPair(2048, 'master keypair', 'pipo', function(err, newMasterKeyPair) {
  console.log(err, !!newMasterKeyPair);
});

function generateOrLoadKeyPair(numBits, userId, passphrase, callback) {
  var keypair;

  try {
    keypair = JSON.parse(fs.readFileSync(__dirname + "/config/pgpKeys.json"));
    return callback(null, keypair);
  }
  catch (e) {
    console.log("Error reading keys, generating new ones instead", e);
    var options = {
      numBits: numBits,
      userId: userId,
      passphrase: passphrase
    };
    var timestamp = Date().toString();
    console.log("[" + timestamp + "] [GENERATE KEY PAIR] generating keypair now...");
    openpgp.generateKeyPair(options).then(function (keyPair) {
      var timestamp = Date().toString();
      console.log("[" + timestamp + "] [GENERATE KEY PAIR] in generateKeyPair then");
      keyPair = {
        privKey: keyPair.privateKeyArmored,
        pubKey: keyPair.publicKeyArmored
      };
      fs.writeFileSync(__dirname + "/config/pgpKeys.json", JSON.stringify(keyPair));
      return callback(null, keyPair);
    }).catch(function (err) {
      console.log("Error generating key pair: " + err);
      return callback(err, null);
    });
  }
}

function showKeys(privkey, pubkey) {
  console.log("PGP PrivKey: "+privkey+" pubkey: "+pubkey);
}

/**
 * Handle server errors
 */
server.on('error', function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error('[SERVER] ' + bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error('[SERVER] ' + bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
});

server.on('listening', function listening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  console.log('[SERVER] Listening on ' + bind);
});

server.listen(configHttps.port);
