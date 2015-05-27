var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var channelSchema = new Schema({
  name: { type: String },
  description: { type: String },
  _userList: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User"  }],
  membership: {
    _current: [{ type: mongoose.SchemaTypes.ObjectId, ref: "User" }],
  }
});

channelSchema.statics.getUsersArray = function getChannelUsersArray(channel, callback) {
  Channel.findOne({ name: channel }).populate('_userList').exec(function(err, channel) {
    if (err) {
      return callback(err);
    } else if (channel == null) {
      return callback("[GETCHANNELUSERSARRAY] Channel is null");
    } else {
      var channelUsersArray = [];
      channel._userList.forEach(function(user) {
        channelUsersArray.push(user.userName);
      });
      console.log("[GETCHANNELUSERSARRAY] Channel users list array is: "+channelUsersArray.toString());
      return callback(null, channelUsersArray);
    };
  });
};

channelSchema.statics.addUser = function addUserToChannel(userName, channelName, callback) {
  User.findOne({ userName: userName }, function(err, user) {
    if (err) {
      console.log("[ADDUSERTOCHANNEL] Error finding user");
      return callback(err);
    } else {
      Channel.findOneAndUpdate( { name: channelName }, { $addToSet: { _userList: user }}, { upsert: true } ).populate('_userList').exec(function(err, channel) {
        if (err) {
          console.log("[ADDUSERTOCHANNEL] Error finding channel");
          return callback(err);
        } else if (channel == null) {
          console.log("[ADDUSERTOCHANNEL] Channel is NULL");
          return callback("Channel is NULL");
        } else {
          console.log("Added user "+userName+" to channel #"+channelName);
          getChannelUsersArray(channelName, function(err, channelUsersArray) {
            console.log("[ADDUSERTOCHANNEL] Channel users array is: "+channelUsersArray);
            return callback(null);
          });
        };
      });
    };
  });
};

channelSchema.statics.removeUser = function removeUserFromChannel(userName, channel, callback) {
  console.log("Removing user "+userName+" from channel "+channel);
  Membership.findOneAndUpdate({ type: 'userList', channel: channel }, { $pull: { members: userName }}, function(err, membership, count) {
    if (err) {
      return callback(err);
    } else {
      return callback(null);
    };
  });
};

module.exports = mongoose.model('Channel', channelSchema);
