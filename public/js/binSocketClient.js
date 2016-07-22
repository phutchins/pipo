'use strict'

var through = require('through');

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

BinSocketClient.prototype.getSocket = function() {
  return this.binSocket;
};

BinSocketClient.prototype.listenForFileStream = function(callback) {
  var self = this;
  // This should have a timeout for listening

  //self.binListeners = true;

  // Maybe we split these appart and only add stream listener when we're
  // actually waiting on a stream
  var buf = new Buffer([]);

  this.binSocket.on('stream', function(binStream, data) {
    /*
    var logger1 = through(function(data) {
      debugger;

      if (data.length % 4 !== 0) {
        debugger;
        data = Buffer.concat([data, Buffer(data.length % 4).fill(0)]);
      }

      this.queue(data);
    });

    var passthrough = stream.PassThrough();

    var transformer = through(function(data) {
      debugger;

      //var buffer = new Uint8Array(data);
      this.queue(data);
    });

    debugger;

    passthrough.pause();

    //binStream.pipe(transformer).pipe(passthrough);
    binStream.pipe(logger1).pipe(passthrough);
    //passthrough.pause();
    callback(passthrough, metadata);
    var logger = through(function(data) {
      debugger;
      this.queue(data);
    });
    */

    var id = data.id;
    var fileName = data.fileName;
    var chunkCount = data.chunkCount;
    var chunkNumber = data.chunkNumber;
    var encryptedKey = data.encryptedKey;
   // var iv = data.iv;
    var description = data.description;

/*
    var decipherData = {
      encryptedKey: encryptedKey,
      iv: iv
    };
*/

    //window.encryptionManager.getFileDecipher(decipherData, function(err, decipher) {
      // Build an object locally to keep track of the parts of the file
      // if it doesn't exist


    // Get first message from server with iv and encryptedKey
    // Create decipher
    // Reply with ready?
    // Listen for stream
    // pipe stream to decipher

			var keyRing = window.encryptionManager.keyRing;
			encryptedKey = data.encryptedKey;
			//iv = new Buffer(data.iv, 'hex');

      var sessionKey = new Buffer('93d1d1541a976333673935683f49b5e8', 'hex');
      var iv = new Buffer('27c3465f041e046a61a6f8dc01f0db3d', 'hex');


			// Add our own decrypted private key to the key manager so we can decrypt the key
/*
			if (window.encryptionManager.keyManager) {
				keyRing.add_key_manager(self.keyManager);
			};
*/

/*
			window.kbpgp.unbox({ keyfetch: keyRing, armored: encryptedKey }, function(err, literals) {
				if (err) {
					console.log('[encryptionManager.decryptFile] Error decrypting file: ',err);
				}

				var sessionKey = new Buffer(literals.toString(), 'hex');

				return callback(err, decipher);
			});
*/

      var decipher = nodeCrypto.createDecipheriv('aes-128-cbc', sessionKey, iv);

      var incomingFilesIsUndefined = typeof window.incomingFiles === 'undefined';
      if (incomingFilesIsUndefined) {
        window.incomingFiles = [];
        window.incomingFiles[id] = {
          fileName: fileName,
          chunksReceived: 0,
          chunkCount: chunkCount
        };
      }

      console.log('[fileManager.handleIncomingFileStream] Got file decipher, preparing to decrypt file');

      //var fileBuffer = new Buffer([], 'binary');

      //fileStream.resume();
      console.log('[fileManager.handleIncomingFileStream] Created fileBuffer, piping to decipher');


 //     binStream.resume();

      console.log('[fileManager.handleIncomingFileStream] Piped fileStream to decipher, waiting on data');

      debugger;
      binStream.on('data', function(data) {
        console.log('[fileManager.handleIncomingFileStream] Got some data from binStream, piping to decipher');
      }).pipe(decipher).on('data', function(data) {
        // Create hash to compare to the provided hash to ensure data integrity
        console.log('[fileManager.handleIncomingFileStream] Got on data from fileStream');

        //var dataString = data.toString('binary');

        debugger;

        //fileBuffer = Buffer.concat([fileBuffer, Buffer(dataString, 'binary')]);
      }).on('end', function() {
        var self = this;

        console.log('[binSocketClient.addBinListeners] Got fileStream END');

        // ******************************
        // Moev all of this to flip-stream and create a writer that we can steram to
        // ******************************

        debugger;
        var blob = new Blob([fileBuffer], { type: 'octet/stream' });
        var url = URL.createObjectURL(blob);
        window.open(url);
      });
    //});

  });

  //this.binSocket.on('stream', callback.bind(this));
  //callback(this.binSocket);
};

module.exports = BinSocketClient;
