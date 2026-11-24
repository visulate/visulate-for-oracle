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

  it('should create code-maps in visulate-memory/dev/ without modifying the app repo', async () => {
    const gitService = require('../services/gitService');
    const map = await dependencyIndexer.indexProjectDependencies(repoName, null, null, 'dev');
    expect(map.dbConnectionId).to.equal('dev');

    const memDir = gitService.getMemoryRepoDir();
    const devDir = path.join(memDir, 'dev', 'code-maps', repoName);
    expect(fs.existsSync(devDir)).to.be.true;
    // App repo should remain untouched (no visulate/ directory created inside it)
    expect(fs.existsSync(path.join(repoDir, 'visulate'))).to.be.false;

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

  it('should create visulate-memory/prod/code-maps/ without overwriting dev when indexing for "prod"', async () => {
    const gitService = require('../services/gitService');
    const map = await dependencyIndexer.indexProjectDependencies(repoName, null, null, 'prod');
    expect(map.dbConnectionId).to.equal('prod');

    const memDir = gitService.getMemoryRepoDir();
    const prodDir = path.join(memDir, 'prod', 'code-maps', repoName);
    const devDir = path.join(memDir, 'dev', 'code-maps', repoName);

    expect(fs.existsSync(prodDir)).to.be.true;
    expect(fs.existsSync(devDir)).to.be.true;

    const prodMap = JSON.parse(fs.readFileSync(path.join(prodDir, 'oracle-code-map.json'), 'utf8'));
    const devMap = JSON.parse(fs.readFileSync(path.join(devDir, 'oracle-code-map.json'), 'utf8'));

    expect(prodMap.dbConnectionId).to.equal('prod');
    expect(devMap.dbConnectionId).to.equal('dev');
  });

  it('should resolve codebase dependencies across multiple repos from visulate-memory', async () => {
    const secondRepo = 'second-app';
    const secondDir = path.join(baseDir, secondRepo);
    fs.mkdirSync(path.join(secondDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(secondDir, 'payroll.sql'), 'SELECT * FROM EMP;\n', 'utf8');
    await dependencyIndexer.indexProjectDependencies(secondRepo, null, null, 'dev');

    const devAll = await dependencyIndexer.getObjectCodeDependencies('dev', 'EMP');
    expect(devAll.found).to.be.true;
    expect(devAll.files).to.include('emp.sql');
    expect(devAll.files).to.include('payroll.sql');
    expect(devAll.repositories.map(r => r.repoFolder)).to.include.members([repoName, secondRepo]);

    const prodResult = await dependencyIndexer.getObjectCodeDependencies('prod', 'EMP', null, repoName);
    expect(prodResult.found).to.be.true;
    expect(prodResult.files).to.include('emp.sql');

    const loadedMap = dependencyIndexer.getProjectCodeMap(repoName, 'dev');
    expect(loadedMap).to.be.an('object');
    expect(loadedMap.objects['EMP']).to.exist;
  });

  it('should resolve safe file path for download using gitService.getSafeFilePath', () => {
    const gitService = require('../services/gitService');
    const filePath = gitService.getSafeFilePath(repoName, 'emp.sql');
    expect(filePath).to.equal(path.join(repoDir, 'emp.sql'));

    expect(() => gitService.getSafeFilePath(repoName, 'nonexistent.sql')).to.throw();
    fs.mkdirSync(path.join(repoDir, 'subdir'), { recursive: true });
    expect(() => gitService.getSafeFilePath(repoName, 'subdir')).to.throw('directory');

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

  it('should save comparison report to visulate-memory via compareEntities without ReferenceError', async () => {
    const gitService = require('../services/gitService');
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
      expect(result.repo).to.equal(gitService.getDefaultMemoryRepoName());
      expect(result.savedPath).to.include('dev/reports/comparison_dev_vs_prod.md');
      expect(fs.existsSync(path.join(gitService.getMemoryRepoDir(), result.savedPath))).to.be.true;
    } finally {
      controller.endpoints = origEndpoints;
      controller.getObjectDetails = origGetObj;
      dbConfig.endpoints = origConfigEndpoints;
    }
  });

  it('should namespace shared code maps by user identity in GIT_MODE=server to prevent workspace collisions', async () => {
    const origMode = process.env.GIT_MODE;
    const origScope = process.env.MEMORY_REPO_SCOPE;
    try {
      process.env.GIT_MODE = 'server';
      process.env.MEMORY_REPO_SCOPE = 'shared';

      const aliceRepoDir = path.join(baseDir, 'users', 'alice', 'app');
      const bobRepoDir = path.join(baseDir, 'users', 'bob', 'app');
      fs.mkdirSync(aliceRepoDir, { recursive: true });
      fs.mkdirSync(bobRepoDir, { recursive: true });
      fs.writeFileSync(path.join(aliceRepoDir, 'alice.sql'), 'SELECT * FROM ALICE_CUSTOMERS;\n', 'utf8');
      fs.writeFileSync(path.join(bobRepoDir, 'bob.sql'), 'SELECT * FROM BOB_ORDERS;\n', 'utf8');

      const aliceIdx = await dependencyIndexer.indexProjectDependencies('app', null, { username: 'alice' }, 'test-db');
      const bobIdx = await dependencyIndexer.indexProjectDependencies('app', null, { username: 'bob' }, 'test-db');

      expect(aliceIdx.repoIdentity).to.equal('users/alice/app');
      expect(bobIdx.repoIdentity).to.equal('users/bob/app');
      expect(aliceIdx.savedPath).to.include('code-maps/users/alice/app/oracle-code-map.json');
      expect(bobIdx.savedPath).to.include('code-maps/users/bob/app/oracle-code-map.json');

      const aliceMap = dependencyIndexer.getProjectCodeMap('app', 'test-db', { username: 'alice' });
      const bobMap = dependencyIndexer.getProjectCodeMap('app', 'test-db', { username: 'bob' });
      expect(Object.keys(aliceMap.objects)).to.include('ALICE_CUSTOMERS');
      expect(Object.keys(aliceMap.objects)).to.not.include('BOB_ORDERS');
      expect(Object.keys(bobMap.objects)).to.include('BOB_ORDERS');
      expect(Object.keys(bobMap.objects)).to.not.include('ALICE_CUSTOMERS');

      const aliceDeps = await dependencyIndexer.getObjectCodeDependencies('test-db', 'ALICE_CUSTOMERS', { username: 'alice' });
      expect(aliceDeps.found).to.be.true;
      expect(aliceDeps.repoIdentity).to.equal('users/alice/app');
      expect(aliceDeps.repositories[0].repoOwner).to.equal('alice');

      // Alice's lookup must not return Bob's colliding repo map
      const bobFromAlice = await dependencyIndexer.getObjectCodeDependencies('test-db', 'BOB_ORDERS', { username: 'alice' });
      expect(bobFromAlice.found).to.be.false;
    } finally {
      if (origMode === undefined) delete process.env.GIT_MODE;
      else process.env.GIT_MODE = origMode;
      if (origScope === undefined) delete process.env.MEMORY_REPO_SCOPE;
      else process.env.MEMORY_REPO_SCOPE = origScope;
    }
  });
});

