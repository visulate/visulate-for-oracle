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
const gitService = require('./gitService');
const dbConfig = require('../config/database');
const dbService = require('./database');
const logger = require('./logger');

/**
 * Computes a stable, collision-free code-map identity for a repository.
 * In GIT_MODE=server with a shared memory repository, per-user workspaces can each
 * contain a repository with the same folder name (e.g. Alice's 'app' and Bob's 'app').
 * Namespacing under `users/<username>/<projectId>` isolates them cleanly.
 */
function getRepoCodeMapIdentity(projectId, userContext = null) {
  const mode = (process.env.GIT_MODE || 'local').toLowerCase();
  const memScope = (process.env.MEMORY_REPO_SCOPE || 'shared').toLowerCase();
  const rawUser = userContext && userContext.username ? String(userContext.username).trim() : '';
  if (mode === 'server' && memScope !== 'user' && rawUser) {
    const safeUser = rawUser.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (safeUser && safeUser !== '.' && safeUser !== '..') {
      return {
        relSegments: ['users', safeUser, projectId],
        repoIdentity: `users/${safeUser}/${projectId}`,
        repoOwner: safeUser
      };
    }
  }
  return {
    relSegments: [projectId],
    repoIdentity: projectId,
    repoOwner: null
  };
}

async function getValidCatalogObjects(dbConnectionId, targetOwner = null) {
  if (!dbConnectionId) return null;
  const ep = dbConfig.endpoints.find(e => e.namespace === dbConnectionId || e.connect.poolAlias === dbConnectionId);
  if (!ep) return null;

  const poolAlias = ep.connect.poolAlias;
  const dbType = (ep.connect && ep.connect.dbType) || 'oracle';

  let cleanOwner = null;
  if (targetOwner) {
    if (!/^[A-Za-z0-9_#$]+$/.test(targetOwner)) {
      throw new Error('Invalid target owner: contains unsafe characters');
    }
    cleanOwner = targetOwner.trim();
  }

  const binds = cleanOwner ? { targetOwner: cleanOwner } : {};

  try {
    let query = '';
    if (dbType === 'postgres') {
      const ownerTablesClause = cleanOwner ? `AND table_schema = LOWER(:targetOwner)` : `AND table_schema NOT IN ('information_schema', 'pg_catalog')`;
      const ownerRoutinesClause = cleanOwner ? `AND routine_schema = LOWER(:targetOwner)` : `AND routine_schema NOT IN ('information_schema', 'pg_catalog')`;
      query = `
        SELECT UPPER(table_schema) AS OWNER, UPPER(table_name) AS OBJECT_NAME, 'TABLE' AS OBJECT_TYPE 
        FROM information_schema.tables 
        WHERE table_type = 'BASE TABLE' ${ownerTablesClause}
        UNION
        SELECT UPPER(table_schema) AS OWNER, UPPER(table_name) AS OBJECT_NAME, 'VIEW' AS OBJECT_TYPE 
        FROM information_schema.views 
        WHERE 1=1 ${ownerTablesClause}
        UNION
        SELECT UPPER(routine_schema) AS OWNER, UPPER(routine_name) AS OBJECT_NAME, UPPER(routine_type) AS OBJECT_TYPE 
        FROM information_schema.routines 
        WHERE 1=1 ${ownerRoutinesClause}
      `;
    } else {
      const systemSchemas = [
        'SYS', 'SYSTEM', 'PUBLIC', 'AUDSYS', 'OUTLN', 'GSMADMIN_INTERNAL', 
        'DBSNMP', 'XDB', 'WMSYS', 'CTXSYS', 'ORDS_METADATA', 'LBACSYS', 
        'DVF', 'DVSYS', 'OLAPSYS', 'MDSYS', 'ORDSYS', 'ORDDATA', 
        'ORDPLUGINS', 'SI_INFORMTN_SCHEMA', 'APPQOSSYS', 'OJVMSYS', 
        'REMOTE_SCHEDULER_AGENT', 'DBSFWUSER', 'ORACLE_OCM'
      ];
      const excludedList = systemSchemas.map(s => `'${s}'`).join(', ');
      const ownerClause = cleanOwner ? `AND OWNER = UPPER(:targetOwner)` : `AND OWNER NOT IN (${excludedList})`;

      // Try DBA_OBJECTS first (shows full schema catalog regardless of direct grants)
      query = `
        SELECT DISTINCT UPPER(OWNER) AS OWNER, UPPER(OBJECT_NAME) AS OBJECT_NAME, UPPER(OBJECT_TYPE) AS OBJECT_TYPE 
        FROM DBA_OBJECTS 
        WHERE OBJECT_TYPE IN ('TABLE', 'VIEW', 'PACKAGE', 'PROCEDURE', 'FUNCTION', 'SEQUENCE', 'TYPE')
        ${ownerClause}
      `;
    }

    let rows;
    try {
      rows = await dbService.simpleExecute(poolAlias, query, binds);
    } catch (oracleErr) {
      if (dbType === 'oracle') {
        logger.log('info', `DBA_OBJECTS query failed (${oracleErr.message}), falling back to ALL_OBJECTS`);
        const systemSchemas = [
          'SYS', 'SYSTEM', 'PUBLIC', 'AUDSYS', 'OUTLN', 'GSMADMIN_INTERNAL', 
          'DBSNMP', 'XDB', 'WMSYS', 'CTXSYS', 'ORDS_METADATA', 'LBACSYS', 
          'DVF', 'DVSYS', 'OLAPSYS', 'MDSYS', 'ORDSYS', 'ORDDATA', 
          'ORDPLUGINS', 'SI_INFORMTN_SCHEMA', 'APPQOSSYS', 'OJVMSYS', 
          'REMOTE_SCHEDULER_AGENT', 'DBSFWUSER', 'ORACLE_OCM'
        ];
        const excludedList = systemSchemas.map(s => `'${s}'`).join(', ');
        const ownerClause = cleanOwner ? `AND OWNER = UPPER(:targetOwner)` : `AND OWNER NOT IN (${excludedList})`;
        const fallbackQuery = `
          SELECT DISTINCT UPPER(OWNER) AS OWNER, UPPER(OBJECT_NAME) AS OBJECT_NAME, UPPER(OBJECT_TYPE) AS OBJECT_TYPE 
          FROM ALL_OBJECTS 
          WHERE OBJECT_TYPE IN ('TABLE', 'VIEW', 'PACKAGE', 'PROCEDURE', 'FUNCTION', 'SEQUENCE', 'TYPE')
          ${ownerClause}
        `;
        rows = await dbService.simpleExecute(poolAlias, fallbackQuery, binds);
      } else {
        throw oracleErr;
      }
    }

    if (Array.isArray(rows) && rows.length > 0) {
      const validObjects = new Map();
      for (const row of rows) {
        const name = row.OBJECT_NAME || row.object_name;
        const owner = row.OWNER || row.owner;
        const type = row.OBJECT_TYPE || row.object_type || 'TABLE';
        if (name && owner) {
          const upperName = String(name).toUpperCase();
          validObjects.set(upperName, {
            owner: String(owner).toUpperCase(),
            type: String(type).toUpperCase(),
            name: upperName
          });
        }
      }
      logger.log('info', `Fetched ${validObjects.size} valid database catalog objects for endpoint '${dbConnectionId}'`);
      return validObjects;
    }
  } catch (err) {
    logger.log('warn', `Could not fetch database catalog objects for endpoint '${dbConnectionId}': ${err.message}`);
  }
  return null;
}

async function indexProjectDependencies(projectId, owner = null, userContext = null, dbConnParam = null) {
  const repoDir = gitService.getProjectRepoDir(projectId, userContext);
  if (!repoDir || !fs.existsSync(repoDir)) {
    throw new Error(`Repository directory not found for '${projectId}'`);
  }

  let dbConnectionId = dbConnParam || '';
  const visulateDir = path.join(repoDir, 'visulate');
  const rootVisulateMap = path.join(visulateDir, 'oracle-code-map.json');
  const existingMapPath = fs.existsSync(rootVisulateMap) ? rootVisulateMap : null;
  if (!dbConnectionId && existingMapPath) {
    try {
      const existing = JSON.parse(fs.readFileSync(existingMapPath, 'utf8'));
      dbConnectionId = existing.dbConnectionId || '';
    } catch (e) {}
  }

  const catalogObjects = await getValidCatalogObjects(dbConnectionId, owner);

  const codeFiles = await gitService.listProjectFiles(projectId, '', userContext);
  const { relSegments, repoIdentity, repoOwner } = getRepoCodeMapIdentity(projectId, userContext);
  const mapData = {
    projectId,
    repoIdentity,
    ...(repoOwner ? { repoOwner } : {}),
    indexedAt: new Date().toISOString(),
    dbConnectionId,
    objects: {},
    files: {}
  };

  // SQL & Application language reserved words and common English words to filter out
  const reservedWords = new Set([
    'THE', 'A', 'AN', 'AND', 'OR', 'NOT', 'IS', 'IN', 'ON', 'OF', 'TO', 'AT', 'BY', 'FOR', 'IF', 'IT', 'DO', 'SO', 'NO', 'BE', 'AS', 'WE', 'US', 'ME', 'MY', 'HE', 'SHE',
    'THIS', 'THAT', 'THEN', 'ELSE', 'WHEN', 'WHAT', 'HOW', 'WHY', 'ALL', 'ANY', 'NEW', 'GET', 'SET', 'PUT', 'DELETE', 'POST', 'TRY', 'CATCH', 'THROW', 'ERR', 'ERROR',
    'LOG', 'FILE', 'DATA', 'JSON', 'PATH', 'NAME', 'TYPE', 'VALUE', 'KEY', 'LIST', 'ITEM', 'SELECT', 'INSERT', 'UPDATE', 'MERGE', 'CREATE', 'ALTER', 'DROP',
    'TRUNCATE', 'FROM', 'JOIN', 'INTO', 'GROUP', 'ORDER', 'HAVING', 'VALUES', 'DUAL', 'TABLE', 'VIEW', 'PACKAGE', 'PROCEDURE', 'FUNCTION', 'BODY', 'INDEX',
    'TRIGGER', 'SEQUENCE', 'SYNONYM', 'BEGIN', 'END', 'EXCEPTION', 'RETURN', 'NULL', 'TRUE', 'FALSE', 'LOOP', 'WITH', 'EXEC', 'EXECUTE', 'CALL', 'PUBLIC',
    'PRIVATE', 'PROTECTED', 'STATIC', 'CLASS', 'INTERFACE', 'EXTENDS', 'IMPLEMENTS', 'ARRAY', 'STRING', 'INT', 'BOOL', 'BOOLEAN', 'FLOAT', 'VOID', 'SELF',
    'PARENT', 'CLONE', 'EVAL', 'VAR', 'LET', 'CONST', 'REQUIRE', 'MODULE', 'EXPORTS', 'DEFAULT', 'ASYNC', 'AWAIT', 'PROMISE', 'RESPONSE', 'REQUEST'
  ]);

  // Scan codebase files for object names
  for (const fileRelPath of codeFiles) {
    if (fileRelPath.startsWith('.git') || fileRelPath.startsWith('visulate/') || fileRelPath === 'visulate') {
      continue;
    }

    try {
      const content = await gitService.getFileContent(projectId, fileRelPath, null, userContext);
      mapData.files[fileRelPath] = [];

      const isSqlFile = fileRelPath.endsWith('.sql') || fileRelPath.endsWith('.pks') || fileRelPath.endsWith('.pkb') || fileRelPath.endsWith('.pls');

      // For SQL/PLSQL files, match DDL + SQL queries.
      // For app code files (.php, .js, .py, etc.), match SQL query clauses (FROM, JOIN, INTO, UPDATE, MERGE INTO, EXEC, CALL)
      const objectRegex = isSqlFile
        ? /(?:CREATE(?:\s+OR\s+REPLACE)?\s+(?:TABLE|VIEW|PACKAGE|PROCEDURE|FUNCTION|BODY)|FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|EXEC|EXECUTE|CALL)\s+([a-zA-Z0-9_"\.]+)/gi
        : /(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|EXEC|EXECUTE|CALL)\s+([a-zA-Z0-9_"\.]+)/gi;

      const matches = [...content.matchAll(objectRegex)];
      
      for (const match of matches) {
        const rawName = match[1].replace(/"/g, '').toUpperCase();
        const parts = rawName.split('.');
        const objectName = parts.length > 1 ? parts[parts.length - 1] : parts[0];

        if (objectName && objectName.length > 2 && !reservedWords.has(objectName)) {
          let dbObjectMeta = null;
          if (catalogObjects) {
            if (!catalogObjects.has(objectName)) {
              continue;
            }
            dbObjectMeta = catalogObjects.get(objectName);
          }

          if (!mapData.objects[objectName]) {
            mapData.objects[objectName] = {
              owner: dbObjectMeta?.owner || '',
              type: dbObjectMeta?.type || '',
              files: [],
              dependencies: []
            };
          }
          if (dbObjectMeta?.owner && !mapData.objects[objectName].owner) {
            mapData.objects[objectName].owner = dbObjectMeta.owner;
          }
          if (dbObjectMeta?.type && !mapData.objects[objectName].type) {
            mapData.objects[objectName].type = dbObjectMeta.type;
          }

          if (!mapData.objects[objectName].files.includes(fileRelPath)) {
            mapData.objects[objectName].files.push(fileRelPath);
          }
          if (!mapData.files[fileRelPath].includes(objectName)) {
            mapData.files[fileRelPath].push(objectName);
          }
        }
      }
    } catch (err) {
      logger.log('warn', `Error reading file ${fileRelPath} during indexing: ${err.message}`);
    }
  }

  let safeDbId = null;
  if (dbConnectionId) {
    const rawDb = String(dbConnectionId).trim().toLowerCase();
    if (!/^[a-zA-Z0-9._-]+$/.test(rawDb) || rawDb === '.' || rawDb === '..') {
      throw new Error('Invalid database connection identifier');
    }
    safeDbId = rawDb;
  }

  // Write dependency maps into the central visulate-memory repository so user code repos remain clean
  // and AI agents can perform cross-codebase impact analysis across all indexed repos.
  const memoryRepoDir = await gitService.ensureMemoryRepoInitialized(userContext);
  const dbFolder = safeDbId || '_unscoped';
  const targetDir = path.join(memoryRepoDir, dbFolder, 'code-maps', ...relSegments);

  gitService.resolveSafePath(memoryRepoDir, path.relative(memoryRepoDir, targetDir), false);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const mapPath = path.join(targetDir, 'oracle-code-map.json');
  gitService.resolveSafePath(memoryRepoDir, path.relative(memoryRepoDir, mapPath), false);
  fs.writeFileSync(mapPath, JSON.stringify(mapData, null, 2), 'utf8');

  // Also generate OKF Markdown document (<memoryRepo>/<db>/code-maps/<repoIdentity>/codebase-dependencies.md)
  let mdContent = `# Database-to-Codebase Dependency Index\n\n`;
  mdContent += `> **Indexed At:** ${mapData.indexedAt}\n`;
  mdContent += `> **Database Endpoint:** \`${mapData.dbConnectionId || 'N/A'}\` \n`;
  mdContent += `> **Project ID:** \`${projectId}\` \n`;
  if (repoOwner) {
    mdContent += `> **Workspace Owner:** \`${repoOwner}\` (\`${repoIdentity}\`) \n`;
  }
  mdContent += `\n`;
  mdContent += `## Mapped Oracle Objects & Codebase Dependencies\n\n`;

  const objectKeys = Object.keys(mapData.objects);
  if (objectKeys.length === 0) {
    mdContent += `*No database dependencies mapped yet.*\n`;
  } else {
    for (const objName of objectKeys) {
      const info = mapData.objects[objName];
      mdContent += `### \`${objName}\`\n`;
      if (info.owner || info.type) {
        mdContent += `- **Database Object:** \`${info.owner ? info.owner + '.' : ''}${objName}\` (${info.type || 'OBJECT'})\n`;
      }
      mdContent += `- **Mapped Files (${info.files.length}):**\n`;
      for (const f of info.files) {
        mdContent += `  - \`${f}\`\n`;
      }
      if (info.dependencies && info.dependencies.length > 0) {
        mdContent += `- **DB Dependencies:** ${info.dependencies.join(', ')}\n`;
      }
      mdContent += `\n`;
    }
  }

  const mdPath = path.join(targetDir, 'codebase-dependencies.md');
  gitService.resolveSafePath(memoryRepoDir, path.relative(memoryRepoDir, mdPath), false);
  fs.writeFileSync(mdPath, mdContent, 'utf8');

  logger.log('info', `Successfully generated oracle-code-map.json and codebase-dependencies.md for project ${projectId} in ${targetDir}`);

  return {
    ...mapData,
    memoryRepo: gitService.getDefaultMemoryRepoName(),
    savedPath: path.relative(memoryRepoDir, mapPath).replace(/\\/g, '/')
  };
}

/**
 * Loads the oracle-code-map.json for a specific project and database.
 * Checks visulate-memory/<db>/code-maps/<projectId>/ first, then falls back to legacy paths inside the code repo.
 */
function getProjectCodeMap(projectId, dbConnectionId = null, userContext = null) {
  if (!projectId) return null;
  const safeProject = String(projectId).trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(safeProject) || safeProject === '.' || safeProject === '..') {
    throw new Error('Invalid repository identifier');
  }

  const normalizedDb = dbConnectionId ? String(dbConnectionId).trim().toLowerCase() : null;
  if (normalizedDb && (!/^[a-zA-Z0-9._-]+$/.test(normalizedDb) || normalizedDb === '.' || normalizedDb === '..')) {
    throw new Error('Invalid database connection identifier');
  }

  const memoryDir = gitService.getMemoryRepoDir(userContext);
  const { relSegments, repoOwner } = getRepoCodeMapIdentity(safeProject, userContext);
  const candidates = [];

  if (normalizedDb) {
    candidates.push(path.join(memoryDir, normalizedDb, 'code-maps', ...relSegments, 'oracle-code-map.json'));
    if (repoOwner) {
      candidates.push(path.join(memoryDir, normalizedDb, 'code-maps', safeProject, 'oracle-code-map.json'));
    }
  }
  candidates.push(path.join(memoryDir, '_unscoped', 'code-maps', ...relSegments, 'oracle-code-map.json'));
  if (repoOwner) {
    candidates.push(path.join(memoryDir, '_unscoped', 'code-maps', safeProject, 'oracle-code-map.json'));
  }

  // Legacy fallback inside the code repository itself
  try {
    const repoDir = gitService.getProjectRepoDir(safeProject, userContext);
    if (repoDir && fs.existsSync(repoDir)) {
      if (normalizedDb) {
        candidates.push(path.join(repoDir, 'visulate', normalizedDb, 'oracle-code-map.json'));
      }
      candidates.push(path.join(repoDir, 'visulate', 'oracle-code-map.json'));
    }
  } catch (_) {}

  for (const mapPath of candidates) {
    if (fs.existsSync(mapPath)) {
      try {
        return JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      } catch (err) {
        logger.log('warn', `Error parsing code map at ${mapPath}: ${err.message}`);
      }
    }
  }
  return null;
}


/**
 * Resolves repository codebase files that reference or depend on a given database object.
 * Searches visulate-memory/<db>/code-maps/<repo>/ first, then falls back to legacy <repo>/visulate/<db>/ indexes.
 *
 * @param {string} db - The database endpoint/connection identifier (e.g. 'pdb21')
 * @param {string} objectName - Name of the database object (e.g. 'PR_PROPERTIES')
 * @param {object} userContext - Optional user context
 * @param {string} repoFolder - Optional specific repository folder to inspect (restricts search if provided)
 * @param {string} owner - Optional schema owner to disambiguate object matches
 */
async function getObjectCodeDependencies(db, objectName, userContext = null, repoFolder = null, owner = null) {
  if (!db || !objectName) {
    return { found: false, files: [], message: 'db and objectName are required' };
  }

  const targetObject = objectName.toUpperCase().trim();
  const targetOwner = owner ? owner.toUpperCase().trim() : null;
  const normalizedDb = db.toLowerCase().trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(normalizedDb) || normalizedDb === '.' || normalizedDb === '..') {
    throw new Error('Invalid database connection identifier');
  }
  if (repoFolder && (!/^[a-zA-Z0-9._-]+$/.test(repoFolder) || repoFolder === '.' || repoFolder === '..')) {
    throw new Error('Invalid repository identifier');
  }

  const matches = [];
  const seenIdentities = new Set();
  let primaryRepo = null;
  let primaryIdentity = null;
  let primaryOwner = null;
  let primaryType = null;
  const allFiles = new Set();
  const allDependencies = new Set();

  const mode = (process.env.GIT_MODE || 'local').toLowerCase();
  const memScope = (process.env.MEMORY_REPO_SCOPE || 'shared').toLowerCase();
  const currentSafeUser = (mode === 'server' && memScope !== 'user' && userContext && userContext.username)
    ? String(userContext.username).trim().replace(/[^a-zA-Z0-9._-]/g, '_')
    : null;

  function inspectMapData(repoName, mapData, isDbSpecific, identityOverride = null, ownerOverride = null) {
    const mapOwner = ownerOverride || mapData.repoOwner || null;
    const identity = identityOverride || mapData.repoIdentity || (mapOwner ? `users/${mapOwner}/${repoName}` : repoName);
    if (seenIdentities.has(identity)) return;

    // In server mode with a shared memory repo, isolate lookups for a requesting user to their
    // own user-namespaced workspace maps (plus shared un-namespaced maps) so Alice's and Bob's
    // identically-named repositories never leak into each other's dependency lookups.
    if (currentSafeUser && mapOwner && mapOwner !== currentSafeUser) {
      return;
    }

    const repoDb = (mapData.dbConnectionId || '').toLowerCase().trim();
    const shouldInspect = repoFolder
      ? repoName === repoFolder && (repoDb === normalizedDb || isDbSpecific)
      : (repoDb === normalizedDb || isDbSpecific);

    if (!shouldInspect) return;
    seenIdentities.add(identity);

    if (mapData.objects && mapData.objects[targetObject]) {
      const info = mapData.objects[targetObject];
      if (targetOwner && info.owner && info.owner.toUpperCase().trim() !== targetOwner) {
        return;
      }
      const repoFiles = info.files || [];
      if (!primaryRepo) {
        primaryRepo = repoName;
        primaryIdentity = identity;
        primaryOwner = info.owner || null;
        primaryType = info.type || null;
      }
      repoFiles.forEach(f => allFiles.add(f));
      if (info.dependencies) {
        info.dependencies.forEach(d => allDependencies.add(d));
      }
      const matchEntry = {
        repoFolder: repoName,
        repoIdentity: identity,
        owner: info.owner,
        type: info.type,
        files: repoFiles
      };
      if (mapOwner) {
        matchEntry.repoOwner = mapOwner;
      }
      matches.push(matchEntry);
    }
  }

  // 1. Primary source: central visulate-memory/<db>/code-maps/[users/<user>/]<repo>/oracle-code-map.json
  const memoryDir = gitService.getMemoryRepoDir(userContext);
  const codeMapsRoot = path.join(memoryDir, normalizedDb, 'code-maps');
  if (fs.existsSync(codeMapsRoot)) {
    try {
      const discoveredMaps = [];

      // Collect user-namespaced code maps: code-maps/users/<user>/<repo>/oracle-code-map.json
      const usersDir = path.join(codeMapsRoot, 'users');
      if (fs.existsSync(usersDir) && fs.statSync(usersDir).isDirectory()) {
        const userDirs = fs.readdirSync(usersDir, { withFileTypes: true })
          .filter(e => e.isDirectory() && !e.name.startsWith('.'))
          .map(e => e.name)
          .sort();
        for (const uName of userDirs) {
          const uPath = path.join(usersDir, uName);
          const uRepos = fs.readdirSync(uPath, { withFileTypes: true })
            .filter(e => e.isDirectory() && !e.name.startsWith('.'))
            .map(e => e.name)
            .sort();
          for (const rName of uRepos) {
            const mapPath = path.join(uPath, rName, 'oracle-code-map.json');
            if (fs.existsSync(mapPath)) {
              discoveredMaps.push({
                repoName: rName,
                identity: `users/${uName}/${rName}`,
                repoOwner: uName,
                mapPath
              });
            }
          }
        }
      }

      // Collect top-level (local / shared) code maps: code-maps/<repo>/oracle-code-map.json
      const repoEntries = fs.readdirSync(codeMapsRoot, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'users')
        .map(e => e.name)
        .sort();
      for (const rName of repoEntries) {
        const mapPath = path.join(codeMapsRoot, rName, 'oracle-code-map.json');
        if (fs.existsSync(mapPath)) {
          discoveredMaps.push({
            repoName: rName,
            identity: rName,
            repoOwner: null,
            mapPath
          });
        }
      }

      // Prioritize requesting user's workspace and requested repoFolder first
      discoveredMaps.sort((a, b) => {
        const aOwn = currentSafeUser && a.repoOwner === currentSafeUser ? 0 : 1;
        const bOwn = currentSafeUser && b.repoOwner === currentSafeUser ? 0 : 1;
        if (aOwn !== bOwn) return aOwn - bOwn;
        if (repoFolder) {
          const aMatch = a.repoName === repoFolder ? 0 : 1;
          const bMatch = b.repoName === repoFolder ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
        }
        return a.identity.localeCompare(b.identity);
      });

      for (const item of discoveredMaps) {
        try {
          const mapData = JSON.parse(fs.readFileSync(item.mapPath, 'utf8'));
          inspectMapData(item.repoName, mapData, true, item.identity, item.repoOwner);
        } catch (err) {
          logger.log('warn', `Error reading memory dependency map for ${item.identity}: ${err.message}`);
        }
      }
    } catch (err) {
      logger.log('warn', `Error scanning code-maps in ${codeMapsRoot}: ${err.message}`);
    }
  }

  // 2. Legacy fallback: <repo>/visulate/<db>/oracle-code-map.json or <repo>/visulate/oracle-code-map.json
  const repos = gitService.listLocalRepositories(userContext);
  if (repos && repos.length > 0) {
    if (repoFolder) {
      repos.sort((a, b) => {
        if (a.folderName === repoFolder) return -1;
        if (b.folderName === repoFolder) return 1;
        return 0;
      });
    }

    for (const repo of repos) {
      if (repo.isMemoryRepo) continue;
      const { repoIdentity, repoOwner } = getRepoCodeMapIdentity(repo.folderName, userContext);
      if (seenIdentities.has(repoIdentity) || seenIdentities.has(repo.folderName)) continue;
      const visulateDbMap = path.join(repo.fullPath, 'visulate', normalizedDb, 'oracle-code-map.json');
      const visulateLegacyMap = path.join(repo.fullPath, 'visulate', 'oracle-code-map.json');

      const mapPath = fs.existsSync(visulateDbMap) ? visulateDbMap : (
        fs.existsSync(visulateLegacyMap) ? visulateLegacyMap : null
      );
      if (!mapPath) continue;

      try {
        const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        inspectMapData(repo.folderName, mapData, mapPath === visulateDbMap, repoIdentity, repoOwner);
      } catch (err) {
        logger.log('warn', `Error reading dependency map in ${repo.folderName}: ${err.message}`);
      }
    }
  }

  return {
    found: allFiles.size > 0,
    repoFolder: primaryRepo || repoFolder,
    repoIdentity: primaryIdentity || (primaryRepo || repoFolder),
    dbConnectionId: db,
    objectName: targetObject,
    owner: primaryOwner || targetOwner,
    type: primaryType,
    files: Array.from(allFiles),
    dependencies: Array.from(allDependencies),
    repositories: matches
  };
}

module.exports = {
  indexProjectDependencies,
  getProjectCodeMap,
  getObjectCodeDependencies
};

