var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var roomSchema = new Schema({
  name: { type: String },
  topic: { type: String, default: 'This is the default description. You should replace this with a snarky description.' },
  group: { type: String, default: 'general' },
  createDate: { type: Date },
  owner: { type: mongoose.SchemaTypes.ObjectId, ref: "User" },
  admins: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User" }],
  members: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User" }],
  messages: [{
    date: { type: Date },
    user: { type: mongoose.SchemaTypes.ObjectId, ref: "User" },
    message: { Type: String }
  }]
});

roomSchema.statics.create = function create(data, callback) {
  var self = this;
  mongoose.model('User').findOne({ userName: data.userName }, function(err, user) {
    if (err) {
      return callback(err);
    }
    if (!user) {
      return console.log("Could not find user " + data.userName + " while creating room " + data.roomName);
    }
    var newRoom = new self({
      name: data.roomName,
      createDate: Date.now(),
      owner: user,
      members: []
    })
    newRoom.members.push(user);
    newRoom.save(callback);
  })
};


roomSchema.statics.join = function join(data, callback) {
  var self = this;
  var userName = data.userName;
  var roomName = data.roomName;
  mongoose.model('User').findOne({ userName: userName }, function(err, user) {
    mongoose.model('Room').findOne({ name: roomName }, function(err, room) {
      if (err) {
        return callback(err, { auth: false });
      }
      if (!room) {
        console.log("Room " + roomName + " does not exist so creating...");
        return self.create(data, function(err) {
          if (err) {
            return console.log("Failed to create room " + data.roomName);
          }
          return self.join(data, callback);
        })
      }
      var isMember = room.members.some(function(member) {
        return member.equals(user._id);
      });
      if (isMember || room.name == 'pipo') {
        console.log("User " + userName + " has joined #" + data.roomName);
        user.membership._currentRooms.push(room);
        user.save();
        return callback(null, { auth: true, room: room });
      } else {
        console.log("User " + userName + " unable to join #" + roomName + " due to incorrect membership");
        return callback(null, { auth: false, room: { name: roomName } });
      }
    })
  })
};

roomSchema.statics.part = function part(data, callback) {
  mongoose.model('User').findOne({ userName: data.userName }, function(err, user) {
    mongoose.model('Room').findOne({ name: data.roomName }, function(err, room) {
      if (err) {
        return callback(err, false);
      }
      if (!room) {
        return console.log("No room found when trying to part for user " + data.userName);
      }
      var isMember = room.members.some(function(member) {
        return member.equals(user._id);
      });
      if (isMember || room.name == 'pipo') {
        user.membership._currentRooms.pull(room);
        user.save();
        console.log("User " + data.userName + " has parted #" + data.roomName + " successfully");
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
  var roomName = data.roomName;
  mongoose.model('User').findOne({ userName: requestingUser }, function(err, requestingUserObj) {
    mongoose.model('Room').findOne({ name: roomName }, function(err, room) {
      if (err) {
        return callback(err, false);
      }
      if (!room) {
        return console.log("No room found when trying to part for user " + userName);
      }
      var isRoomAdmin = room.admins.some(function(admin) {
        return admin.equals(requestingUserObj._id);
      });
      var isRoomOwner = room.owner.equals(requestingUserObj._id);
      console.log("Attempting to add member to room - isRoomOwner: " + isRoomOwner + " isRoomAdmin: " + isRoomAdmin);
      if (isRoomAdmin || isRoomOwner) {
        mongoose.model('User').findOne({ userName: memberToAdd }, function(err, memberToAddObj) {
          console.log("Requesting user " + requestingUser + " is an admin of room " + room.name + " so adding " + memberToAdd);
          room.members.push(memberToAddObj);
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
