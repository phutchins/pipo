var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var logger = require('../../config/logger');
var fs = require('fs');
var md5 = require('md5');
var crypto = require('crypto');
var Chat = require('./chat');
var Room = require('./room');

var pfileSchema = new Schema({
  name: { type: String },
  uploadedBy: { type: mongoose.SchemaTypes.ObjectId, ref: "User" },
  uploadedDate: { type: Date, default: new Date() },
  fileHash: { type: String },
  toChatId: { type: String },
  toChat: { type: mongoose.SchemaTypes.ObjectId, ref: "Chat" },
  toRoom: { type: mongoose.SchemaTypes.ObjectId, ref: "Room" },
  chatType: { type: String },
  nameOnDisk: { type: String },
  description: { type: String }
});

pfileSchema.statics.create = function create(data, callback) {
  var self = this;
  var fileBuffer = data.fileBuffer;
  var fileName = data.fileName;
  var chatType = data.chatType;
  var toChatId = data.toChatId;

  // Verify file data
  self.verify(data, function(err) {
    if (err) {
      logger.debug("[pfile.create] PFile data verification failed: " + err);
      return callback(err);
    }

    // Create md5 hash of the data so that we can name the file uniquely and ensure that we
    // don't already have a copy of the file. If we do have a file where the hash matches, that
    // means that it is already encrypted to the same people.
    var fileHash = crypto.createHash('rmd160').update(Buffer(fileBuffer.data)).digest("hex");

    logger.debug("[pfile.create] fileHash: " + fileHash);

    // Create new pfile from data
    // TODO: create unique filenames from hash before storing and set that to nameOnDisk
    var myPFile = new self({
      name: fileName,
      uploadedBy: data.uploadedBy,
      fileHash: fileHash,
      nameOnDisk: data.fileName,
      description: data.description,
      chatType: chatType,
      toChatId: toChatId
    });

    logger.debug("[pfile.create] chatType is: " + chatType);

    logger.debug("[pfile.create] creating pfile with toChatId: " + toChatId);

    var finish = function finish(pfile) {
      pfile.save(function(err, newPFile) {
        var newPFile = newPFile;
        if (err) {
          logger.debug("[pfile.create] Error creating PFile: " + err);
          return callback(err);
        }

        logger.debug("[pfile.create] newPFile.id: " + newPFile.id);
        // Need to move this directory to the config
        fs.writeFile("files/" + fileHash, Buffer(fileBuffer.data), function(err) {
          return callback(err, newPFile);
        });
      });
    };

    // Check the chatType
    if (chatType == 'chat') {
      Chat.findOne({ chatHash: toChatId }, function(err, chat) {
        logger.debug("[pfile.create] Found chat for chatHash: " + toChatId);
        myPFile.toChat = chat.id;
        finish(myPFile);
      });
    } else if (chatType == 'room') {
      Room.findOne({ _id: toChatId }, function(err, room) {
        logger.debug("[pfile.create] Found room for chatId: " + toChatId);
        myPFile.toRoom = room.id;
        finish(myPFile);
      });
    } else {
      return logger.error("[pfile.create] Error: Unknown chat type: " + chatType);
    }

    // If it is a privateChat, then the toChatId is a chatHash and we need to set it appropriatly
    //    In this case we need to get the chatId fo the privateChat

    // If it is a room, we can use it as a chat id

  });
};

pfileSchema.statics.verify = function verify(data, callback) {
  // Do some verification here
  return callback(null);
};

module.exports = mongoose.model('PFile', pfileSchema);
