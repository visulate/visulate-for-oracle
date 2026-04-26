/*!
 * Copyright 2019, 2025 Visulate LLC. All Rights Reserved.
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

const dbConfig = require('../config/database');
const logger = require('./logger.js');
const OracleProvider = require('./providers/oracle-provider');
const PostgresProvider = require('./providers/postgres-provider');

const providers = {
  oracle: new OracleProvider(),
  postgres: new PostgresProvider()
};

function getProvider(poolAlias) {
  const endpoint = dbConfig.endpoints.find(e => e.connect.poolAlias === poolAlias);
  if (!endpoint) {
    throw new Error(`Endpoint configuration for poolAlias ${poolAlias} not found.`);
  }
  const dbType = endpoint.connect.dbType || 'oracle';
  const provider = providers[dbType];
  if (!provider) {
    throw new Error(`No provider found for database type: ${dbType}`);
  }
  return { provider, endpoint };
}

async function closePool(poolAlias) {
  try {
    logger.log('info', `Disconnecting from poolAlias ${poolAlias}`);
    const { provider } = getProvider(poolAlias);
    await provider.closePool(poolAlias);
  } catch (err) {
    logger.log('error', `Failed to close pool ${poolAlias}: ${err.message}`);
  }
}
module.exports.closePool = closePool;

async function close() {
  for (const endpoint of dbConfig.endpoints) {
    try {
      await closePool(endpoint.connect.poolAlias);
    } catch (err) {
      logger.log('error', `Failed to close pool for ${endpoint.connect.poolAlias}`);
    }
  }
}
module.exports.close = close;

async function simpleExecute(poolAlias, statement, binds = [], opts = {}) {
  let conn;
  let provider;
  try {
    const p = getProvider(poolAlias);
    provider = p.provider;
    conn = await provider.getConnection(poolAlias, p.endpoint.connect);
    return await provider.query(conn, statement, binds, opts);
  } catch (err) {
    logger.log('error', err);
    throw err;
  } finally {
    if (conn && provider) {
      try {
        await provider.closeConnection(conn);
      } catch (err) {
        logger.log('error', err);
      }
    }
  }
}
module.exports.simpleExecute = simpleExecute;

async function getConnection(poolAlias) {
  const { provider, endpoint } = getProvider(poolAlias);
  return await provider.getConnection(poolAlias, endpoint.connect);
}
module.exports.getConnection = getConnection;

async function pingConnection(poolAlias) {
  const { provider } = getProvider(poolAlias);
  const success = await provider.ping(poolAlias);
  if (!success) {
    throw new Error(`Health check failed for ${poolAlias}`);
  }
}
module.exports.pingConnection = pingConnection;

async function closeConnection(connection) {
  // Since we don't know the provider from the connection object easily,
  // and both providers handle their own connection types,
  // we might need a better way. But in simple cases:
  if (typeof connection.execute === 'function') { // Oracle
    await connection.close();
  } else if (typeof connection.release === 'function') { // PG
    connection.release();
  }
}
module.exports.closeConnection = closeConnection;

async function query(connection, statement, binds = [], opts = {}) {
  // Similar to closeConnection, we need to know the provider.
  // This function is often called after getConnection.
  // A better design would be to pass the provider or use a wrapped connection.
  // For now, let's detect based on connection properties.
  
  if (typeof connection.execute === 'function') {
    return await providers.oracle.query(connection, statement, binds, opts);
  } else {
    return await providers.postgres.query(connection, statement, binds, opts);
  }
}
module.exports.query = query;