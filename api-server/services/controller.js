/*!
 * Copyright 2019, 2020 Visulate LLC. All Rights Reserved.
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
const dbConstants = require('../config/db-constants');
const e = require('express');

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

async function endpoints(filter) {
  let query = sql.statement['COUNT_DBA_OBJECTS'];
  if (filter && filter !== '*'){
    query = sql.statement['COUNT_DBA_OBJECTS_FILTER'];
    query.params.object_name = filter.toString().toUpperCase().replace('*', '%').replace('_', '\\_');
  }

  let rows = [];
  for (const ep of dbConfig.endpoints) {
    try {
      const result = await dbService.simpleExecute(ep.connect.poolAlias, query.sql, query.params);
      if (result.length > 0) {
        const endpoint = formatEndpoint(ep, result);
        rows.push(endpoint);
      }
    } catch (err) {
      logger.log('error', `controller.js endpoints() connection failed for ${ep.connect.poolAlias}`);
    }
  }
  return rows;
}
/**
 * Implements GET /
 * @param {*} req - request
 * @param {*} res - response
 * @param {*} next - next matching route
 */
async function getEndpoints(req, res, next) {
  try {
    const filter= req.query.filter;
    const databaseList = await endpoints(filter);
    res.status(200).json({ endpoints: databaseList });
  } catch (err) {
    next(err);
  }
}

module.exports.getEndpoints = getEndpoints;

/**
 * Implements GET /endpoints
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 */

async function getEndpointConnections(req, res, next) {
  try {
    const filter= req.query.filter;
    const databaseList = await endpoints(filter);
    let endpointConnections = {}
    databaseList.forEach(entry => {
      let key = entry.endpoint;
      let value = entry.connectString;
      endpointConnections[key] = value;
    });
      

    res.status(200).json(endpointConnections);
  } catch (err) {
    next(err);
  }
}
module.exports.getEndpointConnections = getEndpointConnections;

async function executeSearch(searchCondition) {
  let query = sql.statement['FIND-DBA-OBJECTS']
  query.params.object_name = searchCondition.toUpperCase();
  let rows = [];
  for (const ep of dbConfig.endpoints) {
    try {
      const result = await dbService.simpleExecute(ep.connect.poolAlias, query.sql, query.params);
      rows.push({database: ep.namespace, objects: result});
    } catch (err) {
      logger.log('error', `controller.js executeSearch() failed for ${ep.connect.poolAlias}`);    }
  }
  return rows;
}
/**
 * Implements /find/:name
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */

async function dbSearch(req, res, next) {
  try {
    const searchCondition = req.params.name;
    const rows = await executeSearch(searchCondition);
    res.status(200).json({find: searchCondition, result: rows});
  } catch (err) {
    next(err);
  }
}
module.exports.dbSearch = dbSearch;

/**
 * Implements GET /api/:db endpoint.
 * @param {*} req - request
 * @param {*} res - reponse
 * @param {*} next - next matching route
 */

async function getDbDetails(req, res, next) {
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
    return;
  }

  let queryCollection = sql.collection['DATABASE'];
  let result = [];
  const connection = await dbService.getConnection(poolAlias);
  for (let c of queryCollection.noParamQueries) {
    const cResult = await dbService.query(connection, c.sql, c.params);
    result.push({ title: c.title, description: c.description, display: c.display, link: c.link, rows: cResult });
  }
  await dbService.closeConnection(connection);
  res.status(200).json(result);
}
module.exports.getDbDetails = getDbDetails;

/**
 * Implements GET /api/:db/:owner endpoint.
 * @param {*} req - request
 * @param {*} res - reponse
 * @param {*} next - next matching route
 */
async function getSchemaDetails(req, res, next) {
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
    return;
  }
  let queryCollection = sql.collection['SCHEMA'];
  let result = [];
  let connection = await dbService.getConnection(poolAlias);
  for (let c of queryCollection.ownerNameQueries) {
    c.params.owner.val = req.params.owner;
    const cResult = await dbService.query(connection, c.sql, c.params);
    result.push({ title: c.title, description: c.description, display: c.display, link: c.link, rows: cResult });
  }
  await dbService.closeConnection(connection);


  // Queries that support object_name filters
  const filter = req.query.filter;
  queryCollection = sql.collection['SCHEMA-FILTERED'];
  connection = await dbService.getConnection(poolAlias);
  for (let c of queryCollection.ownerNameQueries) {
    c.params.owner.val = req.params.owner;
    if (filter){
      c.params.object_name.val = filter.toString().toUpperCase().replace('*', '%').replace('_', '\\_');
    }
    const cResult = await dbService.query(connection, c.sql, c.params);
    result.push({ title: c.title, description: c.description, display: c.display, link: c.link, rows: cResult });
  }
  await dbService.closeConnection(connection);
  result[0].rows.length === 0? res.status(404).send("Invalid database username"): res.status(200).json(result);
}
module.exports.getSchemaDetails = getSchemaDetails;


