#!javascript
//spec/socketServer.spec.js

var mongoose = require('mongoose');
var socketIO = require('socket.io');
var express = require('express');
var https = require('https');

var Schema = mongoose.Schema;
var ObjectId = mongoose.ObjectId;

var User = require('../../models/user');
var Room = require('../../models/room');

var configHttps = require('../../config/https');

var app = express();
var server = require('../../server');
var server = https.createServer({key: configHttps.serviceKey, cert: configHttps.certificate}, app);
var io = socketIO(server);
var SocketServer = require('../../socketServer');
var ioMain = io.of('/socket');
var socketServer = null;


socketServer = new SocketServer(ioMain);
//socketServer.onSocket(socket);

// Stubbed objects
var testUser = new User({
  userName: 'TestUser1',
  userNameLowerCase: 'testuser1',
  email: 'testuser@email.com',
  emailHash: '810ed1d1f1315e3104734fb720a95873',
  publicKey: "-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: OpenPGP.js v1.0.1\nComment: http://openpgpjs.org\n\nxsBNBFWoMlQBCADfMUcy8Z31SvX/UbwzE8afo1mSuBEQGd7UTkcwEbmWOScT\nZu66tjAgGfWLpcot+A1eVA8mPiHQlgsLzMJu1AKm+u2ZNY/lzBgmcX/TsyK+\ng5mK3kzfPWUPpvt1+fgBwEe8UGUu9I0xk80MNqe7bJO5O2VULe+ofbCuc/L0\ngY4Fh8CfkEAYnOTPKA1tEb/7P9cu5YXJKJecbpwDJ/pZU2cAM4/OnRxATz0G\nwVUaWBtjRr+Bk+FulZQjJ0TqlFdPZck+37MpCrYTcOdUieA0yA1s6Ma0RNh1\nN/c95CXrawLDUWELIyg6AF5XUxbLKF0vDVV4l8k/I/tB/ZZtvEeMQerVABEB\nAAHNBmZsaXAxMsLAcgQQAQgAJgUCVagyWgYLCQgHAwIJECvy/wuE+RVwBBUI\nAgoDFgIBAhsDAh4BAACU3ggAoEtxanrqzrRikoapSLdZ23pdh2xf2NpTRUb6\nuG7BcaF6tYm3gXgOYeCcWNeSliO6whN/IzvZnsLpKEWgqz10YvTbs9nPmOKH\n18WEWKlTXhETDEU8AWGt/RvYjYx5msDoVyX35UOto6zKgV/aOWL8d86IDpPH\nfIe3S6/gm3alXeMmpGkzZUUR8J3kjHL/P+3f5ywN+YL7LO5iT2dn5MlSV6CN\n5spWcZH52HfhZWfZwb/KKcBG94yaUVAvDgihUa/G2xufy0JbMrS97AdjPK/9\nRopcGHc7nljLdNA41RPq8op34KzlDb9fEdD1a0KtHSsX+KPEmcLaEbCv+5Gq\nZkQ/qs7ATQRVqDJUAQgA5/3VSPG774BHfTyy0umwo/5u67V+sugAKn1rH79+\n7zRiuISkb29OKkHE29otuUdLJq7FhfxxadjSdXuMXYVlrTCASlNsd3mVgYFP\n/JxmgbvwO7vaaui40b7RWmbkQxYZU3ChsP3EMbA29VzBDQ2er3GEtSA1/m5O\n6fdk/Fuf9cZ8ta72MLqqCAf4gZa9ztBnVf6LdvITa9h8DSPhP2tq2M8/7iMQ\nnOVCFS51GK4GAP6d0OSPrkrtJF4l70+DNVUNIR6Gtm2VRLkMgOvVtXV8ejSy\nOqpjbDoxi3R5PQOqqGcWGHgpsDfid8zEeJNDZvwy8YUA+WXTeQ2nPtrn3mDs\nuQARAQABwsBfBBgBCAATBQJVqDJeCRAr8v8LhPkVcAIbDAAAnc8IAKvC36wa\nBxZ0xP0Cm/7/vLabgaL0EeI7juWCDejg/bSc6SQjtJ9Tn91yCJ1Y2e3vZNFB\nYmV/GhZxadZNYTJPJg3bVl1a1iQNlnBa9JSaEJ07glgOtTyNlChzF3uTA5rr\nplRGL8cF4OfuI3TFV2QdHXsPYgNE0rYQI9kCbDcTSKBcD4WY7wYhQCCNs/v6\nDCYf60hcjZVCNskTsnLqTFIxTSAUag5KaBnekyThUd94raO6HjuW+A1eDRFR\nzZpxc7OFmGB0FzRQx3GhQvla4xevaoQjU09aD9Lstkc9Kc1s+JuGGF14zOu1\n2ypvMLDaWnmVFM7VW99sVHY0y6rUmjW3D5k=\n=nKRV\n-----END PGP PUBLIC KEY BLOCK-----",
  membership: {
    autoJoin: [],
    currentRooms: [],
    rooms: []
  }
});

var testPublicRoom = new Room({
  name: 'testroom',
  topic: 'test room topic',
  group: 'default',
  keepHistory: true,
  encryptionScheme: 'clientkey',
  membershipRequired: false,
  _owner: testUser,
  _members: [ testUser ],
  _admins: [ testUser ],
  messages: [ ]
});


describe("sanatize room for client", function() {
  it("should convert _members object to array of usernames", function() {
    socketServer.sanatizeRoomForClient(testPublicRoom, function(sanatizedRoom) {
      console.log("Sanatized room is:",sanatizedRoom);
      expect(sanatizedRoom).toBe(0);
    })
  })
});
