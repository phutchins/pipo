var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var Message = require('./message');
var logger = require('../../config/logger');

/*
 * Room Membership Definitions
 * _owner - Owner of the room, there can only be one
 * _admins - Array of admins for the room
 * _members - Array of members of the room
 *
 * Room Status Definitions
 * _activeUsers - Users that have a current connection and have joined the room
 * _subscribers - Users that want to receive updates from the room even if they are not connected or joined
 *
 */

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
  _members: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User", default: [] }],
  _activeUsers: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User", default: [] }],
  _subscribers: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User", default: [] }]
});

roomSchema.statics.create = function create(data, callback) {
  var self = this;

  var ownerName = data.username;
  var roomName = data.name;
  var topic = data.topic;
  var encryptionScheme = data.encryptionScheme;
  var keepHistory = data.keepHistory;
  var membershipRequired = data.membershipRequired;

  logger.debug("[room.create] Creating room #" + roomName + " with owner ", ownerName);

  mongoose.model('User').findOne({ username: ownerName }, function(err, owner) {
    if (err) {
      return callback(err);
    }

    if (!owner) {
      return logger.error("Could not find user " + ownerName + " while creating room " + roomName);
    }

    // Make sure a room with this name doesn't already exist
    mongoose.model('Room').findOne({ name: roomName }, function(err, room) {
      if (room) {
        return callback('room already exists', null);
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
        _members: [],
        _admins: []
      })

      newRoom._members.push(owner._id);

      newRoom.save(function(err) {
        mongoose.model('Room').findOne({ name: newRoom.name }).populate('_owner _members _admins').exec(function(err, myRoom) {
          return callback(null, myRoom);
        });
      })
    })
  })
};

roomSchema.statics.getByName = function getByName(name, callback) {
  var self = this;

  logger.debug("[ROOM] (getByName) Finding room #" + name + " by name");
  mongoose.model('Room').findOne({ name: name })
    .populate('_members _owner _admins _subscribers _activeUsers')
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
      return logger.error("[room.update] Could not find user " + data.username + " while updating creating room " + data.name);
    }
    logger.debug("[room.update] Looking for room '" + data.name + "' with id '" + data.id + "'");
    mongoose.model('Room').findOne({ _id: data.id }).populate('_owner _members _admins _activeUsers _subscribers').exec(function(err, room) {
      if (err) {
        return logger.error('[room.update] Error finding room to update:',err);
      }

      if (!room) {
        return logger.error("[room.update] Could not find room '" + data.name + "' with id '" + data.id + "'");
      }
      logger.debug("[room.update] Found room '" + room.name + "' with id '" + room.id + "'");

      logger.debug("[room.update] Updating room with data:",data);

      room.name = data.name;
      room.topic = data.topic;
      room.encryptionScheme = data.encryptionScheme;
      room.keepHistory = data.keepHistory;
      room.membershipRequired = data.membershipRequired;

      room.save(function(err) {
        if (err) {
          return logger.error("[room.update] Error updating room:",err);
        }

        mongoose.model('Room').findOne({ _id: data.id }).populate('_owner _members _admins _activeUsers _subscribers').exec( function(err, room) {
          logger.debug("[room.update] Found room:",room.name);
          callback(null, room);
        });
      })
    })
  })
};



/*
 * Convert all mongoose objects to arrays or hashes
 * Users will be looked up on the client side using username or id
 */
