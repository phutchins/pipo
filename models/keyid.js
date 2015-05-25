var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var keyIdSchema = new Schema({
  type: { type: String },
  channel: { type: String },
  id: { type: Number }
});

module.exports = mongoose.model('KeyId', keyIdSchema);
