const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const gitService = require('../services/gitService');

describe('Git Service Authentication and Error Handling', function () {
  this.timeout(10000);

  const baseDir = path.join(__dirname, 'fixtures', 'test-git-repos');
  const repoName = 'git-test-repo';
  const repoDir = path.join(baseDir, repoName);
  let origReposDir;

  before(() => {
    origReposDir = process.env.GIT_REPOS_DIR;
    process.env.GIT_REPOS_DIR = baseDir;

    fs.mkdirSync(repoDir, { recursive: true });
  });

  after(() => {
    process.env.GIT_REPOS_DIR = origReposDir;
    if (fs.existsSync(baseDir)) {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  });

  describe('formatGitAuthHeader', () => {
    it('should return null when authContext is null or missing token', () => {
      expect(gitService.formatGitAuthHeader(null)).to.be.null;
      expect(gitService.formatGitAuthHeader({})).to.be.null;
      expect(gitService.formatGitAuthHeader({ token: '' })).to.be.null;
      expect(gitService.formatGitAuthHeader({ token: '   ' })).to.be.null;
    });

    it('should format token as HTTP Basic Auth using x-access-token by default', () => {
      const header = gitService.formatGitAuthHeader({ token: 'ghp_secretToken123' });
      const expectedBasic = Buffer.from('x-access-token:ghp_secretToken123').toString('base64');
      expect(header).to.equal(`Authorization: Basic ${expectedBasic}`);
    });

    it('should format token as HTTP Basic Auth using provided username', () => {
      const header = gitService.formatGitAuthHeader({ username: 'customuser', token: 'ghp_secretToken123' });
      const expectedBasic = Buffer.from('customuser:ghp_secretToken123').toString('base64');
      expect(header).to.equal(`Authorization: Basic ${expectedBasic}`);
    });
  });

  describe('runGitCommand in non-interactive environment', () => {
    it('should execute basic git commands successfully with safe.directory', async () => {
      const initRes = await gitService.runGitCommand(repoDir, ['init']);
      expect(initRes.success).to.be.true;

      const statusRes = await gitService.runGitCommand(repoDir, ['status']);
      expect(statusRes.success).to.be.true;
    });

    it('should sanitize both Bearer and Basic tokens from error output', async () => {
      const fakeToken = 'ghp_SuperSecretPassword123';
      const fakeBasic = Buffer.from(`x-access-token:${fakeToken}`).toString('base64');

      const res = await gitService.runGitCommand(repoDir, [
        '-c', `http.extraHeader=Authorization: Basic ${fakeBasic}`,
        'ls-remote', 'https://github.com/visulate/nonexistent-private-repo-12345.git'
      ], { logError: false });

      expect(res.success).to.be.false;
      expect(res.error).to.not.include(fakeToken);
      expect(res.error).to.not.include(fakeBasic);
      expect(res.error).to.include('Authorization: Basic ***');
    });
  });

  describe('commitAndPush clean working tree handling', () => {
    it('should handle nothing to commit gracefully', async () => {
      await gitService.runGitCommand(repoDir, ['init']);
      fs.writeFileSync(path.join(repoDir, 'test.txt'), 'hello world\n', 'utf8');

      // First commit
      const firstRes = await gitService.commitAndPush(repoName, 'main', 'Initial commit', null, {});
      expect(firstRes.success).to.be.true;

      // Second commit with no changes staged
      const secondRes = await gitService.commitAndPush(repoName, 'main', 'Second commit no changes', null, {});
      expect(secondRes.success).to.be.true;
      expect(secondRes.commit.stdout).to.include('Nothing to commit');
    });
  });

  describe('remote matching exactness', () => {
    it('should reject remote when only substring matches exist (e.g. origin2 vs origin)', async () => {
      await gitService.runGitCommand(repoDir, ['remote', 'add', 'origin2', 'https://github.com/fake/repo.git']);
      try {
        await gitService.pullRepo(repoName, 'main', null, 'origin');
        expect.fail('Should have thrown an error for nonexistent remote origin');
      } catch (err) {
        expect(err.message).to.include("Remote 'origin' does not exist");
      }
    });
  });

  describe('visulate-memory repo, M:N associations, granular commit/push/remote, and copy', () => {
    it('should bootstrap visulate-memory with no upstream remote and list it', async () => {
      const memDir = await gitService.ensureMemoryRepoInitialized();
      expect(fs.existsSync(path.join(memDir, '.git'))).to.be.true;
      expect(fs.existsSync(path.join(memDir, 'README.md'))).to.be.true;
      expect(fs.existsSync(path.join(memDir, 'associations.json'))).to.be.true;

      const status = await gitService.getRepoStatus(gitService.getDefaultMemoryRepoName());
      expect(status.isMemoryRepo).to.be.true;
      expect(status.hasRemote).to.be.false;
      expect(status.files).to.have.lengthOf(0);

      const repos = gitService.listLocalRepositories();
      const memEntry = repos.find(r => r.folderName === gitService.getDefaultMemoryRepoName());
      expect(memEntry).to.exist;
      expect(memEntry.isMemoryRepo).to.be.true;
      expect(memEntry.hasRemote).to.be.false;
    });

    it('should manage M:N associations in visulate-memory/associations.json without auto-committing', async () => {
      await gitService.saveAssociation('pdb21', 'rental-portal', 'source');
      await gitService.saveAssociation('cmbs-postgres', 'rental-portal', 'target');
      await gitService.saveAssociation('*', 'dba-common-tools', 'dba');

      const assoc = await gitService.getAssociations();
      expect(assoc.links).to.have.lengthOf(3);
      expect(assoc.links.find(l => l.db === 'pdb21' && l.repo === 'rental-portal').role).to.equal('source');
      expect(assoc.links.find(l => l.db === 'cmbs-postgres' && l.repo === 'rental-portal').role).to.equal('target');
      expect(assoc.links.find(l => l.db === '*' && l.repo === 'dba-common-tools').role).to.equal('dba');

      // Associations change stays uncommitted so user retains commit control
      const status = await gitService.getRepoStatus(gitService.getDefaultMemoryRepoName());
      expect(status.files.some(f => f.path === 'associations.json')).to.be.true;

      await gitService.deleteAssociation('pdb21', 'rental-portal');
      const afterDel = await gitService.getAssociations();
      expect(afterDel.links).to.have.lengthOf(2);
    });

    it('should selectively commit locally without pushing, then push explicitly to a configured remote', async () => {
      const bareRemote = path.join(baseDir, '_bare_remote.git');
      fs.mkdirSync(bareRemote, { recursive: true });
      await gitService.runGitCommand(bareRemote, ['init', '--bare']);

      const localRepo = 'granular-repo';
      const localDir = path.join(baseDir, localRepo);
      fs.mkdirSync(localDir, { recursive: true });
      await gitService.runGitCommand(localDir, ['init', '-b', 'main']);

      fs.writeFileSync(path.join(localDir, 'fileA.sql'), 'SELECT 1;\n', 'utf8');
      fs.writeFileSync(path.join(localDir, 'fileB.sql'), 'SELECT 2;\n', 'utf8');

      // Commit ONLY fileA.sql locally
      const commitRes = await gitService.commitChanges(localRepo, {
        commitMessage: 'Add fileA only',
        files: ['fileA.sql']
      });
      expect(commitRes.success).to.be.true;
      expect(commitRes.commitHash).to.be.a('string');

      // fileB.sql must remain untracked
      const statusAfterCommit = await gitService.getRepoStatus(localRepo);
      expect(statusAfterCommit.files.map(f => f.path)).to.deep.equal(['fileB.sql']);

      // Explicit push before remote is configured should fail clearly
      try {
        await gitService.pushChanges(localRepo, { remote: 'origin' });
        expect.fail('Should fail when no remote configured');
      } catch (err) {
        expect(err.message).to.include('not configured');
      }

      // Configure remote via raw git (file:// path for local bare test) and push explicitly
      await gitService.runGitCommand(localDir, ['remote', 'add', 'origin', bareRemote]);
      const pushRes = await gitService.pushChanges(localRepo, { remote: 'origin', setUpstream: true });
      expect(pushRes.success).to.be.true;
      expect(pushRes.status.ahead).to.equal(0);
      expect(pushRes.status.upstream).to.include('origin/');

      // Discard untracked fileB.sql
      const discardRes = await gitService.discardFileChanges(localRepo, 'fileB.sql');
      expect(discardRes.success).to.be.true;
      expect(fs.existsSync(path.join(localDir, 'fileB.sql'))).to.be.false;
    });

    it('should validate remote URLs in setRemote', async () => {
      const memName = gitService.getDefaultMemoryRepoName();
      await gitService.setRemote(memName, 'origin', 'https://github.com/example/visulate-memory.git');
      const remotes = await gitService.getRemotes(memName);
      expect(remotes).to.deep.equal([{ name: 'origin', url: 'https://github.com/example/visulate-memory.git' }]);

      try {
        await gitService.setRemote(memName, 'origin', '--upload-pack=evil');
        expect.fail('Should reject unsafe remote URL');
      } catch (err) {
        expect(err.message).to.include('Invalid remote URL');
      }
    });

    it('should copy files from visulate-memory to a target code repo without committing', async () => {
      const memName = gitService.getDefaultMemoryRepoName();
      const memDir = await gitService.ensureMemoryRepoInitialized();
      const srcDir = path.join(memDir, 'pdb21', 'comments');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'rnt_comments.sql'), 'COMMENT ON TABLE emp IS \'Employees\';\n', 'utf8');

      const targetRepo = 'granular-repo';
      const copyRes = await gitService.copyBetweenRepos(
        memName,
        'pdb21/comments/rnt_comments.sql',
        targetRepo,
        'db/scripts/rnt_comments.sql'
      );
      expect(copyRes.success).to.be.true;
      expect(copyRes.copiedFiles).to.deep.equal(['db/scripts/rnt_comments.sql']);
      expect(fs.existsSync(path.join(baseDir, targetRepo, 'db', 'scripts', 'rnt_comments.sql'))).to.be.true;

      // Second copy without overwrite should throw EEXIST
      try {
        await gitService.copyBetweenRepos(
          memName,
          'pdb21/comments/rnt_comments.sql',
          targetRepo,
          'db/scripts/rnt_comments.sql',
          { overwrite: false }
        );
        expect.fail('Should fail on existing target file without overwrite');
      } catch (err) {
        expect(err.code).to.equal('EEXIST');
      }
    });
  });
});
