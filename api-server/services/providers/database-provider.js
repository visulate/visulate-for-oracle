/**
 * Base Database Provider
 */
class DatabaseProvider {
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

  async ping(poolAlias) {
    throw new Error('ping not implemented');
  }
}

module.exports = DatabaseProvider;
