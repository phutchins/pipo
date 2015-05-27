var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var keyIdSchema = new Schema({
  type: { type: String },
  channel: { type: String },
  id: { type: Number }
});

keyIdSchema.statics.getMasterKeyId = function getMasterKeyId(callback) {
  var self = this;
  var keyId = null;
  self.findOne({ type: 'master' }, function(err, keyId, count) {
    if (err) {
      return callback(err, null);
    } else if (typeof keyId == 'undefined' || keyId == null) {
      this.create(function(err, keyId) {
        keyId = self.keyId.id;
      });
    } else {
      console.log("keyId is: "+keyId);
      return callback(null, keyId.id);
    };
  });
};

keyIdSchema.statics.create = function createMasterKeyId(callback) {
  new this({
    type: 'master',
    id: 0
  }).save(function(err, keyId) {
    if (err) {
      return callback(err, null);
    } else {
      console.log("Added master key id '"+keyId.id+"' as it did not exist yet");
      return callback(null, keyId);
    };
  });
};

keyIdSchema.statics.increment = function incrementMasterKeyId(callback) {
  KeyId.findOne({ type: 'master' }, function(err, keyId, count) {
    if (typeof keyId == 'undefined') {
      return callback("Cannot find master key ID while trying to increment", null);
    } else {
      var id = keyId.id + 1;
      keyId.id = id;
      keyId.save(function(err, keyId, count) {
        if (err) {
          return callback("Error saving key id");
        } else {
          return callback(null, keyId.id);
        }
      });
    };
  });
};

module.exports = mongoose.model('KeyId', keyIdSchema);
