require('../config/database');
var KeyPair = require('../models/keypair.js');
var User = require('../models/user.js');
var Keys = require('events').EventEmitter;

module.exports = function(app) {
  app.get('/key/publickey', function(req, res) {
    var timestamp = new Date().toString();
    var userName = req.param('userName');
    console.log("["+timestamp+"] [API] [GET] [/key/publickey] Getting publickey for user "+userName);
    User.findOne({ userNameLowerCase: userName.toLowerCase() }, function(err, user) {
      if (err) return console.log("[ERROR] Error getting user: "+err);
      if (user == null) {
        console.log("["+timestamp+"] publicKey for "+userName+"  not found");
        res.status(404).send();
      } else if (typeof user.publicKey != 'undefined') {
        console.log("["+timestamp+"] KeyPair found...");
        res.json({ publicKey: user.publicKey });
      } else {
        console.log("["+timestamp+"] Error while looking for publickey for "+userName);
        res.status(500).send();
      }
    });
  });
  app.post('/key/publickey', function(req, res) {
    // Accept users public key
    //TODO: Check to see if any master key needs to be regenerated
    var timestamp = new Date().toString();
    var userName = req.param('userName');
    var publicKey = req.param('publicKey');
    if (publicKey !== null && typeof publicKey !== 'undefined') {
      console.log("["+timestamp+"] Saving public key from user "+userName);
      User.findOne({ userName: userName }, function(err, user, count) {
        if (user === null) {
          console.log("["+timestamp+"] [DEBUG] (/key/publickey) User not found");
          new User({
            userName: userName,
            publicKey: publicKey
          }).save(function(err, user) {
            if (err) {
              res.status(500).send();
            } else {
            res.status(200).send();
            };
          });
        } else {
          user.publicKey = publicKey;
          user.save(function(err, user, count) {
            if (err) {
              console.log("Error saving publickey from "+userName+": "+err);
              return res.status(500).send();
            } else {
              console.log("["+timestamp+"] Saved publickey from "+userName);
              // TODO: run regenerateMasterKeyPair();

              //module.exports.emit('publickey updated', {data: { userName: userName }} );
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
        console.log("[MASTER KEY PAIR] user.masterKey: "+user.masterKey.toString());
        if (typeof user !== 'undefined' && user !== null) {
          res.json({ publicKey: user.masterKey.publicKey, privateKey: user.masterKey.encryptedPrivateKey, keyId: user.masterKey.id });
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
      privateKey = keyPair.privateKeyArmored;
      publicKey = keyPair.publicKeyArmored;
      var keyPair = {
        privateKey: privateKey,
        publicKey: publicKey
      }
      return callback(keyPair);
    }).catch(function(error) {
      console.log("[ROUTE KEYS] Error generating key pair: "+error);
    });
  }

  function showKeys(privateKey, publicKey) {
    console.log("PGP PrivKey: "+privatekey+" publicKey: "+publicKey);
  }
}
