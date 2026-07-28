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
const projectService = require('./projectService');
const logger = require('./logger');

async function getValidCatalogObjects(dbConnectionId) {
  if (!dbConnectionId) return null;
  const ep = dbConfig.endpoints.find(e => e.namespace === dbConnectionId || e.connect.poolAlias === dbConnectionId);
  if (!ep) return null;

  const poolAlias = ep.connect.poolAlias;
  const dbType = (ep.connect && ep.connect.dbType) || 'oracle';

  try {
    let query = '';
    if (dbType === 'postgres') {
      query = `
        SELECT UPPER(table_schema) AS OWNER, UPPER(table_name) AS OBJECT_NAME, 'TABLE' AS OBJECT_TYPE 
        FROM information_schema.tables 
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog') AND table_type = 'BASE TABLE'
        UNION
        SELECT UPPER(table_schema) AS OWNER, UPPER(table_name) AS OBJECT_NAME, 'VIEW' AS OBJECT_TYPE 
        FROM information_schema.views 
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        UNION
        SELECT UPPER(routine_schema) AS OWNER, UPPER(routine_name) AS OBJECT_NAME, UPPER(routine_type) AS OBJECT_TYPE 
        FROM information_schema.routines 
        WHERE routine_schema NOT IN ('information_schema', 'pg_catalog')
      `;
    } else {
      query = `
        SELECT DISTINCT UPPER(OWNER) AS OWNER, UPPER(OBJECT_NAME) AS OBJECT_NAME, UPPER(OBJECT_TYPE) AS OBJECT_TYPE 
        FROM ALL_OBJECTS 
        WHERE OBJECT_TYPE IN ('TABLE', 'VIEW', 'PACKAGE', 'PROCEDURE', 'FUNCTION', 'SEQUENCE', 'SYNONYM', 'TYPE')
        AND OWNER NOT IN ('SYS', 'SYSTEM', 'AUDSYS', 'OUTLN', 'GSMADMIN_INTERNAL', 'DBSNMP', 'XDB', 'WMSYS', 'CTXSYS', 'ORDS_METADATA')
      `;
    }

    const rows = await dbService.simpleExecute(poolAlias, query, []);
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

async function indexProjectDependencies(projectId, owner = null) {
  const project = projectService.getProjectById(projectId);
  const repoDir = gitService.getProjectRepoDir(projectId);

  if (!fs.existsSync(repoDir)) {
    await gitService.cloneOrFetchRepo(projectId, project?.gitRepo?.remoteUrl || '');
  }

  const dbConnectionId = project?.dbConnectionId || '';
  const catalogObjects = await getValidCatalogObjects(dbConnectionId);

  const codeFiles = await gitService.listProjectFiles(projectId);
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
      const content = await gitService.getFileContent(projectId, fileRelPath);
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
  const okfDir = path.join(repoDir, '.okf');
  if (!fs.existsSync(okfDir)) {
    fs.mkdirSync(okfDir, { recursive: true });
  }

  const mapPath = path.join(okfDir, 'oracle-code-map.json');
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

module.exports = {
  indexProjectDependencies
};
