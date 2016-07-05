var fs = require('fs');
var path = require('path');
var async = require('async');
var kbpgp = require('kbpgp');
var encryptionManager = require('../server/js/managers/encryption');
var adminDataDirectory = "./config/adminData/";
var AdminPayload, AdminCertificate;
var logger = require('../config/logger');

function loadAdminCertificate(callback) {
  try {
    AdminCertificate = fs.readFileSync(adminDataDirectory + "adminCertificate");
  }
  catch (e) {}
  callback();
}

function asyncKeyFilesFilterMap(filterExtension, mapFunction, done) {
  var keyFileNames = fs.readdirSync(adminDataDirectory).filter(function(fileName) {
    return path.extname(fileName) === filterExtension;
  });
  async.map(keyFileNames, function(fileName, next) {
    mapFunction(fileName, next)
  }, done);
}

function loadAdminPayload(callback) {
  try {
    AdminPayload = fs.readFileSync(adminDataDirectory + "adminPayload");
  }
  catch (e) {}
  callback();
}

function loadAdminKeys(done) {
  var extension = '.pub' ;
  if (!fs.existsSync(adminDataDirectory)) {
    fs.mkdirSync(adminDataDirectory);
  }
  asyncKeyFilesFilterMap(extension, function(fileName, next) {
    fs.readFile(adminDataDirectory + fileName, function(err, file) {
      if (err) {
        return next(err);
      }
      kbpgp.KeyManager.import_from_armored_pgp({
        armored: file
      }, function(err, key) {
        return next(err, {km: key, name: path.basename(fileName, extension), file: file});
      });
    });
  }, done);
}

function loadAdminSignatures(done) {
  var extension = '.pub' ;
  asyncKeyFilesFilterMap(extension, function(fileName, next) {
    fs.readFile(adminDataDirectory + fileName, function(err, file) {
      return next(err, {data: file, name: path.basename(fileName, extension)});
    });
  }, done);
}

function buildAdminPayload() {
  var RawDataToSign = [];
  loadAdminKeys(function(err, adminKeys) {
    if (err) {
      logger.error("Error: ", err);
      process.exit(1);
    }
    if (!adminKeys.length) {
      logger.error("No keys found.");
      logger.info("Place the armored public key of each administrator into the 'adminData' directory with the naming convention 'username.pub'");
      process.exit(1);
    }

    logger.info("Loaded", adminKeys.length, "keys, now generating certificate data");

    adminKeys.forEach(function(keySet) {
      RawDataToSign.push({
        "role": "administrator",
        "keyName": keySet.name,
        "fingerprint": keySet.km.get_pgp_fingerprint_str()
      });
    });

    fs.writeFileSync(adminDataDirectory + "adminPayload",  JSON.stringify(RawDataToSign, null, 2));

    logger.info("Payload generated and saved");
    logger.info("Have each administrator sign ./adminData/adminPayload and then place their signatures in the 'adminData' directory with the naming convention 'username.sig'");
    process.exit(1);
  });
}

function verifyCertificateSignatures() {
  loadAdminKeys(function(err, keys) {
    if (err) {
      logger.error("Error loading admin keys", err);
      process.exit(1);
    }
    if (!keys || !keys.length) {
      logger.error("No keys found.");
      logger.info("Place the armored public key of each administrator into the 'adminData' directory with the naming convention 'username.pub'");
      process.exit(1);
    }

    loadAdminSignatures(function(err, signatures) {
      if (err) {
        logger.error("Error loading signatures", err);
        process.exit(1);
      }
      if (!signatures || !signatures.length) {
        logger.error("No signatures found.");
        logger.info("Have each administrator sign the AdminPayload and place their signatures in the 'adminData' directory with the naming convention 'username.sig'");
        process.exit(1);
      }
      async.each(signatures, function(signature, callback) {

        var signedMessage = signature.data;

        var pubkey = keys.filter(function (key) {
          return key.name === signature.name;
        });

        encryptionManager.verifyMessageSignature(signedMessage, pubkey[0].file, AdminPayload, function (err, fingerprint) {
          if (err) {
            callback(err);
          }
          logger.info("Verified", pubkey[0].name, "fingerprint", fingerprint, "has valid signature for AdminPayload");
          callback();
        });
      }, function(err) {
        if (err) {
          logger.error("Could not verify all signatures", err);
          process.exit(1);
        }
        if (signatures.length !== keys.length) {
          logger.error("The number of signatures should match the number of keys for the AdminPayload");
          process.exit(1);
        }
        else {
          logger.info("All required signatures found");
          buildAdminCertificate(signatures, keys, function() {
            require('./server');
          });
        }

      });

    });
  });
}

function buildAdminCertificate(signatures, keys, callback) {
  var certificateObject = {
    payload: AdminPayload.toString('base64'),
    signatures: [],
    keys: []
  };

  signatures.forEach(function(sig) {
    certificateObject.signatures.push({
      user: sig.name,
      data: sig.data.toString('base64')
    });
  });

  keys.forEach(function(key) {
    certificateObject.keys.push({
      user: key.name,
      data: key.file.toString('base64')
    });
  });

  fs.writeFileSync(adminDataDirectory + "adminCertificate", "module.exports = " + JSON.stringify(certificateObject, null, 2));
  callback();
}

loadAdminCertificate(function () {
  if (!AdminCertificate) {
    loadAdminPayload(function() {
      if (!AdminPayload) {
        buildAdminPayload();
      }
      else {
        verifyCertificateSignatures();
      }
    });
  }
  else {
    require('../server/server')();
  }
});
