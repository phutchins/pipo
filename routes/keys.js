require('../config/database');
var KeyPair = require('../models/keypair.js');

module.exports = function(app) {
  app.post('/keys/pubkey', function(req, res) {
    // Accept users public key
    var userName = req.param('nick');
    var pubKey = req.param('pubkey');
    new KeyPair ({
      type: 'user',
      pubKey: pubKey,
    }).save( function( err, keyPair, count) {
      if (err) {
        console.log("Error saving pubkey from "+userName+":" err);
      };
      console.log("Saved pubkey from "+userName);
    });
  });

  function generateKeyPair(numBits, userId, passphrase, callback) {
    var options = {
      numBits: numBits,
      userId: userId,
      passphrase: passphrase
    }
    openpgp.generateKeyPair(options).then(function(keyPair) {
      privkey = keyPair.privateKeyArmored;
      pubkey = keyPair.publicKeyArmored;
      var keyPair = {
        privkey: privkey,
        pubkey: pubkey
      }
      return callback(keyPair);
    }).catch(function(error) {
      console.log("Error generating key pair: "+error);
    });
  }

  function showKeys(privkey, pubkey) {
    console.log("PGP PrivKey: "+privkey+" pubkey: "+pubkey);
  }
}
