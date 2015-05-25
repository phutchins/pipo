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

module.exports = mongoose.model('Channel', channelSchema);
