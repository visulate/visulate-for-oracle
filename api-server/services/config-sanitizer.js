/*!
 * Copyright 2026 Visulate LLC. All Rights Reserved.
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

const fs = require('fs');
const path = require('path');
const logger = require('./logger.js');
const OracleProvider = require('./providers/oracle-provider');
const PostgresProvider = require('./providers/postgres-provider');

const providers = {
  oracle: new OracleProvider(),
  postgres: new PostgresProvider()
};

/**
 * Validates whether an endpoint's connect string is structurally valid and can be reached.
 * Does not hardcode any placeholder values or strings.
 *
 * @param {object} endpoint - Endpoint configuration object
 * @param {number} [timeoutMs=2000] - Connection timeout in milliseconds
 * @returns {Promise<boolean>} True if connect string is valid and reachable, false otherwise
 */
async function validateConnectString(endpoint, timeoutMs = 2000) {
  if (!endpoint || !endpoint.namespace || !endpoint.connect) {
    return false;
  }
  const connect = endpoint.connect;
  if (!connect.connectString || typeof connect.connectString !== 'string' || !connect.connectString.trim()) {
    return false;
  }

  const dbType = (connect.dbType || 'oracle').toLowerCase();
  const provider = providers[dbType];
  if (!provider) {
    logger.log('warn', `Unknown database type '${dbType}' for endpoint ${endpoint.namespace}`);
    return false;
  }

  const poolAlias = connect.poolAlias || endpoint.namespace;
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Connection attempt timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    const success = await Promise.race([
      provider.ping(poolAlias, connect),
      timeoutPromise
    ]);
    return Boolean(success);
  } catch (err) {
    logger.log('warn', `Endpoint ${endpoint.namespace} connectString verification failed: ${err.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loads database configuration into memory.
 * Supports both standard JavaScript export syntax and pure JSON syntax in database.js / database.json.
 * Updates require.cache so all modules receive the in-memory object.
 *
 * @param {string} [customPath] - Optional path to config file (default: config/database.js)
 * @returns {object} { endpoints: Array }
 */
function loadDatabaseConfig(customPath) {
  const defaultPath = path.resolve(__dirname, '../config/database.js');
  const resolvedPath = customPath ? path.resolve(customPath) : defaultPath;

  let dbConfig = null;
  let rawContent = null;

  if (fs.existsSync(resolvedPath)) {
    try {
      rawContent = fs.readFileSync(resolvedPath, 'utf8');
    } catch (err) {
      logger.log('error', `Failed to read config file at ${resolvedPath}: ${err.message}`);
    }
  }

  // 1. Try requiring as standard JavaScript module first
  try {
    delete require.cache[resolvedPath];
    dbConfig = require(resolvedPath);
  } catch (requireErr) {
    // If require failed (e.g. JSON syntax like { "endpoints": [...] } which is invalid JS syntax),
    // parse as JSON if valid JSON syntax
    if (rawContent) {
      try {
        const parsed = JSON.parse(rawContent);
        dbConfig = {
          endpoints: Array.isArray(parsed) ? parsed : (parsed.endpoints || [])
        };
      } catch (jsonErr) {
        logger.log('error', `Failed to parse database configuration at ${resolvedPath}: ${requireErr.message}`);
        throw requireErr;
      }
    } else {
      throw requireErr;
    }
  }

  // 2. If require returned an empty object (which happens when a .js file contains a JSON array [{...}]),
  // parse as JSON
  if (rawContent && (!dbConfig || !Array.isArray(dbConfig.endpoints))) {
    try {
      const parsed = JSON.parse(rawContent);
      if (Array.isArray(parsed)) {
        dbConfig = { endpoints: parsed };
      } else if (parsed && Array.isArray(parsed.endpoints)) {
        dbConfig = parsed;
      }
    } catch (e) {
      // Keep existing dbConfig
    }
  }

  if (!dbConfig || typeof dbConfig !== 'object') {
    dbConfig = { endpoints: [] };
  }

  if (!Array.isArray(dbConfig.endpoints)) {
    dbConfig.endpoints = [];
  }

  // Register in require.cache so any require('./config/database.js') gets this in-memory object
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: dbConfig
  };

  return { dbConfig, resolvedPath };
}

/**
 * Synchronous initial config loader for require() initialization.
 */
function sanitizeDatabaseConfig(customPath) {
  const { dbConfig } = loadDatabaseConfig(customPath);
  return dbConfig;
}

/**
 * Validates endpoints on startup and filters out any invalid connect strings in memory.
 *
 * @param {object} dbConfig - Configuration object
 * @param {number} [timeoutMs=2000] - Connection timeout per endpoint
 * @param {string} [configPath] - Path to config file for require.cache update
 * @returns {Promise<object>} Updated dbConfig with invalid connect strings removed
 */
async function filterInvalidEndpoints(dbConfig, timeoutMs = 2000, configPath) {
  const defaultPath = path.resolve(__dirname, '../config/database.js');
  const resolvedPath = configPath ? path.resolve(configPath) : defaultPath;

  const endpoints = dbConfig.endpoints || [];
  const results = await Promise.all(
    endpoints.map(async (ep) => {
      const isValid = await validateConnectString(ep, timeoutMs);
      return { endpoint: ep, isValid };
    })
  );

  const validEndpoints = [];
  for (const res of results) {
    if (res.isValid) {
      validEndpoints.push(res.endpoint);
    } else {
      logger.log('info', `Ignoring invalid connect string for endpoint '${res.endpoint?.namespace || 'unknown'}' (${res.endpoint?.connect?.connectString || 'none'})`);
    }
  }

  dbConfig.endpoints = validEndpoints;

  // Update require.cache
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: dbConfig
  };

  return dbConfig;
}

module.exports = {
  validateConnectString,
  loadDatabaseConfig,
  sanitizeDatabaseConfig,
  filterInvalidEndpoints
};
