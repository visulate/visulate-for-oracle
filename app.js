const httpServer = require('./services/http-server.js');
const database = require('./services/database.js');
const dbConfig = require('./config/database.js');
const defaultThreadPoolSize = 4;

// Used by regression test suite to delay testing until httpServerStarted.
const events = require('events');
const eventEmitter = new events.EventEmitter();
module.exports.eventEmitter = eventEmitter;

// Increase thread pool size by poolMax
process.env.UV_THREADPOOL_SIZE = dbConfig.totalDbThreadRequirement() + defaultThreadPoolSize;

async function startup() {
  console.log('Starting application');
  try {
    console.log('Initializing database module');
    await database.initialize();
  } catch (err) {
    console.error(err);
    process.exit(1); // Non-zero failure code
  }
  try {
    console.log('Initializing http server module');
    await httpServer.initialize();
    eventEmitter.emit('httpServerStarted');
  } catch (err) {
    console.error(err);
    process.exit(1); // Non-zero failure code
  }
}

startup();

async function shutdown(e) {
  let err = e;
  console.log('Shutting down application');
  try {
    console.log('Closing http server module');
    await httpServer.close();
  } catch (e) {
    console.error(e);
    err = err || e;
  }

  try {
    console.log('Closing database module');
    await database.close();
  } catch (e) {
    console.error(e);
    err = err || e;
  }
  console.log('Exiting process');
  if (err) {
    process.exit(1); // Non-zero failure code
  } else {
    process.exit(0);
  }
}
module.exports.shutdown = shutdown;

// Trap Ctrl-C and force clean shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM');
  shutdown();
});

process.on('SIGINT', () => {
  console.log('Received SIGINT');
  shutdown();
});

process.on('uncaughtException', err => {
  console.log('Uncaught exception');
  console.error(err);
  shutdown(err);
});
