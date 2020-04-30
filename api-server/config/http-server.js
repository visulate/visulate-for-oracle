/**
 * Return environment variable or default value 
 */
module.exports = {
  port: process.env.HTTP_PORT || 3000 ,
  logFileLocation: process.env.PWD + '/logs'
};
