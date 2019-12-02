/*!
 * Copyright 2019 Visulate LLC. All Rights Reserved.
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

const dbConfig = require('../config/database.js');
const dbService = require('./database.js');
const sql = require('./sql-statements');
const logger = require('./logger.js');
const util = require('./util');
const endpointList = getEndpointList(dbConfig.endpoints);

/**
 * Gets a list of endpoints
 * @returns an endpoint to pool alias  dictionary 
 */
function getEndpointList(endpoints) {
  let endpointList = [];
  endpoints.forEach(endpoint => {
    endpointList[endpoint.namespace] = endpoint.connect.poolAlias;
  });
  return endpointList;
}


/**
 * Group an array of objects by one of its values
 * https://gist.github.com/JamieMason/0566f8412af9fe6a1d470aa1e089a752
 * @param {*} key - An array value to group by
 */
const groupBy = key => array =>
  array.reduce((objectsByKeyValue, obj) => {
    const value = obj[key];
    objectsByKeyValue[value] = (objectsByKeyValue[value] || []).concat(obj);
    return objectsByKeyValue;
  }, {});


////////////////////////////////////////////////////////////////////////////////
// List all database connection endpoints
////////////////////////////////////////////////////////////////////////////////
function formatEndpoint(endpoint, objectCountRows) {
  let epObj = {};
  epObj['endpoint'] = endpoint.namespace;
  epObj['description'] = endpoint.description;
  epObj['connectString'] = endpoint.connect.connectString;
  const groupByOwner = groupBy('OWNER');
  epObj['schemas'] = groupByOwner(objectCountRows);
  return epObj;
}

async function endpoints() {
  const query = sql.statement['COUNT_DBA_OBJECTS'].sql;
  let rows = [];
  for (const ep of dbConfig.endpoints) {
    try {
      const result = await dbService.simpleExecute(ep.connect.poolAlias, query);
      const endpoint = formatEndpoint(ep, result.rows);
      rows.push(endpoint);
    } catch (err) {
      logger.log('error', `controller.js endpoints() connection failed for ${ep.connect.poolAlias}`);
    }
  }
  return rows;
}

async function getEndpoints(req, res, next) {
  try {
    const databaseList = await endpoints();
    res.status(200).json({ endpoints: databaseList });
  } catch (err) {
    next(err);
  }
}

module.exports.getEndpoints = getEndpoints;

////////////////////////////////////////////////////////////////////////////////
// List object for a given database, schemea, object type and filter conditions
////////////////////////////////////////////////////////////////////////////////
async function getObjectList(connection, owner, type, name, status) {
  // Get the list of object types
  query = sql.statement['LIST_DBA_OBJECTS'];
  const filtered_name = name.replace('*', '%').replace('_', '\\_');
  const filtered_type = type.replace('*', '%');
  let filtered_status = status.toUpperCase();
  if (filtered_status !== 'VALID' &&
    filtered_status !== 'INVALID') {
    filtered_status = '%';
  }
  query.params.owner.val = owner;
  query.params.object_type.val = filtered_type;
  query.params.object_name.val = filtered_name;
  query.params.status.val = filtered_status;

  const result = await dbService.query(connection, query.sql, query.params);
  return result;
}

