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
var configPipo = require('./config/pipo');
var configMD = require('./config/markdown');
var configDB = require('./config/database');
var logger = require('./config/logger');
var configHttp = require('./config/http');
var configHttps = require('./config/https');

//Models
var KeyPair = require('./models/keypair');
var User = require('./models/user');
var Channel = require('./models/channel');
var KeyId = require('./models/keyid');

//Globals
var SocketServer = require('./socketServer');

try {
  var AdminCertificate = require('./adminData/adminCertificate');
}
catch (e) {
  console.log("Admin Certificate not yet configured, please run setup");
  process.exit(1);
}

//Application
var app = express();
//var server = http.Server(app);
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
app.use(express['static'](path.join(__dirname, 'public')));

//Logger
//app.use(morgan('dev'));

//L33t asci
console.log('  __________.____________           ');
console.log('  \\______   \\__\\______   \\____  ');
console.log('   |     ___/  ||     ___/  _ \\    ');
console.log('   |    |   |  ||    |  (  <_> )'    );
console.log('   |____|   |__||____|   \\____/    ');
console.log('');

var connectWithRetry = function() {
  return mongoose.connect(configDB.url, function(err) {
    if (err) {
      logger.error('Failed to connect to mongo on startup - retrying in 5 sec', err);
      setTimeout(connectWithRetry, 5000);
    }
  });
};
connectWithRetry();

// Load routes
var routePath = './routes/';
var routes = [];
fs.readdirSync(routePath).forEach(function(file) {
  var route = routePath + file;
  var routeName = file.split('.')[0];
  logger.info("[SERVER] Loading route", routeName);
  routes[routeName] = require(route)(app);
});

io.on('connection',function (socket) {
  logger.info("Connection to io");
});

var ioMain = io.of('/socket');

// Startup routine
initServer();

function initServer() {
  var socketServer = null;
  switch (configPipo.encryptionStrategy) {
    // Use master shared key encryption (faster but slightly less secure possibly)
    case 'masterKey':
      logger.info("[START] Starting in MASTER KEY mode");
      ioMain.on('connection', function(socket) {
        logger.info("Connection to ioMain");
        socket.emit('certificate', AdminCertificate);
        socketServer = new SocketServer(ioMain);
        socketServer.onSocket(socket);
        //socketServer.start();
      });
      //new SocketServer(ioMain).start();
      break;
      // Use multi client key encryption (slower but a tad more secure)
    case 'clientKey':
      logger.info("[START] Starting in CLIENT KEY mode");
      ioMain.on('connection', function(socket) {
        logger.info("Connection to ioMain");
        socket.emit('certificate', AdminCertificate);
        socketServer = new SocketServer(ioMain).onSocket(socket);
      });
      break;
    default:
      logger.info("Default not set up yet");
      break;
  }
}

/**
 * Handle server errors
 */
server.on('error', function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var port = configHttp.port;
  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      logger.error('[SERVER] ' + bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      logger.error('[SERVER] ' + bind + ' is already in use.');
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
  logger.info('[SERVER] Listening on ' + bind);
});

//https_server.listen(configHttps.port);
server.listen(configHttp.port);
