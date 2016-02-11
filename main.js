// Main start script for PiPo

// Detect whether we are running inside of electron or nodejs
if (process.versions['electron']) {
  // Running inside of electron so run the client
  require('./client.js');
} else {
  // Running in node (or something else, should be more specific here) so load the server
  require('./server.js');
}
