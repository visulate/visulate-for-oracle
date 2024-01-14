/**
 * Return environment variable or default value
 */
module.exports = {
  port: process.env.HTTP_PORT || 3000 ,
  corsOriginWhitelist: process.env.CORS_ORIGIN_WHITELIST ||'http://localhost:4200',
  logFileLocation: process.env.PWD + '/logs'
};
