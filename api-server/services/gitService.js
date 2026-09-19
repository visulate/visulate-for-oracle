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
 * Resolves and validates an existing safe file path within a repository.
 */
function getSafeFilePath(identifier, filePath, userContext = null) {
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(repoDir)) {
    throw new Error('Repository directory does not exist');
  }
  const fullPath = resolveSafePath(repoDir, filePath, true);
  const stat = fs.lstatSync(fullPath);
  if (stat.isDirectory()) {
    throw new Error('Target path is a directory, not a file');
  }
  return fullPath;
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
  const { logError = true } = options;
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
    return { success: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
  } catch (error) {
    const sanitize = (value) => String(value || '').replace(/(Authorization:\s*(?:Bearer|Basic)\s+)\S+/gi, '$1***');
    if (logError) {
      logger.log('warn', `Git command error: ${sanitize(error.message)}`);
    }
    return {
      success: false,
      error: sanitize(error.message),
      stderr: sanitize(error.stderr).trim(),
      stdout: sanitize(error.stdout).trim()
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
 */
async function pullRepo(identifier, branch = null, authContext = {}, userContext = null, remote = 'origin') {
  const repoDir = getProjectRepoDir(identifier, userContext);
  if (!repoDir || !fs.existsSync(repoDir)) {
    throw new Error('Repository directory does not exist');
  }

  const currentBranch = branch || await getCurrentBranch(repoDir);
  const gitArgs = [];
  const authHeader = formatGitAuthHeader(authContext);
  if (authHeader) {
    gitArgs.push('-c', `http.extraHeader=${authHeader}`);
  }

  // Check if remote exists
  const targetRemote = remote || 'origin';
  const remoteCheck = await runGitCommand(repoDir, ['remote']);
  const remotes = remoteCheck.success ? remoteCheck.stdout.split(/\s+/).filter(Boolean) : [];
  if (!remoteCheck.success || !remotes.includes(targetRemote)) {
    throw new Error(`Remote '${targetRemote}' does not exist for this repository`);
  }

  gitArgs.push('pull', targetRemote, currentBranch);
  const res = await runGitCommand(repoDir, gitArgs, { authContext });

  if (!res.success) {
    if (res.stderr && res.stderr.includes("couldn't find remote ref")) {
      throw new Error(`Branch '${currentBranch}' does not exist on remote '${targetRemote}'. Use Commit & Push to publish it first.`);
    }
    let pullErr = res.stderr || res.error || 'Failed to pull changes from remote';
    if (/could not read Username|Authentication failed|terminal prompts disabled/i.test(pullErr)) {
      pullErr = `Git authentication failed for remote '${targetRemote}'. Please configure your Personal Access Token (PAT) via the Git Session Credentials dialog. (${pullErr})`;
    } else if (/Permission to .* denied|returned error: 403/i.test(pullErr)) {
      pullErr = `Permission denied (HTTP 403) accessing remote '${targetRemote}'. Please ensure your Personal Access Token (PAT) has access to this repository. (${pullErr})`;
    }
    throw new Error(pullErr);
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

module.exports = {
  getBaseReposDir,
  getProjectRepoDir,
  resolveSafePath,
  getSafeFilePath,
  listLocalRepositories,
  cloneRepoToFolder,
  pullRepo,
  getFileContent,
  saveFileContent,
  deleteFile,
  createAndCheckoutBranch,
  commitAndPush,
  getDiff,
  listProjectFiles,
  getCurrentBranch,
  getRepoBranches,
  switchBranch,
  formatGitAuthHeader,
  runGitCommand
};
