const oracledb = require('oracledb');
const DatabaseProvider = require('./database-provider');
const logger = require('../logger');

class OracleProvider extends DatabaseProvider {
  constructor() {
    super();
    this.poolCreationMutex = new Map();
  }

  async getConnection(poolAlias, config) {
    try {
      const pool = oracledb.getPool(poolAlias);
      const conn = await pool.getConnection();
      conn.poolAlias = poolAlias;
      return conn;
    } catch (err) {
      if (err.message.startsWith('NJS-047')) {
        // Pool does not exist, create it
        if (this.poolCreationMutex.has(poolAlias)) {
          await this.poolCreationMutex.get(poolAlias);
          const pool = oracledb.getPool(poolAlias);
          const conn = await pool.getConnection();
          conn.poolAlias = poolAlias;
          return conn;
        }

        const createPromise = (async () => {
          try {
            await oracledb.createPool(config);
          } finally {
            this.poolCreationMutex.delete(poolAlias);
          }
        })();

        this.poolCreationMutex.set(poolAlias, createPromise);
        await createPromise;
        const pool = oracledb.getPool(poolAlias);
        const conn = await pool.getConnection();
        conn.poolAlias = poolAlias;
        return conn;
      }
      throw err;
    }
  }

  async closeConnection(connection) {
    if (connection) {
      await connection.close();
    }
  }

  async query(connection, statement, binds = [], opts = {}) {
    opts.outFormat = oracledb.OUT_FORMAT_OBJECT;
    opts.resultSet = true;
    oracledb.fetchAsString = [oracledb.CLOB];
    let rs;

    try {
      const result = await connection.execute(statement, binds, opts);
      rs = result.resultSet;
      let row;
      let returnResult = [];
      while ((row = await rs.getRow())) {
        returnResult.push(row);
      }
      return returnResult;
    } finally {
      if (rs) {
        await rs.close();
      }
    }
  }

  async createPool(config) {
    return await oracledb.createPool(config);
  }

  async closePool(poolAlias) {
    try {
      const pool = oracledb.getPool(poolAlias);
      await pool.close(0);
    } catch (err) {
      logger.log('error', `Failed to close Oracle pool ${poolAlias}: ${err.message}`);
    }
  }

  async ping(poolAlias) {
    let connection;
    try {
      const pool = oracledb.getPool(poolAlias);
      connection = await pool.getConnection();
      return true;
    } finally {
      if (connection) {
        await this.closeConnection(connection);
      }
    }
  }
}

module.exports = OracleProvider;
