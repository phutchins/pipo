'use strict'

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
var webServer;

//Globals
var SocketServer = require('./js/socketServer');

function Server(options) {
  var self = this;
  if (!(this instanceof Server)) {
    return new Server(options);
  }

  try {
    this.AdminCertificate = require('../config/adminData/adminCertificate');
  }
  catch (e) {
    console.log("Admin Certificate not yet configured, please run setup");
    process.exit(1);
  }

  //Application
  this.app = express();

  if (configPipo.server.ssl) {
    console.log('Creating HTTPS server for PiPo')
    this.webServer = https.createServer({key: configHttps.serviceKey, cert: configHttps.certificate}, this.app);
  } else {
    console.log('Creating HTTP server for PiPo')
    this.webServer = http.Server(this.app);
  }

  if (configPipo.binServer.ssl) {
    console.log('Creating HTTPS server for Binary Transfer');
    this.binWebServer = https.createServer({port: configPipo.binServer.port, key: configHttps.serviceKey, cert: configHttps.certificate});
  } else {
    console.log('Creating HTTP server for Binary Transfer');
    this.binWebServer = http.createServer();
  }

  this.io = socketIO(this.webServer);
  this.bs = BinaryServer({server: this.binWebServer});

  //Express
  this.app.set('views', path.join(__dirname, '../public/views'));
  this.app.set('view engine', 'jade');
  this.app.set('x-powered-by', false);

  //Middleware
  this.app.use(favicon(__dirname + '/../public/img/favicon.ico'));
  this.app.use(bodyParser.json());
  this.app.use(bodyParser.urlencoded({extended: true}));

  //Static assets
  // TODO: Change this to point to 'dist' folder and compile (copy) everything over to that?
  this.app.use(express['static'](path.join(__dirname, '../public')));

  //Logger
  //app.use(morgan('dev'));

  //L33t asci
  logger.debug('  __________.____________           ');
  logger.debug('  \\______   \\__\\______   \\____  ');
  logger.debug('   |     ___/  ||     ___/  _ \\    ');
  logger.debug('   |    |   |  ||    |  (  <_> )'    );
  logger.debug('   |____|   |__||____|   \\____/    ');
  logger.debug('');

  database.connect('development');

  // Initialize authentication framework
  AuthenticationManager.init(this.app);

  // Load routes
  var routePath = __dirname + '/routes/';
  var routes = [];

  logger.info("[SERVER] Loading routes...");

  fs.readdirSync(routePath).forEach(function(file) {
    var route = routePath + file;
    var routeName = file.split('.')[0];

    routes[routeName] = require(route)(self.app);
  });

  this.io.on('connection',function (socket) {
    logger.debug("Connection to io");
  });


  this.ioMain = this.io.of('/socket');

  /**
   * Handle server errors
   */
  this.webServer.on('error', function onError(error) {
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

  this.binWebServer.on('listening', function listening() {
    logger.info('[SERVER] Binary Server listening on %s', configPipo.binServer.port);
  });

  this.binWebServer.listen(configPipo.binServer.port);

  this.webServer.on('listening', function listening() {
    var addr = self.webServer.address();
    var bind = typeof addr === 'string'
      ? 'pipe ' + addr
      : 'port ' + addr.port;
    logger.info('[SERVER] Listening on ' + bind);
  });

  this.webServer.listen(configPipo.server.port);


  var serverConfig = {
    socket: this.ioMain,
    binSocket: this.bs,
    AdminCertificate: this.AdminCertificate
  };

  // Startup routine
  this.initServer(serverConfig);
}

Server.prototype.initServer = function(config) {
  var ioMain = config.socket;
  var bs = config.binSocket;
  var AdminCertificate = config.AdminCertificate;
  var socketServer = null;

  // Need to make this run an init method that then runs createSystemUser
  this.createSystemUser(function() {
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

/*
          binSocket.on('stream', function(stream, data) {
            //data.socketServer = self;

            logger.debug('[socketServer.onBinarySocketConnection.stream] Got sendFile socket event');

            data.fileBuffer = stream;

            FileManager.handleChunk(data);
          });
*/

          //var testFile = fs.createReadStream(__dirname + 'testFile');
          //binSocket.send(testFile);
          socketServer.onBinarySocketConnection(binSocket);
        });
        break;
      default:
        logger.info("Default not set up yet");
        break;
    }
  })
}

Server.prototype.createSystemUser = function(callback) {
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

module.exports = Server;
