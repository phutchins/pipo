require('../config/database');
var KeyPair = require('../models/keypair.js');
var User = require('../models/user.js');
var Keys = require('events').EventEmitter;

module.exports = function(app) {
  app.get('/key/pubkey', function(req, res) {
    var timestamp = new Date().toString();
    var username = req.param('username');
    console.log("["+timestamp+"] [API] [GET] [/key/pubkey] Getting pubkey for user "+username);
    User.findOne({ username: username }, function(err, user) {
      console.log("["+timestamp+"] [API] [DEBUG] Found user");
      if (user === null) {
        console.log("["+timestamp+"] pubKey for "+username+"  not found");
        //res.status(404).send("pubKey not found");
        // Might should return 404 here
        //res.json({ pubKey: '' });
        res.status(404).send();
      } else if (typeof user.pubKey != 'undefined') {
        console.log("["+timestamp+"] KeyPair found...");
        res.json({ pubKey: user.pubKey });
      } else {
        console.log("["+timestamp+"] Error while looking for pubkey for  "+username);
        res.status(500).send();
      }
    });
  });
  app.post('/key/pubkey', function(req, res) {
    // Accept users public key
    var timestamp = new Date().toString();
    var username = req.param('username');
    var pubKey = req.param('pubKey');
    if (pubKey !== null && typeof pubKey !== 'undefined') {
      console.log("["+timestamp+"] Saving public key from user "+username);
      User.findOne({ username: username }, function(err, user, count) {
        if (user === null) {
          console.log("["+timestamp+"] [DEBUG] (/key/pubkey) User not found");
          new User({
            username: username,
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
              console.log("Error saving pubkey from "+username+": "+err);
              return res.status(500).send();
            } else {
              console.log("["+timestamp+"] Saved pubkey from "+username);
              //module.exports.emit('pubkey updated', {data: { username: username }} );
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
    var username = req.param('username');
    User.findOne({ username: username }, function(err, user) {
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
          console.log("Didn't find masterKey encrypted to "+username);
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