roomSchema.statics.sanatize = function sanatize(room, callback) {
  var self = this;

  if (room._owner) {
    var ownerusername = room._owner.username;
  } else {
    logger.error("[room.sanatize] Room owner does not exist");
    var ownerusername = null;
  }

  var membersLength = room._members.length;
  var adminsLength = room._admins.length;
  var activeUsersLength = room._activeUsers.length;
  var subscribersLength = room._subscribers.length;

  var membersArray = [];
  var adminsArray = [];
  var subscribersArray = [];
  var activeUsersArray = [];
  var messagesArray = [];

  if (membersLength > 0) {
    room._members.forEach(function(member) {
      membersArray.push(member._id.toString());
    });
  };

  if (subscribersLength > 0) {
    room._subscribers.forEach(function(subscriber) {
      subscribersArray.push(subscriber._id.toString());
    });
  };

  if (activeUsersLength > 0) {
    room._activeUsers.forEach(function(activeUser) {
      activeUsersArray.push(activeUser._id.toString());
    });
  };

  if (adminsLength > 0) {
    room._admins.forEach(function(admin) {
      adminsArray.push(admin._id.toString());
    });
  };

  if (room.messages && room.messages.length > 0) {
    var processedMessages = 0;
    mongoose.model('Message').bulkSanatize(room.messages, function(sanatizedMessages) {
      messagesArray = sanatizedMessages;

      finish();
    });
  };

  var finish = function finish() {
    logger.debug("[room.sanatize] Finishing...");

    var sanatizedRoom = {
      id: room._id.toString(),
      type: 'room',
      name: room.name,
      topic: room.topic,
      group: room.group,
      messageCache: '',
      messages: messagesArray.sort(dynamicSort("date")),
      encryptionScheme: room.encryptionScheme,
      keepHistory: room.keepHistory,
      membershipRequired: room.membershipRequired,
      members: membersArray,
      activeUsers: activeUsersArray,
      subscribers: subscribersArray,
      admins: adminsArray,
      owner: room._owner._id.toString()
    };

    return callback(sanatizedRoom);
  }

  // If there are no messages or the messages array is empty, go ahead and finish
  if (!room.messages || ( room.messages && room.messages.length == 0 )) {
    finish();
  };
};


function dynamicSort(property) {
  var sortOrder = 1;
  if(property[0] === "-") {
    sortOrder = -1;
    property = property.substr(1);
  }
  return function (a,b) {
    var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
    return result * sortOrder;
  }
}



roomSchema.statics.sanatizeRooms = function sanatizeRooms(rooms, callback) {
  var self = this;
  var sanatizedRooms = {};
  var roomCount = rooms.length;
  var count = 0;

  logger.debug("[room.sanatizeRooms] Sanatizing " + rooms.length + " rooms");

  rooms.forEach(function(room) {
    logger.debug("[room.sanatizeRooms] Sanatizing room '" + room.name + "'");

    mongoose.model('Room').sanatize(room, function(sanatizedRoom) {
      logger.debug("[room.sanatizeRooms] Done sanatizing room and pushing '" + sanatizedRoom.name + "' to array...");
      sanatizedRooms[sanatizedRoom.id] = sanatizedRoom;
      count += 1;

      logger.debug("[room.sanatizeRooms] Total rooms: " + roomCount + " count: " + count);

      if (count == roomCount) {
        logger.debug("[room.sanatizeRooms] Sanatized " + Object.keys(sanatizedRooms).length + " rooms and returning");
        return callback(sanatizedRooms);
      };
    });

  });
};



/*
 * Join a public room and add user as a member of that room
 * (Should move session type bits to a clientSessionStart and clientSessionEnd (or something similar))
 */
