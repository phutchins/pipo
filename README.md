# PiPo - A secure chat client with client side encryption and perfect forward secrecy written in NodeJS

# Features
+ Markdown using the Marked Library and React (https://github.com/chjj/marked, https://facebook.github.io/react/)

# Encryption
Options...
+ GPG
+ OpenSSL (Eliptic Curve AES 256)

### Setup
+ Place two admins public keys in adminData in the format username.pub
  + Generate Two Keys (repeat this process for the second key)
    + gpg --gen-key
    + Choose RSA and RSA
    + keysize should be at least 2048
    + Choose an amount of time for the key to expire
    + Your real name should be your username for pipo
    + Enter your email address
    + Comment can be blank if you like
    + Use a secure passphrase to protect your key
  + Export your public and private key to a file
    + List your secret keys to find the userID of your key which is a combination of full name (your username that you entered) along with email and comment
      + gpg --list-secret-keys
    + gpg --export -a "username <username@mydomain.com>" --output adminData/username.pub
    + gpg --export-secret-key -a "username <username@mydomain.com>" --output adminData/username.key
    + Place the two username.pub files in the adminData directory
  + Run node setup again
  + Generate a clearsign signature from each secret key for the generated adminPayload
    + gpg --clearsign -u "username <username@mydomain.com>" adminData/adminPayload --output adminData/username.sig
  + Run node seutp again
    + You should see the server start and tell you that out found the signatures
    + This will generate the adminCertificate
  + Run npm start to start the server (make usre Mongo is running)

### Authentication
+ Initial Signup
  + signature verification, user creates invite object with a random token created by the client
  + this token is sha256 hashed and sent to the server,
  + the client pgp encrpts the non-hashed token and sends it to the invitee
  + then only the invitee can decrypt the token and then can send it to the server,
  + which can do a sha256 and say oh yeah thats right
+ authenticate and sign of request using pgp keys?
+ node_http_signature
  + Positives
  + Negatives
    + Whitepaper not quite complete yet
    + Have not addressed two factor
    + Does not include eliptical curve in their docs
    + * Does not have revocation for identity in case of compromise *
+ sqrl
  + Positives
    + Creates QR codes to scan with phnoe for authentication with sessions which is easy
    + Creates revocation
    + Allows you to print QR code for private key so it does not exist elictroncially
  + Negatives
    + Seems over engineered
    + Uniqe terms for all types of keys so it is cryptic cryptography


### Sessions
+ Use keyid to verify user and do not use sessions?
+ How do we indicate that the data is encrypted?


### Server Management of Keys
+ Server generates a shared private key
+ Server encrypts private key to all users that are granted access using their personal public key
+ Server destroys unencrypted shared private key
+ Server sends new encrypted private key to users as they sign on
  + Possible to have client with rights to add user create the private key and encrypt to all users then upload to server


# Protocol
+ Send noonce with each message and then the clients would see that it's a new one and query the server for new key?
+ When someone joins, they send public key to server. Server temporarily encrypts to both old key and new key until new keys are generated and ready for users to download. Everyone can see messages from new user as soon as they have updated their key to the new key.


### Decentralizaing
+ Clients can still communicate if server is down?

### Local storage of private keys



### Use this as a way to replace email?


## Mobile
+ Ionic & Socket.io

## Desktop & Browser
+ NodeJS & Node WebKit


### Problem & Solution Walkthrough
+ Problem
  + Easy passwords are easy to hack, more secure passwords are hard to remember and use
+ Solution
  + Use key pairs or something similar (Something like PGP)
+ Problem
  + Want to proove identification and communicate securely
+ Solution
  + Encryption should be done client side
  +
+ Problem
  + PGP is hard for the normal user
+ Solution

+ Problem
  + Managing Keys is tricky
+ Solution

+ Problem
  + Communication in this way is hard with multiple people
