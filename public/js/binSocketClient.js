'use strict'

var through = require('through');

function BinSocketClient(options) {
  if (!(this instanceof BinSocketClient)) {
    return new BinSocketClient(options);
  }

  this._options = options || {};

  var binServerProtocol = 'ws';


  var protocol = window.location.protocol;
  var binServerPort = 3031;

  if (protocol === 'https:') {
    binServerProtocol = 'wss';
    binServerPort = 8443;
  }

  var binServer = binServerProtocol + '://' + window.location.hostname + ':' + binServerPort;

  if (window.config) {
    var binServerHost = window.config.binServer.host;
    var binServerPort = window.config.binServer.port;

    var binServerProto = 'ws';

    if (window.config.binServer.ssl) {
      binServerProto = 'wss';
    }
  }

  console.log("Binary Server: " + binServer);

  this.binSocket = new BinaryClient(binServer);
  console.log("[socketClient.init] binSocket: ", this.binSocket);
  console.log("[socketClient.init] Connected to binServer at " + binServer);
}

BinSocketClient.prototype.close = function() {
  return this.binSocket.close();
};

BinSocketClient.prototype.getSocket = function() {
  return this.binSocket;
};

// Need to make this be able to handle multiple streams at one time (pass id or something)
// Could create a local listener with event emitter to wait for a id
BinSocketClient.prototype.listenForFileStream = function(callback) {
  this.binSocket.on('stream', function(fileStream, metadata) {
    callback(fileStream, metadata);
  });
};

module.exports = BinSocketClient;
