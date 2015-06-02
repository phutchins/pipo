var mongoose = require('mongoose');
var openpgp = require('openpgp');
var KeyId = require('./keyid');
var User = require('./user');
var async = require('async');
var Schema = mongoose.Schema;

var keyPairSchema = new Schema({
  type: { type: String },
  encryptedTo: { type: mongoose.SchemaTypes.ObjectId,ref: "User" },
  userName: { type: String },
  privateKey: { type: String },
  publicKey: { type: String },
  version: { type: Number, default: 0 }
});

keyPairSchema.statics.regenerateMasterKeyPair = function regenerateMasterKeyPair(callback) {
  var self = this;
  console.log("Running regenerateMasterKeyPair");
  self.generateMasterKeyPair(function(err, masterKeyPair, id) {
    console.log("[START] New master keyPair generated...");
    //TODO: Loop through all channels and update master key pair for each
    self.updateMasterKeyPairForAllUsers(masterKeyPair, id, function(err) {
      if (err) {
        console.log("[START] Error encrypting master key for all users: "+err);
        return callback(err, null, null);
      };
      console.log("[START] Encrypted master key for all users!");
      callback(null, masterKeyPair, id);
    });
  });
};

keyPairSchema.statics.generateMasterKeyPair = function generateMasterKeyPair(callback) {
  var self = this;
  console.log("Generating master key pair start");
  self.generateKeyPair(2048, 'masterKeyPair', '', function(err, newMasterKeyPair) {
    console.log("Generated master key pair!");
    if (err) {
      callback(err, null, null);
    } else {
      // Should not be saving the keypair here eventually
      KeyId.increment(function(err, keyId) {
        if (err) {
          console.log("Error incrememnting keyId: "+err);
          return callback(err, null, null);
        } else {
          console.log("Incrememnted keyId to '"+keyId+"'");
          return callback(null, newMasterKeyPair, keyId);
        };
      });
    };
  });
};

// This shold include the room for which to update the master key
keyPairSchema.statics.updateMasterKeyPairForAllUsers = function updateMasterKeyPairForAllUsers(masterKeyPair, keyId, callback) {
  var self = this;
  var timestamp = new Date().toString();
  console.log("["+timestamp+"] [UPDATE] starting updateMasterKeyPairForAllUsers");
  // check the DB to make sure the user has access to the room
  User.find({}, function(err, users, count) {
    var timestamp = new Date().toString();
    console.log("["+timestamp+"] [UPDATE] found users");
    async.each(users, function(user, asyncCallback) {
      self.updateMasterKeyPairForUser(user, masterKeyPair, keyId, function(err) {
        if (err) { return asyncCallback(err); }
        //console.log("Update master key process for "+user.userName+" done...");
        asyncCallback(err);
      });
    }, function(err) {
      callback(err);
    });
  });
}

keyPairSchema.statics.checkMasterKeyPairForAllUsers = function checkMasterKeyPairForAllUsers(callback) {
  KeyId.getMasterKeyId(function(err, currentKeyId) {
    if (err) {
      return callback(err, null);
    } else {
      var response = 'ok';
      User.find({}, function(err, users, count) {
        users.forEach( function(user) {
          //console.log("[DEBUG] checkMasterKeyPairForAllUsers - user is: "+user);
          if (user.masterKey.encryptedPrivateKey && user.masterKey.id == currentKeyId) {
            console.log("[KEYPAIR] (checkMasterKeyPairForAllUsers) Users Key ID: "+user.masterKey.id+" Current Key ID: "+currentKeyId);
          } else if (user.publicKey == null) {
            console.log("[KEYPAIR] checkMasterKeyPairForAllUsers - user.publicKey is null");
          } else {
            console.log("User '"+user.userName+"' has key id "+user.masterKey.id+" and current keyId is "+currentKeyId);
            response = 'update';
          };
        });
        return callback(null, response);
      });
    };
  });
};

keyPairSchema.statics.updateMasterKeyPairForUser = function updateMasterKeyPairForUser(user, masterKeyPair, keyId, callback) {
  console.log("Updating master keyPair for "+user.userName);
  console.log("[DEBUG] (updateMasterKeyPairForUser) user.publicKey: "+user.publicKey);
  console.log("[DEBUG] (updateMasterKeyPairForUser) masterKeyPair.privateKey: "+masterKeyPair.privateKey);
  if (user.publicKey) {
    var publicKey = openpgp.key.readArmored(user.publicKey).keys[0];
    var masterPrivateKey = openpgp.key.readArmored(masterKeyPair.privateKey).keys[0];
    masterPrivateKey.decrypt('pipo');
    console.log("Encrypting master key with id "+keyId+" to "+user.userName);
    openpgp.encryptMessage(publicKey, masterKeyPair.privateKey).then(function(encKey) {
      User.findOne({ userName: user.userName }, function(err, user, count) {
        user.masterKey.encryptedPrivateKey = encKey;
        user.masterKey.publicKey = masterKeyPair.publicKey;
        user.masterKey.id = keyId;
        user.save( function( err, user ) {
          //if (err) { return callback("Error saving encrypted master key for user "+user.userName) };
          console.log("Saved encrypted master key for user "+user.userName);
          //console.log("[DEBUG] (updateMaseterKeyPairForUser) user.masterKey.encryptedMasterKey: "+user.masterKey.encryptedMasterKey);
          callback(null);
        });
      });
    });
  } else {
    console.log("User "+user.userName+" does not have a publicKey so cannot create master key for them");
    callback(null);
  }
}

keyPairSchema.statics.generateKeyPair = function generateKeyPair(numBits, userId, passphrase, callback) {
  var self = this;
  var options = {
    numBits: numBits,
    userId: userId,
    passphrase: passphrase
  };
  var timestamp = Date().toString();
  console.log("["+timestamp+"] [GENERATE KEY PAIR] generating keypair now...");
  openpgp.generateKeyPair(options).then(function(keyPair) {
    var timestamp = Date().toString();
    console.log("["+timestamp+"] [GENERATE KEY PAIR] in generateKeyPair then");
    privateKey = keyPair.privateKeyArmored;
    publicKey = keyPair.publicKeyArmored;
    var keyPair = {
      privateKey: privateKey,
      publicKey: publicKey
    };
    return callback(null, keyPair);
  }).catch(function(err) {
    console.log("Error generating key pair: "+err);
    return callback(err, null);
  });
};

module.exports = mongoose.model('KeyPair', keyPairSchema);
