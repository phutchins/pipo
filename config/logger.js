var winston = require('winston');
var logger;

if (process.env.NODE_ENV !== 'test') {
    logger = new (winston.Logger)({
        transports: [
            new (winston.transports.Console)(),
            new (winston.transports.File)({ filename: 'pipo.log' })
        ]
    });
} else {
    // while testing, log only to file, leaving stdout free for unit test status messages
    logger = new (winston.Logger)({
        transports: [
            new (winston.transports.File)({ filename: 'pipo.log' })
        ]
    });
}

module.exports = logger;
