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
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const logger = require('./logger');

const projectService = require('./projectService');

function getBaseReposDir() {
  return process.env.GIT_REPOS_DIR || path.join(process.cwd(), 'repos');
}

function getProjectRepoDir(identifier) {
  if (!identifier) return null;
  const baseDir = getBaseReposDir();
  
  // Check if identifier matches a registered project
  const project = projectService.getProjectById(identifier) || projectService.getProjectByDbConnection(identifier);
  if (project && project.repoFolder) {
    return path.join(baseDir, project.repoFolder);
  }

  // Otherwise treat identifier as folder name or path under baseDir
  const safeName = identifier.replace(/[^a-zA-Z0-9._-]/g, '_');
  const targetPath = path.join(baseDir, safeName);
  if (fs.existsSync(targetPath)) {
    return targetPath;
  }
  return path.join(baseDir, safeName);
}

function listLocalRepositories() {
  const baseDir = getBaseReposDir();
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const repos = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
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

async function cloneRepoToFolder(remoteUrl, folderName, branch = 'main') {
  const baseDir = getBaseReposDir();
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const safeFolder = folderName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const targetDir = path.join(baseDir, safeFolder);

  if (fs.existsSync(targetDir) && fs.existsSync(path.join(targetDir, '.git'))) {
    await runGitCommand(targetDir, `git fetch origin`);
    return { success: true, folderName: safeFolder, message: 'Repository already exists; fetched latest from remote.' };
  }

  if (branch && !/^[0-9A-Za-z._\/-]+$/.test(branch)) {
    throw new Error('Invalid branch name: contains unsafe characters');
  }

  const safeRemoteUrl = String(remoteUrl).replace(/"/g, '\\"');
  const cloneCmd = branch ? `git clone -b "${branch}" "${safeRemoteUrl}" "${safeFolder}"` : `git clone "${safeRemoteUrl}" "${safeFolder}"`;
  const res = await runGitCommand(baseDir, cloneCmd);
  return {
    success: res.success,
    folderName: safeFolder,
    message: res.success ? 'Repository cloned successfully' : res.error
  };
}

async function runGitCommand(repoDir, command, logError = true) {
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: repoDir });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    if (logError) {
      logger.log('warn', `Git command (${command}) output: ${error.message}`);
    }
    return { success: false, error: error.message, stderr: error.stderr ? error.stderr.trim() : '' };
  }
}

async function ensureRepoInitialized(projectId, remoteUrl = '', branch = 'main') {
  const repoDir = getProjectRepoDir(projectId);
  if (!fs.existsSync(repoDir)) {
    fs.mkdirSync(repoDir, { recursive: true });
  }

  const gitDir = path.join(repoDir, '.git');
  if (!fs.existsSync(gitDir)) {
    if (remoteUrl) {
      logger.log('info', `Cloning ${remoteUrl} into ${repoDir}`);
      const baseDir = getBaseReposDir();
      const safeId = path.basename(repoDir);
      const cloneCmd = `git clone -b ${branch} "${remoteUrl}" "${safeId}"`;
      const res = await runGitCommand(baseDir, cloneCmd);
      if (!res.success) {
        // Fallback to git init if clone fails or is empty
        await runGitCommand(repoDir, 'git init');
        await runGitCommand(repoDir, `git checkout -b ${branch}`);
      }
    } else {
      logger.log('info', `Initializing git repository at ${repoDir}`);
      await runGitCommand(repoDir, 'git init');
      await runGitCommand(repoDir, `git checkout -b ${branch}`);
      // Set initial git config if not set
      await runGitCommand(repoDir, 'git config user.name "Visulate Workbench"');
      await runGitCommand(repoDir, 'git config user.email "workbench@visulate.com"');
    }
  }
  return repoDir;
}

async function cloneOrFetchRepo(projectId, remoteUrl, branch = 'main') {
  const repoDir = await ensureRepoInitialized(projectId, remoteUrl, branch);
  if (remoteUrl) {
    await runGitCommand(repoDir, `git fetch origin`);
  }
  return repoDir;
}

