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
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);
const logger = require('./logger');

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
  const baseDir = getBaseReposDir(userContext);
  const safeName = String(identifier);
  if (!/^[a-zA-Z0-9._-]+$/.test(safeName) || safeName === '.' || safeName === '..') {
    throw new Error('Invalid repository identifier');
  }
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
 * Lists local repository directories in the active workspace.
 */
function listLocalRepositories(userContext = null) {
  const baseDir = getBaseReposDir(userContext);
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const repos = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'users') {
        const fullPath = path.join(baseDir, entry.name);
        const isGit = fs.existsSync(path.join(fullPath, '.git'));
        repos.push({
          folderName: entry.name,
          fullPath: fullPath,
          isGitRepo: isGit
        });
      }
    }
    return repos;
  } catch (err) {
    logger.log('error', `Error scanning local repos in ${baseDir}: ${err.message}`);
    return [];
  }
}

/**
 * Executes Git directly via execFile with an argument array.
 * Never executes through a shell and never writes secrets to repository .git/config.
 */
async function runGitCommand(repoDir, args, options = {}) {
  const { logError = true } = options;
  const env = { ...process.env };
  const gitArgs = Array.isArray(args) ? args : args.split(' ').filter(Boolean);

  try {
    const { stdout, stderr } = await execFileAsync('git', gitArgs, { cwd: repoDir, env });
    return { success: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
  } catch (error) {
    if (logError) {
      // Sanitize potential token from log output
      const cleanMsg = (error.message || '').replace(/([a-zA-Z0-9_-]{20,})/g, '***');
      logger.log('warn', `Git command error: ${cleanMsg}`);
    }
    return { success: false, error: error.message, stderr: error.stderr ? error.stderr.trim() : '' };
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
  if (authContext && authContext.token && safeRemoteUrl.startsWith('https://')) {
    gitArgs.push('-c', `http.extraHeader=Authorization: Bearer ${authContext.token}`);
  }

  gitArgs.push('clone', '--depth', '1');
  if (branch) {
    gitArgs.push('-b', branch);
  }
  gitArgs.push(safeRemoteUrl, safeFolder);

  const res = await runGitCommand(baseDir, gitArgs, { authContext });
  return {
    success: res.success,
    folderName: safeFolder,
    message: res.success ? 'Repository cloned successfully' : res.error
  };
}

/**
 * Pulls latest remote changes into the checked-out branch using active session credentials.
 */
async function pullRepo(identifier, branch = null, authContext = {}, userContext = null, remote = 'origin') {
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(repoDir) || !fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`Repository folder '${identifier}' does not exist or is not a git repository.`);
  }

  const currentBranch = branch || await getCurrentBranch(repoDir);
  const gitArgs = [];
  if (authContext && authContext.token) {
    gitArgs.push('-c', `http.extraHeader=Authorization: Bearer ${authContext.token}`);
  }

  // Check if remote exists
  const remoteCheck = await runGitCommand(repoDir, ['remote']);
  const remotes = remoteCheck.success ? remoteCheck.stdout.split(/\s+/).filter(Boolean) : [];
  const targetRemote = remotes.includes(remote) ? remote : (remotes[0] || 'origin');

  gitArgs.push('pull', '--prune', targetRemote, currentBranch);
  const res = await runGitCommand(repoDir, gitArgs);
  if (!res.success) {
    if (res.stderr && res.stderr.includes("couldn't find remote ref")) {
      throw new Error(`Branch '${currentBranch}' does not exist on remote '${targetRemote}'. Use Commit & Push to publish it first.`);
    }
    throw new Error(res.stderr || res.error || 'Failed to pull changes from remote');
  }

  return { success: true, stdout: res.stdout, branch: currentBranch, summary: res.stdout || 'Already up to date' };
}

/**
 * Ensures repo exists or initializes empty repo if needed.
 */
async function ensureRepoInitialized(identifier, userContext = null) {
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!fs.existsSync(repoDir)) {
    fs.mkdirSync(repoDir, { recursive: true });
  }

  const gitDir = path.join(repoDir, '.git');
  if (!fs.existsSync(gitDir)) {
    logger.log('info', `Initializing git repository at ${repoDir}`);
    await runGitCommand(repoDir, ['init']);
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
  const commitRes = await runGitCommand(repoDir, commitArgs);
  
  // Try pushing if remote origin exists
  const remoteCheck = await runGitCommand(repoDir, ['remote']);
  let pushRes = { success: true, stdout: 'No remote origin configured' };

  if (remoteCheck.success && remoteCheck.stdout.includes('origin')) {
    const currentBranch = branchName || await getCurrentBranch(repoDir);
    const pushArgs = [];
    if (authContext && authContext.token) {
      pushArgs.push('-c', `http.extraHeader=Authorization: Bearer ${authContext.token}`);
    }
    pushArgs.push('push', 'origin', currentBranch);
    pushRes = await runGitCommand(repoDir, pushArgs, { authContext });
  }

  return {
    success: commitRes.success || pushRes.success,
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
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
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

module.exports = {
  getBaseReposDir,
  getProjectRepoDir,
  resolveSafePath,
  listLocalRepositories,
  cloneRepoToFolder,
  pullRepo,
  getFileContent,
  saveFileContent,
  createAndCheckoutBranch,
  commitAndPush,
  getDiff,
  listProjectFiles,
  getCurrentBranch,
  getRepoBranches,
  switchBranch
};
