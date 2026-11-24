/*!
 * Copyright 2026 Visulate LLC. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const logger = require('./logger');

const DEFAULT_MEMORY_REPO_FALLBACK = 'visulate-memory';
const VALID_ASSOCIATION_ROLES = ['app', 'dba', 'source', 'target'];

/**
 * Resolves a lock file path inside .git/ (so it never pollutes git status),
 * falling back to os.tmpdir() if .git does not exist yet.
 */
function getRepoLockPath(repoDir, lockName) {
  const gitDir = path.join(repoDir, '.git');
  if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
    return path.join(gitDir, `.visulate-${lockName}.lock`);
  }
  const hash = crypto.createHash('sha256').update(path.resolve(repoDir)).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), `visulate-${lockName}-${hash}.lock`);
}

/**
 * Cross-process file lock using exclusive atomic creation (O_CREAT | O_EXCL).
 * Handles stale lock recovery and retries with backoff until timeoutMs.
 */
async function withFileLock(lockPath, fn, { timeoutMs = 15000, staleMs = 30000, retryMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let acquired = false;

  while (!acquired) {
    try {
      const handle = await fs.promises.open(lockPath, 'wx');
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }), 'utf8');
      } finally {
        await handle.close();
      }
      acquired = true;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
      // Recover stale lock left behind by a crashed process
      try {
        const stat = await fs.promises.stat(lockPath);
        if (Date.now() - stat.mtimeMs > staleMs) {
          await fs.promises.unlink(lockPath).catch(() => {});
          continue;
        }
      } catch (statErr) {
        if (statErr.code === 'ENOENT') {
          continue;
        }
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for repository lock: ${path.basename(lockPath)}`);
      }
      await new Promise(resolve => setTimeout(resolve, retryMs + Math.floor(Math.random() * 15)));
    }
  }

  try {
    return await fn();
  } finally {
    await fs.promises.unlink(lockPath).catch(() => {});
  }
}

/**
 * Verifies that neither targetAbsPath nor any intermediate directory component
 * under rootDir is a symbolic link.
 */
function assertNoSymlinkComponents(rootDir, targetAbsPath) {
  const realRoot = fs.realpathSync(rootDir);
  const rel = path.relative(realRoot, targetAbsPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes repository boundary: ${rel}`);
  }
  const parts = rel.split(path.sep);
  let current = realRoot;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const st = fs.lstatSync(current);
      if (st.isSymbolicLink()) {
        throw new Error(`Symbolic link not allowed in path: ${rel}`);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        break;
      }
      throw err;
    }
  }
}

/**
 * Returns the configured folder name for the shared Visulate memory repository.
 */
function getDefaultMemoryRepoName() {
  const raw = (process.env.DEFAULT_MEMORY_REPO || DEFAULT_MEMORY_REPO_FALLBACK).trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(raw) || raw === '.' || raw === '..') {
    return DEFAULT_MEMORY_REPO_FALLBACK;
  }
  return raw;
}

/**
 * Resolves the root directory for the Visulate memory repository.
 * Defaults to shared scope (<GIT_REPOS_DIR>/visulate-memory) so database memories
 * are available across all users and repositories; can be set to 'user' via MEMORY_REPO_SCOPE.
 */
function getMemoryRepoDir(userContext = null) {
  const scope = (process.env.MEMORY_REPO_SCOPE || 'shared').toLowerCase();
  const root = process.env.GIT_REPOS_DIR || path.join(process.cwd(), 'repos');
  const memoryRepoName = getDefaultMemoryRepoName();
  if (scope === 'user') {
    return path.join(getBaseReposDir(userContext), memoryRepoName);
  }
  return path.join(root, memoryRepoName);
}

/**
 * Resolves the base directory for repositories.
 * - In server mode (GIT_MODE=server), partitions workspaces under $GIT_REPOS_DIR/users/<username>/
 * - In local mode (default), uses $GIT_REPOS_DIR directly ($HOME/git)
 */
function getBaseReposDir(userContext = null) {
  const root = process.env.GIT_REPOS_DIR || path.join(process.cwd(), 'repos');
  const mode = (process.env.GIT_MODE || 'local').toLowerCase();

  if (mode === 'server' && userContext && userContext.username) {
    const safeUser = String(userContext.username).replace(/[^a-zA-Z0-9._-]/g, '_');
    const userDir = path.join(root, 'users', safeUser);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
  }
  return root;
}

/**
 * Resolves directory for a target repository folder.
 */
function getProjectRepoDir(identifier, userContext = null) {
  if (!identifier) return null;
  const safeName = String(identifier);
  if (!/^[a-zA-Z0-9._-]+$/.test(safeName) || safeName === '.' || safeName === '..') {
    throw new Error('Invalid repository identifier');
  }
  if (safeName === getDefaultMemoryRepoName()) {
    return getMemoryRepoDir(userContext);
  }
  const baseDir = getBaseReposDir(userContext);
  return path.join(baseDir, safeName);
}

/**
 * Validates that a path is canonically contained within a repository directory,
 * preventing directory traversal attacks (../) and symlink escapes.
 */
function resolveSafePath(repoDir, relativePath = '', mustExist = false) {
  if (!repoDir || !fs.existsSync(repoDir)) {
    throw new Error('Repository directory does not exist');
  }
  const realRepoDir = fs.realpathSync(repoDir);
  const normalizedRel = (relativePath || '').replace(/^[\\\/]+/, '');
  const resolved = path.resolve(realRepoDir, normalizedRel);

  if (mustExist) {
    if (!fs.existsSync(resolved)) {
      throw new Error(`Path does not exist: ${relativePath}`);
    }
    const realTarget = fs.realpathSync(resolved);
    if (!realTarget.startsWith(realRepoDir + path.sep) && realTarget !== realRepoDir) {
      throw new Error(`Path escapes repository boundary: ${relativePath}`);
    }
    return realTarget;
  } else {
    // For file creation/saving: check canonical path of existing ancestor directory
    let checkDir = path.dirname(resolved);
    while (!fs.existsSync(checkDir) && checkDir !== path.dirname(checkDir)) {
      checkDir = path.dirname(checkDir);
    }
    if (fs.existsSync(checkDir)) {
      const realCheckDir = fs.realpathSync(checkDir);
      if (!realCheckDir.startsWith(realRepoDir + path.sep) && realCheckDir !== realRepoDir) {
        throw new Error(`Path escapes repository boundary: ${relativePath}`);
      }
    }
    if (!resolved.startsWith(realRepoDir + path.sep) && resolved !== realRepoDir) {
      throw new Error(`Path escapes repository boundary: ${relativePath}`);
    }
    // Prevent overwriting through an existing symlink
    if (fs.existsSync(resolved)) {
      const stat = fs.lstatSync(resolved);
      if (stat.isSymbolicLink()) {
        throw new Error(`Cannot write to symbolic link: ${relativePath}`);
      }
    }
    return resolved;
  }
}

/**
 * Resolves and validates an existing safe file path within a repository.
 */
function getSafeFilePath(identifier, filePath, userContext = null) {
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(repoDir)) {
    throw new Error('Repository directory does not exist');
  }
  const normalizedRel = (filePath || '').replace(/^[\\\/]+/, '');
  if (normalizedRel.split(/[\\\/]/).includes('.git')) {
    throw new Error('Invalid file path: repository metadata is not downloadable');
  }
  const realRepoDir = fs.realpathSync(repoDir);
  const resolved = path.resolve(realRepoDir, normalizedRel);
  if (fs.existsSync(resolved)) {
    const rawStat = fs.lstatSync(resolved);
    if (rawStat.isSymbolicLink()) {
      throw new Error('Invalid file path: symbolic links are not downloadable');
    }
  }
  const fullPath = resolveSafePath(repoDir, filePath, true);
  const relativeTarget = path.relative(realRepoDir, fullPath);
  if (relativeTarget.split(path.sep).includes('.git')) {
    throw new Error('Invalid file path: repository metadata is not downloadable');
  }
  const stat = fs.lstatSync(fullPath);
  if (stat.isDirectory()) {
    throw new Error('Target path is a directory, not a file');
  }
  return fullPath;
}

