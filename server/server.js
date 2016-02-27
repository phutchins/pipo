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
var passport = require('passport');
var PublicKeyStrategy = require('passport-publickey');

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

// Authentication
passport.use(new PublicKeyStrategy(
  function(nonce, signature, done) {
    User.findByNonce(nonce, function (err, user) {
      if (err) { return done(err); }
      if (!user) { return done(null, false); }

      var verifier = crypto.createVerify("RSA-SHA256");
      verifier.update(nonceString);

      var publicKeyBuf = new Buffer(user.public_key, 'base64');

      var result = verifier.verify(publicKeyBuf, signature, "base64");

      if (result) {
        return done(null, user);
      } else {
        return done(null, false);
      }
    });
  }
));

// Startup routine
initServer();

function initServer() {
  var socketServer = null;

  createSystemUser(function() {
    switch (configPipo.encryptionStrategy) {
      // Use master shared key encryption (faster but slightly less secure possibly)
      case 'masterKey':
        logger.info("[START] Starting in MASTER KEY mode");
        ioMain.on('connection', function(socket) {
          logger.debug("Connection to ioMain");
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
          logger.debug("Connection to ioMain");
          socket.emit('certificate', AdminCertificate);
          socketServer = new SocketServer(ioMain).onSocket(socket);
        });
        break;
      default:
        logger.info("Default not set up yet");
        break;
    }
  })
}

function createSystemUser(callback) {
  User.create({
    username: 'pipo',
    email: 'pipo@pipo.chat',
    publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: OpenPGP.js v1.0.1\nComment: http://openpgpjs.org\n\nxsBNBFYHKFYBCAC2+gs6wGupdqKwAAHsNfTMqpBJkezYox9fRnHXBgkOzWty\nTzBdItmKRRBr7RCpeQ9nPS4WtEq6d3iUcP4MQmL35gou4mQIH6ClhVUAZykJ\niYXugvPgZXZl6qK8/k7EaLl2kAiYM0n9NSQhOGkZXAtH6MGw0gR4bhw7Dcp7\n3GSOMpgT/n4nBOWbiATKy9Kl3FrW5DrLkt8l0P3ocwVmGC418fkqJSkuNJR1\nFi87L2E2kEcn4EHL9Z4uVTI1mdBp9oLkriW2lMrR1aKMa/I5L5U6ayNALYnS\nNC7pieG3ZuxX7crFcaWa9krFinLSf6AxATQFLpJQLPLTF68yjYhNHzSDABEB\nAAHNDGZsaXBfZmlyZWZveMLAcgQQAQgAJgUCVgcoVwYLCQgHAwIJEKb6o/qa\nk5gaBBUIAgoDFgIBAhsDAh4BAABuWQf5AagTGdxjkpWreAEbqBcolqEIP8I5\nBIHsJcpDoI7VPKsrb4H0qLdE0YTIeD59yPBbs8NPPSh3veebMGU8fVr+5HoN\nQpg8JJImlSvTnZM83fpygsOrMzULgNIqsACDM933Bu34v43dodQ/1n7SN88c\nmpxJSzjoAJdMQ6ItFg6bsPp7Us9KfCeXBSNXHnuBrky9YqyIoAbBmi9mefzh\ngTRI2OnezCIGuNvu/fK2whgjK+qx831EVepqf8JM+IVfA22eZBq9wPFbYkof\n3q1yjuyGePPpn1uTZgQSlw/Ql/uuyQe66PxLuXm2eBrbzbPGdapllywThQ6j\nhfzSR5B6hyiPGM7ATQRWByhWAQgAwXw97JA9goeBP3K3FOb8TVLq/E/Vi13i\ndsrrc2A9D9g/ISCky9Ax211rCZg7IjzKWO7tNU14f25eOoD+pPKxC4iJkmVx\nAXQGIp744g7NmA0WhgzrnM/lId2OvypUihEMq5d3EFVO8g5DKhsRHHkReE6s\nmiagfKlhHT6epZu7lBhU3uUUtwfsdl/cbwpaZb27FeiKvp+5hL03de3g8v+v\nHO81XmS8q2wWOI2OR+419iYDlmXVD9NKxiDMRaJjCDbgJUsM82QgaTnG5WvZ\nAap5OzCL/AKfnN0KQgZsF9oxsl5izmGDuu6faAzO/hyDQ4EK3WwvFtzEtsK8\nGdS6l6ROjwARAQABwsBfBBgBCAATBQJWByhXCRCm+qP6mpOYGgIbDAAAAqIH\n/jLpXcPZhnwCYG3W/9XsAA3xMfzPAiYmv0NeWuLsovPvsOkQGgD6iPoNmdCm\nJrL8dYqmwUSAn+SELYYtLjGk/0XvgCi2l3I46mO4Z8of0cjyHRr6n2j7xRRb\nKRFOj3DTrhhqHSA/rXzrR+r8dT75/EUcIlQZ/3CiI4lF474c5+793DjyCXDC\nkZdurRkTA6UWT2fvnq4HqKlBMZEGMwO5keXMcaQL+mcZOCjgNJxwVqk6DtiY\ntUX8Tvo0QvbOaFhRMaKFqeMBlSrQZmzzBmTXYOBtupfxAFIqjYLqO2AsRXUr\nk8vffgzuYy6uRINhhTfz/iGKsQAVWAWzQ+ndSj86jRE=\n=83fL\n-----END PGP PUBLIC KEY BLOCK-----'
  }, function(err, data) {
    if (err) {
      return logger.error("[SERVER] Error creating system user: ",err);
    }
    callback();
  })
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
server.listen(configHttp.port);
