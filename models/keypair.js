var mongoose = require('mongoose');
var openpgp = require('openpgp');
var KeyId = require('./keyid');
var User = require('./user');
var Schema = mongoose.Schema;

var keyPairSchema = new Schema({
  type: { type: String },
  encryptedTo: { type: mongoose.SchemaTypes.ObjectId,ref: "User" },
  userName: { type: String },
  privKey: { type: String },
  pubKey: { type: String },
  version: { type: Number, default: 0 }
});

keyPairSchema.statics.regenerateMasterKeyPair = function regenerateMasterKeyPair() {
  console.log("Running regenerateMasterKeyPair");
  generateMasterKeyPair(function(err, masterKeyPair, id) {
    console.log("[START] New master keyPair generated...");
    updateMasterKeyPairForAllUsers(masterKeyPair, id, function(err) {
      if (err) { return console.log("[START] Error encrypting master key for all users: "+err); };
      console.log("[START] Encrypted master key for all users!");
    });
  });
};

keyPairSchema.statics.generateMasterKeyPair = function generateMasterKeyPair(callback) {
  var self = this;
  console.log("Generating master key pair start");
  self.generateKeyPair(2048, 'master keypair', 'pipo', function(err, newMasterKeyPair) {
    console.log("Generated master key pair!");
    if (err) {
      callback(err, null, null);
    } else {
      // Should not be saving the keypair here eventually
      incrementMasterKeyId(function(err, keyId) {
        if (err) {
          return callback(err, null, null);
        } else {
          return callback(null, newMasterKeyPair, keyId);
        };
      });
    };
  });
};

keyPairSchema.statics.updateMasterKeyPairForAllUsers = function updateMasterKeyPairForAllUsers(masterKeyPair, keyId, callback) {
  var timestamp = new Date().toString();
  console.log("["+timestamp+"] [UPDATE] starting updateMasterKeyPairForAllUsers");
  User.find({}, function(err, users, count) {
    var timestamp = new Date().toString();
    console.log("["+timestamp+"] [UPDATE] found users");
    async.each(users, function(user, asyncCallback) {
      updateMasterKeyPairForUser(user, masterKeyPair, keyId, function(err) {
        if (err) { return asyncCallback(err); }
        //console.log("Update master key process for "+user.userName+" done...");
        asyncCallback(err);
      });
    }, function(err) {
        if (err) {
          console.log("Error generating key pair for all users");
          callback(err);
        } else {
          console.log("Generated encrypted master key for all users");
          ioMain.emit('new master key', masterKeyPair);
          callback(err);
        };
    });
  });
}

keyPairSchema.statics.checkMasterKeyPairForAllUsers = function checkMasterKeyPairForAllUsers(callback) {
  KeyId.getMasterKeyId(function(err, currentKeyId) {
    if (err) {
      return callback(err, null);
    } else {
      var response = '';
      User.find({}, function(err, users, count) {
        users.forEach( function(user) {
          if (user.masterKey.encPrivKey && user.masterKey.id == currentKeyId) {
            response = 'ok';
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
  //console.log("Updating master keyPair for "+user.userName);
  //console.log("[DEBUG] (updateMasterKeyPairForUser) user.pubKey: "+user.pubKey);
  //console.log("[DEBUG] (updateMasterKeyPairForUser) masterKeyPair.privKey: "+masterKeyPair.privKey);
  if (user.pubKey) {
    var pubKey = openpgp.key.readArmored(user.pubKey).keys[0];
    var masterPrivKey = openpgp.key.readArmored(masterKeyPair.privKey).keys[0];
    masterPrivKey.decrypt('pipo');
    console.log("Encrypting master key with id "+keyId+" to "+user.userName);
    openpgp.encryptMessage(pubKey, masterKeyPair.privKey).then(function(encKey) {
      user.masterKey.encPrivKey = encKey;
      user.masterKey.pubKey = masterKeyPair.pubKey;
      user.masterKey.id = keyId;
      user.save( function( err, user, count ) {
        if (err) { return callback("Error saving encrypted master key for user "+user.userName) };
        //console.log("Saved encrypted master key for user "+user.userName);
        callback(null);
      });
    });
  } else {
    console.log("User "+user.userName+" does not have a pubKey so cannot create master key for them");
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
    privKey = keyPair.privateKeyArmored;
    pubKey = keyPair.publicKeyArmored;
    var keyPair = {
      privKey: privKey,
      pubKey: pubKey
    };
    return callback(null, keyPair);
  }).catch(function(err) {
    console.log("Error generating key pair: "+err);
    return callback(err, null);
  });
};

module.exports = mongoose.model('KeyPair', keyPairSchema);