/**
 * Checks whether a git repository directory has at least one configured remote.
 */
function hasConfiguredRemoteSync(repoDir) {
  try {
    const configPath = path.join(repoDir, '.git', 'config');
    if (!fs.existsSync(configPath)) return false;
    const cfg = fs.readFileSync(configPath, 'utf8');
    return /\[remote\s+"[^"]+"\]/.test(cfg);
  } catch (_) {
    return false;
  }
}

/**
 * Lists local repository directories in the active workspace.
 * Includes the shared Visulate memory repository if present.
 */
function listLocalRepositories(userContext = null) {
  const baseDir = getBaseReposDir(userContext);
  const memoryRepoName = getDefaultMemoryRepoName();
  const memoryRepoDir = getMemoryRepoDir(userContext);
  const repos = [];
  const seen = new Set();

  if (fs.existsSync(memoryRepoDir)) {
    const isGit = fs.existsSync(path.join(memoryRepoDir, '.git'));
    repos.push({
      folderName: memoryRepoName,
      fullPath: memoryRepoDir,
      isGitRepo: isGit,
      isMemoryRepo: true,
      hasRemote: isGit && hasConfiguredRemoteSync(memoryRepoDir)
    });
    seen.add(memoryRepoName);
  }

  if (!fs.existsSync(baseDir)) {
    return repos;
  }

  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'users' && !seen.has(entry.name)) {
        const fullPath = path.join(baseDir, entry.name);
        const isGit = fs.existsSync(path.join(fullPath, '.git'));
        repos.push({
          folderName: entry.name,
          fullPath: fullPath,
          isGitRepo: isGit,
          isMemoryRepo: entry.name === memoryRepoName,
          hasRemote: isGit && hasConfiguredRemoteSync(fullPath)
        });
        seen.add(entry.name);
      }
    }
    return repos;
  } catch (err) {
    logger.log('error', `Error scanning local repos in ${baseDir}: ${err.message}`);
    return repos;
  }
}

/**
 * Formats an HTTP Authorization header using Basic Authentication for Git Smart HTTP protocol.
 * Git Smart HTTP servers (including GitHub) require HTTP Basic Auth with username/token,
 * rather than OAuth Bearer tokens.
 */
function formatGitAuthHeader(authContext) {
  if (!authContext || !authContext.token) return null;
  const token = String(authContext.token).trim();
  if (!token) return null;
  const user = (authContext.username && String(authContext.username).trim()) || 'x-access-token';
  const basicAuth = Buffer.from(`${user}:${token}`).toString('base64');
  return `Authorization: Basic ${basicAuth}`;
}

/**
 * Executes Git directly via execFile with an argument array.
 * Never executes through a shell and never writes secrets to repository .git/config.
 */
async function runGitCommand(repoDir, args, options = {}) {
  const { logError = true, raw = false } = options;
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'echo'
  };
  const rawArgs = Array.isArray(args) ? args : args.split(' ').filter(Boolean);
  // Ensure safe.directory is honored for Docker container mounts where host UID != container UID
  const gitArgs = ['-c', 'safe.directory=*', ...rawArgs];

  try {
    const { stdout, stderr } = await execFileAsync('git', gitArgs, { cwd: repoDir, env });
    return {
      success: true,
      stdout: raw ? (stdout || '') : (stdout || '').trim(),
      stderr: raw ? (stderr || '') : (stderr || '').trim()
    };
  } catch (error) {
    const sanitize = (value) => String(value || '').replace(/(Authorization:\s*(?:Bearer|Basic)\s+)\S+/gi, '$1***');
    if (logError) {
      logger.log('warn', `Git command error: ${sanitize(error.message)}`);
    }
    return {
      success: false,
      error: sanitize(error.message),
      stderr: raw ? sanitize(error.stderr) : sanitize(error.stderr).trim(),
      stdout: raw ? sanitize(error.stdout) : sanitize(error.stdout).trim()
    };
  }
}

/**
 * Clones a repository into the active user's workspace.
 * Uses shallow clone (--depth 1) by default to prevent filesystem exhaustion.
 */
async function cloneRepoToFolder(remoteUrl, folderName, branch = null, userContext = null, authContext = {}) {
  const baseDir = getBaseReposDir(userContext);
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const safeFolder = folderName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const targetDir = path.join(baseDir, safeFolder);

  if (fs.existsSync(targetDir) && fs.existsSync(path.join(targetDir, '.git'))) {
    await pullRepo(safeFolder, branch, authContext, userContext, 'origin');
    return { success: true, folderName: safeFolder, message: 'Repository already exists; pulled latest from remote.' };
  }

  if (branch && !/^[0-9A-Za-z._\/-]+$/.test(branch)) {
    throw new Error('Invalid branch name: contains unsafe characters');
  }

  const safeRemoteUrl = String(remoteUrl).trim();
  const gitArgs = [];

  // Inject token dynamically for HTTPS if provided
  const authHeader = formatGitAuthHeader(authContext);
  if (authHeader && safeRemoteUrl.startsWith('https://')) {
    gitArgs.push('-c', `http.extraHeader=${authHeader}`);
  }

  gitArgs.push('clone', '--depth', '1');
  if (branch) {
    gitArgs.push('-b', branch);
  }
  gitArgs.push(safeRemoteUrl, safeFolder);

  const res = await runGitCommand(baseDir, gitArgs, { authContext });
  let cloneMsg = res.success ? 'Repository cloned successfully' : res.error;
  if (!res.success) {
    if (cloneMsg && /could not read Username|Authentication failed|terminal prompts disabled/i.test(cloneMsg)) {
      cloneMsg = `Git authentication failed for remote repository. Please configure your Personal Access Token (PAT) via the Git Session Credentials dialog. (${cloneMsg})`;
    } else if (cloneMsg && /Permission to .* denied|returned error: 403/i.test(cloneMsg)) {
      cloneMsg = `Permission denied (HTTP 403) accessing remote repository. Please ensure your Personal Access Token (PAT) has access to this repository. (${cloneMsg})`;
    }
  }
  return {
    success: res.success,
    folderName: safeFolder,
    message: cloneMsg
  };
}

/**
 * Pulls latest remote changes into the checked-out branch using active session credentials.
 * When options.rebase is true, executes `git pull --rebase` and automatically runs
 * `git rebase --abort` on conflict so the repository is never left in a half-rebased state.
 */
