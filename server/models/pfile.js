var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var logger = require('../../config/logger');
var fs = require('fs');
var md5 = require('md5');
var crypto = require('crypto');

var pfileSchema = new Schema({
  name: { type: String },
  uploadedBy: { type: mongoose.SchemaTypes.ObjectId, ref: "User" },
  uploadedDate: { type: Date, default: new Date() },
  fileHash: { type: String },
  toChat: { type: mongoose.SchemaTypes.ObjectId, ref: "Chat" },
  nameOnDisk: { type: String },
  description: { type: String }
});

pfileSchema.statics.create = function create(data, callback) {
  var self = this;
  var fileBuffer = data.fileBuffer;
  var fileName = data.fileName;

  // Verify file data
  self.verify(data, function(err) {
    if (err) {
      console.log("[pfile.create] PFile data verification failed: " + err);
      return callback(err);
    }

    // Create md5 hash of the data so that we can name the file uniquely and ensure that we
    // don't already have a copy of the file. If we do have a file where the hash matches, that
    // means that it is already encrypted to the same people.
    var hasher = crypto.createHash('md5');

    hasher.update(Buffer(fileBuffer.data)).digest("hex");
    var fileHash = hasher.read();

    console.log("[pfile.create] fileHash: " + fileHash);
    // Create new pfile from data
    // TODO: create unique filenames from hash before storing and set that to nameOnDisk
    var myPFile = new self({
      name: fileName,
      uploadedBy: data.uploadedBy,
      fileHash: fileHash,
      toChat: data.toChatId,
      nameOnDisk: data.fileName,
      description: data.description
    });

    myPFile.save(function(err) {
      if (err) {
        logger.debug("[pfile.create] Error creating PFile: " + err);
        return callback(err);
      }
      // Need to move this directory to the config
      fs.writeFile("files/" + fileHash, Buffer(fileBuffer.data), function(err) {
        return callback(err);
      });
    });
  });
};

pfileSchema.statics.verify = function verify(data, callback) {
  // Do some verification here
  return callback(null);
};

module.exports = mongoose.model('PFile', pfileSchema);
