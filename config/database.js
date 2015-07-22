// config/database.js
var logger = require('./logger');

module.exports = {
  'url' : {
    'development': 'mongodb://localhost:27017/pipo',
    'test': 'mongodb://localhost:27017/pipo_test'
  }
}