async function pullRepo(identifier, branch = null, authContext = {}, userContext = null, remote = 'origin', options = {}) {
  const { rebase = false } = options || {};
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(repoDir)) {
    throw new Error('Repository directory does not exist');
  }

  const targetRemote = String(remote || 'origin').trim();
  if (!targetRemote || !/^[a-zA-Z0-9._-]+$/.test(targetRemote) || targetRemote.startsWith('-')) {
    throw new Error('Invalid remote name');
  }

  const lockPath = getRepoLockPath(repoDir, 'tx');
  return withFileLock(lockPath, async () => {
    const currentBranch = branch || await getCurrentBranch(repoDir);
    if (!/^[0-9A-Za-z._\/-]+$/.test(currentBranch)) {
      throw new Error('Invalid branch name: contains unsafe characters');
    }

    const gitArgs = [];
    const authHeader = formatGitAuthHeader(authContext);
    if (authHeader) {
      gitArgs.push('-c', `http.extraHeader=${authHeader}`);
    }

    // Check if remote exists
    const remoteCheck = await runGitCommand(repoDir, ['remote']);
    const remotes = remoteCheck.success ? remoteCheck.stdout.split(/\s+/).filter(Boolean) : [];
    if (!remoteCheck.success || !remotes.includes(targetRemote)) {
      throw new Error(`Remote '${targetRemote}' does not exist for this repository`);
    }

    gitArgs.push('pull');
    if (rebase) {
      gitArgs.push('--rebase');
    }
    gitArgs.push(targetRemote, currentBranch);
    const res = await runGitCommand(repoDir, gitArgs, { authContext });

    if (!res.success) {
      let abortedRebase = false;
      if (rebase) {
        const rebaseMergeDir = path.join(repoDir, '.git', 'rebase-merge');
        const rebaseApplyDir = path.join(repoDir, '.git', 'rebase-apply');
        if (fs.existsSync(rebaseMergeDir) || fs.existsSync(rebaseApplyDir)) {
          await runGitCommand(repoDir, ['rebase', '--abort'], { logError: false });
          abortedRebase = true;
        }
      }

      if (res.stderr && res.stderr.includes("couldn't find remote ref")) {
        throw new Error(`Branch '${currentBranch}' does not exist on remote '${targetRemote}'. Use Push to Remote to publish it first.`);
      }
      let pullErr = res.stderr || res.error || 'Failed to pull changes from remote';
      if (abortedRebase) {
        pullErr = `Pull (Rebase) encountered conflicts and was automatically aborted so the repository remains clean. (${pullErr})`;
      } else if (/could not read Username|Authentication failed|terminal prompts disabled/i.test(pullErr)) {
        pullErr = `Git authentication failed for remote '${targetRemote}'. Please configure your Personal Access Token (PAT) via the Git Session Credentials dialog. (${pullErr})`;
      } else if (/Permission to .* denied|returned error: 403/i.test(pullErr)) {
        pullErr = `Permission denied (HTTP 403) accessing remote '${targetRemote}'. Please ensure your Personal Access Token (PAT) has access to this repository. (${pullErr})`;
      }
      throw new Error(pullErr);
    }

    return {
      success: true,
      rebase: Boolean(rebase),
      stdout: res.stdout,
      branch: currentBranch,
      summary: res.stdout || 'Already up to date'
    };
  });
}

/**
 * Ensures the shared Visulate memory repository exists as a local git repository
 * (no upstream remote required). Bootstraps starter .gitignore, README.md, and
 * associations.json with a single initial commit if HEAD does not yet exist.
 * Subsequent writes are never auto-committed so the user retains full commit control.
 */
async function ensureMemoryRepoInitialized(userContext = null) {
  const repoDir = getMemoryRepoDir(userContext);
  if (!fs.existsSync(repoDir)) {
    fs.mkdirSync(repoDir, { recursive: true });
  }

  const gitDir = path.join(repoDir, '.git');
  let freshlyInitialized = false;
  if (!fs.existsSync(gitDir)) {
    logger.log('info', `Initializing Visulate memory repository at ${repoDir}`);
    const initMain = await runGitCommand(repoDir, ['init', '-b', 'main'], { logError: false });
    if (!initMain.success) {
      await runGitCommand(repoDir, ['init']);
    }
    freshlyInitialized = true;
  }

  const gitignorePath = path.join(repoDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(
      gitignorePath,
      '# Temporary Ora2Pg runtime configs and large archives\n**/ora2pg.conf\n**/*.tar.gz\n**/data/*.sql\n**/copy/*.sql\n.DS_Store\n',
      'utf8'
    );
  }

  const associationsPath = path.join(repoDir, 'associations.json');
  if (!fs.existsSync(associationsPath)) {
    fs.writeFileSync(associationsPath, JSON.stringify({ version: 1, links: [] }, null, 2) + '\n', 'utf8');
  }

  const readmePath = path.join(repoDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(
      readmePath,
      '# Visulate Architectural Knowledge Base\n\nThis repository stores database architectural memories, dependency code maps, generated artifacts, and database-to-repository associations managed by Visulate.\n\nNo upstream remote is required. You may configure an upstream remote at any time from the Application Workbench.\n',
      'utf8'
    );
  }

  // Create initial bootstrap commit only when the repo has no commits yet
  if (freshlyInitialized) {
    const headCheck = await runGitCommand(repoDir, ['rev-parse', '--verify', 'HEAD'], { logError: false });
    if (!headCheck.success) {
      await runGitCommand(repoDir, ['add', '.gitignore', 'README.md', 'associations.json']);
      await runGitCommand(repoDir, [
        '-c', 'user.name=Visulate',
        '-c', 'user.email=visulate@localhost',
        'commit', '-m', 'Initial Visulate memory repository'
      ], { logError: false });
    }
  }

  return repoDir;
}

/**
 * Ensures repo exists or initializes empty repo if needed.
 */
async function ensureRepoInitialized(identifier, userContext = null) {
  if (identifier === getDefaultMemoryRepoName()) {
    return ensureMemoryRepoInitialized(userContext);
  }
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!fs.existsSync(repoDir)) {
    fs.mkdirSync(repoDir, { recursive: true });
  }

  const gitDir = path.join(repoDir, '.git');
  if (!fs.existsSync(gitDir)) {
    logger.log('info', `Initializing git repository at ${repoDir}`);
    const initMain = await runGitCommand(repoDir, ['init', '-b', 'main'], { logError: false });
    if (!initMain.success) {
      await runGitCommand(repoDir, ['init']);
    }
  }
  return repoDir;
}

async function getFileContent(identifier, filePath, revision = null, userContext = null) {
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(repoDir)) return '';
  const fullPath = resolveSafePath(repoDir, filePath, false);

  if (revision) {
    if (!/^[0-9A-Za-z._\/-]+$/.test(revision)) {
      throw new Error('Invalid revision: contains unsafe characters');
    }
    const res = await runGitCommand(repoDir, ['show', `${revision}:${filePath}`]);
    if (res.success) {
      return res.stdout;
    }
    logger.log('warn', `Failed to get ${filePath} at revision ${revision}, falling back to disk`);
  }

  if (fs.existsSync(fullPath)) {
    const canonical = fs.realpathSync(fullPath);
    const canonicalRoot = fs.realpathSync(repoDir);
    if (canonical.startsWith(canonicalRoot + path.sep)) {
      return fs.readFileSync(canonical, 'utf8');
    }
  }
  return '';
}

async function saveFileContent(identifier, filePath, content, userContext = null) {
  const repoDir = await ensureRepoInitialized(identifier, userContext);
  const fullPath = resolveSafePath(repoDir, filePath, false);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, content, 'utf8');
  logger.log('info', `Saved file ${filePath} in repository ${identifier}`);
  return { success: true, filePath, fullPath };
}

async function deleteFile(identifier, filePath, userContext = null) {
  const repoDir = await ensureRepoInitialized(identifier, userContext);
  const fullPath = resolveSafePath(repoDir, filePath, true);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = fs.lstatSync(fullPath);
  if (stat.isDirectory()) {
    throw new Error(`Cannot delete directory: ${filePath}. Only file deletions are permitted.`);
  }

  fs.unlinkSync(fullPath);
  logger.log('info', `Deleted ${filePath} in repository ${identifier}`);
  return { success: true, filePath, message: `Deleted ${filePath}` };
}

/**
 * Renames or moves a regular file within a repository working tree.
 * Uses `git mv` for tracked files (preserving Git rename history) and `fs.renameSync` for untracked files.
 * Rejects symlink escapes, `.git` paths, directories, and overwriting existing targets.
 */
