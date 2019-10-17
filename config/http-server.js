module.exports = {
  port: process.env.HTTP_PORT || 3000 ,
  corsOrigin: process.env.CORS_ORIGIN ||'http://localhost:4200'
};
