const dbConstants = require('../../config/db-constants');
const rawTimeout = dbConstants.DEFAULT_CONNECT_TIMEOUT_MS || dbConstants.values?.defaultConnectTimeoutMs;
const parsedTimeout = parseInt(
  process.env.ENDPOINT_VALIDATION_TIMEOUT_MS || process.env.DB_CONNECT_TIMEOUT_MS || '',
  10
);
const DEFAULT_CONNECT_TIMEOUT_MS = Number.isFinite(rawTimeout) && rawTimeout > 0
  ? rawTimeout
  : (Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 10000);

/**
 * Base Database Provider
 */
class DatabaseProvider {
  static get DEFAULT_TIMEOUT_MS() {
    return DEFAULT_CONNECT_TIMEOUT_MS;
  }
  async getConnection(config) {
    throw new Error('getConnection not implemented');
  }

  async closeConnection(connection) {
    throw new Error('closeConnection not implemented');
  }

  async query(connection, statement, binds, opts) {
    throw new Error('query not implemented');
  }

  async createPool(config) {
    throw new Error('createPool not implemented');
  }

  async closePool(poolAlias) {
    throw new Error('closePool not implemented');
  }

  async ping(poolAlias, config, timeoutMs) {
    throw new Error('ping not implemented');
  }
}

module.exports = DatabaseProvider;
