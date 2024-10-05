// Load environment variables from .env file if it exists
require('dotenv').config();
console.log('GOOGLE_AI_KEY:', process.env.GOOGLE_AI_KEY);
console.log('HTTP_PORT:', process.env.HTTP_PORT || 3000);
console.log('CORS_ORIGIN_WHITELIST:', process.env.CORS_ORIGIN_WHITELIST ||'');
/**
 * Return environment variable or default value
 */

module.exports = {
  port: process.env.HTTP_PORT || 3000 ,
  corsOriginWhitelist: process.env.CORS_ORIGIN_WHITELIST ||'',
  logFileLocation: process.env.PWD + '/logs',
  googleAiKey: process.env.GOOGLE_AI_KEY
};
