require('../../config/database');
var KeyPair = require('../models/keypair.js');
var User = require('../models/user.js');
var Keys = require('events').EventEmitter;
var logger = require('../../config/logger');
var passport = require('passport');

module.exports = function(app) {
  app.get('/key/publickey', function(req, res) {
    var timestamp = new Date().toString();
    var username = req.param('username');
    logger.debug("[API] [GET] [/key/publickey] Getting publickey for user "+username);
    User.findOne({ username: username }, function(err, user) {
      if (err) return logger.info("[ERROR] Error getting user: "+err);
      if (user == null) {
        logger.error("["+timestamp+"] publicKey for "+username+"  not found");
        res.status(404).send();
      } else if (typeof user.publicKey != 'undefined') {
        logger.debug("KeyPair found...");
        res.json({ publicKey: user.publicKey });
      } else {
        logger.error("[API] [GET] Error while looking for publickey for "+username);
        res.status(500).send();
      }
    });
  });
  app.post('/key/publickey',
    passport.authenticate('keyverify', { session: false }),
    function(req, res) {
    // Accept users public key
    //TODO: Check to see if any master key needs to be regenerated
    var timestamp = new Date().toString();
    var username = req.param('username');
    var publicKey = req.param('publicKey');
    if (publicKey !== null && typeof publicKey !== 'undefined') {
      logger.info("["+timestamp+"] Saving public key from user "+username);
      User.findOne({ username: username }, function(err, user, count) {
        if (user === null) {
          logger.info("["+timestamp+"] [DEBUG] (/key/publickey) User not found");
          new User({
            username: username,
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
              logger.info("Error saving publickey from "+username+": "+err);
              return res.status(500).send();
            } else {
              logger.info("["+timestamp+"] Saved publickey from "+username);
              // TODO: run regenerateMasterKeyPair();

              //module.exports.emit('publickey updated', {data: { username: username }} );
              res.status(200).send();
            };
          });
        }
      });
    } else {
      logger.info("Pub key is not defined");
      res.status(500).send();
    };
  });

  app.get('/key/masterKeyPair',
    passport.authenticate('keyverify', { session: false }),
    function(req, res) {
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
        //logger.info("[MASTER KEY PAIR] user.masterKey: "+user.masterKey.toString());
        if (typeof user !== 'undefined' && user !== null) {
          res.json({ publicKey: user.masterKey.publicKey, privateKey: user.masterKey.encryptedPrivateKey, keyId: user.masterKey.id });
        } else {
          logger.info("Didn't find masterKey encrypted to "+username);
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
      logger.info("[ROUTE KEYS] Error generating key pair: "+error);
    });
  }

  function showKeys(privateKey, publicKey) {
    logger.info("PGP PrivKey: "+privatekey+" publicKey: "+publicKey);
  }
}
