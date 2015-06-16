var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var User = require('./user');

var roomSchema = new Schema({
  name: { type: String },
  description: { type: String, default: '' },
  createDate: { type: Date },
  owner: { type: mongoose.SchemaTypes.ObjectId, ref: "User" },
  admins: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User" }],
  members: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User" }],
  activeMembers: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User" }],
  messages: [{
    date: { type: Date },
    user: { type: mongoose.SchemaTypes.ObjectId, ref: "User" },
    message: { Type: String }
  }]
});

roomSchema.statics.create = function create(data, callback) {
  User.findOne({ userName: data.userName }, function(err, user) {
    if (err) {
      return callback(err);
    }
    if (!user) {
      return console.log("Could not find user " + data.userName + " while creating room " + data.roomName);
    }
    new this({
      name: data.roomName,
      createDate: Date.now(),
      owner: user,
      members: [ user ]
    }).save(callback);
  })
}


roomSchema.statics.join = function join(data, callback) {
  var self = this;
  User.findOne({ userName: data.userName }, function(err, user) {
    this.findOne({ name: data.roomName }, function(err, room) {
      if (err) {
        return callback(err, false);
      }
      if (!room) {
        console.log("Room " + data.roomName + " does not exist so creating...");
        return self.create(data, function(err) {
          if (err) {
            return console.log("Failed to create room " + data.roomName);
          }
          return self.join(data, callback)
        })
      }
      var isMember = room.members.some(function(member) {
        return member.equals(user._id)
      });
      if (isMember) {
        user.rooms
        room.activeMembers.push(user);
        room.save();
        console.log("User " + data.userName + " has joined #" + data.roomName);
        return callback(null, true);
      } else {
        console.log("User " + data.userName + " unable to join #" + data.roomName + " due to incorrect membership");
        return callback("User " + data.userName + " unable to join #" + data.roomName + " due to incorrect membership", false);
      }
    })
  })
}

roomSchema.statics.part = function part(data, callback) {
  User.findOne({ userName: data.userName }, function(err, user) {
    this.findOne({ name: data.roomName }, function(err, room) {
      if (err) {
        return callback(err, false);
      }
      if (!room) {
        return console.log("No room found when trying to part for user " + data.userName);
      }
      room.activeMembers.pull(user);
      room.save();
      user.membership.currentRooms.pull(room);
      user.save();
      console.log("User " + data.userName + " has parted #" + data.roomName + " successfully");
      return callback(null, true);
    })
  })
}

module.exports = mongoose.model('Room', roomSchema);
