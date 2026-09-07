const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  validateConnectString,
  loadDatabaseConfig,
  sanitizeDatabaseConfig,
  filterInvalidEndpoints
} = require('../services/config-sanitizer');

describe('config-sanitizer', () => {
  describe('validateConnectString', function () {
    this.timeout(5000);

    it('should return false for missing, empty, or invalid connectString structures', async () => {
      expect(await validateConnectString(null)).to.be.false;
      expect(await validateConnectString({})).to.be.false;
      expect(await validateConnectString({ namespace: 'T1' })).to.be.false;
      expect(await validateConnectString({ namespace: 'T1', connect: {} })).to.be.false;
      expect(await validateConnectString({ namespace: 'T1', connect: { connectString: '' } })).to.be.false;
      expect(await validateConnectString({ namespace: 'T1', connect: { connectString: '   ' } })).to.be.false;
      expect(await validateConnectString({ namespace: 'T1', connect: { connectString: 12345 } })).to.be.false;
    });

    it('should return false for unknown database types', async () => {
      const endpoint = {
        namespace: 'UNKNOWN_DB',
        connect: {
          dbType: 'nonexistent-db',
          connectString: 'localhost:1234/test'
        }
      };
      expect(await validateConnectString(endpoint, 500)).to.be.false;
    });

    it('should return false when connectString points to an unreachable host or listener', async () => {
      const endpoint = {
        namespace: 'UNREACHABLE',
        connect: {
          poolAlias: 'UNREACHABLE',
          user: 'test',
          password: 'test',
          connectString: '10.255.255.1:1521/NONEXISTENT'
        }
      };
      const isValid = await validateConnectString(endpoint, 800);
      expect(isValid).to.be.false;
    });
  });

  describe('loadDatabaseConfig', () => {
    let tmpDir;
    let tmpConfigFile;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visulate-test-'));
      tmpConfigFile = path.join(tmpDir, 'database.js');
    });

    afterEach(() => {
      delete require.cache[require.resolve(tmpConfigFile)];
      if (fs.existsSync(tmpConfigFile)) {
        fs.unlinkSync(tmpConfigFile);
      }
      if (fs.existsSync(tmpDir)) {
        fs.rmdirSync(tmpDir);
      }
    });

    it('should load standard JavaScript export syntax in database.js', () => {
      const jsContent = `const endpoints = [
        {
          namespace: 'db1',
          connect: { poolAlias: 'db1', connectString: 'localhost:1521/db1' }
        }
      ];
      module.exports.endpoints = endpoints;`;

      fs.writeFileSync(tmpConfigFile, jsContent);

      const config = sanitizeDatabaseConfig(tmpConfigFile);
      expect(config.endpoints).to.have.lengthOf(1);
      expect(config.endpoints[0].namespace).to.equal('db1');

      const cached = require(tmpConfigFile);
      expect(cached).to.equal(config);
    });

    it('should parse valid JSON object syntax in database.js', () => {
      const jsonContent = JSON.stringify({
        endpoints: [
          {
            namespace: 'json_db',
            connect: { poolAlias: 'json_db', connectString: 'localhost:1521/json_db' }
          }
        ]
      });

      fs.writeFileSync(tmpConfigFile, jsonContent);

      const config = sanitizeDatabaseConfig(tmpConfigFile);
      expect(config.endpoints).to.have.lengthOf(1);
      expect(config.endpoints[0].namespace).to.equal('json_db');

      const cached = require(tmpConfigFile);
      expect(cached).to.equal(config);
    });

    it('should parse valid JSON array syntax in database.js', () => {
      const jsonArray = JSON.stringify([
        {
          namespace: 'array_db',
          connect: { poolAlias: 'array_db', connectString: 'localhost:1521/array_db' }
        }
      ]);

      fs.writeFileSync(tmpConfigFile, jsonArray);

      const config = sanitizeDatabaseConfig(tmpConfigFile);
      expect(config.endpoints).to.have.lengthOf(1);
      expect(config.endpoints[0].namespace).to.equal('array_db');
    });

    it('should throw when config contains invalid syntax that is neither valid JS nor valid JSON', () => {
      fs.writeFileSync(tmpConfigFile, 'this is { invalid : syntax ;;;');
      expect(() => sanitizeDatabaseConfig(tmpConfigFile)).to.throw();
    });
  });

  describe('filterInvalidEndpoints', function () {
    this.timeout(5000);

    it('should filter out endpoints with invalid connect strings in memory', async () => {
      const config = {
        endpoints: [
          {
            namespace: 'INVALID_EMPTY',
            connect: { poolAlias: 'INVALID_EMPTY', connectString: '' }
          },
          {
            namespace: 'INVALID_HOST',
            connect: { poolAlias: 'INVALID_HOST', connectString: '10.255.255.1:1521/NONEXISTENT' }
          }
        ]
      };

      const result = await filterInvalidEndpoints(config, 800);
      expect(result.endpoints).to.be.an('array').that.is.empty;
    });
  });
});
