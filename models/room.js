var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var logger = require('../config/logger');

var roomSchema = new Schema({
  name: { type: String },
  topic: { type: String, default: 'This is the default description. You should replace this with a snarky description.' },
  group: { type: String, default: 'general' },
  membershipRequired: { type: Boolean, default: true },
  keepHistory: { type: Boolean, default: true },
  encryptionScheme: { type: String, default: 'clientkey' },
  createDate: { type: Date },
  _owner: { type: mongoose.SchemaTypes.ObjectId, ref: "User", default: null },
  _admins: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User", default: [] }],
  _members: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User", default: []  }],
  messages: [{
    date: { type: Date },
    _user: { type: mongoose.SchemaTypes.ObjectId, ref: "User" },
    message: { Type: String },
    default: []
  }]
});

roomSchema.statics.create = function create(data, callback) {
  var self = this;

  var ownerName = data.userName;
  var roomName = data.name;
  var topic = data.topic;
  var encryptionScheme = data.encryptionScheme;
  var keepHistory = data.keepHistory;
  var membershipRequired = data.membershipRequired;

  mongoose.model('User').findOne({ userName: ownerName }, function(err, owner) {
    if (err) {
      return callback(err);
    }

    if (!owner) {
      return logger.error("Could not find user " + ownerName + " while creating room " + roomName);
    }

    // TODO: Add conditional to check if user is allowed to create rooms
    var newRoom = new self({
      name: roomName,
      topic: topic,
      encryptionScheme: encryptionScheme,
      keepHistory: (keepHistory === 'keep'),
      membershipRequired: (membershipRequired === 'private'),
      createDate: Date.now(),
      _owner: owner,
      _admins: [],
      _members: []
    })
    //newRoom._members.push(user);
    newRoom.save(callback(null, newRoom));
  })
};

roomSchema.statics.getByName = function getByName(name, callback) {
  var self = this;

  mongoose.model('Room').findOne({ name: name })
    .populate('_members _owner _admins')
    .exec(function(err, room) {
    if (err) {
      return logger.error("[ROOM] (getByName) Error getting room:",err);
    }

    if (!room) {
      return callback(null);
    }

    return callback(room);
  })
};

roomSchema.statics.update = function update(data, callback) {
  var self = this;
  mongoose.model('User').findOne({ userName: data.userName }, function(err, user) {
    if (err) {
      return callback(err);
    }
    if (!user) {
      return logger.error("Could not find user " + data.userName + " while creating room " + data.name);
    }
    logger.debug("Looking for room '" + data.name + "' with id '" + data.id + "'");
    mongoose.model('Room').findOne({ _id: data.id }, function(err, room) {
      if (err) {
        return logger.error('Error finding room to update:',err);
      }

      if (!room) {
        return logger.error("Could not find room '" + data.name + "' with id '" + data.id + "'");
      }

      logger.debug("Updating room with data:",data);

      room.name = data.name;
      room.topic = data.topic;
      room.encryptionScheme = data.encryptionScheme;
      room.keepHistory = data.keepHistory;
      room.membershipRequired = data.membershipRequired;

      room.save(function(err) {
        if (err) {
          return logger.error("Error updating room:",err);
        }

        mongoose.model('Room').findOne({ _id: data.id }, function(err, room) {
          logger.debug("Found room:",room);
          callback(null, room);
        });
      })
    })
  })
};


