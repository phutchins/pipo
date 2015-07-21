var winston = require('winston');

var logger = new (winston.Logger)({
  levels: {
    trace: 0,
    input: 1,
    verbose: 2,
    prompt: 3,
    debug: 4,
    info: 5,
    data: 6,
    help: 7,
    warn: 8,
    error: 9
  },
  colors: {
    trace: 'magenta',
    input: 'grey',
    verbose: 'cyan',
    prompt: 'grey',
    debug: 'blue',
    info: 'green',
    data: 'grey',
    help: 'cyan',
    warn: 'yellow',
    error: 'red'
  },
});

if (process.env.NODE_ENV !== 'test') {
  logger.add(winston.transports.File, {
    level: 'info',
    prettyPrint: false,
    colorize: true,
    silent: false,
    timestamp: true,
    filename: './pipo.log',
    maxsize: 40000,
    maxFiles: 10,
    json: false
  })

  logger.add(winston.transports.Console, {
    level: 'trace',
    prettyPrint: true,
    colorize: true,
    silent: false,
    timestamp: false
  })
} else {
  // while testing, log only to file, leaving stdout free for unit test status messages
  logger.add(winston.transports.File, {
    level: 'info',
    prettyPrint: false,
    colorize: true,
    silent: false,
    timestamp: true,
    filename: './pipo.log',
    maxsize: 40000,
    maxFiles: 10,
    json: false
  })
}

module.exports = logger;
