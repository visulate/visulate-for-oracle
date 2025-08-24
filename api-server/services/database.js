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


async function closePool(poolAlias) {
  try {
    logger.log('info', `Disconnecting from poolAlias ${poolAlias}`);
    const pool = oracledb.getPool(poolAlias);
    await pool.close(0);
  } catch (err) {
    logger.log('error', `Failed to close pool ${poolAlias}`);
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
      await closePool(endpoint.connect.poolAlias);
    } catch (err) {
      logger.log('error', `Failed to close pool for ${endpoint.connect.poolAlias}`);
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
  let conn;
  try {
    conn = await getConnection(poolAlias);
    const result = await query(conn, statement, binds, opts);
    return result;
  } catch (err) {
    logger.log('error', err);
    throw err;
  } finally {
    if (conn) {
      try {
        await closeConnection(conn);
      } catch (err) {
        logger.log('error', err);
      }
    }
  }
}
module.exports.simpleExecute = simpleExecute;

/**
 * Gets a connection from the connection pool
 * @param {*} poolAlias - Connection pool alias
 * @returns connection - a database connection
 */
/**
 * Gets a connection from the connection pool.
 * Creates the pool if it does not exist
 * @param {*} poolAlias - Connection pool alias
 * @returns connection - a database connection
 */
function getConnection(poolAlias){
  return new Promise(async (resolve, reject) => {
    try {
      const pool = oracledb.getPool(poolAlias);
      const connection = await pool.getConnection();
      resolve(connection);
    } catch (err) {
      // Pool does not exist. Create it.
      if (err.message.startsWith('NJS-047')) {
        try {
          const endpoint = dbConfig.endpoints.find(e => e.connect.poolAlias === poolAlias);
          await oracledb.createPool(endpoint.connect);
          const pool = oracledb.getPool(poolAlias);
          const connection = await pool.getConnection();
          resolve(connection);
        } catch (err) {
          logger.log('error', `Failed to create pool for ${poolAlias}`);
          logger.log('error', err.message);
          reject(err);
        }
      } else {
        logger.log('error', `Failed to get connection from pool ${poolAlias}`);
        logger.log('error', err.message);
        reject(err);
      }
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
    let connection;
    try {
      const pool = oracledb.getPool(poolAlias);
      connection = await pool.getConnection();
      resolve();
    } catch (err) {
      logger.log('error', `Health check failed for ${poolAlias}`);
      logger.log('error', err.message);
      reject(err);
    } finally {
      if (connection) {
        try {
          await closeConnection(connection);
        } catch (err) {
          logger.log('error', `Failed to close connection during health check for ${poolAlias}`);
          logger.log('error', err);
        }
      }
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
      logger.log('error', 'Failed to close connection');
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
    let rs;

    try {
      const result = await connection.execute(
        statement, binds, opts
      );
      rs = result.resultSet;
      let row;
      let returnResult = [];
      while ((row = await rs.getRow())) {
        returnResult.push(row);
      }
      resolve(returnResult);
    } catch (err) {
      logger.log('error', `Query failed: ${statement}`);
      logger.log('error', err);
      reject(err);
    } finally {
      if (rs) {
        try {
          await rs.close();
        } catch (err) {
          logger.log('error', 'Failed to close result set');
          logger.log('error', err);
        }
      }
    }
  });
}
module.exports.query = query;