/*!
 * Copyright 2019 Visulate LLC. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const httpServer = require('./services/http-server.js');
const database = require('./services/database.js');
const dbConfig = require('./config/database.js');
const logger = require('./services/logger.js');
const defaultThreadPoolSize = 4;

// Used by regression test suite to delay testing until httpServerStarted.
const events = require('events');
const eventEmitter = new events.EventEmitter();
module.exports.eventEmitter = eventEmitter;

// Increase thread pool size by poolMax
let threadRequirement = 0;
dbConfig.endpoints.forEach(endpoint => {
  threadRequirement += endpoint.connect.poolMax;
});
logger.log('info', '===============================================================')
logger.log('info', `Oracle connection pool thread requirement = ${threadRequirement}`)
process.env.UV_THREADPOOL_SIZE = threadRequirement + defaultThreadPoolSize;
logger.log('info', `UV_THREADPOOL_SIZE set to ${process.env.UV_THREADPOOL_SIZE}` )

async function startup() {
  logger.log('info', 'Starting application');
  try {
    logger.log('info', 'Initializing database module');
    await database.initialize();
    await database.validateConnections();
  } catch (err) {
    logger.log('error', err);
    process.exit(1); // Non-zero failure code
  }
  try {
    logger.log('info', 'Initializing http server module');
    await httpServer.initialize();
    eventEmitter.emit('httpServerStarted');
  } catch (err) {
    logger.log('error', err);
    process.exit(1); // Non-zero failure code
  }
}

startup();

async function shutdown(e) {
  let err = e;
  logger.log('info', 'Shutting down application');
  try {
    logger.log('info', 'Closing http server module');
    await httpServer.close();
  } catch (e) {
    logger.log('error', e);
    err = err || e;
  }

  try {
    logger.log('info', 'Closing database module');
    await database.close();
  } catch (e) {
    logger.log('error', e);
    err = err || e;
  }
  logger.log('info', 'Exiting process');
  if (err) {
    process.exit(1); // Non-zero failure code
  } else {
    process.exit(0);
  }
}
module.exports.shutdown = shutdown;

// Trap Ctrl-C and force clean shutdown
process.on('SIGTERM', () => {
  logger.log('info', 'Received SIGTERM');
  shutdown();
});

process.on('SIGINT', () => {
  logger.log('info', 'Received SIGINT');
  shutdown();
});

process.on('uncaughtException', err => {
  logger.log('error', 'Uncaught exception');
  logger.log('error', err);
  shutdown(err);
});
