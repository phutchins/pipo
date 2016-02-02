module.exports = function(){
  switch(process.env.NODE_ENV){
    case 'development':
      return {
        encryptionStrategy: "clientKey",
        encryptionType: "aes256",
        server: "localhost",
        port: 3030
      };

    case 'production':
      return {
        encryptionStrategy: "clientKey",
        encryptionType: "aes256",
        server: "pipo.chat",
        port: 80
    };

    default:
      return {
        encryptionStrategy: "clientKey",
        encryptionType: "aes256",
        server: "localhost",
        port: 3030
      };
    }
};
