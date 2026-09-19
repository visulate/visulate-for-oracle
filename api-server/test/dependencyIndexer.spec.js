const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const dependencyIndexer = require('../services/dependencyIndexer');

describe('Dependency Indexer - Multi-Database .okf/<db>/ Support', function () {
  this.timeout(10000);

  const baseDir = path.join(__dirname, 'fixtures', 'test-repos');
  const repoName = 'sample-project';
  const repoDir = path.join(baseDir, repoName);
  let origReposDir;

  before(() => {
    origReposDir = process.env.GIT_REPOS_DIR;
    process.env.GIT_REPOS_DIR = baseDir;

    // Create fixture repo with git and sample sql files
    fs.mkdirSync(path.join(repoDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'emp.sql'), 'SELECT empno, ename FROM EMP JOIN DEPT ON EMP.deptno = DEPT.deptno;\n', 'utf8');
  });

  after(() => {
    process.env.GIT_REPOS_DIR = origReposDir;
    if (fs.existsSync(baseDir)) {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  });

  it('should create visulate/dev/ with oracle-code-map.json and codebase-dependencies.md when db is "dev"', async () => {
    const map = await dependencyIndexer.indexProjectDependencies(repoName, null, null, 'dev');
    expect(map.dbConnectionId).to.equal('dev');

    const devDir = path.join(repoDir, 'visulate', 'dev');
    expect(fs.existsSync(devDir)).to.be.true;

    const mapFile = path.join(devDir, 'oracle-code-map.json');
    const mdFile = path.join(devDir, 'codebase-dependencies.md');
    expect(fs.existsSync(mapFile)).to.be.true;
    expect(fs.existsSync(mdFile)).to.be.true;

    const mapContent = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
    expect(mapContent.dbConnectionId).to.equal('dev');
    expect(mapContent.objects['EMP']).to.be.an('object');

    const mdContent = fs.readFileSync(mdFile, 'utf8');
    expect(mdContent).to.include('> **Database Endpoint:** `dev`');
    expect(mdContent).to.include('EMP');
  });

  it('should create visulate/prod/ without overwriting visulate/dev/ when indexing for "prod"', async () => {
    const map = await dependencyIndexer.indexProjectDependencies(repoName, null, null, 'prod');
    expect(map.dbConnectionId).to.equal('prod');

    const prodDir = path.join(repoDir, 'visulate', 'prod');
    const devDir = path.join(repoDir, 'visulate', 'dev');

    expect(fs.existsSync(prodDir)).to.be.true;
    expect(fs.existsSync(devDir)).to.be.true;

    const prodMap = JSON.parse(fs.readFileSync(path.join(prodDir, 'oracle-code-map.json'), 'utf8'));
    const devMap = JSON.parse(fs.readFileSync(path.join(devDir, 'oracle-code-map.json'), 'utf8'));

    expect(prodMap.dbConnectionId).to.equal('prod');
    expect(devMap.dbConnectionId).to.equal('dev');
  });

  it('should resolve codebase dependencies from visulate/<db>/ in getObjectCodeDependencies', async () => {
    const devResult = await dependencyIndexer.getObjectCodeDependencies('dev', 'EMP', null, repoName);
    expect(devResult.found).to.be.true;
    expect(devResult.files).to.include('emp.sql');

    const prodResult = await dependencyIndexer.getObjectCodeDependencies('prod', 'EMP', null, repoName);
    expect(prodResult.found).to.be.true;
    expect(prodResult.files).to.include('emp.sql');
  });

  it('should resolve safe file path for download using gitService.getSafeFilePath', () => {
    const gitService = require('../services/gitService');
    const filePath = gitService.getSafeFilePath(repoName, 'emp.sql');
    expect(filePath).to.equal(path.join(repoDir, 'emp.sql'));

    expect(() => gitService.getSafeFilePath(repoName, 'nonexistent.sql')).to.throw();
    expect(() => gitService.getSafeFilePath(repoName, 'visulate')).to.throw('directory');

    // Reject .git control metadata
    expect(() => gitService.getSafeFilePath(repoName, '.git/config')).to.throw('repository metadata is not downloadable');

    // Reject symlinks
    const symlinkPath = path.join(repoDir, 'emp-link.sql');
    try { fs.unlinkSync(symlinkPath); } catch (e) {}
    try {
      fs.symlinkSync(path.join(repoDir, 'emp.sql'), symlinkPath);
      expect(() => gitService.getSafeFilePath(repoName, 'emp-link.sql')).to.throw('symbolic links are not downloadable');
    } finally {
      try { fs.unlinkSync(symlinkPath); } catch (e) {}
    }
  });

  it('should delete a file from working tree using gitService.deleteFile', async () => {
    const gitService = require('../services/gitService');
    const testFile = 'to-delete.sql';
    fs.writeFileSync(path.join(repoDir, testFile), '-- temporary file\n', 'utf8');
    expect(fs.existsSync(path.join(repoDir, testFile))).to.be.true;

    const result = await gitService.deleteFile(repoName, testFile);
    expect(result.success).to.be.true;
    expect(fs.existsSync(path.join(repoDir, testFile))).to.be.false;
  });

  it('should reject deleting nonexistent file or escaping directory boundary', async () => {
    const gitService = require('../services/gitService');
    try {
      await gitService.deleteFile(repoName, 'does-not-exist.sql');
      expect.fail('Should have thrown error');
    } catch (err) {
      expect(err.message).to.include('not exist');
    }

    try {
      await gitService.deleteFile(repoName, '../../outside.txt');
      expect.fail('Should have thrown error');
    } catch (err) {
      expect(err.message).to.be.a('string');
    }

    try {
      // Should reject deleting directory (e.g. '.' or subfolder)
      await gitService.deleteFile(repoName, '.');
      expect.fail('Should have rejected directory deletion');
    } catch (err) {
      expect(err.message).to.include('Only file deletions are permitted');
    }
  });

  it('should reject invalid dbConnectionId attempting directory traversal', async () => {
    try {
      await dependencyIndexer.indexProjectDependencies(repoName, null, null, '../../evil-dir');
      expect.fail('Should have rejected invalid dbConnectionId');
    } catch (err) {
      expect(err.message).to.include('Invalid database connection identifier');
    }
  });

  it('should save comparison report to repository via compareEntities without ReferenceError', async () => {
    const compareService = require('../services/compare-service');
    const controller = require('../services/controller');
    const dbConfig = require('../config/database');

    const origEndpoints = controller.endpoints;
    const origGetObj = controller.getObjectDetails;
    const origConfigEndpoints = dbConfig.endpoints;

    try {
      dbConfig.endpoints = { dev: 'dev_pool', prod: 'prod_pool' };
      controller.endpoints = async () => ({ dev: { connectString: 'mock' }, prod: { connectString: 'mock' } });
      controller.getObjectDetails = async () => ([{ title: 'Columns', rows: [{ COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER' }] }]);

      const sourceReq = { db: 'dev', owner: 'HR', type: 'TABLE', name: 'EMP' };
      const targetReq = { db: 'prod', owner: 'HR', type: 'TABLE', name: 'EMP' };

      const result = await compareService.compareEntities(sourceReq, targetReq);
      expect(result).to.have.property('savedPath');
      expect(result.savedPath).to.include('visulate/dev/reports/comparison_dev_vs_prod.md');
      expect(fs.existsSync(path.join(repoDir, result.savedPath))).to.be.true;
    } finally {
      controller.endpoints = origEndpoints;
      controller.getObjectDetails = origGetObj;
      dbConfig.endpoints = origConfigEndpoints;
    }
  });
});

