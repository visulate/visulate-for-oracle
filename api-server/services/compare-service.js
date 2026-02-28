const dbConfig = require('../config/database.js');
const dbService = require('./database.js');
const sql = require('./sql-statements');
const controller = require('./controller.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DOWNLOAD_ROOT = process.env.VISULATE_DOWNLOADS || path.resolve(__dirname, '../downloads');

function getEndpointList(endpoints) {
  let endpointList = [];
  endpoints.forEach(endpoint => {
    endpointList[endpoint.namespace] = endpoint.connect.poolAlias;
  });
  return endpointList;
}

const endpointList = getEndpointList(dbConfig.endpoints);

async function getSchemaObjectCounts(db, ownerToFilter = null) {
  const eps = await controller.endpoints('');
  const epObj = eps.find(e => e.endpoint === db);
  if (!epObj || !epObj.schemas) return null;

  const countsRows = [];
  const knownInternal = ['SYS', 'SYSTEM', 'XDB', 'WMSYS', 'CTXSYS', 'MDSYS', 'OLAPSYS', 'OJVMSYS', 'SYSMAN', 'AUDSYS', 'DBSNMP', 'OUTLN', 'APPQOSSYS', 'DIP', 'GSMADMIN_INTERNAL', 'ORACLE_OCM', 'SYS$UMF', 'XS$NULL'];

  for (const [schemaName, schemaObjs] of Object.entries(epObj.schemas)) {
    if (ownerToFilter && schemaName !== ownerToFilter) continue;

    // Skip internal schemas
    if (schemaObjs[0] && schemaObjs[0].INTERNAL === 1) continue;
    if (knownInternal.includes(schemaName)) continue;

    schemaObjs.forEach(obj => {
      if (ownerToFilter) {
        countsRows.push({ "Object Type": obj.OBJECT_TYPE, "Count": obj.OBJECT_COUNT });
      } else {
        countsRows.push({ "Schema": schemaName, "Object Type": obj.OBJECT_TYPE, "Count": obj.OBJECT_COUNT });
      }
    });
  }

  if (countsRows.length === 0) return null;

  if (ownerToFilter) {
    return { title: "Schema Object Counts", display: ["Object Type", "Count"], rows: countsRows };
  } else {
    return { title: "Schema Object Counts", display: ["Schema", "Object Type", "Count"], rows: countsRows };
  }
}

async function getDatabaseData(db) {
  const poolAlias = endpointList[db];
  if (!poolAlias) throw new Error(`Database ${db} not found`);

  let queryCollection = sql.collection['DATABASE'];
  let result = [];
  let connection;
  try {
    connection = await dbService.getConnection(poolAlias);
    for (let c of queryCollection.noParamQueries) {
      const cResult = await dbService.query(connection, c.sql, c.params);
      result.push({ title: c.title, display: c.display, rows: cResult });
    }

    // Include object counts by schema for Database comparisons
    const countData = await getSchemaObjectCounts(db);
    if (countData) result.unshift(countData);

    return result;
  } finally {
    if (connection) await dbService.closeConnection(connection);
  }
}

async function getSchemaData(db, owner) {
  const poolAlias = endpointList[db];
  if (!poolAlias) throw new Error(`Database ${db} not found`);

  let result = [];
  let connection;
  try {
    connection = await dbService.getConnection(poolAlias);

    let queryCollection = sql.collection['SCHEMA'];
    if (queryCollection) {
      for (let c of queryCollection.ownerNameQueries) {
        let params = JSON.parse(JSON.stringify(c.params));
        params.owner.val = owner;
        const cResult = await dbService.query(connection, c.sql, params);
        result.push({ title: c.title, display: c.display, rows: cResult });
      }
    }

    let filteredCollection = sql.collection['SCHEMA-FILTERED'];
    if (filteredCollection) {
      for (let c of filteredCollection.ownerNameQueries) {
        let params = JSON.parse(JSON.stringify(c.params));
        params.owner.val = owner;
        params.object_name.val = '%';
        const cResult = await dbService.query(connection, c.sql, params);
        result.push({ title: c.title, display: c.display, rows: cResult });
      }
    }

    // Include object counts for THIS schema for Schema comparisons
    const countData = await getSchemaObjectCounts(db, owner);
    if (countData) result.unshift(countData);

    return result;
  } finally {
    if (connection) await dbService.closeConnection(connection);
  }
}

async function getObjectData(db, owner, type, name) {
  const poolAlias = endpointList[db];
  if (!poolAlias) throw new Error(`Database ${db} not found`);
  const details = await controller.getObjectDetails(poolAlias, owner, type, name, true);
  if (details === '404') throw new Error(`Object ${name} not found in ${db}.${owner}`);
  return details;
}

async function compareEntities(sourceReq, targetReq) {
  let sourceData, targetData;

  // Fetch Source Data
  if (sourceReq.type && sourceReq.name) {
    sourceData = await getObjectData(sourceReq.db, sourceReq.owner, sourceReq.type, sourceReq.name);
  } else if (sourceReq.owner) {
    sourceData = await getSchemaData(sourceReq.db, sourceReq.owner);
  } else {
    sourceData = await getDatabaseData(sourceReq.db);
  }

  // Fetch Target Data
  if (targetReq.type && targetReq.name) {
    targetData = await getObjectData(targetReq.db, targetReq.owner, targetReq.type, targetReq.name);
  } else if (targetReq.owner) {
    targetData = await getSchemaData(targetReq.db, targetReq.owner);
  } else {
    targetData = await getDatabaseData(targetReq.db);
  }

  let report = `# Universal Comparison Report\n\n`;
  report += `**Source**: ${sourceReq.db}` + (sourceReq.owner ? `.${sourceReq.owner}` : '') + (sourceReq.type ? `.${sourceReq.type}` : '') + (sourceReq.name ? `.${sourceReq.name}` : '') + `\n`;
  report += `**Target**: ${targetReq.db}` + (targetReq.owner ? `.${targetReq.owner}` : '') + (targetReq.type ? `.${targetReq.type}` : '') + (targetReq.name ? `.${targetReq.name}` : '') + `\n\n`;

  let sHeader = sourceReq.db + (sourceReq.owner ? `.${sourceReq.owner}` : '');
  let tHeader = targetReq.db + (targetReq.owner ? `.${targetReq.owner}` : '');

  if (sourceReq.db === targetReq.db && sourceReq.owner && targetReq.owner && sourceReq.owner !== targetReq.owner) {
    sHeader = sourceReq.owner;
    tHeader = targetReq.owner;
  } else if (sourceReq.owner === targetReq.owner && sourceReq.db !== targetReq.db) {
    sHeader = sourceReq.db;
    tHeader = targetReq.db;
  } else if (sourceReq.db === targetReq.db && sourceReq.owner === targetReq.owner) {
    if (sourceReq.name && targetReq.name && sourceReq.name !== targetReq.name) {
      sHeader = sourceReq.name;
      tHeader = targetReq.name;
    }
  }

  const sourceMap = new Map(sourceData.map(d => [d.title, d]));
  const targetMap = new Map(targetData.map(d => [d.title, d]));

  for (const [title, sBlock] of sourceMap.entries()) {
    report += `## ${title}\n\n`;
    if (!targetMap.has(title)) {
      report += `*Section missing in target.*\n\n`;
      continue;
    }
    const tBlock = targetMap.get(title);

    const sRows = sBlock.rows || [];
    const tRows = tBlock.rows || [];

    if (sRows.length === 0 && tRows.length === 0) {
      report += `*No data in either source or target.*\n\n`;
      continue;
    }

    const displayCols = sBlock.display || [];
    let numColsForPk = 1;

    if (sRows.length <= 1 && tRows.length <= 1) {
      // Single-row summary block (like Status), use index as PK
    } else {
      while (numColsForPk < displayCols.length) {
        let sUnique = true;
        let sSeen = new Set();
        for (let r of sRows) {
          let key = displayCols.slice(0, numColsForPk).map(col => r[col]).join(', ');
          if (sSeen.has(key)) { sUnique = false; break; }
          sSeen.add(key);
        }
        let tUnique = true;
        let tSeen = new Set();
        for (let r of tRows) {
          let key = displayCols.slice(0, numColsForPk).map(col => r[col]).join(', ');
          if (tSeen.has(key)) { tUnique = false; break; }
          tSeen.add(key);
        }
        if (sUnique && tUnique) break;
        numColsForPk++;
      }
    }

    const sRowsMap = new Map();
    sRows.forEach(r => {
      let key = (sRows.length <= 1 && tRows.length <= 1) ? 'Row 1' : displayCols.slice(0, numColsForPk).map(col => r[col]).join(', ');
      while (sRowsMap.has(key)) key += '*';
      sRowsMap.set(key, r);
    });

    const tRowsMap = new Map();
    tRows.forEach(r => {
      let key = (sRows.length <= 1 && tRows.length <= 1) ? 'Row 1' : displayCols.slice(0, numColsForPk).map(col => r[col]).join(', ');
      while (tRowsMap.has(key)) key += '*';
      tRowsMap.set(key, r);
    });

    let missing = [];
    let extra = [];
    let diffs = [];

    for (const [pk, srow] of sRowsMap.entries()) {
      if (!tRowsMap.has(pk)) {
        missing.push(pk);
      } else {
        const trow = tRowsMap.get(pk);
        let rowDiffs = [];
        for (let col of displayCols) {
          const sVal = srow[col] !== undefined && srow[col] !== null ? String(srow[col]).replace(/\|/g, '-').replace(/\r?\n|\r/g, '<br>') : '';
          const tVal = trow[col] !== undefined && trow[col] !== null ? String(trow[col]).replace(/\|/g, '-').replace(/\r?\n|\r/g, '<br>') : '';
          if (sVal !== tVal) {
            rowDiffs.push({ col, sVal, tVal });
          }
        }
        if (rowDiffs.length > 0) {
          rowDiffs.forEach(diff => {
            diffs.push(`| ${pk !== 'Row 1' ? pk.replace(/\|/g, '-').replace(/\r?\n|\r/g, '<br>') : '-'} | ${diff.col} | ${diff.sVal} | ${diff.tVal} |`);
          });
        }
      }
    }
    for (const [pk, trow] of tRowsMap.entries()) {
      if (!sRowsMap.has(pk)) {
        extra.push(pk);
      }
    }

    if (missing.length === 0 && extra.length === 0 && diffs.length === 0) {
      report += `*Exact match.*\n\n`;
    } else {
      if (missing.length > 0) {
        report += `### Missing in ${tHeader}\n`;
        report += `| ${displayCols.join(' | ')} |\n`;
        report += `|${displayCols.map(() => '---').join('|')}|\n`;
        missing.forEach(pk => {
          const mRow = sRowsMap.get(pk);
          report += `| ${displayCols.map(col => mRow[col] !== undefined && mRow[col] !== null ? String(mRow[col]).replace(/\|/g, '-').replace(/\r?\n|\r/g, '<br>') : '').join(' | ')} |\n`;
        });
        report += `\n`;
      }
      if (extra.length > 0) {
        report += `### Extra in ${tHeader}\n`;
        report += `| ${displayCols.join(' | ')} |\n`;
        report += `|${displayCols.map(() => '---').join('|')}|\n`;
        extra.forEach(pk => {
          const mRow = tRowsMap.get(pk);
          report += `| ${displayCols.map(col => mRow[col] !== undefined && mRow[col] !== null ? String(mRow[col]).replace(/\|/g, '-').replace(/\r?\n|\r/g, '<br>') : '').join(' | ')} |\n`;
        });
        report += `\n`;
      }
      if (diffs.length > 0) {
        report += `### Differences\n`;
        report += `| Row PK | Column | ${sHeader} | ${tHeader} |\n`;
        report += `|---|---|---|---|\n`;
        diffs.forEach(d => report += `${d}\n`);
        report += `\n`;
      }
    }
  }

  for (const [title, tBlock] of targetMap.entries()) {
    if (!sourceMap.has(title)) {
      report += `## ${title}\n\n*Section exists in target but missing in source.*\n\n`;
    }
  }

  const sessionId = crypto.randomUUID();
  const dirPath = path.join(DOWNLOAD_ROOT, sessionId);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  const filename = 'comparison_report.md';
  const filePath = path.join(dirPath, filename);
  fs.writeFileSync(filePath, report);

  const downloadUrl = `/download/${sessionId}/${filename}`;

  return {
    reportSummary: `Comparison complete! Download the full Markdown diff report at: ${downloadUrl}\n\nPreview:\n\n${report.substring(0, 1500)}${report.length > 1500 ? '\n\n... (report truncated to save space, download the file to see the full list of differences)' : ''}`,
    downloadUrl,
    rawMarkdown: report
  };
}

module.exports = { compareEntities };
