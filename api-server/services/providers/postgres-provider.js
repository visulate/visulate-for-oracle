const { Pool } = require('pg');
const DatabaseProvider = require('./database-provider');
const logger = require('../logger');

class PostgresProvider extends DatabaseProvider {
  constructor() {
    super();
    this.pools = new Map();
  }

  async getConnection(poolAlias, config) {
    let pool = this.pools.get(poolAlias);
    if (!pool) {
      // Create pool if it doesn't exist
      // Map Oracle-style config to PG-style config
      // Oracle: { user, password, connectString (host:port/service), poolMin, poolMax }
      // PG: { user, password, host, port, database, min, max }
      
      const [hostPort, dbName] = config.connectString.split('/');
      const [host, port] = hostPort.split(':');

      pool = new Pool({
        user: config.user,
        password: config.password,
        host: host,
        port: port || 5432,
        database: dbName,
        min: config.poolMin || 0,
        max: config.poolMax || 10
      });
      this.pools.set(poolAlias, pool);
    }
    const conn = await pool.connect();
    conn.poolAlias = poolAlias;
    return conn;
  }

  async closeConnection(connection) {
    if (connection) {
      connection.release();
    }
  }

  async query(connection, statement, binds = [], opts = {}) {
    // Convert Oracle-style binds (:name) to PG-style ($1, $2)
    // This is a simple implementation and might need to be more robust
    let pgStatement = statement;
    let pgBinds = [];
    
    if (typeof binds === 'object' && !Array.isArray(binds)) {
      let i = 1;
      for (const [key, value] of Object.entries(binds)) {
        const val = (typeof value === 'object' && value.val !== undefined) ? value.val : value;
        const regex = new RegExp(`:${key}\\b`, 'g');
        if (regex.test(pgStatement)) {
          pgStatement = pgStatement.replace(regex, `$${i}`);
          pgBinds.push(val);
          i++;
        }
      }
    } else if (Array.isArray(binds)) {
      pgBinds = binds;
      // Replace :1, :2 etc if they exist
      pgStatement = pgStatement.replace(/:(\d+)/g, '$$$1');
    }

    try {
      const result = await connection.query(pgStatement, pgBinds);
      // Map result rows to Oracle-style objects (uppercase keys) 
      // while preserving original casing for UI display matching
      return result.rows.map(row => {
        const normalizedRow = { ...row };
        for (const [key, value] of Object.entries(row)) {
          normalizedRow[key.toUpperCase()] = value;
        }
        return normalizedRow;
      });
    } catch (err) {
      logger.log('error', `Postgres query failed: ${pgStatement}`);
      throw err;
    }
  }

  async createPool(config) {
    // Pool creation is handled in getConnection for PG in this simple implementation
    return Promise.resolve();
  }

  async closePool(poolAlias) {
    const pool = this.pools.get(poolAlias);
    if (pool) {
      await pool.end();
      this.pools.delete(poolAlias);
    }
  }

  async ping(poolAlias) {
    let connection;
    try {
      // Note: This requires config to be available or pool to be pre-created
      // For now, assume pool exists
      const pool = this.pools.get(poolAlias);
      if (!pool) return false;
      connection = await pool.connect();
      return true;
    } catch (err) {
      return false;
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
}

module.exports = PostgresProvider;