async function renameFile(identifier, oldPath, newPath, userContext = null) {
  const repoDir = await ensureRepoInitialized(identifier, userContext);
  const normOld = String(oldPath || '').trim().replace(/^[\\\/]+/, '').replace(/\\/g, '/');
  const normNew = String(newPath || '').trim().replace(/^[\\\/]+/, '').replace(/\\/g, '/');

  if (!normOld || !normNew) {
    throw new Error('oldPath and newPath are required');
  }
  if (normOld === normNew) {
    throw new Error('New file path must be different from the current path');
  }
  if (normOld.split('/').includes('.git') || normNew.split('/').includes('.git')) {
    throw new Error('Invalid file path: repository metadata cannot be renamed');
  }

  const realRepoDir = fs.realpathSync(repoDir);
  const unresolvedOld = path.resolve(realRepoDir, normOld);
  if (!unresolvedOld.startsWith(realRepoDir + path.sep)) {
    throw new Error(`Path escapes repository boundary: ${normOld}`);
  }
  assertNoSymlinkComponents(realRepoDir, unresolvedOld);

  const srcFull = resolveSafePath(repoDir, normOld, true);
  if (path.relative(realRepoDir, srcFull).split(path.sep).includes('.git')) {
    throw new Error('Invalid source path: repository metadata cannot be renamed');
  }
  const srcStat = fs.lstatSync(srcFull);
  if (srcStat.isDirectory() || srcStat.isSymbolicLink()) {
    throw new Error('Only regular files can be renamed');
  }

  const dstFull = resolveSafePath(repoDir, normNew, false);
  assertNoSymlinkComponents(realRepoDir, dstFull);
  if (path.relative(realRepoDir, dstFull).split(path.sep).includes('.git')) {
    throw new Error('Invalid target path: repository metadata cannot be modified');
  }

  const lockPath = getRepoLockPath(repoDir, 'tx');
  return withFileLock(lockPath, async () => {
    let dstExists = false;
    try {
      fs.lstatSync(dstFull);
      dstExists = true;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (dstExists) {
      const err = new Error(`Target file already exists: ${normNew}`);
      err.code = 'EEXIST';
      throw err;
    }

    fs.mkdirSync(path.dirname(dstFull), { recursive: true });

    const isGit = fs.existsSync(path.join(repoDir, '.git'));
    const trackedCheck = isGit
      ? await runGitCommand(repoDir, ['ls-files', '--error-unmatch', '--', normOld], { logError: false })
      : { success: false };

    if (trackedCheck.success) {
      const mvRes = await runGitCommand(repoDir, ['mv', '--', normOld, normNew]);
      if (!mvRes.success) {
        throw new Error(mvRes.stderr || mvRes.error || `Failed to rename ${normOld} to ${normNew}`);
      }
    } else {
      fs.renameSync(srcFull, dstFull);
    }

    logger.log('info', `Renamed ${normOld} to ${normNew} in repository ${identifier}`);
    return {
      success: true,
      oldPath: normOld,
      newPath: normNew,
      message: `Renamed ${normOld} to ${normNew}`
    };
  });
}


async function createAndCheckoutBranch(identifier, branchName, userContext = null) {
  const repoDir = await ensureRepoInitialized(identifier, userContext);
  const checkRes = await runGitCommand(repoDir, ['rev-parse', '--verify', branchName], { logError: false });
  if (checkRes.success) {
    return await runGitCommand(repoDir, ['checkout', branchName]);
  } else {
    return await runGitCommand(repoDir, ['checkout', '-b', branchName]);
  }
}

/**
 * Commits all working tree changes with the user's session author identity and pushes using session auth.
 */
async function commitAndPush(identifier, branchName, commitMessage = 'Visulate Workbench commit', userContext = null, authContext = {}) {
  const repoDir = await ensureRepoInitialized(identifier, userContext);
  
  if (branchName) {
    const branchRes = await createAndCheckoutBranch(identifier, branchName, userContext);
    if (!branchRes.success) {
      throw new Error(branchRes.stderr || branchRes.error || `Failed to switch to branch ${branchName}`);
    }
  }

  const authorName = (authContext && authContext.authorName) || 'Visulate Workbench';
  const authorEmail = (authContext && authContext.authorEmail) || 'workbench@visulate.com';

  await runGitCommand(repoDir, ['add', '-A']);
  const commitArgs = [
    '-c', `user.name=${authorName}`,
    '-c', `user.email=${authorEmail}`,
    'commit',
    '-m', commitMessage
  ];
  let commitRes = await runGitCommand(repoDir, commitArgs);

  if (!commitRes.success) {
    const combinedOutput = `${commitRes.stdout || ''} ${commitRes.stderr || ''} ${commitRes.error || ''}`;
    if (/nothing to commit|working tree clean/i.test(combinedOutput)) {
      commitRes = { success: true, stdout: 'Nothing to commit, working tree clean' };
    } else {
      throw new Error(commitRes.stderr || commitRes.error || 'Failed to commit changes');
    }
  }

  // Try pushing if remote origin exists
  const remoteCheck = await runGitCommand(repoDir, ['remote']);
  let pushRes = { success: true, stdout: 'No remote origin configured' };
  const remotes = remoteCheck.success ? remoteCheck.stdout.split(/\s+/).filter(Boolean) : [];

  if (remoteCheck.success && remotes.includes('origin')) {
    const currentBranch = branchName || await getCurrentBranch(repoDir);
    const pushArgs = [];
    const authHeader = formatGitAuthHeader(authContext);
    if (authHeader) {
      pushArgs.push('-c', `http.extraHeader=${authHeader}`);
    }
    pushArgs.push('push', 'origin', currentBranch);
    pushRes = await runGitCommand(repoDir, pushArgs, { authContext });

    if (!pushRes.success) {
      let pushErr = pushRes.stderr || pushRes.error || 'Failed to push changes to remote';
      if (/could not read Username|Authentication failed|terminal prompts disabled/i.test(pushErr)) {
        pushErr = `Git authentication failed for remote 'origin'. Please configure your Personal Access Token (PAT) via the Git Session Credentials dialog. (${pushErr})`;
      } else if (/Permission to .* denied|returned error: 403/i.test(pushErr)) {
        pushErr = `Permission denied (HTTP 403) pushing to remote repository. Please ensure your Personal Access Token (PAT) has 'Contents: Read and write' permissions (or 'repo' scope for classic tokens) and access to repository '${identifier}'. (${pushErr})`;
      }
      throw new Error(pushErr);
    }
  }

  return {
    success: true,
    commit: commitRes,
    push: pushRes
  };
}

async function getCurrentBranch(repoDir) {
  try {
    const res = await runGitCommand(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD'], { logError: false });
    if (res.success && res.stdout && res.stdout !== 'HEAD') {
      return res.stdout;
    }
    const headFile = path.join(repoDir, '.git', 'HEAD');
    if (fs.existsSync(headFile)) {
      const headContent = fs.readFileSync(headFile, 'utf8').trim();
      const match = headContent.match(/ref:\s*refs\/heads\/(.+)/);
      if (match) return match[1];
    }
  } catch (e) {
    // ignore
  }
  return 'main';
}

async function getRepoBranches(identifier, userContext = null) {
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`Repository folder '${identifier}' does not exist or is not a git repository.`);
  }
  const currentBranch = await getCurrentBranch(repoDir);

  // List only actual local branches that exist in the repository
  const res = await runGitCommand(repoDir, ['branch', '--no-color'], { logError: false });
  const branches = new Set();
  if (currentBranch) {
    branches.add(currentBranch);
  }

  if (res.success && res.stdout) {
    const lines = res.stdout.split('\n');
    for (const line of lines) {
      const b = line.trim().replace(/^[\*\s]+/, '');
      if (b && !b.includes('->') && b !== 'HEAD') {
        branches.add(b);
      }
    }
  }

  return {
    currentBranch,
    branches: Array.from(branches).sort()
  };
}

async function switchBranch(identifier, branchName, createIfMissing = false, userContext = null) {
  if (!branchName || !/^[0-9A-Za-z._\/-]+$/.test(branchName)) {
    throw new Error('Invalid branch name: contains unsafe characters');
  }
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`Repository folder '${identifier}' does not exist or is not a git repository.`);
  }

  if (createIfMissing) {
    const result = await createAndCheckoutBranch(identifier, branchName, userContext);
    if (!result.success) {
      throw new Error(result.stderr || result.error || `Failed to create branch ${branchName}`);
    }
    return { success: true, branch: branchName };
  }

  const res = await runGitCommand(repoDir, ['checkout', branchName]);
  if (!res.success) {
    throw new Error(res.stderr || res.error || `Failed to checkout branch ${branchName}`);
  }

  return { success: true, branch: branchName };
}

