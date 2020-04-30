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

const http = require('http');
const express = require('express');
const morgan = require('morgan');
const logger = require('./logger.js');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const httpServerConfig = require('../config/http-server.js');
const router = require('./router.js');
let httpServer;

/**
 * Initialize an Express instance with support for cross origin
 * requests from Angular
 */
function initialize() {
  return new Promise((resolve, reject) => {
    const app = express();

    let corsOptions = {
      origin: '*'
    };
    app.use(cors(corsOptions));
    httpServer = http.createServer(app);

    // Setup logging
    if (!fs.existsSync(httpServerConfig.logFileLocation)) {
      fs.mkdirSync(httpServerConfig.logFileLocation);
    }
    let accessLogStream = fs.createWriteStream(path.join(httpServerConfig.logFileLocation, 'access.log'), { flag: 'a' });
    app.use(morgan('combined', { stream: accessLogStream }));



    // Start listener
    app.use('/', router);
    httpServer.listen(httpServerConfig.port)
      .on('listening', () => {
        logger.log('info', `HTTP Server listening on port ${httpServerConfig.port}`);
        resolve();
      })
      .on('error', err => {
        reject(err);
      });
  });
}
module.exports.initialize = initialize;

/**
 * Shutdown the Express instance
 */
function close() {
  return new Promise((resolve, reject) => {
    httpServer.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
module.exports.close = close;
