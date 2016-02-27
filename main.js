// Main start script for PiPo

// Detect whether we are running inside of electron or nodejs
if (process.versions['electron']) {
  // Running inside of electron so run the client
  console.log("Starting as Electron");
  require('./public/client.js');
} else {
  // Running in node (or something else, should be more specific here) so load the server
  console.log("Starting as Server");
  require('./server/server.js');
}