async function getDiff(identifier, filePath = '', userContext = null) {
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(path.join(repoDir, '.git'))) {
    return '';
  }
  const diffArgs = filePath ? ['diff', 'HEAD', '--', filePath] : ['diff', 'HEAD'];
  const res = await runGitCommand(repoDir, diffArgs);
  if (res.success) {
    return res.stdout;
  }
  const fallbackArgs = filePath ? ['diff', '--', filePath] : ['diff'];
  const fallback = await runGitCommand(repoDir, fallbackArgs);
  return fallback.stdout || '';
}

async function listProjectFiles(identifier, subDir = '', userContext = null) {
  if (!identifier) return [];
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(repoDir)) return [];

  const targetDir = resolveSafePath(repoDir, subDir, true);

  function scan(dir, baseRel = '') {
    let results = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.pytest_cache', '.angular', 'dist', 'build', '.DS_Store'].includes(entry.name)) {
          continue;
        }
        const full = path.join(dir, entry.name);
        const rel = baseRel ? `${baseRel}/${entry.name}` : entry.name;
        try {
          const stat = fs.lstatSync(full);
          // Never recurse through symlinks to prevent directory escape
          if (stat.isSymbolicLink()) {
            continue;
          }
          if (stat.isDirectory()) {
            results = results.concat(scan(full, rel));
          } else if (stat.isFile()) {
            results.push(rel);
          }
        } catch (e) {
          // Ignore unstatable
        }
      }
    } catch (e) {
      logger.log('warn', `Could not scan directory ${dir}: ${e.message}`);
    }
    return results;
  }

  return scan(targetDir, subDir);
}

/**
 * Reads many-to-many database <-> repository associations from visulate-memory/associations.json.
 */
async function getAssociations(userContext = null) {
  const memoryDir = await ensureMemoryRepoInitialized(userContext);
  const assocPath = path.join(memoryDir, 'associations.json');
  if (!fs.existsSync(assocPath)) {
    return { version: 1, links: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(assocPath, 'utf8'));
    const links = Array.isArray(parsed.links) ? parsed.links : [];
    return { version: parsed.version || 1, links };
  } catch (err) {
    logger.log('warn', `Failed to parse associations.json: ${err.message}`);
    return { version: 1, links: [] };
  }
}

/**
 * Adds or updates a database <-> repository association in visulate-memory/associations.json.
 * Leaves the change uncommitted so the user retains commit control.
 */
async function saveAssociation(db, repo, role = 'app', userContext = null) {
  const cleanDb = String(db || '').trim();
  const cleanRepo = String(repo || '').trim();
  const cleanRole = String(role || 'app').trim().toLowerCase();

  if (!cleanDb || (cleanDb !== '*' && !/^[a-zA-Z0-9._-]+$/.test(cleanDb)) || cleanDb === '.' || cleanDb === '..') {
    throw new Error('Invalid database identifier');
  }
  if (!cleanRepo || !/^[a-zA-Z0-9._-]+$/.test(cleanRepo) || cleanRepo === '.' || cleanRepo === '..') {
    throw new Error('Invalid repository identifier');
  }
  if (cleanRepo === getDefaultMemoryRepoName()) {
    throw new Error('Cannot associate the memory repository with itself');
  }
  if (!VALID_ASSOCIATION_ROLES.includes(cleanRole)) {
    throw new Error(`Invalid association role '${cleanRole}'. Must be one of: ${VALID_ASSOCIATION_ROLES.join(', ')}`);
  }

  const memoryDir = await ensureMemoryRepoInitialized(userContext);
  const lockPath = getRepoLockPath(memoryDir, 'associations');
  return withFileLock(lockPath, async () => {
    const data = await getAssociations(userContext);
    const existingIdx = data.links.findIndex(
      l => l.db.toLowerCase() === cleanDb.toLowerCase() && l.repo === cleanRepo
    );
    const linkObj = { db: cleanDb, repo: cleanRepo, role: cleanRole };
    if (existingIdx >= 0) {
      data.links[existingIdx] = linkObj;
    } else {
      data.links.push(linkObj);
    }

    const assocPath = path.join(memoryDir, 'associations.json');
    const tmpPath = path.join(memoryDir, `.associations.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmpPath, JSON.stringify({ version: 1, links: data.links }, null, 2) + '\n', 'utf8');
    fs.renameSync(tmpPath, assocPath);
    return { version: 1, links: data.links };
  });
}

/**
 * Removes a database <-> repository association from visulate-memory/associations.json.
 */
async function deleteAssociation(db, repo, userContext = null) {
  const cleanDb = String(db || '').trim();
  const cleanRepo = String(repo || '').trim();
  if (!cleanDb || !cleanRepo) {
    throw new Error('db and repo are required');
  }

  const memoryDir = await ensureMemoryRepoInitialized(userContext);
  const lockPath = getRepoLockPath(memoryDir, 'associations');
  return withFileLock(lockPath, async () => {
    const data = await getAssociations(userContext);
    const filtered = data.links.filter(
      l => !(l.db.toLowerCase() === cleanDb.toLowerCase() && l.repo === cleanRepo)
    );

    const assocPath = path.join(memoryDir, 'associations.json');
    const tmpPath = path.join(memoryDir, `.associations.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmpPath, JSON.stringify({ version: 1, links: filtered }, null, 2) + '\n', 'utf8');
    fs.renameSync(tmpPath, assocPath);
    return { version: 1, links: filtered };
  });
}

/**
 * Parses configured remotes for a repository.
 */
async function getRemotes(identifier, userContext = null) {
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`Repository folder '${identifier}' does not exist or is not a git repository.`);
  }
  const res = await runGitCommand(repoDir, ['remote', '-v'], { logError: false });
  if (!res.success || !res.stdout) {
    return [];
  }
  const map = new Map();
  for (const line of res.stdout.split('\n')) {
    const match = line.trim().match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (match && !map.has(match[1])) {
      map.set(match[1], { name: match[1], url: match[2] });
    }
  }
  return Array.from(map.values());
}

/**
 * Adds or updates a git remote URL on a repository.
 */
async function setRemote(identifier, name = 'origin', url, userContext = null) {
  const remoteName = String(name || 'origin').trim();
  const remoteUrl = String(url || '').trim();

  if (!remoteName || !/^[a-zA-Z0-9._-]+$/.test(remoteName) || remoteName.startsWith('-')) {
    throw new Error('Invalid remote name');
  }
  if (!remoteUrl || /\s/.test(remoteUrl) || remoteUrl.startsWith('-') ||
      !/^(https?:\/\/|ssh:\/\/|git@)/i.test(remoteUrl)) {
    throw new Error('Invalid remote URL. Must be an HTTPS or SSH Git URL.');
  }

  const repoDir = await ensureRepoInitialized(identifier, userContext);
  const existing = await getRemotes(identifier, userContext);
  const exists = existing.some(r => r.name === remoteName);

  const args = exists
    ? ['remote', 'set-url', remoteName, remoteUrl]
    : ['remote', 'add', remoteName, remoteUrl];

  const res = await runGitCommand(repoDir, args);
  if (!res.success) {
    throw new Error(res.stderr || res.error || `Failed to configure remote '${remoteName}'`);
  }

  return {
    success: true,
    remote: { name: remoteName, url: remoteUrl },
    remotes: await getRemotes(identifier, userContext)
  };
}

/**
 * Parses NUL-delimited `git status --porcelain=v1 -b -uall -z` output.
 * Preserves verbatim filenames (no C-escaping, no ambiguous ' -> ' splitting)
 * and captures rename/copy source paths (`origPath`).
 */