roomSchema.statics.join = function join(data, callback) {
  var self = this;
  var username = data.username;
  var socket = data.socket;
  var updated = false;
  var id = data.id;
  mongoose.model('User').findOne({ username: username }, function(err, user) {
    var user = user;
    mongoose.model('Room').findOne({ _id: id }).populate('_members _owner _admins').exec(function(err, room) {
      if (err) {
        return callback(err, { auth: false });
      }

      if (!room) {
        logger.debug("Room with id " + id + " does not exist...");
      }

      // Set isMember to true if the user is a member of this room
      var isMember = room._members.some(function(member) {
        return member._id.equals(user._id);
      });

      if (isMember || !self.membershipRequired || room.name == 'pipo') {
        socket.join(room._id.toString());

        logger.debug("[room.join] User " + username + " has joined #" + room.name);

        // Set the member to active in room._activeUsers
        mongoose.model('Room').findOneAndUpdate({ $addToSet: { _activeUsers: user._id } });

        user.membership._currentRooms.push(room._id);

        user.save(function(err) {
          if (err) {
            logger.error("[room.join] Error while adding room to _currentRooms: " + err);
          } else {
            logger.debug("[room.join] Added room to users _currentRooms array");
          }
        });

        // Does this work? Needed?
        var alreadySubscribed = (room._subscribers.indexOf(user._id) > -1);


        // Should only subscribe if not already subscribed
        self.subscribe({ userId: user._id, roomId: room._id }, function(data) {
          var updatedRoom = data.room;
          mongoose.model('Message').get({ chatId: updatedRoom.id, type: 'room', messagesPerPage: 10, page: 0, pages: 1 }, function(err, messages) {
            updatedRoom.messages = messages;
            //var sortedMessages = messages.sort(function(m2, m1) { return m1.date - m2.date; });

            if (data.err) {
              logger.error("[room.join] Error: data.err");
              return callback(data.err, { auth: false, updated: updated, room: { name: name } } );
            }

            if (!alreadySubscribed) {
              updated = true;
            };

            logger.debug("[room.join] Successfully subscribed " + user.username + " to #" + updatedRoom.name + ". Returning updated room with auth true");
            return callback(null, { auth: true, updated: updated, room: updatedRoom });
          });
        });
      } else {
        logger.debug("User " + username + " unable to join #" + room.name + " due to incorrect membership");
        // Should not return room name? Should catch error...
        return callback(null, { auth: false, updated: updated, room: { name: room.name } });
      }
    })
  })
};

/*
 * Add a user as a member of a public room so that they get notifications and appear in the userlist
 */
roomSchema.statics.subscribe = function subscribe(data, callback) {
  var self = this;
  var userId = data.userId;
  var roomId = data.roomId;

  logger.debug("[room.subscribe] Subscribing userId: '" + userId + "' to roomId '" + roomId + "'");

  mongoose.model('Room').findOneAndUpdate({ _id: roomId }, { $addToSet: { _subscribers: mongoose.Types.ObjectId(userId) } }, { new: true }).populate('_members _owner _admins _messages _subscribers _activeUsers').exec(function(err, room) {

    return callback({ room: room });
  });
};

/*
 * Remove a users membership to a public room so that they do not show up in the userlist and do not get notifications
 */
roomSchema.statics.unsubscribe = function subscribe(data, callback) {
  var self = this;
  var userId = data.userId;
  var roomId = data.roomId;

  logger.debug("[room.unsubscribe] Unsubscribing userId: '" + userId + "' from roomId '" + roomId + "'");

  mongoose.model('Room').findOneAndUpdate({ _id: roomId }, { $pull: { _subscribers: mongoose.Types.ObjectId(userId) } }, { new: true }, function(err, room) {
    return callback({ room: room });
  });
};



