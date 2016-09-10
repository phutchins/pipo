// Modals
var FileManager = require('../js/files/index.js');

window.FileManager = FileManager;
var registerUserPrompt = require('../js/modals/registerUserPrompt.js');
var unlockClientKeyPairModal = require('../js/modals/unlockClientKeyPairModal.js');
var createRoomModal = require('../js/modals/createRoomModal.js');
var editRoomModal = require('../js/modals/editRoomModal.js');
var sendFileModal = require('../js/modals/sendFileModal.js');

// Misc
var nodeCrypto = require('crypto-browserify');
var stream = require('stream-browserify');

window.nodeCrypto = nodeCrypto;
window.stream = stream;

// Managers
var EncryptionManager = require('../js/encryption/index.js');
var socketClient = require('../js/network/socketClient.js');