function parsePorcelainStatusZ(rawStdout, branchFallback = 'HEAD') {
  let branch = branchFallback;
  let upstream = null;
  let ahead = 0;
  let behind = 0;
  const files = [];

  if (!rawStdout) {
    return { branch, upstream, ahead, behind, files };
  }

  const tokens = rawStdout.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token.startsWith('## ')) {
      const header = token.slice(3).trim();
      if (header.startsWith('No commits yet on ')) {
        branch = header.slice('No commits yet on '.length).trim();
      } else if (header.startsWith('Initial commit on ')) {
        branch = header.slice('Initial commit on '.length).trim();
      } else if (!header.startsWith('HEAD (no branch)')) {
        const trackMatch = header.match(/^([^\s]+?)(?:\.\.\.([^\s\[]+))?(?:\s+\[(.+)\])?$/);
        if (trackMatch) {
          branch = trackMatch[1] || branch;
          upstream = trackMatch[2] || null;
          if (trackMatch[3]) {
            const aheadMatch = trackMatch[3].match(/ahead (\d+)/);
            const behindMatch = trackMatch[3].match(/behind (\d+)/);
            if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
            if (behindMatch) behind = parseInt(behindMatch[1], 10);
          }
        }
      }
      continue;
    }

    if (token.length >= 4 && token[2] === ' ') {
      const indexStatus = token[0];
      const workTreeStatus = token[1];
      const filePath = token.slice(3);
      let origPath = null;

      // In `-z` porcelain v1 format, rename (R) and copy (C) entries are followed by
      // an extra NUL-terminated token containing the original source path.
      if (indexStatus === 'R' || indexStatus === 'C' || workTreeStatus === 'R' || workTreeStatus === 'C') {
        if (i + 1 < tokens.length) {
          origPath = tokens[++i] || null;
        }
      }

      let status = 'M';
      if (indexStatus === '?' && workTreeStatus === '?') {
        status = '?';
      } else if (indexStatus === 'A' || workTreeStatus === 'A') {
        status = 'A';
      } else if (indexStatus === 'D' || workTreeStatus === 'D') {
        status = 'D';
      } else if (indexStatus === 'R' || workTreeStatus === 'R') {
        status = 'R';
      } else if (indexStatus === 'C' || workTreeStatus === 'C') {
        status = 'C';
      }

      const entry = {
        path: filePath,
        indexStatus,
        workTreeStatus,
        status
      };
      if (origPath) {
        entry.origPath = origPath;
      }
      files.push(entry);
    }
  }

  return { branch, upstream, ahead, behind, files };
}

/**
 * Returns full working-tree and upstream status for a repository.
 */
async function getRepoStatus(identifier, userContext = null) {
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`Repository folder '${identifier}' does not exist or is not a git repository.`);
  }

  const [statusRes, remotes, branchFallback] = await Promise.all([
    runGitCommand(repoDir, ['status', '--porcelain=v1', '-b', '-uall', '-z'], { logError: false, raw: true }),
    getRemotes(identifier, userContext),
    getCurrentBranch(repoDir)
  ]);

  let { branch, upstream, ahead, behind, files } = statusRes.success
    ? parsePorcelainStatusZ(statusRes.stdout, branchFallback)
    : { branch: branchFallback, upstream: null, ahead: 0, behind: 0, files: [] };

  // If remotes exist but no upstream tracking branch is set yet, count local commits so UI knows branch can be pushed
  if (!upstream && remotes.length > 0) {
    const countRes = await runGitCommand(repoDir, ['rev-list', '--count', 'HEAD'], { logError: false });
    if (countRes.success && countRes.stdout) {
      ahead = parseInt(countRes.stdout.trim(), 10) || 0;
    }
  }

  return {
    projectId: identifier,
    branch,
    upstream,
    remotes,
    hasRemote: remotes.length > 0,
    isMemoryRepo: identifier === getDefaultMemoryRepoName(),
    ahead,
    behind,
    files
  };
}

/**
 * Commits selected (or all) working tree changes LOCALLY without pushing.
 * Serialized with a cross-process repository lock spanning branch selection through commit.
 */
async function commitChanges(identifier, options = {}, userContext = null, authContext = {}) {
  const {
    commitMessage = '',
    files = null,
    stageAll = false,
    branchName = null
  } = options || {};

  const trimmedMessage = String(commitMessage || '').trim();
  if (!trimmedMessage) {
    throw new Error('Commit message is required');
  }

  const repoDir = await ensureRepoInitialized(identifier, userContext);
  const lockPath = getRepoLockPath(repoDir, 'tx');

  return withFileLock(lockPath, async () => {
    if (branchName) {
      const current = await getCurrentBranch(repoDir);
      if (branchName !== current) {
        const branchRes = await createAndCheckoutBranch(identifier, branchName, userContext);
        if (!branchRes.success) {
          throw new Error(branchRes.stderr || branchRes.error || `Failed to switch to branch ${branchName}`);
        }
      }
    }

    if (Array.isArray(files) && files.length > 0) {
      // Validate every file path stays inside the repo and outside .git
      const safeRelPaths = [];
      for (const f of files) {
        const normalized = String(f || '').replace(/^[\\\/]+/, '');
        if (!normalized || normalized.split(/[\\\/]/).includes('.git')) {
          throw new Error(`Invalid file path for commit: ${f}`);
        }
        resolveSafePath(repoDir, normalized, false);
        safeRelPaths.push(normalized);
      }

      // Inspect staged renames BEFORE resetting HEAD so selecting a renamed destination
      // also stages the removal of its original source path.
      const preResetStatus = await runGitCommand(repoDir, ['status', '--porcelain=v1', '-uall', '-z'], { logError: false, raw: true });
      const renameDestToOrig = new Map();
      if (preResetStatus.success && preResetStatus.stdout) {
        const parsed = parsePorcelainStatusZ(preResetStatus.stdout);
        for (const entry of parsed.files) {
          if ((entry.indexStatus === 'R' || entry.workTreeStatus === 'R') && entry.origPath) {
            renameDestToOrig.set(entry.path, entry.origPath);
          }
        }
      }

      const pathsToStageSet = new Set(safeRelPaths);
      for (const p of safeRelPaths) {
        const orig = renameDestToOrig.get(p);
        if (orig && !orig.split(/[\\\/]/).includes('.git')) {
          resolveSafePath(repoDir, orig, false);
          pathsToStageSet.add(orig);
        }
      }
      const pathsToStage = Array.from(pathsToStageSet);

      // Clear previously staged index entries so only selected files are committed
      const headCheck = await runGitCommand(repoDir, ['rev-parse', '--verify', 'HEAD'], { logError: false });
      if (headCheck.success) {
        await runGitCommand(repoDir, ['reset', '--quiet', 'HEAD'], { logError: false });
      } else {
        await runGitCommand(repoDir, ['rm', '--cached', '-r', '--quiet', '.'], { logError: false });
      }

      const addRes = await runGitCommand(repoDir, ['add', '-A', '--', ...pathsToStage]);
      if (!addRes.success) {
        throw new Error(addRes.stderr || addRes.error || 'Failed to stage selected files');
      }
    } else if (stageAll) {
      const addRes = await runGitCommand(repoDir, ['add', '-A']);
      if (!addRes.success) {
        throw new Error(addRes.stderr || addRes.error || 'Failed to stage files');
      }
    } else {
      throw new Error('No files selected for commit');
    }

    const authorName = (authContext && authContext.authorName) || 'Visulate Workbench';
    const authorEmail = (authContext && authContext.authorEmail) || 'workbench@visulate.com';

    const commitArgs = [
      '-c', `user.name=${authorName}`,
      '-c', `user.email=${authorEmail}`,
      'commit',
      '-m', trimmedMessage
    ];
    let commitRes = await runGitCommand(repoDir, commitArgs);

    if (!commitRes.success) {
      const combinedOutput = `${commitRes.stdout || ''} ${commitRes.stderr || ''} ${commitRes.error || ''}`;
      if (/nothing to commit|working tree clean/i.test(combinedOutput)) {
        commitRes = { success: true, stdout: 'Nothing to commit, working tree clean' };
      } else {
        throw new Error(commitRes.stderr || commitRes.error || 'Failed to commit changes');
      }
    }

    const hashRes = await runGitCommand(repoDir, ['rev-parse', '--short', 'HEAD'], { logError: false });
    const status = await getRepoStatus(identifier, userContext);

    return {
      success: true,
      commitHash: hashRes.success ? hashRes.stdout : null,
      commit: commitRes,
      status
    };
  });
}

