var fs = require('fs');
var async = require('async');
var kbpgp = require('kbpgp');
var encryptionManager = require('./managers/encryption');
var adminDataDirectory = "./adminData/";
var AdminPayload, AdminCertificate;

function loadAdminCertificate(callback) {
  try {
    AdminCertificate = fs.readFileSync(adminDataDirectory + "adminCertificate");
  }
  catch (e) {}
  callback();
}

function getFileExtension(fileName) {
  var lastDot = fileName.lastIndexOf(".");
  if ( lastDot === -1 || lastDot === fileName.length - 1) {
    return null;
  }
  return fileName.substr(lastDot + 1);
}

function getOnlyFilename(fileName) {
  var lastDot = fileName.lastIndexOf(".");
  if ( lastDot === -1) {
    return fileName;
  }
  return fileName.substr(0, fileName.lastIndexOf("."));
}

function loadAdminPayload(callback) {
  try {
    AdminPayload = fs.readFileSync(adminDataDirectory + "adminPayload");
  }
  catch (e) {}
  callback();
}

function loadAdminKeys(callback) {
  if (!fs.existsSync(adminDataDirectory)) {
    fs.mkdirSync(adminDataDirectory);
  }
  var keyFileNames = fs.readdirSync(adminDataDirectory).filter(function(name) {
    return getFileExtension(name) === "pub";
  });
  async.map(keyFileNames, function(fileName, callback) {
    fs.readFile(adminDataDirectory + fileName, function(err, file) {
      if (err) {
        return callback(err);
      }
      kbpgp.KeyManager.import_from_armored_pgp({
        armored: file
      }, function(err, key) {
        return callback(err, {km: key, name: getOnlyFilename(fileName), file: file});
      });
    });
  }, callback);
}

function loadAdminSignatures(callback) {
  var keyFileNames = fs.readdirSync(adminDataDirectory).filter(function(name) {
    return getFileExtension(name) === "sig";
  });
  async.map(keyFileNames, function(fileName, callback) {
    fs.readFile(adminDataDirectory + fileName, function(err, file) {
      return callback(err, {data: file, name: getOnlyFilename(fileName)});
    });
  }, callback);
}

function buildAdminPayload() {
  var RawDataToSign = [];
  loadAdminKeys(function(err, adminKeys) {
    if (err) {
      console.log("Error: ", err);
      process.exit(1);
    }
    if (!adminKeys.length) {
      console.log("No keys found.");
      console.log("Place the armored public key of each administrator into the 'adminData' directory with the naming convention 'username.pub'");
      process.exit(1);
    }

    console.log("Loaded", adminKeys.length, "keys, now generating certificate data");

    adminKeys.forEach(function(keySet) {
      RawDataToSign.push({
        "role": "administrator",
        "keyName": keySet.name,
        "fingerprint": keySet.km.get_pgp_fingerprint_str()
      });
    });

    fs.writeFileSync(adminDataDirectory + "adminPayload",  JSON.stringify(RawDataToSign, null, 2));

    console.log("Payload generated and saved");
    console.log("Have each administrator sign ./adminData/adminPayload and then place their signatures in the 'adminData' directory with the naming convention 'username.sig'");
    process.exit(1);
  });
}

function verifyCertificateSignatures() {
  loadAdminKeys(function(err, keys) {
    if (err) {
      console.log("Error loading admin keys", err);
      process.exit(1);
    }
    if (!keys || !keys.length) {
      console.log("No keys found.");
      console.log("Place the armored public key of each administrator into the 'adminData' directory with the naming convention 'username.pub'");
      process.exit(1);
    }

    loadAdminSignatures(function(err, signatures) {
      if (err) {
        console.log("Error loading signatures", err);
        process.exit(1);
      }
      if (!signatures || !signatures.length) {
        console.log("No signatures found.");
        console.log("Have each administrator sign the AdminPayload and place their signatures in the 'adminData' directory with the naming convention 'username.sig'");
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
          console.log("Verified", pubkey[0].name, "fingerprint", fingerprint, "has valid signature for AdminPayload");
          callback();
        });
      }, function(err) {
        if (err) {
          console.log("Could not verify all signatures", err);
          process.exit(1);
        }
        if (signatures.length !== keys.length) {
          console.log("The number of signatures should match the number of keys for the AdminPayload");
          process.exit(1);
        }
        else {
          console.log("All required signatures found");
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
    require('./server');
  }
});
