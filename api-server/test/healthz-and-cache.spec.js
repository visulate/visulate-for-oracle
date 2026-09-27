const mainApp = require('../app');
const express = require('express');
const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = chai;
chai.use(chaiHttp);

const router = require('../services/router');
const controller = require('../services/controller');
const dbService = require('../services/database');

describe('Healthcheck and Controller Caching Tests', function () {
  let app;
  let originalSimpleExecute;

  before((done) => {
    app = express();
    app.use(express.json());
    app.use('/', router);
    originalSimpleExecute = dbService.simpleExecute;

    if (mainApp.isStarted) {
      return done();
    }
    mainApp.eventEmitter.on('httpServerStarted', () => {
      done();
    });
  });

  after(() => {
    dbService.simpleExecute = originalSimpleExecute;
  });

  afterEach(() => {
    controller.clearEndpointsCache();
    dbService.simpleExecute = originalSimpleExecute;
  });

  describe('GET /healthz and /api/healthz', () => {
    it('GET /healthz should return 200 with status OK without querying database', (done) => {
      chai.request(app)
        .get('/healthz')
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.deep.equal({ status: 'OK' });
          done();
        });
    });

    it('GET /api/healthz should return 200 with status OK', (done) => {
      chai.request(app)
        .get('/api/healthz')
        .end((err, res) => {
          expect(res).to.have.status(200);
          expect(res.body).to.deep.equal({ status: 'OK' });
          done();
        });
    });
  });

  describe('Endpoints in-memory cache', () => {
    it('clearEndpointsCache should empty cache maps', () => {
      controller.endpointsCache.set('*', { timestamp: Date.now(), data: [] });
      controller.dbVersionCache.set('TEST_POOL', 'Oracle Database 19c');

      expect(controller.endpointsCache.size).to.equal(1);
      expect(controller.dbVersionCache.size).to.equal(1);

      controller.clearEndpointsCache();

      expect(controller.endpointsCache.size).to.equal(0);
      expect(controller.dbVersionCache.size).to.equal(0);
    });

    it('endpoints should return cached data when within TTL and not call simpleExecute', async () => {
      let callCount = 0;
      dbService.simpleExecute = async () => {
        callCount++;
        return [];
      };

      const mockData = [
        { endpoint: 'MOCK_DB', description: 'Mock Database', schemas: {} }
      ];
      controller.endpointsCache.set('*', {
        timestamp: Date.now(),
        data: mockData
      });

      const result = await controller.endpoints('*');
      expect(result).to.deep.equal(mockData);
      expect(callCount).to.equal(0);
    });

    it('endpoints should bypass cache and query database when bypassCache is true', async () => {
      let queryCalls = [];
      dbService.simpleExecute = async (poolAlias, sql, params) => {
        queryCalls.push({ poolAlias, sql, params });
        if (sql.includes('v$version')) {
          return [{ Version: 'Oracle Database 19c Enterprise Edition' }];
        }
        return [
          { OWNER: 'HR', OBJECT_TYPE: 'TABLE', OBJECT_COUNT: 10, INTERNAL: 0 }
        ];
      };

      const mockData = [
        { endpoint: 'CACHED_DB', description: 'Cached Database', schemas: {} }
      ];
      controller.endpointsCache.set('*', {
        timestamp: Date.now(),
        data: mockData
      });

      const result = await controller.endpoints('*', true);
      expect(result).to.not.deep.equal(mockData);
      expect(queryCalls.length).to.be.greaterThan(0);

      // Verify dbVersionCache was populated
      expect(controller.dbVersionCache.size).to.be.greaterThan(0);

      // Next call with cache should NOT execute queries again
      queryCalls = [];
      const cachedResult = await controller.endpoints('*');
      expect(queryCalls.length).to.equal(0);
      expect(cachedResult).to.deep.equal(result);
    });

    it('endpoints should reuse cached dbVersionCache across calls when only endpointsCache expires', async () => {
      let versionQueryCount = 0;
      let countQueryCount = 0;

      dbService.simpleExecute = async (poolAlias, sql, params) => {
        if (sql.includes('v$version')) {
          versionQueryCount++;
          return [{ Version: 'Oracle Database 19c Enterprise Edition' }];
        }
        countQueryCount++;
        return [
          { OWNER: 'HR', OBJECT_TYPE: 'TABLE', OBJECT_COUNT: 10, INTERNAL: 0 }
        ];
      };

      // First run: uncached, queries both version and object count
      await controller.endpoints('*', true);
      const initialVersionCount = versionQueryCount;
      expect(initialVersionCount).to.be.greaterThan(0);
      expect(countQueryCount).to.be.greaterThan(0);

      // Invalidate endpointsCache only (simulating TTL expiry), but keep dbVersionCache
      controller.endpointsCache.clear();

      // Second run: should NOT re-query v$version because dbVersionCache is populated
      await controller.endpoints('*', false);
      expect(versionQueryCount).to.equal(initialVersionCount);
    });
  });
});
