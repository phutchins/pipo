// Main start script for PiPo
//
//require('dotenv').config({ path: __dirname });
//process.env.MYENV = process.env.NODE_ENV;
//process.env.MYDIR = __dirname;
var env = require('./env');

// Detect whether we are running inside of electron or nodejs
if (process.versions['electron']) {
  // Running inside of electron so run the client
  // Set the environment here (should be much smarter than this)
  process.env.NODE_ENV = env.environment;

  console.log("Starting as Electron");
  require('./public/client.js');
} else {
  // Running in node (or something else, should be more specific here) so load the server
  console.log("Starting as Server");
  require('./server/server.js');
}
