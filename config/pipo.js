'use strict';

module.exports = function(){
  var development = {
    environment: 'development',
    encryptionStrategy: 'clientKey',
    encryptionType: 'aes256',
    chats: {
      messagesPerPage: 50,
      initialPagesToLoad: 1
    },
    server: {
      ssl: false,
      host: 'localhost',
      port: 3030,
    },
    client: {
      ssl: false,
      port: 3030,
      host: 'localhost'
    },
    binServer: {
      port: 3031,
      ssl: false,
    },
    binClient: {
      port: 3031,
      ssl: false
    }
  };

  var production = {
    environment: 'production',
    encryptionStrategy: 'clientKey',
    encryptionType: 'aes256',
    chats: {
      messagesPerPage: 50,
      initialPagesToLoad: 1
    },
    server: {
      ssl: false,
      host: 'pipo.chat',
      port: 443
    },
    client: {
      ssl: true,
      port: 443,
      host: 'pipo.chat'
    },
    binServer: {
      port: 3031,
      ssl: false
    },
    binClient: {
      ssl: true,
      port: 443
    }
  };

  switch(process.env.NODE_ENV){
    case 'development':
      return development;

    case 'production':
      return production;

    default:
      return development;
  }
};
