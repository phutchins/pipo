// Main start script for PiPo
//
var env = require('./env');

// Detect whether we are running inside of electron or nodejs
if (process.versions['electron']) {
  // Running inside of electron so run the client
  // Set the environment here (should be much smarter than this)
  process.env.NODE_ENV = 'production';
  process.env.NODE_ENV = env.environment;

  console.log("Starting as Electron");
  console.log('process.env', process.env);
  require('./public/client.js');
} else {
  // Running in node (or something else, should be more specific here) so load the server
  console.log("Starting as Server");
  require('./server/server.js')();
}
