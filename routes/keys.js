require('../config/database');
var KeyPair = require('../models/keypair.js');

module.exports = function(app) {
  app.get('/keys/pubkey', function(req, res) {
    var userName = req.param('userName');
    KeyPair.findOne({ type: 'user', user: userName }, function(err, keyPair) {
      if (keyPair == null) {
        res.send(404, "Not found").end();
      } else if (typeof keyPair.pubKey != 'undefined') {
        res.json({ data: keyPair.pubKey });
      }
    });
  });
  app.post('/keys/pubkey', function(req, res) {
    // Accept users public key
    var userName = req.param('userName');
    var pubKey = req.param('pubKey');
    new KeyPair ({
      type: 'user',
      pubKey: pubKey,
    }).save( function( err, keyPair, count) {
      if (err) {
        console.log("Error saving pubkey from "+userName+": "+err);
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
