'use strict'

var expect = require('chai').expect;
var chatHeader = require('../../js/chat/header.js');

describe('chatHeader', function() {

  describe('update', function() {
    it('should update the icon appropriately for type chat', function(callback) {
    });

    it('should update the icon appropriately for type room', function(callback) {

    });

    it('should enable the favorite button if room is a favorite', function(callback) {
      //chatHeader.update('57cb9d08f0c5bea981140b65');
    });

    it('should be able to determine if a room is a favorite or not', function(callback) {
      var ChatManager = {
        userProfile: {
          membership: {
            favoriteRooms: [
              '57cb9d08f0c5bea981140b65'
            ]
          }
        },
        activeChat: '57cb9d08f0c5bea981140b65',
        chats: {
          '57cb9d08f0c5bea981140b65': {
            name: 'testChat',
            topic: 'test topic',
            group: 'test group'
          }
        }
      };

      var isFavorite = chatHeader.isFavorite('57cb9d08f0c5bea981140b65');

      expect(isFavorite).to.equal(true);
      callback();

    });
  });
});
