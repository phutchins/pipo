#! javascript

var mongoose = require('mongoose');

var Schema = mongoose.Schema;
var ObjectId = mongoose.ObjectId;

var User = require('../../../models/user');

describe('Create user', function() {
  it('should create a user', function() {
    var userData = null;
    User.create(userData, function(user) {
      expect(typeof user == mongoose.Schema('User')).toBe(true);
    })
  })
});
