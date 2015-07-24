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
  mongoose.model('User').findOne({ userName: data.userName }, function(err, user) {
    if (err) {
      return callback(err);
    }
    if (!user) {
      return logger.error("Could not find user " + data.userName + " while creating room " + data.name);
    }
    // TODO: Add conditional to check if user is allowed to create rooms
    var newRoom = new self({
      name: data.name,
      topic: data.topic,
      encryptionScheme: data.encryptionScheme,
      keepHistory: (data.keepHistory === 'keep'),
      membershipRequired: (data.membershipRequired === 'private'),
      createDate: Date.now(),
      _owner: user,
      _admins: [ user ],
      _members: []
    })
    newRoom._members.push(user);
    newRoom.save(callback(null, newRoom));
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
    mongoose.model('Room').findOne({ name: name }).populate('_members').exec(function(err, room) {
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
      logger.debug("[ROOM] room._members is: ",room._members);
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
  var requestingUser = data.requestingUser;
  var memberToAdd = data.memberToAdd;
  var name = data.name;
  mongoose.model('User').findOne({ userName: requestingUser }, function(err, requestingUserObj) {
    mongoose.model('Room').findOne({ name: name }, function(err, room) {
      if (err) {
        return callback(err, false);
      }
      if (!room) {
        return logger.error("No room found when trying to part for user " + userName);
      }
      var isRoomAdmin = room.admins.some(function(admin) {
        return admin.equals(requestingUserObj._id);
      });
      var isRoomOwner = room.owner.equals(requestingUserObj._id);
      logger.debug("Attempting to add member to room - isRoomOwner: " + isRoomOwner + " isRoomAdmin: " + isRoomAdmin);
      if (isRoomAdmin || isRoomOwner) {
        mongoose.model('User').findOne({ userName: memberToAdd }, function(err, memberToAddObj) {
          logger.debug("Requesting user " + requestingUser + " is an admin of room " + room.name + " so adding " + memberToAdd);
          room._members.push(memberToAddObj);
          room.save();
          return callback(null, true);
        })
      } else {
        return callback(null, false);
      }
    })
  })
};

module.exports = mongoose.model('Room', roomSchema);
