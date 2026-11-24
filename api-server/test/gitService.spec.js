const fs = require('fs');
const os = require('os');
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

    it('should parse dotted branch names, handle NUL-delimited filenames with arrows, preserve renames on selective commit, and discard staged additions/deletions', async () => {
      const repo = 'edge-cases-repo';
      const repoDir = path.join(baseDir, repo);
      fs.mkdirSync(repoDir, { recursive: true });
      await gitService.runGitCommand(repoDir, ['init', '-b', 'release/1.2']);
      await gitService.saveFileContent(repo, 'old_name.sql', 'SELECT 1 FROM dual;\n');
      await gitService.saveFileContent(repo, 'keep.sql', 'SELECT 2 FROM dual;\n');
      await gitService.commitChanges(repo, { commitMessage: 'Initial', stageAll: true });

      // 1. Branch name containing a period must be preserved verbatim
      let status = await gitService.getRepoStatus(repo);
      expect(status.branch).to.equal('release/1.2');

      // 2. Ordinary filename containing " -> " must not be mangled
      await gitService.saveFileContent(repo, 'a -> b.sql', 'SELECT 3;\n');
      status = await gitService.getRepoStatus(repo);
      expect(status.files.map(f => f.path)).to.include('a -> b.sql');
      await gitService.discardFileChanges(repo, 'a -> b.sql');
      expect(fs.existsSync(path.join(repoDir, 'a -> b.sql'))).to.be.false;

      // 3. Staged addition discard should unstage and remove file without failing checkout HEAD
      await gitService.saveFileContent(repo, 'staged_new.sql', 'SELECT 4;\n');
      await gitService.runGitCommand(repoDir, ['add', 'staged_new.sql']);
      await gitService.discardFileChanges(repo, 'staged_new.sql');
      expect(fs.existsSync(path.join(repoDir, 'staged_new.sql'))).to.be.false;
      status = await gitService.getRepoStatus(repo);
      expect(status.files.find(f => f.path === 'staged_new.sql')).to.be.undefined;

      // 4. Staged deletion discard should restore the file from HEAD
      await gitService.runGitCommand(repoDir, ['rm', 'keep.sql']);
      expect(fs.existsSync(path.join(repoDir, 'keep.sql'))).to.be.false;
      await gitService.discardFileChanges(repo, 'keep.sql');
      expect(fs.existsSync(path.join(repoDir, 'keep.sql'))).to.be.true;

      // 5. Selective commit of a staged rename should remove old_name.sql from HEAD too
      await gitService.runGitCommand(repoDir, ['mv', 'old_name.sql', 'new_name.sql']);
      await gitService.saveFileContent(repo, 'unrelated.sql', 'SELECT 99;\n');
      await gitService.commitChanges(repo, {
        commitMessage: 'Rename old to new',
        files: ['new_name.sql']
      });
      const lsHead = await gitService.runGitCommand(repoDir, ['ls-tree', '--name-only', 'HEAD']);
      const headFiles = lsHead.stdout.split('\n').filter(Boolean);
      expect(headFiles).to.include('new_name.sql');
      expect(headFiles).to.not.include('old_name.sql');
      expect(headFiles).to.not.include('unrelated.sql');
    });

    it('should serialize concurrent association updates and reject symlinked copy sources/destinations', async () => {
      const memDir = await gitService.ensureMemoryRepoInitialized();
      const memName = gitService.getDefaultMemoryRepoName();

      // Concurrent saves should not lose each other's links
      await Promise.all([
        gitService.saveAssociation('db_one', 'repo_a', 'app'),
        gitService.saveAssociation('db_two', 'repo_b', 'source'),
        gitService.saveAssociation('db_three', 'repo_c', 'target')
      ]);
      const assoc = await gitService.getAssociations();
      expect(assoc.links.map(l => `${l.db}:${l.repo}`)).to.include.members([
        'db_one:repo_a',
        'db_two:repo_b',
        'db_three:repo_c'
      ]);

      // Reject symlink pointing to .git/config during copyBetweenRepos
      const targetRepo = 'symlink-test-target';
      const targetDir = path.join(baseDir, targetRepo);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.symlinkSync(path.join(memDir, '.git', 'config'), path.join(memDir, 'git_alias.txt'));

      try {
        await gitService.copyBetweenRepos(memName, 'git_alias.txt', targetRepo, 'copied.txt');
        expect.fail('Should reject symlink source pointing to .git/config');
      } catch (err) {
        expect(err.message.toLowerCase()).to.include('symbolic link');
      }

      // Reject symlink destination directory escaping repo
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visulate-outside-'));
      try {
        fs.symlinkSync(outsideDir, path.join(targetDir, 'escape_dir'));
        await gitService.saveFileContent(memName, 'pdb21/safe.sql', 'SELECT 1;\n');
        try {
          await gitService.copyBetweenRepos(memName, 'pdb21/safe.sql', targetRepo, 'escape_dir/leaked.sql');
          expect.fail('Should reject symlinked destination directory');
        } catch (err) {
          expect(err.message.toLowerCase()).to.match(/symbolic link|escapes/);
        }
        expect(fs.existsSync(path.join(outsideDir, 'leaked.sql'))).to.be.false;
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it('should support pull --rebase cleanly and auto-abort on rebase conflict', async () => {
      const bareRemote = path.join(baseDir, 'rebase-remote.git');
      const repoA = 'rebase-repo-a';
      const repoB = 'rebase-repo-b';
      const dirA = path.join(baseDir, repoA);
      const dirB = path.join(baseDir, repoB);

      fs.mkdirSync(bareRemote, { recursive: true });
      fs.mkdirSync(dirA, { recursive: true });
      fs.mkdirSync(dirB, { recursive: true });

      await gitService.runGitCommand(bareRemote, ['init', '--bare', '-b', 'main']);
      await gitService.runGitCommand(dirA, ['init', '-b', 'main']);
      await gitService.runGitCommand(dirA, ['remote', 'add', 'origin', bareRemote]);
      await gitService.saveFileContent(repoA, 'shared.txt', 'line1\n');
      await gitService.commitChanges(repoA, { commitMessage: 'base', stageAll: true });
      await gitService.pushChanges(repoA, { remote: 'origin', branchName: 'main', setUpstream: true });

      // Clone into repoB
      await gitService.runGitCommand(baseDir, ['clone', bareRemote, repoB]);

      // RepoA pushes a non-conflicting file
      await gitService.saveFileContent(repoA, 'remote_only.txt', 'from remote\n');
      await gitService.commitChanges(repoA, { commitMessage: 'remote commit', stageAll: true });
      await gitService.pushChanges(repoA, { remote: 'origin', branchName: 'main' });

      // RepoB commits a local non-conflicting file, then pulls with --rebase
      await gitService.saveFileContent(repoB, 'local_only.txt', 'from local\n');
      await gitService.commitChanges(repoB, { commitMessage: 'local commit', stageAll: true });

      const rebaseOk = await gitService.pullRepo(repoB, 'main', {}, null, 'origin', { rebase: true });
      expect(rebaseOk.success).to.be.true;
      expect(rebaseOk.rebase).to.be.true;
      expect(fs.existsSync(path.join(dirB, 'remote_only.txt'))).to.be.true;
      expect(fs.existsSync(path.join(dirB, 'local_only.txt'))).to.be.true;

      // Verify linear history (no merge commits)
      const logRes = await gitService.runGitCommand(dirB, ['rev-list', '--merges', 'HEAD']);
      expect(logRes.stdout).to.equal('');

      // Now create a conflict on shared.txt: push from repoA and edit locally in repoB
      await gitService.saveFileContent(repoA, 'shared.txt', 'remote change\n');
      await gitService.commitChanges(repoA, { commitMessage: 'remote conflict', stageAll: true });
      await gitService.pushChanges(repoA, { remote: 'origin', branchName: 'main' });

      await gitService.saveFileContent(repoB, 'shared.txt', 'local conflict\n');
      await gitService.commitChanges(repoB, { commitMessage: 'local conflict', stageAll: true });

      try {
        await gitService.pullRepo(repoB, 'main', {}, null, 'origin', { rebase: true });
        expect.fail('Expected rebase conflict error');
      } catch (err) {
        expect(err.message).to.include('automatically aborted');
      }

      // RepoB must NOT be left in a mid-rebase state
      expect(fs.existsSync(path.join(dirB, '.git', 'rebase-merge'))).to.be.false;
      expect(fs.existsSync(path.join(dirB, '.git', 'rebase-apply'))).to.be.false;
    });

    it('should fetch --prune and delete local branches whose upstream is gone while protecting current branch', async () => {
      const bareRemote = path.join(baseDir, 'prune-remote.git');
      const repo = 'prune-repo';
      const dir = path.join(baseDir, repo);

      fs.mkdirSync(bareRemote, { recursive: true });
      fs.mkdirSync(dir, { recursive: true });

      await gitService.runGitCommand(bareRemote, ['init', '--bare', '-b', 'main']);
      await gitService.runGitCommand(dir, ['init', '-b', 'main']);
      await gitService.runGitCommand(dir, ['remote', 'add', 'origin', bareRemote]);
      await gitService.saveFileContent(repo, 'init.txt', 'hello\n');
      await gitService.commitChanges(repo, { commitMessage: 'init', stageAll: true });
      await gitService.pushChanges(repo, { remote: 'origin', branchName: 'main', setUpstream: true });

      // Create & push two feature branches
      await gitService.createAndCheckoutBranch(repo, 'feat/merged-one');
      await gitService.saveFileContent(repo, 'one.txt', '1\n');
      await gitService.commitChanges(repo, { commitMessage: 'one', stageAll: true });
      await gitService.pushChanges(repo, { remote: 'origin', branchName: 'feat/merged-one', setUpstream: true });

      await gitService.createAndCheckoutBranch(repo, 'feat/still-checked-out');
      await gitService.saveFileContent(repo, 'two.txt', '2\n');
      await gitService.commitChanges(repo, { commitMessage: 'two', stageAll: true });
      await gitService.pushChanges(repo, { remote: 'origin', branchName: 'feat/still-checked-out', setUpstream: true });

      // Simulate GitHub deleting both branches on remote after PR merge
      await gitService.runGitCommand(bareRemote, ['branch', '-D', 'feat/merged-one']);
      await gitService.runGitCommand(bareRemote, ['branch', '-D', 'feat/still-checked-out']);

      // Dry run while checked out on feat/still-checked-out: should list merged-one and protect current branch
      const preview = await gitService.pruneGoneBranches(repo, { dryRun: true });
      expect(preview.success).to.be.true;
      expect(preview.goneBranches.map(b => b.name)).to.deep.equal(['feat/merged-one']);
      expect(preview.skippedCurrent.name).to.equal('feat/still-checked-out');

      // Execute prune: should delete feat/merged-one only and keep main + checked-out branch
      const pruned = await gitService.pruneGoneBranches(repo, {
        dryRun: false,
        branches: ['feat/merged-one', 'main'] // main must be ignored because it's not [gone]
      });
      expect(pruned.deleted).to.deep.equal(['feat/merged-one']);
      expect(pruned.branches).to.include('main');
      expect(pruned.branches).to.include('feat/still-checked-out');
      expect(pruned.branches).to.not.include('feat/merged-one');
    });

    it('should rename tracked files via git mv and untracked files safely while rejecting conflicts and escapes', async () => {
      const repo = 'rename-repo';
      const dir = path.join(baseDir, repo);
      fs.mkdirSync(dir, { recursive: true });
      await gitService.runGitCommand(dir, ['init', '-b', 'main']);

      await gitService.saveFileContent(repo, 'tracked.sql', 'SELECT 1;\n');
      await gitService.commitChanges(repo, { commitMessage: 'base', stageAll: true });

      // Rename tracked file into a new subdirectory
      const resTracked = await gitService.renameFile(repo, 'tracked.sql', 'sql/renamed_tracked.sql');
      expect(resTracked.success).to.be.true;
      expect(fs.existsSync(path.join(dir, 'tracked.sql'))).to.be.false;
      expect(fs.existsSync(path.join(dir, 'sql', 'renamed_tracked.sql'))).to.be.true;

      const status = await gitService.getRepoStatus(repo);
      const renamedEntry = status.files.find(f => f.path === 'sql/renamed_tracked.sql');
      expect(renamedEntry).to.exist;
      expect(renamedEntry.status).to.equal('R');
      expect(renamedEntry.origPath).to.equal('tracked.sql');

      // Rename untracked file
      await gitService.saveFileContent(repo, 'draft.md', '# Draft\n');
      const resUntracked = await gitService.renameFile(repo, 'draft.md', 'notes/final.md');
      expect(resUntracked.success).to.be.true;
      expect(fs.existsSync(path.join(dir, 'notes', 'final.md'))).to.be.true;

      // Reject overwriting existing file
      try {
        await gitService.renameFile(repo, 'notes/final.md', 'sql/renamed_tracked.sql');
        expect.fail('Expected EEXIST on existing destination');
      } catch (err) {
        expect(err.code).to.equal('EEXIST');
      }

      // Reject .git target
      try {
        await gitService.renameFile(repo, 'notes/final.md', '.git/evil');
        expect.fail('Expected error for .git target');
      } catch (err) {
        expect(err.message).to.include('metadata');
      }
    });
  });
});
