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
  chunkIndex: [{
    index: { type: Number },
    hash: { type: String },
  }],
  chunkCount: { type: Number },
  fileHash: { type: String },
  toChatId: { type: String },
  toChat: { type: mongoose.SchemaTypes.ObjectId, ref: "Chat" },
  toRoom: { type: mongoose.SchemaTypes.ObjectId, ref: "Room" },
  chatType: { type: String },
  nameOnDisk: { type: String },
  description: { type: String },
  isComplete: { type: Boolean }
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


    // Create new pfile from data
    // TODO: create unique filenames from hash before storing and set that to nameOnDisk
    var myPFile = new self({
      name: fileName,
      uploadedBy: data.uploadedBy,
      nameOnDisk: data.fileName,
      description: data.description,
      fileHash: data.fileHash,
      chatType: chatType,
      chunkCount: data.chunkCount,
      toChatId: toChatId
    });

    logger.debug("[pfile.create] chatType is: " + chatType);

    logger.debug("[pfile.create] creating pfile with toChatId: " + toChatId);

    var finish = function finish(pfile) {
      if (pfile.chunkCount == data.chunkNumber) {
        pfile.isComplete = true;
      };

      pfile.save(function(err, newPFile) {
        var newPFile = newPFile;
        if (err) {
          logger.debug("[pfile.create] Error creating PFile: " + err);
          return callback(err);
        }

        self.addChunk(data, function(err) {
          if (err) {
            logger.debug("[pfile.create] Error adding chunk: " + err);
            return callback(err, null);
          }

          logger.debug("[pfile.create] Added chunk #" + data.chunkNumber + " to pFile " +  data.fileName);


          // Should we be returning the udpated chunk here?
          return callback(err, pfile);
        });

        logger.debug("[pfile.create] newPFile.id: " + newPFile.id);
        // Need to move this directory to the config
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

pfileSchema.statics.get = function get(id, callback) {
  logger.debug("[pfile.get] Getting pfile with id '" + id + "'");

  this.findOne({ _id: id }, function(err, pfile) {
    if (err) {
      logger.error("[pfile.get] Error getting pfile: " + err);
      return callback(err, null);
    }

    if (!pfile) {
      logger.error("[pfile.get] No pfile found with id '" + id);
      return callback(err, null);
    }

    logger.debug("[pfile.get] Found pfile with id '" + pfile.id + "'");

    return callback(null, pfile);
  });
};

pfileSchema.methods.getChunk = function getChunk(index, callback) {
  var isRequestedChunk = function isRequestedChunk(value) {
    return value.index == index;
  }

  var requestedChunk = this.chunkIndex.filter(isRequestedChunk).shift();

  // Get the filename for the chunk (should probably just be the hash)
  var chunkName = requestedChunk.hash + "." + this.name + "." + index;
  logger.debug("[pfile.get] Got chunk '" + chunkName + "'");

  // Read the file from disk and return it (as a readable stream?)
  var chunkStream = fs.createReadStream("files/" + chunkName, { encoding: 'binary' });

  return callback(null, chunkStream);
};

pfileSchema.statics.addChunk = function addChunk(data, callback) {
  var self = this;
  // Verify the hash of the chunk
  //
  // Create md5 hash of the data so that we can name the file uniquely and ensure that we
  // don't already have a copy of the file. If we do have a file where the hash matches, that
  // means that it is already encrypted to the same people.
  var fileBuffer = data.fileBuffer;
  var chunkHash = crypto.createHash('rmd160').update(fileBuffer).digest('hex');
  //var chunkHash = crypto.createHash('rmd160').update(Buffer(fileBuffer.data)).digest('hex');

  // Check to see if the pfile exists
  // Need to use complete file hash for this name here and allow the client to
  // confirm the orig chunkHash upon download
  this.findOne({ name: data.fileName }, function(err, pFile) {
    if (!pFile) {
      // Create it if it doesn't exist with the first chunk data
      self.create(data, function(err, newPFile) {
        if (err) {
          logger.debug('[pfile.addChunk] Error creating pfile');
          return callback(err, null);
        }

        if (newPFile.chunkCount === 1) {
          newPFile.isComplete = true;
        }

        logger.debug("[pfile.addChunk] Created pFile as it did not exist");
        return callback(err, newPFile);
      });
    }

    // Otherwise, add the chunk to the pfile
    if (pFile) {
      var pfileChunkName = chunkHash + "." + data.fileName + "." + data.chunkNumber;

      if (pFile.isComplete) {
        console.log('Pfile already exists and is complete');
        return callback('Pfile already exists and is complete', null);
      }

      fs.writeFile("files/" + pfileChunkName, fileBuffer, { encoding: 'binary' }, function(err) {
        if (err) {
          console.log("[pfile.addChunk] Error writing file to disk: " + err);
          return callback(err, null);
        };

        logger.debug("[pfile.addChunk] Wrote " + pfileChunkName + " to disk.");

        self.findOneAndUpdate(
          { _id: pFile._id },
          {
            $push: {
              "chunkIndex": {
                index: data.chunkNumber,
                hash: chunkHash
              }
            }
          },
          { new: true },
          function(err, savedPfile) {
            if (err) {
              return console.error("[pfile.addChunk] Error saving pFile to chunkIndex: " + err);
            };

            console.log("[pfile.addChunk] Saved PFile to chunkIndex");

            // Check if this was the last chunk
            //
            // Really need to decide the case of pFile and make it consistent...
            var completedChunks = savedPfile.chunkIndex.filter(function(value) { return value !== undefined }).length;
            logger.debug("[pfile.addChunk] We've processed " + completedChunks + " out of " + data.chunkCount + " so far...");

            // If so, set isComplete to true and call callback
            if (completedChunks == data.chunkCount) {
              logger.debug("[pfile.addChunk] Time to celebrate, we've finished!");
              pFile.isComplete = true;
              pFile.save(function(err) {
                if (err) {
                  return logger.debug("[pfile.addChunk] Error saving pfile object: " + err);
                }

                logger.debug("[pfile.addChunk] Running callback since we're done...");
                return callback(err, pFile);
              });
            } else {
              // If not, return chunk complete via callback
              pFile.save(function(err) {
                if (err) {
                  return logger.debug("[pfile.addChunk] Error saving pfile object before completion: " + err);
                }

                return callback(err, pFile);
              });
            };
          }
        );
      });
    }
  })
};

pfileSchema.statics.verify = function verify(data, callback) {
  // Do some verification here
  return callback(null);
};

module.exports = mongoose.model('PFile', pfileSchema);
