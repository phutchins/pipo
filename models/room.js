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
        // Should not return room name? Should catch error...
        return callback(null, { auth: false, room: { name: name } });
      }
    })
  })
};

roomSchema.statics.part = function part(data, callback) {
  mongoose.model('User').findOne({ userName: data.userName }).populate('membership._currentRooms').exec(function(err, user) {
    mongoose.model('Room').findOne({ name: data.name }).populate('_members _admins _owner').exec(function(err, room) {
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
        user.save(function(err) {
          logger.debug("User " + data.userName + " has parted #" + data.name + " successfully");
          return callback(null, true);
        });
      } else {
        return callback(null, false);
      }
    })
  })
};

/*
 * Add a member to a channel
 * TODO: Need to move the auth checking for ability to add, change or delete a member to its own method
 */
roomSchema.statics.addMember = function addMember(data, callback) {
  var userName = data.userName;
  var member = data.member;
  var roomName = data.roomName;
  var membership = data.membership;
  var pushed = false;

  logger.debug("[ADD MEMBER] Finding user '" + userName + "' who is adding member '" + member + "' to '" + roomName + "'");
  mongoose.model('User').findOne({ userName: userName }, function(err, user) {
    if (err) {
      logger.debug("[ROOM] (addMember) Database error while finding user " + userName);
      return callback({ success: false, message: "Error finding user " + userName });
    }

    if (!user) {
      return callback({ success: false, message: "No user '" + userName + "' found." });
    }

    mongoose.model('Room').findOne({ name: roomName }).populate('_admins _owner').exec( function(err, room) {
      if (err) {
        logger.error("[ROOM] (addMember) Error while trying to find room");
        return callback({ success: false, message: "Error finding room" });
      }

      if (!room) {
        logger.error("No room found trying to add member to room " + userName);
        return callback({ success: false, message: "No room found" });
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

      logger.debug("[ROOM] room._owner._id: ",room._owner._id," user._id: ",user._id.toString());
      if (room._owner) {
        isRoomOwner = room._owner._id.equals(user._id);
        logger.debug("[ROOM] user is owner...");
      }
      logger.debug("Attempting to add member to room - isRoomOwner: " + isRoomOwner + " isRoomAdmin: " + isRoomAdmin);
      if (isRoomAdmin || isRoomOwner) {
        logger.debug("[ROOM] User is admin or owner");
        mongoose.model('User').findOne({ userName: member }, function(err, memberObj) {
          logger.debug("Requesting user " + userName + " is an admin of room " + room.name + " so adding " + member + " as a " + membership);

          if (!memberObj) {
            return callback({ success: false, message: "I cannot find the user '" + member + "' so I am unable to add them to #" + room.name } );
          }

          var isInArray = room._members.some(function (member) {
            return member.equals(memberObj._id);
          });

          // Dying somewhere around here and not calling callback
          logger.debug("[ROOM] isInArray: ",isInArray);
          if (isInArray) {
            return callback({ success: false, message: "User '" + member + "' is already a member of this room" } );
          }

          logger.debug("[ROOM] pushing member",memberObj.userName,"to room",room.name,"as a",membership);

          if (membership == 'member') {
            room._members.push(memberObj);
            pushed = true;
          }

          if (membership == 'admin' && isRoomOwner) {
            room._admins.push(memberObj);
            pushed = true;
          }

          if (!pushed) {
            return callback({ success: false, message: "You must be the room owner of " + room.name + " to add an admin" });
          }

          room.save(function(err) {
            logger.debug("[ROOM] Done saving room, calling callback");
            return callback({ success: true, message: member + " has been added as a member of #" + room.name });
          });
        })
      } else {
        var message = "You must be a room admin or owner to add a member";
        return callback({ success: false, message: message });
      }
    })
  })
};

roomSchema.statics.modifyMember = function modifyMember(data, callback) {
  var self = this;

  // Name of the user that is making the modification
  var username = data.username;
  // Name of the user whos membership is being modified
  var memberName = data.memberName;
  // Desired membership to add the member to
  var membership = data.membership;
  // Name of the room that membership is for
  var roomName = data.roomName;
  var isRoomOwner = false;

  mongoose.model('User').findOne({ userName: username }, function(err, user) {
    if (err) {
      return callback({ success: false, message: err, roomName: roomName });
    }

    if (!user) {
      return callback({ success: false, message: "No user found with username " + username, roomName: roomName });
    }

    logger.debug("[ROOM] (modifyMember) Found user " + user.userName + ", looking up room " + roomName);

    mongoose.model('Room').findOne({ name: roomName }).populate('_admins _owner _members').exec( function(err, room) {
      if (err) {
        logger.error("[ROOM] (modifyMember) Error while finding room trying to modify member ",member,"in room",roomName);
        return callback({ success: false, message: err, roomName: roomName });
      }

      if (!room) {
        logger.error("No room found trying to modify membership for",member,"in room",roomName);
        return callback({ success: false, message: "No room found, trying to modify membership for " + member + "in room"+roomName, roomName: roomName });
      }

      logger.debug("[ROOM] (modifyMember) Found room ", roomName);
      logger.debug("[ROOM] room._owner._id: ",room._owner._id," user._id: ",user._id);
      if (room._owner) {
        isRoomOwner = room._owner._id.equals(user._id);
      }
      if (isRoomOwner) {
        logger.debug("[ROOM] (modifyMember) User " + username + " is the owner of " + room.name);
        mongoose.model('User').findOne({ userName: memberName }, function(err, member) {
          if (membership == 'owner') {
            // Add the member as owner
            logger.debug("[ROOM] (modifyMember) Pushing room._owner:",room._owner.userName,"to room._admins");
            room._admins.push(room._owner);
            logger.debug("[ROOM] (modifyMember) Setting room._owner which is currently",room._owner.userName,"to",member.userName);
            room._owner = member;

            logger.debug("[ROOM] (modifyMember) Pulling",member.userName,"from room._members");
            room._members.pull(member);
            logger.debug("[ROOM] (modifyMember) Pulling",member.userName,"from room._admins");
            room._admins.pull(member);

            logger.debug("[ROOM] (modifyMember) Sating room");
            room.save(function(err) {
              return callback({ success: true, message: "Membership change saved", roomName: roomName });
            })
          }

          // Add the user to admins of this room
          if (membership == 'admin') {
            // Add user to admins
            room._admins.push(member);
            // Remove the member from members if they are a member
            room._members.pull(member);
            room.save(function(err) {
              return callback({ success: true, message: "Membership change saved", roomName: roomName });
            })
          }

          // Add the user to members of room
          if (membership == 'member') {
            // Add user to members
            room._members.push(member);
            // Remove user from admins if they are an admin
            room._admins.pull(member);

            room.save(function(err) {
              return callback({ success: true, message: "Membership change saved", roomName: roomName });
            })
          }

          // Remove the user from the room
          if (membership == 'remove') {
            if (room._owner.userName == member.userName) {
              return callback({ success: false, message: "You cannot remove the owner. You must choose a different owner, then remove the member", roomName: roomName });
            }

            // Add user to members
            room._members.pull(member);
            // Remove user from admins if they are an admin
            room._admins.pull(member);

            room.save(function(err) {
              return callback({ success: true, message: "Member removed", roomName: roomName });
            })
          }
        })
      }
      if (isAdmin({ room: room, username: username })) {
        logger.debug("[ROOM] (modifyMember) User " + username + " is an admin of " + room.name);
        mongoose.model('User').findOne({ userName: memberName }, function(err, member) {
          // determine if member is currently an admin or member
          var currentMembership = getMembership({ roomName: room.name, memberName: member });

          // Add the user to members of room
          if (membership == 'member') {
            // Add user to members
            room._members.push(member);
            // Remove user from admins if they are an admin
            room._admins.pull(member);

            room.save(function(err) {
              return callback({ success: true, message: "Membership change saved", roomName: roomName });
            })
          }

          // Remove the user from the room
          if (membership == 'remove') {
            // check if user we're trying to remove is an admin or owner
            if (isAdmin({ room: room, username: member.userName})) {
              return callback({ success: false, message: "You must be the owner to remove an admin", roomName: roomName });
            }
            if (room._owner.userName == member.userName) {
              return callback({ success: false, message: "You must be the owner to remove an admin", roomName: roomName });
            }

            // if not, remove the user
            room._members.pull(member);

            room.save(function(err) {
              return callback({ success: true, message: "Membership change saved", roomName: roomName });
            })
          }

          if (membership == 'admin') {
            return callback({ success: false, message: "You must be the owner of a room to add an admin", roomName: roomName });
          }
          if (membership == 'owner') {
            return callback({ success: false, message: "You must be the current owner of a room to change its owner", roomName: roomName });
          }
        })
      }
    })
  })
};

var getMembership = function getMembership(data) {
  var roomName = data.roomName;
  var memberName = data.memberName;
  var membership = [];
  var isAdmin = false;
  var isMember = false;
  var isOwner = false;

  mongoose.model('Room').findOne({ name: roomName }).populate('_admins _owner _members').exec( function(err, room) {
    var adminsArray = [];
    var membersArray = [];

    if (room._admins) {
      Object.keys(room._admins).forEach(function(key) {
        adminsArray.push(room._admins[key].userName);
      })

      isAdmin = room._admins.some(function(admin) {
        return (admin.userName == memberName);
      })

      if (isAdmin) {
        membership.push(memberName);
      }
    }

    if (room._members) {
      Object.keys(room._members).forEach(function(key) {
        membersArray.push(room._members[key].userName);
      })

      isMember = room._members.some(function(admin) {
        return (admin.userName == memberName);
      })

      if (isMember) {
        membership.push(memberName);
      }
    }

    if (room._owner) {
      isOwner = (memberName == room._owner.userName);
      if (isOwner) {
        membership.push(memberName);
      }
    }

    return { isOwner: isOwner, isAdmin: isAdmin, isMember: isMember, membershipArray: membership };
  })
};

var isAdmin = function isAdmin(data) {
  var room = data.room;
  var username = data.username;
  var userid = data.userid;

  var isRoomAdmin = null;

  var adminsArray = [];
  logger.debug("room._admins.length: ", room._admins.length);
  if (room._admins) {
    Object.keys(room._admins).forEach(function(key) {
      adminsArray.push(room._admins[key].userName);
    })
    isRoomAdmin = room._admins.some(function(admin) {
      return (admin.userName == username);
    });
  }
  if (isRoomAdmin) {
    return true;
  }
};

var isOwner = function isOwner(data) {
  var room = data.room;
  var username = data.username;
  var userid = data.userid;

  var isRoomOwner = null;

  return (room._owner.userName == username);
};

module.exports = mongoose.model('Room', roomSchema);
