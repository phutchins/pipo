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
          localSSL: false,
          externalSSL: false,
          host: "localhost",
          port: 3030
        },
        binServer: {
          localPort: 3031,
          externalPort: 8543,
          localSSL: false,
          externalSSL: false
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
          localSSL: false,
          externalSSL: true,
          host: "pipo.chat",
          port: 443
        },
        binServer: {
          localPort: 3031,
          externalPort: 8543,
          localSSL: false,
          externalSSL: true
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
          localSSL: false,
          externalSSL: false,
          host: "localhost",
          port: 3030
        },
        binServer: {
          localPort: 3031,
          externalPort: 3031,
          localSSL: false,
          externalSSL: false
        }
      };
    }
};
