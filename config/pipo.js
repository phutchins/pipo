module.exports = function(){
  switch(process.env.NODE_ENV){
    case 'development':
      return {
        encryptionStrategy: "clientKey",
        encryptionType: "aes256",
        chats: {
          messagesPerPage: 50,
          initialPagesToLoad: 1
        },
        server: {
          ssl: true,
          host: "localhost",
          port: 3030
        },
        binServer: {
          ssl: true,
          port: 3031,
          externalPort: 8543
        }
      };

    case 'production':
      return {
        encryptionStrategy: "clientKey",
        encryptionType: "aes256",
        chats: {
          messagesPerPage: 50,
          initialPagesToLoad: 1
        },
        server: {
          ssl: true,
          host: "pipo.chat",
          port: 443
        },
        binServer: {
          ssl: true,
          port: 3031,
          externalPort: 8543
        }
    };

    default:
      return {
        encryptionStrategy: "clientKey",
        encryptionType: "aes256",
        chats: {
          messagesPerPage: 50,
          initialPagesToLoad: 1
        },
        server: {
          ssl: false,
          host: "localhost",
          port: 3030
        },
        binServer: {
          ssl: false,
          port: 3031,
          externalPort: 8543
        }
      };
    }
};
