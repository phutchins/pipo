'use strict';

var expect = require('chai').expect;
var mongoose = require('mongoose');

describe('database', function() {
  var database = require('../../../server/js/database');

  describe('#connect', function() {
    it('should return a mongoose connection to the database', function() {
      //expect(database.connect).to.be.instanceof(mongoose.Connection);
    });
  });
});
