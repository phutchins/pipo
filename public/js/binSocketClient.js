'use strict'

function BinSocketClient(options) {
  if (!(this instanceof BinSocketClient)) {
    return new BinSocketClient(options);
  }

  this._options = options || {};

  var binServerProtocol = 'ws';
  var protocol = window.location.protocol;
  if (protocol === 'https') {
    binServerProtocol = 'wss';
  }

  var binServerPort = 3031;
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

  //this.addBinListeners();
  // Need to bind binSocket to this somehow so we can watch .connected
}

BinSocketClient.prototype.close = function() {
  return this.binSocket.close();
};

BinSocketClient.prototype.listenForFileStream = function(callback) {
  // This should have a timeout for listening

  //self.binListeners = true;

  // Maybe we split these appart and only add stream listener when we're
  // actually waiting on a stream

  this.binSocket.on('stream', function(stream, metadata) {
    debugger;
    /*
    stream.on('data', function(data) {
      console.log('Got Data');
    });
    */

    stream.pause();
    callback(stream, metadata);
  });

  //this.binSocket.on('stream', callback.bind(this));
  //callback(this.binSocket);
};

module.exports = BinSocketClient;
