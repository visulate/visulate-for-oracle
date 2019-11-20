const path = require('path');
const fs = require('fs');
const httpServerConfig = require('../config/http-server.js');
const  {transports, createLogger, format}  = require('winston');

if (!fs.existsSync(httpServerConfig.logFileLocation)) {
   fs.mkdirSync(httpServerConfig.logFileLocation);
}

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),    
    transports: [
      // - Write to all logs with level `info` and below to `combined.log` 
      // - Write all logs error (and below) to `error.log`.
      new transports.File({ filename: path.join(httpServerConfig.logFileLocation,'error.log'), level: 'error' }),
      new transports.File({ filename: path.join(httpServerConfig.logFileLocation,'combined.log') })
    ]
  });

module.exports = logger;