module.exports = function(){
  switch(process.env.NODE_ENV){
    case 'development':
      return {
      environment: "development",
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
          localPort: 3030,
          externalPort: 3030
        },
        binServer: {
          localPort: 3031,
          externalPort: 3031,
          localSSL: false,
          externalSSL: false
        }
      };

    case 'production':
      return {
        environment: "production",
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
          localPort: 443,
          externalPort: 443
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
        environment: "default",
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
          localPort: 3030,
          externalPort: 3030
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
