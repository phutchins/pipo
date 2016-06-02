'use strict';

var expect = require('chai').expect;
var app = require('express')();

describe('AuthenticationManager', function() {
  var AuthenticationManager = require('../../../../server/js/managers/authentication');

  describe('#init', function() {
    AuthenticationManager.init(app);

    it('should initialize passport', function() {
    });

    it('should use the KeyVerifyStrategy', function() {
    });
  });

  describe('#verify', function() {
    var badCreds = {
      username: 'badguy',
      nonce: 'jkf3jkj3fjfk32934',
      signature: 'ksdfjoiwhbvlkjweo'
    };

    it('verification should return false with bad credentials', function() {
      AuthenticationManager.verify(badCreds.username, badCreds.nonce, badCreds.signature, function(err, verified) {
        expect(err).to.be.null;
        expect(verified).to.be.false;
      });
    });
  });
});
