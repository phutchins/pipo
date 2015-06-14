var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var keyIdSchema = new Schema({
  type: { type: String },
  room: { type: String },
  id: { type: Number }
});

keyIdSchema.statics.getMasterKeyId = function getMasterKeyId(room, callback) {
  var self = this;
  var keyId = null;
  self.findOne({ type: 'master', room: room }, function(err, keyId, count) {
    if (err) {
      return callback(err, null);
    } else if (typeof keyId == 'undefined' || keyId == null) {
      self.create(room, function(err, keyId) { keyId = self.id;
      });
    } else {
      console.log("keyId is: "+keyId);
      return callback(null, keyId.id);
    };
  });
};

keyIdSchema.statics.create = function createMasterKeyId(room, callback) {
  new this({
    type: 'master',
    room: room,
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

keyIdSchema.statics.increment = function incrementMasterKeyId(room, callback) {
  var self = this;
  this.findOne({ type: 'master', room: room }, function(err, keyId, count) {
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
