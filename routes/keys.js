require('../config/database');
var KeyPair = require('../models/keypair.js');
var User = require('../models/user.js');

module.exports = function(app) {
  app.get('/key/pubkey', function(req, res) {
    var userName = req.param('userName');
    User.findOne({ userName: userName }, function(err, user) {
      if (user === null) {
        console.log("pubKey not found");
        //res.status(404).send("pubKey not found");
        res.json({ pubKey: '' });
      } else if (typeof user.pubKey != 'undefined') {
        console.log("KeyPair found...");
        res.json({ pubKey: keyPair.pubKey });
      } else {
        console.log("User "+userName+" does not seem to have a pubKey");
        res.status(404).send();
      }
    });
  });
  app.post('/key/pubkey', function(req, res) {
    // Accept users public key
    var userName = req.param('userName');
    var pubKey = req.param('pubKey');
    console.log("Saving public key from user "+userName);
    new KeyPair ({
      type: 'user',
      userName: userName,
      pubKey: pubKey,
    }).save( function( err, keyPair, count) {
      if (err) {
        console.log("Error saving pubkey from "+userName+": "+err);
        return res.status(500).send();
      };
      console.log("Saved pubkey from "+userName);
      res.status(200).send();
    });
  });

  app.get('/key/masterKeyPair', function(req, res) {
    // Retrieve msater key encrypted to user that is requesting it if it exists
    var User = require('../models/user.js');
    var userName = req.param('userName');
    User.findOne({ userName: userName }, function(err, user) {
      if (err) { res.status(500).send(); };
      // Check to make sure user is found
      // If user not found, add user
      // If user does not have encryptedMasterPrivKey, generate new one for everyone
      var encryptedMasterPrivKey = user.encryptedMasterPrivKey;
      var masterPubKey = user.masterPubKey;
      if (typeof user !== 'undefined' && user !== null) {
        res.json({ pubKey: masterPubKey, privKey: encryptedMasterPrivKey }).send();
      } else {
        console.log("Didn't find masterKey encrypted to "+userName);
        res.status(404).send();
      };
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
