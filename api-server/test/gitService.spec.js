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
});
