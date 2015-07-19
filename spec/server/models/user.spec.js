#! javascript

var mongoose = require('mongoose');

var Schema = mongoose.Schema;
var ObjectId = mongoose.ObjectId;

var User = require('../../../models/user');

describe('Create user', function() {
  it('should return an error when no data is provided', function() {
    var userData = null;
    User.create(userData, function(err, user) {
      expect(err).toMatch("no userdata provided to create user");
    })
  })
  it('should create a user when given valid data', function() {
    var userData = ({
      userName: 'TestUser',
      email: 'testuser@test.com',
      publicKey: ''
    });
    User.create(userData, function(user) {
      expect(typeof user == mongoose.Schema('User')).toBe(true);
    })
  })
});
