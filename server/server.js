//Native node
var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');

//Modules
var express = require('express');
var socketIO = require('socket.io');
var favicon = require('serve-favicon');
var bodyParser = require('body-parser');
var morgan = require('morgan');
var async = require('async');
var marked = require('marked');
var events = require('events');
var winston = require('winston');
var pgp = require('kbpgp');
var crypto = require('crypto');
var btoa = require('btoa');
var BinaryServer = require('binaryjs').BinaryServer;

// Managers
var AuthenticationManager = require('./js/managers/authentication');

//Local modules
var database = require('./js/database');

//Configuration
var configPipo = require('../config/pipo')();
var configMD = require('../config/markdown');
var logger = require('../config/logger');
var configHttp = require('../config/http');
var configHttps = require('../config/https');

//Models
var KeyPair = require('./models/keypair');
var User = require('./models/user');
var KeyId = require('./models/keyid');

//Globals
var SocketServer = require('./js/socketServer');

try {
  var AdminCertificate = require('../config/adminData/adminCertificate');
}
catch (e) {
  console.log("Admin Certificate not yet configured, please run setup");
  process.exit(1);
}

//Application
var app = express();

if (configPipo.server.ssl) {
  var server = https.createServer({key: configHttps.serviceKey, cert: configHttps.certificate}, app);
} else {
  var server = http.Server(app);
}

var io = socketIO(server);
//var bs = BinaryServer({server: binServer});
var bs = BinaryServer({port: 3031});

//Express
app.set('views', path.join(__dirname, '../public/views'));
app.set('view engine', 'jade');

app.set('x-powered-by', false);

//Middleware
app.use(favicon(__dirname + '/../public/img/favicon.ico'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

//Static assets
// TODO: Change this to point to 'dist' folder and compile (copy) everything over to that?
app.use(express['static'](path.join(__dirname, '../public')));

//Logger
//app.use(morgan('dev'));

//L33t asci
console.log('  __________.____________           ');
console.log('  \\______   \\__\\______   \\____  ');
console.log('   |     ___/  ||     ___/  _ \\    ');
console.log('   |    |   |  ||    |  (  <_> )'    );
console.log('   |____|   |__||____|   \\____/    ');
console.log('');

database.connect('development');

// Initialize authentication framework
AuthenticationManager.init(app);

// Load routes
var routePath = __dirname + '/routes/';
var routes = [];
logger.info("[SERVER] Loading routes...");
fs.readdirSync(routePath).forEach(function(file) {
  var route = routePath + file;
  var routeName = file.split('.')[0];
  logger.debug("[SERVER] Loading route", routeName);
  routes[routeName] = require(route)(app);
});

io.on('connection',function (socket) {
  logger.debug("Connection to io");
});


var ioMain = io.of('/socket');


// Startup routine
initServer();

function initServer() {
  var socketServer = null;

  // Need to make this run an init method that then runs createSystemUser
  createSystemUser(function() {
    var socketServer;
    switch (configPipo.encryptionStrategy) {
      // Use master shared key encryption (faster but slightly less secure possibly)
      case 'masterKey':
        logger.info("[START] Starting in MASTER KEY mode");

        socketServer = new SocketServer(ioMain);

        ioMain.on('connection', function(socket) {
          logger.debug("[server] Connection to ioMain");
          socket.emit('certificate', AdminCertificate);
          socketServer.onSocket(socket);
        });


        break;
        // Use multi client key encryption (slower but a tad more secure)
      case 'clientKey':
        logger.info("[START] Starting in CLIENT KEY mode");

        socketServer = new SocketServer(ioMain);

        ioMain.on('connection', function(socket) {
          logger.debug("Connection to ioMain");
          socket.emit('certificate', AdminCertificate);
          socketServer.onSocket(socket);
        });

        bs.on('connection', function(binSocket) {
          logger.debug("[server] Got binary client connection");
          logger.debug("[server.bs.on] binSocket is: " + binSocket);

          //var testFile = fs.createReadStream(__dirname + 'testFile');
          //binSocket.send(testFile);
          socketServer.onBinarySocket(binSocket);
        });
        break;
      default:
        logger.info("Default not set up yet");
        break;
    }
  })
}

function createSystemUser(callback) {
  logger.debug('[server.createSystemUser] Running create system user...');
  fs.readFile(__dirname + '/../keys/pipo.key', function(err, pipoPrivateKey) {
    var pipoPrivateKey = pipoPrivateKey;
    fs.readFile(__dirname + '/../keys/pipo.pub', function(err, pipoPublicKey) {
      var pipoPublicKey = pipoPublicKey;
      User.create({
        username: 'pipo',
        email: 'pipo@pipo.chat',
        publicKey: pipoPublicKey
      }, function(err, data) {
        if (err) {
          return logger.error("[SERVER] Error creating system user: ",err);
        }
        callback();
      })
    });
  });
};


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
server.listen(configPipo.server.port);
//binServer.listen(3031);