/**
 * Explicitly pushes local commits to a configured remote.
 */
async function pushChanges(identifier, options = {}, userContext = null, authContext = {}) {
  const {
    remote = 'origin',
    branchName = null,
    setUpstream = false
  } = options || {};

  const targetRemote = String(remote || 'origin').trim();
  if (!targetRemote || !/^[a-zA-Z0-9._-]+$/.test(targetRemote) || targetRemote.startsWith('-')) {
    throw new Error('Invalid remote name');
  }

  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`Repository folder '${identifier}' does not exist or is not a git repository.`);
  }

  const remoteCheck = await runGitCommand(repoDir, ['remote']);
  const remotes = remoteCheck.success ? remoteCheck.stdout.split(/\s+/).filter(Boolean) : [];
  if (!remoteCheck.success || !remotes.includes(targetRemote)) {
    throw new Error(`Remote '${targetRemote}' is not configured for repository '${identifier}'. Use 'Set Upstream' to configure a remote first.`);
  }

  const currentBranch = branchName || await getCurrentBranch(repoDir);
  if (!/^[0-9A-Za-z._\/-]+$/.test(currentBranch)) {
    throw new Error('Invalid branch name: contains unsafe characters');
  }

  // Check whether current branch already has an upstream tracking ref
  const upstreamCheck = await runGitCommand(repoDir, ['rev-parse', '--abbrev-ref', `${currentBranch}@{upstream}`], { logError: false });
  const needsSetUpstream = setUpstream || !upstreamCheck.success;

  const pushArgs = [];
  const authHeader = formatGitAuthHeader(authContext);
  if (authHeader) {
    pushArgs.push('-c', `http.extraHeader=${authHeader}`);
  }
  pushArgs.push('push');
  if (needsSetUpstream) {
    pushArgs.push('-u');
  }
  pushArgs.push(targetRemote, currentBranch);

  const pushRes = await runGitCommand(repoDir, pushArgs, { authContext });
  if (!pushRes.success) {
    let pushErr = pushRes.stderr || pushRes.error || 'Failed to push changes to remote';
    if (/could not read Username|Authentication failed|terminal prompts disabled/i.test(pushErr)) {
      pushErr = `Git authentication failed for remote '${targetRemote}'. Please configure your Personal Access Token (PAT) via the Git Session Credentials dialog. (${pushErr})`;
    } else if (/Permission to .* denied|returned error: 403/i.test(pushErr)) {
      pushErr = `Permission denied (HTTP 403) pushing to remote repository. Please ensure your Personal Access Token (PAT) has 'Contents: Read and write' permissions (or 'repo' scope for classic tokens) and access to repository '${identifier}'. (${pushErr})`;
    }
    throw new Error(pushErr);
  }

  const status = await getRepoStatus(identifier, userContext);
  return {
    success: true,
    remote: targetRemote,
    branch: currentBranch,
    stdout: pushRes.stdout || pushRes.stderr || 'Push complete',
    status
  };
}

/**
 * Discards uncommitted working tree and index changes for a single file.
 * - If the file exists in HEAD (modified or deleted, staged or unstaged), restores both index and worktree from HEAD.
 * - If the file does not exist in HEAD (untracked or staged addition), removes it from both index and worktree.
 */
async function discardFileChanges(identifier, filePath, userContext = null) {
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`Repository folder '${identifier}' does not exist or is not a git repository.`);
  }
  const normalizedRel = String(filePath || '').replace(/^[\\\/]+/, '');
  if (!normalizedRel || normalizedRel.split(/[\\\/]/).includes('.git')) {
    throw new Error('Invalid file path');
  }
  const fullPath = resolveSafePath(repoDir, normalizedRel, false);
  const lockPath = getRepoLockPath(repoDir, 'tx');

  return withFileLock(lockPath, async () => {
    const headExists = await runGitCommand(repoDir, ['rev-parse', '--verify', 'HEAD'], { logError: false });
    const inHead = headExists.success
      ? await runGitCommand(repoDir, ['cat-file', '-e', `HEAD:${normalizedRel}`], { logError: false })
      : { success: false };

    if (inHead.success) {
      const res = await runGitCommand(repoDir, ['checkout', 'HEAD', '--', normalizedRel]);
      if (!res.success) {
        throw new Error(res.stderr || res.error || `Failed to discard changes for ${normalizedRel}`);
      }
    } else {
      // File is either untracked or a staged addition not present in HEAD
      const inIndex = await runGitCommand(repoDir, ['ls-files', '--error-unmatch', '--', normalizedRel], { logError: false });
      if (inIndex.success) {
        if (headExists.success) {
          const resetRes = await runGitCommand(repoDir, ['reset', '--quiet', 'HEAD', '--', normalizedRel]);
          if (!resetRes.success) {
            throw new Error(resetRes.stderr || resetRes.error || `Failed to unstage ${normalizedRel}`);
          }
        } else {
          const rmRes = await runGitCommand(repoDir, ['rm', '--cached', '--quiet', '--', normalizedRel]);
          if (!rmRes.success) {
            throw new Error(rmRes.stderr || rmRes.error || `Failed to unstage ${normalizedRel}`);
          }
        }
      }
      if (fs.existsSync(fullPath)) {
        const stat = fs.lstatSync(fullPath);
        if (stat.isDirectory() || stat.isSymbolicLink()) {
          throw new Error('Only regular files can be discarded');
        }
        fs.unlinkSync(fullPath);
      }
    }

    return {
      success: true,
      filePath: normalizedRel,
      status: await getRepoStatus(identifier, userContext)
    };
  });
}

/**
 * Copies a file or directory from one repository (typically visulate-memory)
 * into a target repository working tree without committing.
 */
