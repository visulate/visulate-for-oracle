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
const projectService = require('./projectService');
const controller = require('./controller');
const logger = require('./logger');

async function indexProjectDependencies(projectId, owner = null) {
  const project = projectService.getProjectById(projectId);
  const repoDir = gitService.getProjectRepoDir(projectId);

  if (!fs.existsSync(repoDir)) {
    await gitService.cloneOrFetchRepo(projectId, project?.gitRepo?.remoteUrl || '');
  }

  const codeFiles = await gitService.listProjectFiles(projectId);
  const mapData = {
    projectId,
    indexedAt: new Date().toISOString(),
    dbConnectionId: project?.dbConnectionId || '',
    objects: {},
    files: {}
  };

  // Scan codebase files for object names
  for (const fileRelPath of codeFiles) {
    if (fileRelPath.startsWith('.git') || fileRelPath.startsWith('.okf')) {
      continue;
    }

    try {
      const content = await gitService.getFileContent(projectId, fileRelPath);
      mapData.files[fileRelPath] = [];

      // SQL & Application language reserved words to filter out
      const reservedWords = new Set([
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'ALTER', 'DROP',
        'TRUNCATE', 'FROM', 'JOIN', 'INTO', 'SET', 'WHERE', 'AND', 'OR', 'ON', 'AS',
        'BY', 'GROUP', 'ORDER', 'HAVING', 'VALUES', 'DUAL', 'TABLE', 'VIEW', 'PACKAGE',
        'PROCEDURE', 'FUNCTION', 'BODY', 'INDEX', 'TRIGGER', 'SEQUENCE', 'SYNONYM',
        'TYPE', 'BEGIN', 'END', 'EXCEPTION', 'RETURN', 'NULL', 'TRUE', 'FALSE', 'IF',
        'LOOP', 'FOR', 'IN', 'IS', 'NOT', 'OF', 'TO', 'WITH', 'EXEC', 'EXECUTE', 'CALL',
        'PUBLIC', 'PRIVATE', 'PROTECTED', 'STATIC', 'CLASS', 'INTERFACE', 'EXTENDS',
        'IMPLEMENTS', 'ARRAY', 'STRING', 'INT', 'BOOL', 'BOOLEAN', 'FLOAT', 'VOID',
        'THIS', 'SELF', 'PARENT', 'NEW', 'CLONE', 'EVAL', 'VAR', 'LET', 'CONST'
      ]);

      const isSqlFile = fileRelPath.endsWith('.sql') || fileRelPath.endsWith('.pks') || fileRelPath.endsWith('.pkb') || fileRelPath.endsWith('.pls');

      // For SQL/PLSQL files, match DDL + SQL queries.
      // For app code files (.php, .js, .py, etc.), match SQL query clauses (FROM, JOIN, INTO, UPDATE, MERGE INTO, EXEC, CALL) but ignore app language function/method declarations.
      const objectRegex = isSqlFile
        ? /(?:CREATE(?:\s+OR\s+REPLACE)?\s+(?:TABLE|VIEW|PACKAGE|PROCEDURE|FUNCTION|BODY)|FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|EXEC|EXECUTE|CALL)\s+([a-zA-Z0-9_"\.]+)/gi
        : /(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|EXEC|EXECUTE|CALL)\s+([a-zA-Z0-9_"\.]+)/gi;

      const matches = [...content.matchAll(objectRegex)];
      
      for (const match of matches) {
        const rawName = match[1].replace(/"/g, '').toUpperCase();
        const parts = rawName.split('.');
        const objectName = parts.length > 1 ? parts[parts.length - 1] : parts[0];

        if (objectName && objectName.length > 2 && !reservedWords.has(objectName)) {
          if (!mapData.objects[objectName]) {
            mapData.objects[objectName] = { files: [], dependencies: [] };
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
