'use strict';

var sinon = require('sinon');
var expect = require('chai').expect;
var Server = require('../../server/server.js');


describe('Server', function() {
  describe('@constructor', function() {
    it('should create instance', function() {
      expect(Server()).to.be.instanceOf(Server);
    });

    // Should create an instance of http server
  });

  describe('#createSystemUser', function() {
    it('should create a system user', function() {
      //check if it created system user
    });
  });

});