roomSchema.statics.part = function part(data, callback) {
  var userId = data.userId;
  var chatId = data.chatId;
  var socket = data.socket;

  mongoose.model('User').findOne({ _id: userId }).populate('membership._currentRooms').exec(function(err, user) {
    if (err) {
      return callback(err, false);
    };

    if (!user) {
      var err = "No user found while trying to part room with id '" + chatId + "'";
      return callback(err, false);
    };

    mongoose.model('Room').findOne({ _id: chatId }).populate('_members _admins _owner').exec(function(err, room) {
      if (err) {
        return callback(err, false);
      }

      if (!room) {
        return logger.error("No room found when trying to part for user " + user.username);
      }

      var isMember = null;

      if (typeof user.membership._currentRooms == 'Object') {
        logger.debug("[ROOM} user.membership._currentrooms: ", user.membership._currentRooms);
        logger.debug("[ROOM] (BEFORE) User " + user.username + " is a member of ", user.membership._currentRooms.length);

        // Check SocketServer.namespace.socketmap for the user to see if there are any remaining sockets open for this room
        // Is this a good place to be referencing SocketServer from? Maybe the logic goes in the calling class or lib.

        mongoose.model('Room').findOneAndUpdate({ 'members': { $elemMatch: { '_member': user } } }, { '$members.active': false });
        socket.leave(chatId);
      }

      user.membership._currentRooms.pull(room._id);

      user.save(function(err) {
        logger.debug("User " + userId + " has parted #" + room.name + " successfully");
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
  var memberName = data.memberName;
  var userId = data.userId;
  var memberId = data.memberId;
  var chatId = data.chatId;
  var membership = data.membership;
  var pushed = false;

  logger.debug("[ADD MEMBER] Finding user '" + username + "' who is adding member '" + memberName + "' to '" + chatId + "'");
  mongoose.model('User').findOne({ _id: userId }, function(err, user) {
    if (err) {
      logger.debug("[ROOM] (addMember) Database error while finding user " + username);
      return callback({ success: false, message: "Error finding user " + username });
    }

    if (!user) {
      return callback({ success: false, message: "No user '" + username + "' found." });
    }

    mongoose.model('Room').findOne({ _id: chatId }).populate('_admins _owner _members').exec( function(err, room) {
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
      var adminsArray = [];

      logger.debug("room._owner.username:", room._owner.username);
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
        mongoose.model('User').findOne({ _id: memberId }, function(err, memberObj) {
          logger.debug("Requesting user " + username + " is an admin of room " + room.name + " so adding " + memberName + " as a " + membership);

          if (!memberObj) {
            return callback({ success: false, message: "I cannot find the user '" + memberName + "' so I am unable to add them to #" + room.name } );
          }

          var isInArray = room._members.some(function (member) {
            return member._id.equals(memberObj._id);
          });

          // Dying somewhere around here and not calling callback

          logger.debug("[ROOM] isInArray: ",isInArray);
          if (isInArray) {
            return callback({ success: false, message: "User '" + memberName + "' is already a member of this room" } );
          }

          logger.debug("[ROOM] pushing member",memberObj.username,"to room",room.name,"as a",membership);

          if (membership == 'member') {
            room._members.push(memberObj._id);
            pushed = true;
          };

          if (membership == 'admin' && isRoomOwner) {
            room._admins.push(memberObj);
            pushed = true;
          };

          if (membership == 'owner' && isRoomOwner) {
            room._owner = memberObj;
            pushed = true;
          };

          if (!pushed) {
            return callback({ success: false, message: "You must be the room owner of " + room.name + " to add an admin" });
          }

          room.save(function(err) {
            logger.debug("[ROOM] Done saving room, calling callback");
            return callback({ success: true, message: memberName + " has been added as a member of #" + room.name });
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
  var chatId = data.chatId;
  var isRoomOwner = false;

  mongoose.model('User').findOne({ username: username }, function(err, user) {
    if (err) {
      return callback({ success: false, message: err, chatId: chatId });
    }

    if (!user) {
      return callback({ success: false, message: "No user found with username " + username, chatId: chatId });
    }

    logger.debug("[ROOM] (modifyMember) Found user " + user.username + ", looking up room " + chatId);

    mongoose.model('Room').findOne({ _id: chatId }).populate('_admins _owner _members').exec( function(err, room) {
      if (err) {
        logger.error("[ROOM] (modifyMember) Error while finding room trying to modify member ",member,"in room",chatId);
        return callback({ success: false, message: err, chatId: chatId });
      }

      if (!room) {
        logger.error("No room found trying to modify membership for",member,"in room",chatId);
        return callback({ success: false, message: "No room found, trying to modify membership for " + member + "in room"+chatId, chatId: chatId });
      }

      logger.debug("[ROOM] (modifyMember) Found room ", chatId);
      if (room._owner) {
        isRoomOwner = room._owner._id.equals(user._id);
      }
      if (isRoomOwner) {
        logger.debug("[ROOM] (modifyMember) User " + username + " is the owner of " + room.name);
        logger.debug("[room.modifyMember] memberName is: ",memberName);
        mongoose.model('User').findOne({ _id: memberName }, function(err, member) {
          if (!member) {
            return callback({ success: false, message: "No member found with the name '" + memberName + "'", chatId: chatId});
          };

          if (membership == 'owner') {
            // Add the member as owner
            logger.debug("[ROOM] (modifyMember) Setting room._owner which is currently",room._owner.username,"to",member.username);

            // Should be more precise with the way that we remove users from membership
            room._admins.push({ _id: room._owner._id });
            room._owner = member;
            room._members.pull(member._id);

            room.save(function(err) {
              mongoose.model('Room').findOneAndUpdate({ name: room.name }, { $pull: { _admins: member._id.toString() } }, function(err, pulledRoom) {
                return callback({ success: true, message: "Membership change saved", chatId: chatId });
              })
            })
          }

          // Add the user to admins of this room
          if (membership == 'admin') {
            // Add user to admins
            room._admins.push(member._id);
            // Remove the member from members if they are a member
            room._members.pull(member._id);
            room.save(function(err) {
              return callback({ success: true, message: "Membership change saved", chatId: chatId });
            })
          }

          // Add the user to members of room
          if (membership == 'member') {
            // Add user to members
            room._members.push(member._id);
            // Remove user from admins if they are an admin
            room._admins.pull(member._id);

            room.save(function(err) {
              return callback({ success: true, message: "Membership change saved", chatId: chatId });
            })
          }

          // Remove the user from the room
          if (membership == 'remove') {
            if (room._owner.username == member.username) {
              return callback({ success: false, message: "You cannot remove the owner. You must choose a different owner, then remove the member", chatId: chatId });
            }

            // Add user to members
            room._members.pull(member._id);
            // Remove user from admins if they are an admin
            room._admins.pull(member._id);

            room.save(function(err) {
              return callback({ success: true, message: "Member removed", chatId: chatId });
            })
          }
        })
      }
      if (isAdmin({ room: room, username: username })) {
        logger.debug("[ROOM] (modifyMember) User " + username + " is an admin of " + room.name);
        mongoose.model('User').findOne({ username: memberName }, function(err, member) {
          // determine if member is currently an admin or member
          var currentMembership = getMembership({ chatId: room._id, memberName: member });

          // Add the user to members of room
          if (membership == 'member') {
            // Add user to members
            room._members.push(member);
            // Remove user from admins if they are an admin
            room._admins.pull(member);

            room.save(function(err) {
              return callback({ success: true, message: "Membership change saved", chatId: chatId });
            })
          }

          // Remove the user from the room
          if (membership == 'remove') {
            // check if user we're trying to remove is an admin or owner
            if (isAdmin({ room: room, username: member.username})) {
              return callback({ success: false, message: "You must be the owner to remove an admin", chatId: chatId });
            }
            if (room._owner.username == member.username) {
              return callback({ success: false, message: "You must be the owner to remove an admin", chatId: chatId });
            }

            // if not, remove the user
            room._members.pull(member);

            room.save(function(err) {
              return callback({ success: true, message: "Membership change saved", chatId: chatId });
            })
          }

          if (membership == 'admin') {
            return callback({ success: false, message: "You must be the owner of a room to add an admin", chatId: chatId });
          }
          if (membership == 'owner') {
            return callback({ success: false, message: "You must be the current owner of a room to change its owner", chatId: chatId });
          }
        })
      }
    })
  })
};

var getMembership = function getMembership(data) {
  var chatId = data.chatId;
  var memberName = data.memberName;
  var membership = [];
  var isAdmin = false;
  var isMember = false;
  var isOwner = false;

  mongoose.model('Room').findOne({ _id: chatId }).populate('_admins _owner _members').exec( function(err, room) {
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