async function getFileContent(projectId, filePath, revision = null) {
  const repoDir = await ensureRepoInitialized(projectId);
  const fullPath = path.join(repoDir, filePath);

  if (revision) {
    if (!/^[0-9A-Za-z._\/-]+$/.test(revision)) {
      throw new Error('Invalid revision: contains unsafe characters');
    }
    const res = await runGitCommand(repoDir, `git show ${revision}:"${filePath}"`);
    if (res.success) {
      return res.stdout;
    }
    logger.log('warn', `Failed to get ${filePath} at revision ${revision}, falling back to disk`);
  }

  if (fs.existsSync(fullPath)) {
    return fs.readFileSync(fullPath, 'utf8');
  }
  return '';
}

async function saveFileContent(projectId, filePath, content) {
  const repoDir = await ensureRepoInitialized(projectId);
  const fullPath = path.join(repoDir, filePath);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(fullPath, content, 'utf8');
  logger.log('info', `Saved file ${filePath} in project ${projectId}`);
  return { success: true, filePath, fullPath };
}

async function createAndCheckoutBranch(projectId, branchName) {
  const repoDir = await ensureRepoInitialized(projectId);
  // Check if branch exists
  const checkRes = await runGitCommand(repoDir, `git rev-parse --verify "${branchName}"`, false);
  if (checkRes.success) {
    const res = await runGitCommand(repoDir, `git checkout "${branchName}"`);
    return res;
  } else {
    const res = await runGitCommand(repoDir, `git checkout -b "${branchName}"`);
    return res;
  }
}

async function commitAndPush(projectId, branchName, commitMessage = 'Visulate Workbench commit') {
  const repoDir = await ensureRepoInitialized(projectId);
  
  if (branchName) {
    await createAndCheckoutBranch(projectId, branchName);
  }

  // Ensure git user config
  await runGitCommand(repoDir, 'git config user.name "Visulate Workbench"');
  await runGitCommand(repoDir, 'git config user.email "workbench@visulate.com"');

  await runGitCommand(repoDir, 'git add -A');
  const commitRes = await runGitCommand(repoDir, `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`);
  
  // Try pushing if remote origin exists
  const remoteCheck = await runGitCommand(repoDir, 'git remote');
  let pushRes = { success: true, stdout: 'No remote origin configured' };
  if (remoteCheck.success && remoteCheck.stdout.includes('origin')) {
    const currentBranch = branchName || 'main';
    pushRes = await runGitCommand(repoDir, `git push origin "${currentBranch}"`);
  }

  return {
    success: commitRes.success || pushRes.success,
    commit: commitRes,
    push: pushRes
  };
}

async function getDiff(projectId, filePath = '') {
  const repoDir = await ensureRepoInitialized(projectId);
  const cmd = filePath ? `git diff HEAD -- "${filePath}"` : `git diff HEAD`;
  const res = await runGitCommand(repoDir, cmd);
  if (res.success) {
    return res.stdout;
  }
  // Fallback to working tree diff vs last commit or empty
  const fallback = await runGitCommand(repoDir, filePath ? `git diff -- "${filePath}"` : `git diff`);
  return fallback.stdout || '';
}

async function listProjectFiles(projectId, subDir = '') {
  if (!projectId) return [];
  const repoDir = getProjectRepoDir(projectId);
  if (!repoDir || !fs.existsSync(repoDir)) {
    return [];
  }
  const targetDir = path.join(repoDir, subDir);
  
  if (!fs.existsSync(targetDir)) {
    return [];
  }

  const ignored = new Set(['.git', 'node_modules', '.venv', 'venv', '__pycache__', '.pytest_cache', '.angular', 'dist', 'build', '.DS_Store']);

  function scan(dir, base) {
    let results = [];
    try {
      const list = fs.readdirSync(dir);
      for (const file of list) {
        if (ignored.has(file)) continue;
        const full = path.join(dir, file);
        const rel = base ? path.join(base, file) : file;
        try {
          const stat = fs.lstatSync(full);
          if (stat.isSymbolicLink()) {
            // Check if link target exists and is a file
            try {
              const realStat = fs.statSync(full);
              if (realStat.isFile()) {
                results.push(rel);
              }
            } catch (e) {
              // Ignore broken symlink
            }
          } else if (stat.isDirectory()) {
            results = results.concat(scan(full, rel));
          } else if (stat.isFile()) {
            results.push(rel);
          }
        } catch (e) {
          // Ignore unstatable file
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
  listLocalRepositories,
  cloneRepoToFolder,
  cloneOrFetchRepo,
  getFileContent,
  saveFileContent,
  createAndCheckoutBranch,
  commitAndPush,
  getDiff,
  listProjectFiles
};