async function copyBetweenRepos(sourceRepo, sourcePath, targetRepo, targetPath, options = {}, userContext = null) {
  const { overwrite = false } = options || {};
  if (!sourceRepo || !sourcePath || !targetRepo || !targetPath) {
    throw new Error('sourceRepo, sourcePath, targetRepo, and targetPath are required');
  }

  const srcRepoDir = getProjectRepoDir(sourceRepo, userContext);
  const dstRepoDir = getProjectRepoDir(targetRepo, userContext);
  if (!srcRepoDir || !fs.existsSync(srcRepoDir)) {
    throw new Error(`Source repository '${sourceRepo}' does not exist`);
  }
  if (!dstRepoDir || !fs.existsSync(dstRepoDir)) {
    throw new Error(`Target repository '${targetRepo}' does not exist`);
  }

  const normSrc = String(sourcePath).replace(/^[\\\/]+/, '');
  const normDst = String(targetPath).replace(/^[\\\/]+/, '');
  if (!normSrc || normSrc.split(/[\\\/]/).includes('.git')) {
    throw new Error('Invalid source path');
  }
  if (!normDst || normDst.split(/[\\\/]/).includes('.git')) {
    throw new Error('Invalid target path');
  }

  const realSrcRepoDir = fs.realpathSync(srcRepoDir);
  const realDstRepoDir = fs.realpathSync(dstRepoDir);
  const unresolvedSrc = path.resolve(realSrcRepoDir, normSrc);
  if (!unresolvedSrc.startsWith(realSrcRepoDir + path.sep)) {
    throw new Error(`Path escapes repository boundary: ${normSrc}`);
  }
  // Check unresolved source components for symlinks BEFORE realpath dereferencing
  assertNoSymlinkComponents(realSrcRepoDir, unresolvedSrc);

  const srcFull = resolveSafePath(srcRepoDir, normSrc, true);
  if (path.relative(realSrcRepoDir, srcFull).split(path.sep).includes('.git')) {
    throw new Error('Invalid source path: repository metadata cannot be copied');
  }

  const dstFull = resolveSafePath(dstRepoDir, normDst, false);
  assertNoSymlinkComponents(realDstRepoDir, dstFull);
  if (path.relative(realDstRepoDir, dstFull).split(path.sep).includes('.git')) {
    throw new Error('Invalid target path: repository metadata cannot be modified');
  }

  const srcStat = fs.lstatSync(srcFull);
  if (srcStat.isSymbolicLink()) {
    throw new Error('Symbolic links cannot be copied');
  }

  const copiedFiles = [];

  function copySingleFile(srcFile, dstFile) {
    const relDst = path.relative(realDstRepoDir, dstFile);
    if (!relDst || relDst.startsWith('..') || path.isAbsolute(relDst) || relDst.split(path.sep).includes('.git')) {
      throw new Error(`Invalid target path: ${relDst}`);
    }
    resolveSafePath(dstRepoDir, relDst, false);
    assertNoSymlinkComponents(realDstRepoDir, dstFile);

    let exists = false;
    try {
      const dstStat = fs.lstatSync(dstFile);
      if (dstStat.isSymbolicLink()) {
        throw new Error(`Cannot write to symbolic link: ${relDst}`);
      }
      exists = true;
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    if (exists && !overwrite) {
      const err = new Error(`Target file already exists: ${relDst}`);
      err.code = 'EEXIST';
      throw err;
    }
    fs.mkdirSync(path.dirname(dstFile), { recursive: true });
    fs.copyFileSync(srcFile, dstFile);
    copiedFiles.push(relDst.replace(/\\/g, '/'));
  }

  function copyDirRecursive(srcDir, dstDir) {
    assertNoSymlinkComponents(realDstRepoDir, dstDir);
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const sPath = path.join(srcDir, entry.name);
      const dPath = path.join(dstDir, entry.name);
      const st = fs.lstatSync(sPath);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        copyDirRecursive(sPath, dPath);
      } else if (st.isFile()) {
        copySingleFile(sPath, dPath);
      }
    }
  }

  if (srcStat.isDirectory()) {
    copyDirRecursive(srcFull, dstFull);
  } else {
    copySingleFile(srcFull, dstFull);
  }

  logger.log('info', `Copied ${copiedFiles.length} file(s) from ${sourceRepo}/${normSrc} to ${targetRepo}/${normDst}`);
  return {
    success: true,
    sourceRepo,
    sourcePath: normSrc,
    targetRepo,
    targetPath: normDst,
    copiedFiles
  };
}

/**
 * Runs `git fetch --prune` against the remote and finds (or deletes) local branches
 * whose upstream tracking branch is gone (`[gone]`), mirroring:
 *   git fetch -p && git branch -vv | grep ': gone]' | ... | xargs git branch -D
 *
 * Uses `git for-each-ref` for safe, locale-independent parsing and never deletes the
 * currently checked-out branch. When `dryRun: true`, returns the candidate branches
 * without deleting anything so the UI can prompt for confirmation.
 */
async function pruneGoneBranches(identifier, options = {}, userContext = null, authContext = {}) {
  const {
    remote = 'origin',
    dryRun = false,
    branches = null
  } = options || {};

  const targetRemote = String(remote || 'origin').trim();
  if (!targetRemote || !/^[a-zA-Z0-9._-]+$/.test(targetRemote) || targetRemote.startsWith('-')) {
    throw new Error('Invalid remote name');
  }

  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`Repository folder '${identifier}' does not exist or is not a git repository.`);
  }

  const lockPath = getRepoLockPath(repoDir, 'tx');
  return withFileLock(lockPath, async () => {
    const remoteCheck = await runGitCommand(repoDir, ['remote']);
    const remotes = remoteCheck.success ? remoteCheck.stdout.split(/\s+/).filter(Boolean) : [];
    if (!remoteCheck.success || !remotes.includes(targetRemote)) {
      throw new Error(`Remote '${targetRemote}' is not configured for repository '${identifier}'.`);
    }

    // 1. Fetch and prune stale remote-tracking refs
    const fetchArgs = [];
    const authHeader = formatGitAuthHeader(authContext);
    if (authHeader) {
      fetchArgs.push('-c', `http.extraHeader=${authHeader}`);
    }
    fetchArgs.push('fetch', '--prune', targetRemote);
    const fetchRes = await runGitCommand(repoDir, fetchArgs, { authContext });
    if (!fetchRes.success) {
      let fetchErr = fetchRes.stderr || fetchRes.error || `Failed to fetch from remote '${targetRemote}'`;
      if (/could not read Username|Authentication failed|terminal prompts disabled/i.test(fetchErr)) {
        fetchErr = `Git authentication failed for remote '${targetRemote}'. Please configure your Personal Access Token (PAT) via the Git Session Credentials dialog. (${fetchErr})`;
      } else if (/Permission to .* denied|returned error: 403/i.test(fetchErr)) {
        fetchErr = `Permission denied (HTTP 403) accessing remote '${targetRemote}'. (${fetchErr})`;
      }
      throw new Error(fetchErr);
    }

    // 2. Inspect local branches whose upstream tracking ref is [gone]
    const refRes = await runGitCommand(
      repoDir,
      ['for-each-ref', '--format=%(refname:short)%00%(upstream:short)%00%(upstream:track)%00%(HEAD)', 'refs/heads'],
      { logError: false, raw: true }
    );
    if (!refRes.success) {
      throw new Error(refRes.stderr || refRes.error || 'Failed to inspect local branches');
    }

    let currentBranch = await getCurrentBranch(repoDir);
    const goneBranches = [];
    let skippedCurrent = null;

    for (const line of (refRes.stdout || '').split('\n')) {
      if (!line) continue;
      const [name, upstream, track, headMarker] = line.split('\0');
      if (!name) continue;
      const isCurrent = headMarker === '*';
      if (isCurrent) {
        currentBranch = name;
      }
      if (track === '[gone]') {
        if (isCurrent) {
          skippedCurrent = { name, upstream };
        } else {
          goneBranches.push({ name, upstream });
        }
      }
    }

    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        remote: targetRemote,
        currentBranch,
        goneBranches,
        skippedCurrent
      };
    }

    // Intersect user-requested branch list with actually gone non-current branches
    const goneNames = new Set(goneBranches.map(b => b.name));
    const toDelete = Array.isArray(branches) && branches.length > 0
      ? branches.filter(b => typeof b === 'string' && goneNames.has(b))
      : Array.from(goneNames);

    const deleted = [];
    const failed = [];
    for (const branchName of toDelete) {
      if (!/^[0-9A-Za-z._\/-]+$/.test(branchName) || branchName.startsWith('-')) {
        failed.push({ name: branchName, error: 'Invalid branch name' });
        continue;
      }
      const delRes = await runGitCommand(repoDir, ['branch', '-D', '--', branchName], { logError: false });
      if (delRes.success) {
        deleted.push(branchName);
      } else {
        failed.push({ name: branchName, error: delRes.stderr || delRes.error || 'Failed to delete branch' });
      }
    }

    const updatedBranches = await getRepoBranches(identifier, userContext);
    return {
      success: true,
      dryRun: false,
      remote: targetRemote,
      currentBranch: updatedBranches.current || currentBranch,
      deleted,
      failed,
      skippedCurrent,
      branches: updatedBranches.branches || []
    };
  });
}

module.exports = {
  getDefaultMemoryRepoName,
  getMemoryRepoDir,
  ensureMemoryRepoInitialized,
  getBaseReposDir,
  getProjectRepoDir,
  resolveSafePath,
  getSafeFilePath,
  listLocalRepositories,
  cloneRepoToFolder,
  pullRepo,
  pruneGoneBranches,
  getFileContent,
  saveFileContent,
  deleteFile,
  renameFile,
  createAndCheckoutBranch,
  commitAndPush,
  commitChanges,
  pushChanges,
  discardFileChanges,
  getRepoStatus,
  getRemotes,
  setRemote,
  getAssociations,
  saveAssociation,
  deleteAssociation,
  copyBetweenRepos,
  getDiff,
  listProjectFiles,
  getCurrentBranch,
  getRepoBranches,
  switchBranch,
  formatGitAuthHeader,
  runGitCommand
};
