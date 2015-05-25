var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var membershipSchema = new Schema({
  type: { type: String },
  channel: { type: String },
  members: [{ type: String }],
  socketId: { type: String }
});

module.exports = mongoose.model('Membership', membershipSchema);
