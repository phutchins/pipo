#! javascript

var mongoose = require('mongoose');

var Schema = mongoose.Schema;
var ObjectId = mongoose.ObjectId;

var User = require('../../../../models/user');

var testPubKey = '-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: OpenPGP.js v1.0.1\nComment: http://openpgpjs.org\n\nxsBNBFWoMlQBCADfMUcy8Z31SvX/UbwzE8afo1mSuBEQGd7UTkcwEbmWOScT\nZu66tjAgGfWLpcot+A1eVA8mPiHQlgsLzMJu1AKm+u2ZNY/lzBgmcX/TsyK+\ng5mK3kzfPWUPpvt1+fgBwEe8UGUu9I0xk80MNqe7bJO5O2VULe+ofbCuc/L0\ngY4Fh8CfkEAYnOTPKA1tEb/7P9cu5YXJKJecbpwDJ/pZU2cAM4/OnRxATz0G\nwVUaWBtjRr+Bk+FulZQjJ0TqlFdPZck+37MpCrYTcOdUieA0yA1s6Ma0RNh1\nN/c95CXrawLDUWELIyg6AF5XUxbLKF0vDVV4l8k/I/tB/ZZtvEeMQerVABEB\nAAHNBmZsaXAxMsLAcgQQAQgAJgUCVagyWgYLCQgHAwIJECvy/wuE+RVwBBUI\nAgoDFgIBAhsDAh4BAACU3ggAoEtxanrqzrRikoapSLdZ23pdh2xf2NpTRUb6\nuG7BcaF6tYm3gXgOYeCcWNeSliO6whN/IzvZnsLpKEWgqz10YvTbs9nPmOKH\n18WEWKlTXhETDEU8AWGt/RvYjYx5msDoVyX35UOto6zKgV/aOWL8d86IDpPH\nfIe3S6/gm3alXeMmpGkzZUUR8J3kjHL/P+3f5ywN+YL7LO5iT2dn5MlSV6CN\n5spWcZH52HfhZWfZwb/KKcBG94yaUVAvDgihUa/G2xufy0JbMrS97AdjPK/9\nRopcGHc7nljLdNA41RPq8op34KzlDb9fEdD1a0KtHSsX+KPEmcLaEbCv+5Gq\nZkQ/qs7ATQRVqDJUAQgA5/3VSPG774BHfTyy0umwo/5u67V+sugAKn1rH79+\n7zRiuISkb29OKkHE29otuUdLJq7FhfxxadjSdXuMXYVlrTCASlNsd3mVgYFP\n/JxmgbvwO7vaaui40b7RWmbkQxYZU3ChsP3EMbA29VzBDQ2er3GEtSA1/m5O\n6fdk/Fuf9cZ8ta72MLqqCAf4gZa9ztBnVf6LdvITa9h8DSPhP2tq2M8/7iMQ\nnOVCFS51GK4GAP6d0OSPrkrtJF4l70+DNVUNIR6Gtm2VRLkMgOvVtXV8ejSy\nOqpjbDoxi3R5PQOqqGcWGHgpsDfid8zEeJNDZvwy8YUA+WXTeQ2nPtrn3mDs\nuQARAQABwsBfBBgBCAATBQJVqDJeCRAr8v8LhPkVcAIbDAAAnc8IAKvC36wa\nBxZ0xP0Cm/7/vLabgaL0EeI7juWCDejg/bSc6SQjtJ9Tn91yCJ1Y2e3vZNFB\nYmV/GhZxadZNYTJPJg3bVl1a1iQNlnBa9JSaEJ07glgOtTyNlChzF3uTA5rr\nplRGL8cF4OfuI3TFV2QdHXsPYgNE0rYQI9kCbDcTSKBcD4WY7wYhQCCNs/v6\nDCYf60hcjZVCNskTsnLqTFIxTSAUag5KaBnekyThUd94raO6HjuW+A1eDRFR\nzZpxc7OFmGB0FzRQx3GhQvla4xevaoQjU09aD9Lstkc9Kc1s+JuGGF14zOu1\n2ypvMLDaWnmVFM7VW99sVHY0y6rUmjW3D5k=\n=nKRV\n-----END PGP PUBLIC KEY BLOCK-----';

describe('Create user', function() {
  // Create a spy for newUser.save and mongoose.model('User').findOne
  it('should return an error when no data is provided', function(done) {
    var userData = null;
    User.create(userData, function(err, user) {
      expect(err).toMatch("no userdata provided to create user");
      done();
    })
  })
  it('should create a user when given valid data', function(done) {
    var userData = {
      userName: 'TestUser',
      email: 'testuser@test.com',
      publicKey: testPubKey
    };
    User.create(userData, function(err, user) {
      expect(typeof user == mongoose.Schema('User')).toBe(true);
      done();
    })
  })
  it('should handle missing data while creating a user', function(done) {
    var userData = {
      userName: 'TestUser',
      email: null,
      publicKey: ''
    };
    User.create(userData, function(err, user) {
      expect(err).toMatch("Missing username, publickey or email");
      done();
    })
  })
});
