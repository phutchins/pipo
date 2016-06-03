function binSocketClient(options) {
  var self = this;

  if (!(this instanceof binSocketClient)) {
    return new binSocketClient(options);
  }

  var binServerProtocol = 'ws';
  var protocol = window.location.protocol;
  if (protocol == 'https') {
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
};

SocketClient.prototype.addBinListeners = function() {
  var self = this;
  self.binListeners = true;
  var file;

  this.binSocket.on('stream', function(chunkStream, data){
    console.log("[socketClient.socket.file] Got file event from server");
    var id = data.id;
    var fileName = data.fileName;
    var chunkCount = data.chunkCount;
    var chunkNumber = data.chunkNumber;

    // Build an object locally to keep track of the parts of the file
    // if it doesn't exist
    var incomingFilesIsUndefined = typeof window.incomingFiles == 'undefined';
    if (incomingFilesIsUndefined) {
      window.incomingFiles = [];
      window.incomingFiles[id] = {
        fileName: fileName,
        chunksReceived: 0,
        chunkCount: chunkCount
      }
    }

    var parts = [];
    chunkStream.on('data', function(data) {
      parts.push(data);
    });

    function ab2str(buf) {
        return String.fromCharCode.apply(null, new Uint8Array(buf));
    }

    // add each of the streamed chunks to an array in the correct order then
    // save that array as a file blob?

    chunkStream.on('end', function() {
      file = new Blob(parts);
      var reader = new FileReader();

      // Really should just update the kbpgp library to accept and decrypt buffers
      reader.addEventListener('loadend', function() {
        var encryptedFile = ab2str(reader.result);
        encryptionManager.decryptMessage({
          encryptedMessage: encryptedFile,
          keyRing: encryptionManager.keyRing
        }, function(err, results) {
          // Save the chunk to local storage with a pointer in window.chunksReceived
          //
          window.incomingFiles[id].chunksReceived++;

          // Initialize chunks array if it does not exist
          if (!window.incomingFiles[id].chunks) {
            window.incomingFiles[id].chunks = [];
          };

          var chunkIndex = (chunkNumber - 1);
          window.incomingFiles[id].chunks[chunkIndex] = results;

          if (window.incomingFiles[id].chunksReceived == chunkCount) {
            // Need to piece the file back together here before saving it
            var completeFileBlob = new Blob(window.incomingFiles[id].chunks)

            saveAs(completeFileBlob, fileName);

            return delete window.incomingFiles[id];
          };
        });
      });

      console.log("[socketClient.addBinListeners] Reading file as array buffer");
      reader.readAsArrayBuffer(file);
    });
  });
};

