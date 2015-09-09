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
  _members: [{
    member: { type: mongoose.SchemaTypes.ObjectId, ref: "User", default: []  },
    active: { type: Boolean, default: false }
  }],
  _messages: [{ type: mongoose.SchemaTypes.ObjectId, ref: "Message", default: [] }]
});

roomSchema.statics.create = function create(data, callback) {
  var self = this;

  var ownerName = data.username;
  var roomName = data.name;
  var topic = data.topic;
  var encryptionScheme = data.encryptionScheme;
  var keepHistory = data.keepHistory;
  var membershipRequired = data.membershipRequired;

  mongoose.model('User').findOne({ username: ownerName }, function(err, owner) {
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
      keepHistory: keepHistory,
      membershipRequired: membershipRequired,
      createDate: Date.now(),
      _owner: owner,
      _admins: [],
      _members: []
    })
    //newRoom._members.push(user);
    newRoom.save(function(err) {
      callback(null, newRoom);
    })
  })
};

roomSchema.statics.getByName = function getByName(name, callback) {
  var self = this;

  logger.debug("[ROOM] (getByName) Finding room #" + name + " by name");
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

// TODO: This needs to be renamed so we can use the built in update function
roomSchema.statics.update = function update(data, callback) {
  var self = this;
  mongoose.model('User').findOne({ username: data.username }, function(err, user) {
    if (err) {
      return callback(err);
    }
    if (!user) {
      return logger.error("Could not find user " + data.username + " while updating creating room " + data.name);
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


/*
 * Join a public room and add user as a member of that room
 * (Should move session type bits to a clientSessionStart and clientSessionEnd (or something similar))
 */
roomSchema.statics.join = function join(data, callback) {
  var self = this;
  var username = data.username;
  var name = data.name;
  mongoose.model('User').findOne({ username: username }, function(err, user) {
    var user = user;
    mongoose.model('Room').findOne({ name: name }).populate('_members _owner _admins _messages').exec(function(err, room) {
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
      var isMember = room._members.some(function(member) {
        return member._id.equals(user._id);
      });
      if (isMember || !self.membershipRequired || room.name == 'pipo') {
        //self.populate(room, { path: '_owner _admins messages._user' });
        logger.debug("User " + username + " has joined #" + data.name);
        mongoose.model('Room').findOneAndUpdate({ 'members': { $elemMatch: { '_member': user  } } }, { '$members.active': true });
        user.save();
        return callback(null, { auth: true, room: room });
      } else {
        logger.debug("User " + username + " unable to join #" + name + " due to incorrect membership");
        // Should not return room name? Should catch error...
        return callback(null, { auth: false, room: { name: name } });
      }
    })
  })
};

roomSchema.statics.part = function part(data, callback) {
  mongoose.model('User').findOne({ username: data.username }).populate('membership.rooms._room').exec(function(err, user) {
    mongoose.model('Room').findOne({ name: data.name }).populate('_members _admins _owner').exec(function(err, room) {
      if (err) {
        return callback(err, false);
      }

      if (!room) {
        return logger.error("No room found when trying to part for user " + data.username);
      }

      var isMember = null;

      if (typeof user.membership._currentRooms == 'Object') {
        logger.debug("[ROOM} user.membership._currentrooms: ", user.membership._currentRooms);
        logger.debug("[ROOM] (BEFORE) User " + data.username + " is a member of ", Object.keys(user.membership._currentRooms).length());
        // Check SocketServer.namespace.socketmap for the user to see if there are any remaining sockets open for this room


        mongoose.model('Room').findOneAndUpdate({ 'members': { $elemMatch: { '_member': user } } }, { '$members.active': false });
      }

      user.save(function(err) {
        logger.debug("User " + data.username + " has parted #" + data.name + " successfully");
        return callback(null, true);
      });
    })
  })
};

/*
 * Add a member to a channel
 * TODO: Need to move the auth checking for ability to add, change or delete a member to its own method
 */
roomSchema.statics.addMember = function addMember(data, callback) {
  var username = data.username;
  var member = data.member;
  var roomName = data.roomName;
  var membership = data.membership;
  var pushed = false;

  logger.debug("[ADD MEMBER] Finding user '" + username + "' who is adding member '" + member + "' to '" + roomName + "'");
  mongoose.model('User').findOne({ username: username }, function(err, user) {
    if (err) {
      logger.debug("[ROOM] (addMember) Database error while finding user " + username);
      return callback({ success: false, message: "Error finding user " + username });
    }

    if (!user) {
      return callback({ success: false, message: "No user '" + username + "' found." });
    }

    mongoose.model('Room').findOne({ name: roomName }).populate('_admins _owner').exec( function(err, room) {
      if (err) {
        logger.error("[ROOM] (addMember) Error while trying to find room");
        return callback({ success: false, message: "Error finding room" });
      }

      if (!room) {
        logger.error("No room found trying to add member to room " + username);
        return callback({ success: false, message: "No room found" });
      }

      var isRoomAdmin = null;
      var isRoomOwner = null;

      logger.debug("room._owner.username:", room._owner.username);

      var adminsArray = [];
      logger.debug("room._admins.length: ", room._admins.length);
      if (room._admins) {
        Object.keys(room._admins).forEach(function(key) {
          adminsArray.push(room._admins[key].username);
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
        mongoose.model('User').findOne({ username: member }, function(err, memberObj) {
          logger.debug("Requesting user " + username + " is an admin of room " + room.name + " so adding " + member + " as a " + membership);

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

          logger.debug("[ROOM] pushing member",memberObj.username,"to room",room.name,"as a",membership);

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

  mongoose.model('User').findOne({ username: username }, function(err, user) {
    if (err) {
      return callback({ success: false, message: err, roomName: roomName });
    }

    if (!user) {
      return callback({ success: false, message: "No user found with username " + username, roomName: roomName });
    }

    logger.debug("[ROOM] (modifyMember) Found user " + user.username + ", looking up room " + roomName);

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
      if (room._owner) {
        isRoomOwner = room._owner._id.equals(user._id);
      }
      if (isRoomOwner) {
        logger.debug("[ROOM] (modifyMember) User " + username + " is the owner of " + room.name);
        mongoose.model('User').findOne({ username: memberName }, function(err, member) {
          if (membership == 'owner') {
            // Add the member as owner
            logger.debug("[ROOM] (modifyMember) Setting room._owner which is currently",room._owner.username,"to",member.username);

            // Should be more precise with the way that we remove users from membership
            room._admins.push({ _id: room._owner._id });
            room._owner = member;
            room._members.pull(member);

            room.save(function(err) {
              mongoose.model('Room').findOneAndUpdate({ name: room.name }, { $pull: { _admins: member._id.toString() } }, function(err, pulledRoom) {
                return callback({ success: true, message: "Membership change saved", roomName: roomName });
              })
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
            if (room._owner.username == member.username) {
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
        mongoose.model('User').findOne({ username: memberName }, function(err, member) {
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
            if (isAdmin({ room: room, username: member.username})) {
              return callback({ success: false, message: "You must be the owner to remove an admin", roomName: roomName });
            }
            if (room._owner.username == member.username) {
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
        adminsArray.push(room._admins[key].username);
      })

      isAdmin = room._admins.some(function(admin) {
        return (admin.username == memberName);
      })

      if (isAdmin) {
        membership.push(memberName);
      }
    }

    if (room._members) {
      Object.keys(room._members).forEach(function(key) {
        membersArray.push(room._members[key].username);
      })

      isMember = room._members.some(function(admin) {
        return (admin.username == memberName);
      })

      if (isMember) {
        membership.push(memberName);
      }
    }

    if (room._owner) {
      isOwner = (memberName == room._owner.username);
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
      adminsArray.push(room._admins[key].username);
    })
    isRoomAdmin = room._admins.some(function(admin) {
      return (admin.username == username);
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

  return (room._owner.username == username);
};

module.exports = mongoose.model('Room', roomSchema);
