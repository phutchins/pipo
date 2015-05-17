require('../config/database');
var KeyPair = require('../models/keypair.js');
var User = require('../models/user.js');
var Keys = require('events').EventEmitter;

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
        res.json({ pubKey: user.pubKey });
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
    if (pubKey !== null && typeof pubKey !== 'undefined') {
      console.log("Saving public key from user "+userName);
      User.findOne({ userName: userName }, function(err, user, count) {
        if (user === null) {
          console.log("[DEBUG] (/key/pubkey) User not found");
          new User({
            userName: userName,
            pubKey: pubKey
          }).save(function(err, user) {
            if (err) {
              res.status(500).send();
            } else {
            res.status(200).send();
            };
          });
        } else {
          user.pubKey = pubKey;
          user.save(function(err, user, count) {
            if (err) {
              console.log("Error saving pubkey from "+userName+": "+err);
              return res.status(500).send();
            } else {
              console.log("Saved pubkey from "+userName);
              //module.exports.emit('pubkey updated', {data: { userName: userName }} );
              res.status(200).send();
            };
          });
        }
      });
    } else {
      console.log("Pub key is not defined");
      res.status(500).send();
    };
  });

  app.get('/key/masterKeyPair', function(req, res) {
    // Retrieve msater key encrypted to user that is requesting it if it exists
    var User = require('../models/user.js');
    var userName = req.param('userName');
    User.findOne({ userName: userName }, function(err, user) {
      if (err) {
        return res.status(500).send();
      } else {
        // Check to make sure user is found
        // If user not found, add user
        // If user does not have encryptedMasterPrivKey, generate new one for everyone
        if (typeof user !== 'undefined' && user !== null) {
          var encryptedMasterPrivKey = user.encryptedMasterPrivKey;
          var masterPubKey = user.masterPubKey;
          res.json({ pubKey: masterPubKey, privKey: encryptedMasterPrivKey });
        } else {
          console.log("Didn't find masterKey encrypted to "+userName);
          res.status(404).send();
        };
      }
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