async function listObjects(req, res, next) {

  // Validate the database parameter 
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
    return;
  }
  try {
    const connection = await dbService.getConnection(poolAlias);
    // Validate the owner and object_type parameters
    let query = sql.statement['VALIDATE-OWNER-AND-TYPE'];
    query.params.owner.val = req.params.owner;
    query.params.object_type.val = req.params.type;

    const r = await dbService.query(connection, query.sql, query.params);
    if (r[0]['OBJECT_COUNT'] === 0) {
      await dbService.closeConnection(connection);
      res.status(404).send("No objects match the owner + object_type combination");
      return;
    }

    // Get the list of object types
    query = sql.statement['LIST_DBA_OBJECTS'];
    let filtered_name = req.params.name.replace('*', '%').replace('_', '\\_');
    let filtered_status = req.params.status.toUpperCase();
    if (filtered_status !== 'VALID' &&
      filtered_status !== 'INVALID') {
      filtered_status = '%';
    }
    query.params.owner.val = req.params.owner;
    query.params.object_type.val = req.params.type;
    query.params.object_name.val = filtered_name;
    query.params.status.val = filtered_status;

    const result = await dbService.query(connection, query.sql, query.params);
    let objectList = [];
    result.forEach(element => {
      objectList.push(element.OBJECT_NAME);
    });
    await dbService.closeConnection(connection);
    res.status(200).json(objectList);

  } catch (err) {
    logger.log('error', `controller.js listObjects connection failed for ${poolAlias}`);
    res.status(503).send(`Database connection failed for ${poolAlias}`);
    next(err);
  }
}

module.exports.listObjects = listObjects;

////////////////////////////////////////////////////////////////////////////////
// Show object details
////////////////////////////////////////////////////////////////////////////////

/**
 * Run object detail queries
 * @param {*} poolAlias - database connection
 * @param {*} owner - schema
 * @param {*} object_type - database object type
 * @param {*} object_name - database object name
 */
async function getObjectDetails(poolAlias, owner, object_type, object_name) {
  let query = sql.statement['OBJECT-DETAILS'];
  query.params.owner.val = owner;
  query.params.object_type.val = object_type;
  query.params.object_name.val = object_name;

  const connection = await dbService.getConnection(poolAlias);
  const r = await dbService.query(connection, query.sql, query.params);
  if (!r[0]) {
    await dbService.closeConnection(connection);
    return ('404');
  }
  let result = [{ title: query.title, description: query.description, display: query.display, rows: r }];
  if (r[0]['Status'] === 'INVALID') {
    query = sql.statement['ERRORS'];
    query.params.owner.val = owner;
    query.params.object_type.val = object_type;
    query.params.object_name.val = object_name;
    const e = await dbService.query(connection, query.sql, query.params);
    result.push({ title: query.title, description: query.description, display: query.display, rows: e });
  }

  // Store the object_id for  use in queries that require it
  const object_id = r[0]['OBJECT_ID'];

  let queryCollection = sql.collection[object_type];
  if (queryCollection) {
    for (let c of queryCollection.objectNameQueries) {
      c.params.owner.val = owner;
      c.params.object_name.val = object_name;
      const cResult = await dbService.query(connection, c.sql, c.params);
      result.push({ title: c.title, description: c.description, display: c.display, link: c.link, rows: cResult });
    }
    for (let c of queryCollection.objectIdQueries) {
      c.params.object_id.val = object_id;
      const cResult = await dbService.query(connection, c.sql, c.params);
      result.push({ title: c.title, description: c.description, display: c.display, link: c.link, rows: cResult });
    }

    for (let c of queryCollection.objectTypeQueries) {
      c.params.owner.val = owner;
      c.params.object_type.val = object_type;
      c.params.object_name.val = object_name;
      const cResult = await dbService.query(connection, c.sql, c.params);
      result.push({ title: c.title, description: c.description, display: c.display, rows: cResult });
      if (c.callback) {
        switch (c.callback) {
          case 'extractSqlStatements':
            result.push({
              title: 'SQL Statements',
              description: `Source lines that include the word: select, insert, update, delete, merge,
                                          create, alter, drop, truncate, lock, grant or revoke`,
              display: ["Line", "Statement"],
              rows: util.extractSqlStatements(cResult)
            });
            break;
        }
      }
    }
  }


/**
 * If object_type source is stored in sys.source$ find the line numbers for each  "uses" dependency
 */
  ['PROCEDURE', 'FUNCTION', 'PACKAGE', 'PACKAGE BODY', 'TRIGGER', 'TYPE', 'TYPE BODY', 'LIBRARY', 'ASSEMBLY']
    .includes(object_type) ? queryCollection = sql.collection['DEPENDENCIES'] :
    queryCollection = sql.collection['DEPENDENCIES-NOSOURCE'];

  for (let c of queryCollection.objectNameIdQueries) {
    c.params.object_id.val = object_id;
    c.params.object_name.val = object_name;
    const cResult = await dbService.query(connection, c.sql, c.params);
    result.push({ title: c.title, description: c.description, display: c.display, link: c.link, rows: cResult });
  }
  for (let c of queryCollection.objectIdQueries) {
    c.params.object_id.val = object_id;
    const cResult = await dbService.query(connection, c.sql, c.params);
    result.push({ title: c.title, description: c.description, display: c.display, link: c.link, rows: cResult });
  }
  await dbService.closeConnection(connection);
  return result;
}

