//Native node
var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');

//Modules
var express = require('express');
var socketIO = require('socket.io');
var openpgp = require('openpgp');
var favicon = require('serve-favicon');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var async = require('async');
var marked = require('marked');
var events = require('events');
var winston = require('winston');
var pgp = require('kbpgp');

//Configuration
var configMD = require('./config/markdown.js');
var configDB = require('./config/database.js');
var logger = require('./config/logger.js');
var configHttp = require('./config/http');
var configHttps = require('./config/https');

//Models
var KeyPair = require('./models/keypair');
var User = require('./models/user');
var Channel = require('./models/channel');
var KeyId = require('./models/keyid');

//Globals
var SocketServer = require('./socketServer')

//Application
var app = express();
var server = http.Server(app);
//var https_server = https.createServer({key: configHttps.serviceKey, cert: configHttps.certificate}, app);
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
app.use(express['static'](path.join(__dirname, 'public')));

//Logger
app.use(morgan('dev'));

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
})

io.on('connection',function (socket) {
  console.log("Connection to io");
  new SocketServer(ioMain).onSocket(socket);
});

var ioMain = io.of('/socket');

ioMain.on('connection', function(socket) {
  console.log("Connection to ioMain");
  new SocketServer(ioMain).onSocket(socket);
});

// Startup routine
start();

function start() {
  KeyPair.checkMasterKeyPairForAllUsers(function(err, response) {
    console.log("Checking master key pair for all users");
    if (err) { console.log("[START] Error checking master key for all users: "+err); };
    if (response == 'update') {
      console.log("Users keypair needs updating so generating new master key pair");
      generateMasterKeyPair(function(err, masterKeyPair, id) {
        console.log("[START] New master keyPair generated with id '"+id+"'");
        updateMasterKeyPairForAllUsers(masterKeyPair, id, function(err) {
          if (err) { return console.log("[START] Error encrypting master key for all users: "+err); };
          console.log("[START] Encrypted master key for all users!");
        });
      });
    } else if (response == 'ok') {
      console.log("All users master key matches current version");
      //io.emit('new master key', masterKeyPair);
    }
  });
};

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

//server.listen(configHttps.port);
server.listen(configHttp.port);
