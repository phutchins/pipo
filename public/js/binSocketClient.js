'use strict'

var through = require('through');

function BinSocketClient(options) {
  if (!(this instanceof BinSocketClient)) {
    return new BinSocketClient(options);
  }

  this._options = options || {};
  var protocol = window.location.protocol;

  var binServerProtocol = 'ws';
  // Need to set sane defaults for these or derive them from window.location
  var binServerHost = '';
  var binServerPort = '';

  if (window.config) {
    binServerHost = window.config.binClient.host;
    binServerPort = window.config.binClient.port;

    if (window.config.binClient.ssl) {
      binServerProtocol = 'wss';
    }
  }

  var binServer = binServerProtocol + '://' + window.location.hostname + ':' + binServerPort;

  console.log("Binary Server: " + binServer);

  this.binSocket = new BinaryClient(binServer);
  console.log("[binSocketClient.init] binSocket: ", this.binSocket);
  console.log("[binSocketClient.init] Connected to binServer at " + binServer);
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