/**
 * Implements GET /:db/:owner/:type/:name endpoint
 * @param {*} req - request
 * @param {*} res - reponse
 * @param {*} next - next matching route
 */

async function showObject(req, res, next) {
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(401).send("Requested database was not found");
    return;
  }
  const objectDetails = await getObjectDetails(
    poolAlias, req.params.owner, req.params.type, req.params.name
  ).catch((error) => {
    logger.log('error',
      `controller.js showObject() failed for ${poolAlias}, ${req.params.owner}, ${req.params.type}, ${req.params.name}`);
    logger.log('error', error);
    res.status(503).send(`Database connection failed for ${poolAlias}`);
    next(error);
  });
  objectDetails === '404' ?
    res.status(404).send('Database object was not found') : res.status(200).json(objectDetails);
}

module.exports.showObject = showObject;


////////////////////////////////////////////////////////////////////////////////
// Object collections
////////////////////////////////////////////////////////////////////////////////

async function getUsesDependencies(connection, object) {
  query = sql.statement['USES-OBJECTS-NOLINE'];
  query.params.object_id.val = object['OBJECT_ID'];
  const result = await dbService.query(connection, query.sql, query.params);
  return result;
}

/**
 * Implements POST /collection/:db endpoint.   Returns a list of matched objects
 * @param {*} req - request
 * @param {*} res - reponse
 * @param {*} next - next matching route
 */
async function getCollection(req, res, next) {
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(401).send("Requested database was not found");
    return;
  }
  const connection = await dbService.getConnection(poolAlias);

  /**
   * Process each owner/type/name/status object in the POST body.
   * Find matching objects + their "Uses" dependencies. Stringify the
   * result and store in a Set to remove duplicate entries. Create a Map
   * of uses dependencies keyed on the object_id
   */

  let objectIdSet = new Set();
  let consolidatedSet = new Set();
  let dependencyMap = new Map();
  let result;

  for (let object of req.body) {
    const objectList = await getObjectList(connection, object.owner, object.type, object.name, object.status);

    for (let object of objectList) {
      objectIdSet.add(object.OBJECT_ID);
      consolidatedSet.add(JSON.stringify(object));
      let dependencies = await getUsesDependencies(connection, object);

      for (let d of dependencies) {
        consolidatedSet.add(JSON.stringify(d));
        if (dependencyMap.has(d.OBJECT_ID)) {
          let value = dependencyMap.get(d.OBJECT_ID);
          value.push(object);
          dependencyMap.set(d.OBJECT_ID, value);
        } else {
          dependencyMap.set(d.OBJECT_ID, [object]);
        }
      }
    }

    /**
     * Create an object from the stringified Set entries. Add a "USED_BY"
     * property to dependent objects to identify the primary objects that use them.
     */
    const depArr = Array.from(consolidatedSet);

    result = depArr.map(entry => {
      let obj = JSON.parse(entry);
      if (dependencyMap.has(obj.OBJECT_ID) && !objectIdSet.has(obj.OBJECT_ID)) {
        obj.USED_BY = dependencyMap.get(obj.OBJECT_ID)
      }
      return obj;
    });
  }

  await dbService.closeConnection(connection);
  res.status(200).json(result);
}
module.exports.getCollection = getCollection;