roomSchema.statics.join = function join(data, callback) {
  var self = this;
  var userName = data.userName;
  var name = data.name;
  mongoose.model('User').findOne({ userName: userName }, function(err, user) {
    mongoose.model('Room').findOne({ name: name }).populate('_members _owner _admins').exec(function(err, room) {
      if (err) {
        return callback(err, { auth: false });
      }
      if (!room) {
        logger.debug("Room " + name + " does not exist so creating...");
        return self.create(data, function(err) {
          if (err) {
            return logger.error("Failed to create room " + data.name);
          }
          return self.join(data, callback);
        })
      }
      //logger.debug("[ROOM] room._members is: ",room._members);
      var isMember = room._members.some(function(member) {
        return member._id.equals(user._id);
      });
      if (isMember || !self.membershipRequired || room.name == 'pipo') {
        self.populate(room, { path: '_owner _admins messages._user' });
        logger.debug("User " + userName + " has joined #" + data.name);
        user.membership._currentRooms.push(room);
        user.save();
        return callback(null, { auth: true, room: room });
      } else {
        logger.debug("User " + userName + " unable to join #" + name + " due to incorrect membership");
        return callback(null, { auth: false, room: { name: name } });
      }
    })
  })
};

roomSchema.statics.part = function part(data, callback) {
  mongoose.model('User').findOne({ userName: data.userName }, function(err, user) {
    mongoose.model('Room').findOne({ name: data.name }, function(err, room) {
      if (err) {
        return callback(err, false);
      }
      if (!room) {
        return logger.error("No room found when trying to part for user " + data.userName);
      }
      var isMember = room._members.some(function(member) {
        return member.equals(user._id);
      });
      if (isMember || room.name == 'pipo') {
        user.membership._currentRooms.pull(room);
        logger.debug("User " + data.userName + " is a member of ", user.membership._currentRooms);
        user.save();
        logger.debug("User " + data.userName + " has parted #" + data.name + " successfully");
        return callback(null, true);
      } else {
        return callback(null, false);
      }
    })
  })
};

roomSchema.statics.addMember = function addMember(data, callback) {
  var userName = data.userName;
  var member = data.member;
  var roomName = data.roomName;
  var membership = data.membership;

  logger.debug("[ADD MEMBER] Finding user '" + userName + "' who is adding member '" + member + "' to '" + roomName + "'");
  mongoose.model('User').findOne({ userName: userName }, function(err, user) {
    if (err) {
      return callback(err, false);
    }

    if (!user) {
      return callback(null, false);
    }

    mongoose.model('Room').findOne({ name: roomName }).populate('_admins _owner').exec( function(err, room) {
      if (err) {
        return callback(err, false);
      }

      if (!room) {
        return logger.error("No room found trying to add member to room " + userName);
      }

      var isRoomAdmin = null;
      var isRoomOwner = null;

      logger.debug("room._owner.userName:", room._owner.userName);

      var adminsArray = [];
      logger.debug("room._admins.length: ", room._admins.length);
      if (room._admins) {
        Object.keys(room._admins).forEach(function(key) {
          adminsArray.push(room._admins[key].userName);
        })
        isRoomAdmin = room._admins.some(function(admin) {
          return admin.equals(user);
        });
      }

      if (room._owner) {
        isRoomOwner = room._owner.equals(user);
      }
      logger.debug("Attempting to add member to room - isRoomOwner: " + isRoomOwner + " isRoomAdmin: " + isRoomAdmin);
      if (isRoomAdmin || isRoomOwner) {
        mongoose.model('User').findOne({ userName: member }, function(err, memberObj) {
          logger.debug("Requesting user " + userName + " is an admin of room " + room.name + " so adding " + member + " as a " + membership);

          if (!memberObj) {
            return callback(null, { success: false, message: "I cannot find the user '" + member + "' so I am unable to add them to #" + room.name } );
          }

          var isInArray = room._members.some(function (member) {
            return member.equals(memberObj._id);
          });

          if (!isInArray) {
            room._members.push(memberObj);
            room.save();
            return callback(null, { success: true, message: member + " has been added as a member of #" + room.name });
          } else {
            return callback(null, { success: false, message: "User '" + member + "' is already a member of this room" } );
          }
        })
      } else {
        var message = "You must be a room admin or owner to add a member";
        return callback(null, { success: false, message: message });
      }
    })
  })
};

module.exports = mongoose.model('Room', roomSchema);
