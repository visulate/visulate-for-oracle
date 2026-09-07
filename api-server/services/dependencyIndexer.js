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
  const okfDir = path.join(repoDir, '.okf');
  const mapPath = path.join(okfDir, 'oracle-code-map.json');
  if (!dbConnectionId && fs.existsSync(mapPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      dbConnectionId = existing.dbConnectionId || '';
    } catch (e) {}
  }

  const catalogObjects = await getValidCatalogObjects(dbConnectionId, owner);

  const codeFiles = await gitService.listProjectFiles(projectId, '', userContext);
  const mapData = {
    projectId,
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
    if (fileRelPath.startsWith('.git') || fileRelPath.startsWith('.okf')) {
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

  // Write map to .okf/oracle-code-map.json
  if (!fs.existsSync(okfDir)) {
    fs.mkdirSync(okfDir, { recursive: true });
  }

  fs.writeFileSync(mapPath, JSON.stringify(mapData, null, 2), 'utf8');

  // Also generate OKF Markdown document (.okf/codebase-dependencies.md)
  let mdContent = `# Database-to-Codebase Dependency Index\n\n`;
  mdContent += `> **Indexed At:** ${mapData.indexedAt}\n`;
  mdContent += `> **Database Endpoint:** \`${mapData.dbConnectionId || 'N/A'}\` \n`;
  mdContent += `> **Project ID:** \`${projectId}\` \n\n`;
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

  const mdPath = path.join(okfDir, 'codebase-dependencies.md');
  fs.writeFileSync(mdPath, mdContent, 'utf8');

  logger.log('info', `Successfully generated oracle-code-map.json and codebase-dependencies.md for project ${projectId}`);

  return mapData;
}

/**
 * Resolves repository codebase files that reference or depend on a given database object.
 * Searches across repositories with dependency indexes matching the database endpoint.
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
  const repos = gitService.listLocalRepositories(userContext);

  if (!repos || repos.length === 0) {
    return { found: false, files: [], objectName: targetObject, dbConnectionId: db };
  }

  // If repoFolder is provided, sort it to the front
  if (repoFolder) {
    repos.sort((a, b) => {
      if (a.folderName === repoFolder) return -1;
      if (b.folderName === repoFolder) return 1;
      return 0;
    });
  }

  const matches = [];
  let primaryRepo = null;
  let primaryOwner = null;
  let primaryType = null;
  const allFiles = new Set();
  const allDependencies = new Set();

  for (const repo of repos) {
    const mapPath = path.join(repo.fullPath, '.okf', 'oracle-code-map.json');
    if (!fs.existsSync(mapPath)) continue;

    try {
      const raw = fs.readFileSync(mapPath, 'utf8');
      const mapData = JSON.parse(raw);
      const repoDb = (mapData.dbConnectionId || '').toLowerCase().trim();

      // When repoFolder is explicitly supplied, inspect ONLY that repository
      const shouldInspect = repoFolder ? (repo.folderName === repoFolder) : (repoDb === normalizedDb);

      if (shouldInspect) {
        if (mapData.objects && mapData.objects[targetObject]) {
          const info = mapData.objects[targetObject];
          // If schema owner was specified, verify it matches
          if (targetOwner && info.owner && info.owner.toUpperCase().trim() !== targetOwner) {
            continue;
          }
          const repoFiles = info.files || [];
          if (!primaryRepo) {
            primaryRepo = repo.folderName;
            primaryOwner = info.owner || null;
            primaryType = info.type || null;
          }
          repoFiles.forEach(f => allFiles.add(f));
          if (info.dependencies) {
            info.dependencies.forEach(d => allDependencies.add(d));
          }
          matches.push({
            repoFolder: repo.folderName,
            owner: info.owner,
            type: info.type,
            files: repoFiles
          });
        }
      }
    } catch (err) {
      logger.log('warn', `Error reading dependency map in ${repo.folderName}: ${err.message}`);
    }
  }

  return {
    found: allFiles.size > 0,
    repoFolder: primaryRepo || repoFolder,
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
  getObjectCodeDependencies
};

