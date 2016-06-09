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

  this.addBinListeners();
  // Need to bind binSocket to this somehow so we can watch .connected
}

BinSocketClient.prototype.close = function() {
  return this.binSocket.close();
};

BinSocketClient.prototype.addBinListeners = function() {
  var self = this;
  self.binListeners = true;
  var file;

  // Maybe we split these appart and only add stream listener when we're
  // actually waiting on a stream
  this.binSocket.on('stream', function(chunkStream, data){
    console.log('[socketClient.socket.file] Got file event from server');
    var id = data.id;
    var fileName = data.fileName;
    var chunkCount = data.chunkCount;
    var chunkNumber = data.chunkNumber;

    // Build an object locally to keep track of the parts of the file
    // if it doesn't exist
    var incomingFilesIsUndefined = typeof window.incomingFiles === 'undefined';
    if (incomingFilesIsUndefined) {
      window.incomingFiles = [];
      window.incomingFiles[id] = {
        fileName: fileName,
        chunksReceived: 0,
        chunkCount: chunkCount
      };
    }

    var parts = [];
    chunkStream.on('data', function(data) {
      parts.push(data);
    });


    // add each of the streamed chunks to an array in the correct order then
    // save that array as a file blob?

    chunkStream.on('end', function() {
      var self = this;
      console.log('[binSocketClient.addBinListeners] Got chunkStream END');
      file = new Blob(parts);
      self.reader = new FileReader();

      // This method causes a 'Maximum call stack size exceeded' for some reason
      function ab2str(buf) {
          return String.fromCharCode.apply(null, new Uint8Array(buf));
      }

      function _arrayBufferToBinary( buffer ) {
        var binary = '';
        var bytes = new Uint8Array( buffer );
        var len = bytes.byteLength;
        for (var i = 0; i < len; i++) {
          binary += String.fromCharCode( bytes[ i ] );
        }
        //return window.btoa( binary );
        return binary;
      }


      // Really should just update the kbpgp library to accept and decrypt buffers
      console.log('[binSocketClient.addBinListeners] Adding loadend event listener');

      self.reader.addEventListener('loadend', function() {
        //var encryptedFile = _arrayBufferToBinary(self.reader.result);
        var encryptedFile = self.reader.result;

        console.log('[binSocketClient.addBinListeners] About to decrypt message');

        // Really need to stream the downloaded file directly to disk then decrypt optionally
        // This would keep us from having to store the file in memory
        // Could also stream to a localStorage file

        encryptionManager.decryptFile({
          file: encryptedFile,
          keyRing: encryptionManager.keyRing
        }, function(err, fileBuffer) {
          if (err) {
            // Should alert the client of an error here
            return console.log('[binSocketClient.addBinListeners.end] Error decrypting message: ' + err);
          }

          // Initialize chunks array if it does not exist
          if (!window.incomingFiles[id].chunks) {
            window.incomingFiles[id].chunks = [];
          }

          // Save the chunk to local storage with a pointer in window.chunksReceived
          window.incomingFiles[id].chunksReceived++;
          console.log('[binSocketClient.addBinListeners] Decrypted message...');

          var chunkIndex = (chunkNumber - 1);

          window.incomingFiles[id].chunks[chunkIndex] = fileBuffer;

          if (window.incomingFiles[id].chunksReceived == chunkCount) {
            // Need to piece the file back together here before saving it
            var completeFileBlob = new Blob(window.incomingFiles[id].chunks);

            saveAs(completeFileBlob, fileName);

            // Close the binSocket connection since we're finished receiving the file
            console.log("[binSocketClient.addBinListeners] About to close self");
            this.close();
            console.log("[binSocketClient.addBinListeners] Closing binSocket as we're finished getting the file");

            return delete window.incomingFiles[id];
          };
        });
      });

      console.log("[socketClient.addBinListeners] Reading file as array buffer");
      self.reader.readAsArrayBuffer(file);
    });
  });
};

window.BinSocketClient = BinSocketClient;
