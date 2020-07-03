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

 const oracledb = require('oracledb');
 const dbConfig = require('../config/database');
 const dbConstants = require('../config/db-constants');
 const logger = require('./logger.js');
 const schemaSql = require('./sql/schema-queries');
 const util = require('./util');

/**
 * Creates a connection pool for each endpoint
 */
async function initialize() {
  logger.log('info', `node-oracledb version: ${oracledb.versionString}`);
  logger.log('info', `Oracle client version: ${oracledb.oracleClientVersionString}`);
  for (const endpoint of dbConfig.endpoints){
    try {
      logger.log('info',
        `Creating poolAlias ${endpoint.connect.poolAlias} for ${endpoint.connect.connectString}`);
        await oracledb.createPool(endpoint.connect);
    } catch (err) {
      logger.log('error', err);
      logger.log('error', 
      `Connection failed for poolAlias ${endpoint.connect.poolAlias} using ${endpoint.connect.user}@${endpoint.connect.connectString}`);
    } 
  }
}
module.exports.initialize = initialize;

/**
 * Make sure the connected user has the correct privileges and only the correct privileges
 */
async function validateConnections() {
  for (const endpoint of dbConfig.endpoints){
    try {
      const privs = await simpleExecute(endpoint.connect.poolAlias, schemaSql.statement['VALIDATE-CONNECTION'].sql);
      const privList = privs.map(r => r.PRIVILEGE ).sort().toString();
      if (privList !== dbConstants.values.requiredPrivilages.toString()) {
        logger.log('error',
          `Closing poolAlias ${endpoint.connect.poolAlias}. Account has invalid privileges.
           Expected: '${dbConstants.values.requiredPrivilages.toString()}'
           Found: '${privList}'`
        );
      const pool = oracledb.getPool(endpoint.connect.poolAlias);
      await pool.close(10);
      }
    } catch (err) {
      logger.log('error', err);
    }
  }
}
module.exports.validateConnections = validateConnections;

async function closePool(poolAlias) {
  try {
    logger.log('info', `Disconnecting from poolAlias ${poolAlias}`);
    const pool = oracledb.getPool(poolAlias);
    await pool.close(0);    
  } catch (err) {
    logger.log('error', err);
  }
}
module.exports.closePool = closePool;

/**
 * Close connection pools
 */
async function close() {
  for (const endpoint of dbConfig.endpoints){
    try {
      closePool(endpoint.connect.poolAlias);
    } catch (err) {
      logger.log('error', err);
    }
  }
}
module.exports.close = close;


/**
 * Execute a SQL statement
 *
 * @param {*} poolAlias - Connection pool alias
 * @param {*} statement - The SQL to execute
 * @param {*} binds - Bind variables for the SQL
 * @param {*} opts - Execution options
 */
async function simpleExecute(poolAlias, statement, binds = [], opts = {}) {
      const conn = await getConnection(poolAlias);
      const result = await query(conn, statement, binds, opts);
      await closeConnection(conn);
      return result;
}
module.exports.simpleExecute = simpleExecute;

/**
 * Gets a connection from the connection pool
 * @param {*} poolAlias - Connection pool alias
 * @returns connection - a database connection
 */
function getConnection(poolAlias){
  return new Promise(async (resolve, reject) => {
    try {
      const connection = await oracledb.getConnection(poolAlias);
      resolve(connection);
    } catch (err) {
      logger.log('error', err);
      reject(err);
    }
  });
}
module.exports.getConnection = getConnection;

/**
 * Checks that a poolAlias connection is usable and the network to the database is valid.
 * Closes the connection pool if the connection is not usable.
 * 
 * @param {*} poolAlias - Connection pool alias name
 */

function pingConnection(poolAlias){
  return new Promise(async (resolve, reject) => {
    try {
      const pool = oracledb.getPool(poolAlias);
      // Wait 5 seconds for promise to return before failing with a timeout
      const connection = await util.promiseTimeout(5000, 'Get connection', pool.getConnection());
      const pingError = await util.promiseTimeout(5000, 'Ping connection', connection.ping()) ;   
      await closeConnection(connection); 
      if (pingError) {
        logger.log('error', `${poolAlias} health check failed ${pingError}`)
        reject(pingError);
      }      
      resolve();
    } catch (err) {
      if (err.type && err.type==='timeout'){
         logger.log('error', `${poolAlias} health check timed out`);
      }
      reject(err);     
    }
  });
}
module.exports.pingConnection = pingConnection;

/**
 * Release a connection back to the connection pool
 * @param {*} connection - The connection to release
 */
function closeConnection(connection){
  return new Promise(async (resolve, reject) => {
    try {
      await connection.close();
      resolve();
    } catch (err) {
      logger.log('error', err);
      reject(err);
    }
  });
}
module.exports.closeConnection = closeConnection;

/**
 * Execute query using a result set
 * @param {*} connection - a pre-establised connection
 * @param {*} statement - the statement to execute
 * @param {*} binds - bind variables
 * @param {*} opts - options
 */
function query(connection, statement, binds = [], opts = {}){
  return new Promise(async (resolve, reject) => {
    opts.outFormat = oracledb.OUT_FORMAT_OBJECT;
    opts.resultSet = true;
    oracledb.fetchAsString = [ oracledb.CLOB ];

    try {
      const result = await connection.execute(
        statement, binds, opts
      );
      const rs = result.resultSet;
      let row;
      let returnResult = [];

      while ((row = await rs.getRow())) {
        returnResult.push(row);
      }
      await rs.close();
      resolve(returnResult);
    } catch (err) {
      logger.log('error', `${statement} \n ${err}`);
      reject(err);
    }
  });
}
module.exports.query = query;