////////////////////////////////////////////////////////////////////////////////
// List object for a given database, schemea, object type and filter conditions
////////////////////////////////////////////////////////////////////////////////
async function getObjectList(connection, owner, type, name, status, query) {
  // Get the list of object types
  query = sql.statement[query];
  const filtered_name = name.toString().toUpperCase().replace('*', '%').replace('_', '\\_');
  const filtered_type = type.toString().replace('*', '%');
  let filtered_status = status.toString().toUpperCase();
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


/**
 * Implements GET /api/:db/:owner/:type and /api/:db/:owner/:type/:name/:status endpoints.
 * The first form returns a list of objects for the given db, owner and type combination.
 * The second allows this list to be filtered by status or name wildcard (e.g. AR_*)
 * @param {*} req - request
 * @param {*} res - reponse
 * @param {*} next - next matching route
 */
async function listObjects(req, res, next) {

  // Validate the database parameter
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
    return;
  }
  try {
    /**
     * Get the list of object types.
     * Use default values for name and status for GET /api/:db/:owner/:type calls
     */
    let name = req.params.name? req.params.name : '*';
    if (name === '*' && req.query.filter) {
      name = req.query.filter;
    }
    const status = req.params.status? req.params.status : '*';

    const connection = await dbService.getConnection(poolAlias);
    const result = await getObjectList(connection, req.params.owner, req.params.type, name, status, 'LIST_DBA_OBJECTS');
    await dbService.closeConnection(connection);

    if (result.length === 0) {
      res.status(404).send("No objects found for the requested owner, type, name and status");
    } else {
      let objectList = [];
      result.forEach(element => { objectList.push(element.OBJECT_NAME); });
      res.status(200).json(objectList);
    }


  } catch (err) {
    logger.log('error', `controller.js listObjects connection failed for ${poolAlias}`);
    res.status(503).send(`Database connection failed for ${poolAlias}`);
    next(err);
  }
}

module.exports.listObjects = listObjects;

/**
 * Call DBMS_METADATA to generate DLL
 * @param {*} req - request
 * @param {*} res - reponse
 * @param {*} next - next matching route
 */

async function generateDDL(req, res, next) {
  if (dbConstants.values.internalSchemas.includes(req.params.owner)){
    res.status(403).send("DDL generation not supported for Oracle internal objects");
    return;
  }
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
    return;
  }

  try {
    let name = req.params.name? req.params.name : '*';
    if (name === '*' && req.query.filter) {
      name = req.query.filter;
    }
    const status = req.params.status? req.params.status : '*';

    const connection = await dbService.getConnection(poolAlias);
    const result = await getObjectList(connection, req.params.owner, req.params.type, name, status, 'DDL-GEN');
    await dbService.closeConnection(connection);

    if (result.length === 0) {
      res.status(404).send("No objects found for the requested owner, type, name and status");
    } else {
      res.set({"Content-Disposition":"attachment; filename=\"ddl.sql\""})
      result.forEach(element => { res.write(element.DDL) });
      res.status(200).send();
    }


  } catch (err) {
    logger.log('error', `controller.js generateDDL connection failed for ${poolAlias}`);
    res.status(503).send(`Database connection failed for ${poolAlias}`);
    next(err);
  }

}
module.exports.generateDDL = generateDDL;

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
  let r = await dbService.query(connection, query.sql, query.params);
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
   * Dependency queries do not work in an Oracle Autonomous database instance.
   * Need to write custom queries for ADB that do not access internal sys tables.
   * The current queries do this to improve performance and as a workaround to
   * limits on the number of outer joins in a single query (the DBA_ views include
   * outer joins in their source)
   *
   * */

  query = sql.statement['ADB-YN'];
  r = await dbService.query(connection, query.sql, query.params);
  const absDb = (r[0]['Autonomous Database'] === 'Yes')? true: false;

  if (! absDb ) {
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

}
  await dbService.closeConnection(connection);
  return result;
}

/**
 * Implements GET /api/:db/:owner/:type/:name endpoint
 * @param {*} req - request
 * @param {*} res - reponse
 * @param {*} next - next matching route
 */

async function showObject(req, res, next) {
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
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
  query = sql.statement['DEPENDS-ON'];
  query.params.object_id.val = object['OBJECT_ID'];
  const result = await dbService.query(connection, query.sql, query.params);
  return result;
}

/**
 * Implements POST /api/collection/:db endpoint.   Returns a list of matched objects
 * @param {*} req - request
 * @param {*} res - reponse
 * @param {*} next - next matching route
 */
async function getCollection(req, res, next) {
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
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
    const objectList = await getObjectList(connection, object.owner, object.type, object.name, object.status, 'LIST_DBA_OBJECTS');

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
     * Create an object from the stringified Set entries. Add a "REQUIRED_BY"
     * property to dependent objects to identify the primary objects that use them.
     */
    const depArr = Array.from(consolidatedSet);

    result = depArr.map(entry => {
      let obj = JSON.parse(entry);
      if (dependencyMap.has(obj.OBJECT_ID) && !objectIdSet.has(obj.OBJECT_ID)) {
        obj.REQUIRED_BY = dependencyMap.get(obj.OBJECT_ID)
      }
      return obj;
    });
  }

  await dbService.closeConnection(connection);
  res.status(200).json(result);
}
module.exports.getCollection = getCollection;

