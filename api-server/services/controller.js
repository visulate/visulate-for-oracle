/*!
 * Copyright 2019, 2024 Visulate LLC. All Rights Reserved.
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
const httpConfig = require('../config/http-server.js');
const dbService = require('./database.js');
const sql = require('./sql-statements');
const logger = require('./logger.js');
const util = require('./util');
const endpointList = getEndpointList(dbConfig.endpoints);
const dbConstants = require('../config/db-constants');
const templateEngine = require('./template-engine');
const async = require('async');
const { GoogleGenerativeAI } = require("@google/generative-ai");




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

  if (filter && filter !== '*') {
    query = sql.statement['COUNT_DBA_OBJECTS_FILTER'];
    query.params.object_name = filter.toString().toUpperCase().replace('*', '%').replace('_', '\\_');
  }

  const rows = [];
  await async.each (dbConfig.endpoints, async function (ep) {
    try {
      const result = await dbService.simpleExecute(ep.connect.poolAlias, query.sql, query.params);
      if (result.length > 0) {
        const endpoint = formatEndpoint(ep, result);
        rows.push(endpoint);
      }
    } catch (err) {
      logger.log('error', `controller.js endpoints() connection failed for ${ep.connect.poolAlias}`);
    }
  });

  return rows.sort(function(a, b) {
    const endpointA = a.endpoint.toUpperCase();
    const endpointB = b.endpoint.toUpperCase();
    if (endpointA < endpointB) { return -1; }
    if (endpointA > endpointB) { return 1; }
    return 0;
  });
}
/**
 * Implements GET /
 * @param {*} req - request
 * @param {*} res - response
 * @param {*} next - next matching route
 */
async function getEndpoints(req, res, next) {
  try {
    const filter = req.query.filter;
    const databaseList = await endpoints(filter);
    res.status(200).json({ endpoints: databaseList });
  } catch (err) {
    logger.log('error', 'Failed to get endpoints');
    logger.log('error', err);
    res.status(503).send(err);
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
  const connectionStatus = req.query.status;
  let validConnections = [];
  let invalidConnections = [];

  try {
    for (let ep of dbConfig.endpoints) {
      try {
        await dbService.pingConnection(ep.connect.poolAlias);
        validConnections.push(ep)
      } catch (err) {
        ep['error'] = err.message;
        invalidConnections.push(ep);
      }
    }

    let endpointConnections = {}
    validConnections.forEach(entry => {
      let key = entry.namespace;
      let value = entry.connect.connectString;
      endpointConnections[key] = value;
    });

    let invalidEndpointConnections = {}
    invalidConnections.forEach(entry => {
      let key = entry.namespace;
      let value = {
        connectString: entry.connect.connectString,
        error: entry.error
      };
      invalidEndpointConnections[key] = value;
    });

    (connectionStatus === 'invalid') ?
      res.status(200).json(invalidEndpointConnections) :
      res.status(200).json(endpointConnections);
  } catch (err) {
    logger.log('error', 'Failed to get endpoint connections');
    logger.log('error', err);
    res.status(503).send(err);
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
      if (result) {
        rows.push({ database: ep.namespace, objects: result });
      }
    } catch (err) {
      logger.log('error', `controller.js executeSearch() failed for ${ep.connect.poolAlias}`);
    }
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
    res.status(200).json({ find: searchCondition, result: rows });
  } catch (err) {
    logger.log('error', `Database search failed for ${req.params.name}`);
    logger.log('error', err);
    res.status(503).send(err);
    next(err);
  }
}
module.exports.dbSearch = dbSearch;

/**
 * Implements GET /api/:db endpoint.
 * @param {*} req - request
 * @param {*} res - response
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
  let connection;
  try {
    connection = await dbService.getConnection(poolAlias);
    for (let c of queryCollection.noParamQueries) {
      const cResult = await dbService.query(connection, c.sql, c.params);
      result.push({ title: c.title, description: c.description, display: c.display, link: c.link, rows: cResult });
    }
    res.status(200).json(result);
  } catch (err) {
    logger.log('error', `Failed to get database details for ${req.params.db}`);
    logger.log('error', err);
    res.status(503).send(err);
    next(err);
  } finally {
    if (connection) {
      try {
        await dbService.closeConnection(connection);
      } catch (err) {
        logger.log('error', err);
      }
    }
  }
}
module.exports.getDbDetails = getDbDetails;

/**
 * Implements GET /api/:db/:owner endpoint.
 * @param {*} req - request
 * @param {*} res - response
 * @param {*} next - next matching route
 */
async function getSchemaDetails(req, res, next) {
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
    return;
  }
  let connection;
  try {
    let queryCollection = sql.collection['SCHEMA'];
    let result = [];
    connection = await dbService.getConnection(poolAlias);
    for (let c of queryCollection.ownerNameQueries) {
      c.params.owner.val = req.params.owner;
      const cResult = await dbService.query(connection, c.sql, c.params);
      result.push({ title: c.title, description: c.description, display: c.display, link: c.link, rows: cResult });
    }

    // Queries that support object_name filters
    const filter = req.query.filter;
    queryCollection = sql.collection['SCHEMA-FILTERED'];
    for (let c of queryCollection.ownerNameQueries) {
      c.params.owner.val = req.params.owner;
      c.params.object_name.val = (filter) ? filter.toString().toUpperCase().replace('*', '%').replace('_', '\_') : '%';
      const cResult = await dbService.query(connection, c.sql, c.params);
      result.push({ title: c.title, description: c.description, display: c.display, link: c.link, rows: cResult });
    }
    result[0].rows.length === 0 ? res.status(404).send("Invalid database username") : res.status(200).json(result);
  } catch (err) {
    logger.log('error', `Failed to get schema details for ${req.params.db}/${req.params.owner}`);
    logger.log('error', err);
    res.status(503).send(err);
    next(err);
  } finally {
    if (connection) {
      try {
        await dbService.closeConnection(connection);
      } catch (err) {
        logger.log('error', err);
      }
    }
  }
}
module.exports.getSchemaDetails = getSchemaDetails;


////////////////////////////////////////////////////////////////////////////////
// List object for a given database, schema, object type and filter conditions
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
 * @param {*} res - response
 * @param {*} next - next matching route
 */
async function listObjects(req, res, next) {

  // Validate the database parameter
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
    return;
  }
  let connection;
  try {
    /**
     * Get the list of object types.
     * Use default values for name and status for GET /api/:db/:owner/:type calls
     */
    let name = req.params.name ? req.params.name : '*';
    if (name === '*' && req.query.filter) {
      name = req.query.filter;
    }
    const status = req.params.status ? req.params.status : '*';

    connection = await dbService.getConnection(poolAlias);
    const result = await getObjectList(connection, req.params.owner, req.params.type, name, status, 'LIST_DBA_OBJECTS');

    if (result.length === 0) {
      res.status(404).send("No objects found for the requested owner, type, name and status");
    } else {
      let objectList = [];
      result.forEach(element => { objectList.push(element.OBJECT_NAME); });
      if (req.query.template) {
        try {
          const templateResult = await templateEngine.applyTemplate('list', objectList, req);
          if (typeof (templateResult) === "string") { res.type('txt'); }
          res.status(200).send(templateResult);
        } catch (err) {
          logger.log('error', `Template application failed for ${req.query.template}`);
          logger.log('error', err);
          res.status(404).send(err);
          next(err);
        }
      } else {
        res.status(200).json(objectList);
      }
    }
  } catch (err) {
    logger.log('error', `controller.js listObjects connection failed for ${poolAlias}`);
    res.status(503).send(`Database connection failed for ${poolAlias}`);
    next(err);
  } finally {
    if (connection) {
      try {
        await dbService.closeConnection(connection);
      } catch (err) {
        logger.log('error', err);
      }
    }
  }
}

module.exports.listObjects = listObjects;

/**
 * Call DBMS_METADATA to generate DLL
 * @param {*} req - request
 * @param {*} res - response
 * @param {*} next - next matching route
 */

async function generateDDL(req, res, next) {
  if (dbConstants.values.internalSchemas.includes(req.params.owner)) {
    res.status(403).send("DDL generation not supported for Oracle internal objects");
    return;
  }
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
    return;
  }
  let connection;
  try {
    let name = req.params.name ? req.params.name : '*';
    if (name === '*' && req.query.filter) {
      name = req.query.filter;
    }
    const status = req.params.status ? req.params.status : '*';

    connection = await dbService.getConnection(poolAlias);
    const result = await getObjectList(connection, req.params.owner, req.params.type, name, status, 'DDL-GEN');

    if (result.length === 0) {
      res.status(404).send("No objects found for the requested owner, type, name and status");
    } else {
      res.set({ "Content-Disposition": "attachment; filename=\"ddl.sql\"" })
      result.forEach(element => { res.write(element.DDL) });
      res.status(200).send();
    }


  } catch (err) {
    logger.log('error', `controller.js generateDDL connection failed for ${poolAlias}`);
    res.status(503).send(`Database connection failed for ${poolAlias}`);
    next(err);
  } finally {
    if (connection) {
      try {
        await dbService.closeConnection(connection);
      } catch (err) {
        logger.log('error', err);
      }
    }
  }
}
module.exports.generateDDL = generateDDL;

////////////////////////////////////////////////////////////////////////////////
// Show object details
////////////////////////////////////////////////////////////////////////////////

async function getDependencies(connection, sql, dbService, owner, object_type, object_name, object_id) {
  let result = [];
  const query = sql.statement['ADB-YN'];
  const r = await dbService.query(connection, query.sql, query.params);
  const absDb = (r[0]['Autonomous Database'] === 'Yes') ? true : false;

  if (absDb) { // Autonomous DB query dba_dependencies
    const queryCollection = sql.collection['DEPENDENCIES-ADB'];
    for (let c of queryCollection.objectTypeQueries) {
      c.params.owner.val = owner;
      c.params.object_type.val = object_type;
      c.params.object_name.val = object_name;
      const cResult = await dbService.query(connection, c.sql, c.params);
      result.push({ title: c.title, description: c.description, display: c.display, link: c.link, rows: cResult });
    }
  } else { // Query dependency$ table
    /**
     * If object_type source is stored in sys.source$ find the line numbers for each  "uses" dependency
     */
    const queryCollection = ['PROCEDURE', 'FUNCTION', 'PACKAGE', 'PACKAGE BODY', 'TRIGGER', 'TYPE', 'TYPE BODY', 'LIBRARY', 'ASSEMBLY']
      .includes(object_type) ? sql.collection['DEPENDENCIES'] : sql.collection['DEPENDENCIES-NOSOURCE'];

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

  return result;
}

/**
 * Run object detail queries
 * @param {*} poolAlias - database connection
 * @param {*} owner - schema
 * @param {*} object_type - database object type
 * @param {*} object_name - database object name
 * @param {boolean} [include_dependencies=true] - whether to include dependencies
 */
async function getObjectDetails(poolAlias, owner, object_type, object_name, include_dependencies = true) {
  let query = sql.statement['OBJECT-DETAILS'];
  query.params.owner.val = owner;
  query.params.object_type.val = object_type;
  query.params.object_name.val = object_name;

  let connection;
  try {
    connection = await dbService.getConnection(poolAlias);
    let r = await dbService.query(connection, query.sql, query.params);
    if (!r[0]) {
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
      for (let c of queryCollection.objectTypeQueries) {
        c.params.owner.val = owner;
        c.params.object_type.val = object_type;
        c.params.object_name.val = object_name;
        const cResult = await dbService.query(connection, c.sql, c.params);
        if (c.then && object_type !== 'PACKAGE') {
          switch (c.then) {
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
        result.push({ title: c.title, description: c.description, display: c.display, rows: cResult });
      }
      for (let c of queryCollection.objectIdQueries) {
        c.params.object_id.val = object_id;
        const cResult = await dbService.query(connection, c.sql, c.params);
        //
        if (object_type === 'PACKAGE' && c.title === 'Arguments') {
          const procedures = util.groupRows(cResult, 'OBJECT_NAME');
          procedures.forEach(p => {
            result.push({ title: c.title, description: p.id, display: c.display, link: c.link, rows: p.rows });
          });
        } else {
          result.push({ title: c.title, description: c.description, display: c.display, link: c.link, rows: cResult });
        }
      }
    }

    if (include_dependencies) {
      const dependencies = await getDependencies(connection, sql, dbService, owner, object_type, object_name, object_id);
      result.push(...dependencies);
    }
    return result;
  } finally {
    if (connection) {
      try {
        await dbService.closeConnection(connection);
      } catch (err) {
        logger.log('error', err);
      }
    }
  }
}

/**
 * Implements GET /api/:db/:owner/:type/:name endpoint
 * @param {*} req - request
 * @param {*} res - response
 * @param {*} next - next matching route
 */


async function showObject(req, res, next) {
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
    return;
  }

  try {
    const objectDetails = await getObjectDetails(
      poolAlias, req.params.owner, req.params.type, req.params.name
    );

    if (objectDetails === '404') {
      res.status(404).send('Database object was not found');
    } else if (req.query.template) {
      try {
        const result = await templateEngine.applyTemplate('object', objectDetails, req);
        if (typeof (result) === "string") { res.type('txt'); }
        res.status(200).send(result);
      } catch (err) {
        logger.log('error', `Template application failed for ${req.query.template}`);
        logger.log('error', err);
        res.status(404).send(err);
        next(err);
      }
    } else {
      res.status(200).json(objectDetails);
    }
  } catch (error) {
    logger.log('error',
      `controller.js showObject() failed for ${poolAlias}, ${req.params.owner}, ${req.params.type}, ${req.params.name}`);
    logger.log('error', error);
    res.status(503).send(`Database connection failed for ${poolAlias}`);
    next(error);
  }
}
module.exports.showObject = showObject;

/**
 * Implements POST /api/:db/:owner/:type/:name endpoint
 * Transform the object details using a handlebars template
 * @param {*} req - request
 * @param {*} res - response
 */

async function transformObject(req, res, next) {
  const objectDetails = req.body
  if (req.query.template) {
    try {
      const result = await templateEngine.applyTemplate('object', objectDetails, req);
      if (typeof (result) === "string") { res.type('txt'); }
      res.status(200).send(result);
    } catch (err) {
      logger.log('error', `Object transformation failed for template ${req.query.template}`);
      logger.log('error', err);
      res.status(404).send(err);
      next(err);
    }
  } else {
    res.status(400).send("Missing template parameter");
  }
}
module.exports.transformObject = transformObject;


////////////////////////////////////////////////////////////////////////////////
// Object collections
////////////////////////////////////////////////////////////////////////////////

async function getObjectReferences(req, res, next) {
  const { object, baseDB, relatedObjects } = req.body;
  const results = [];

  try {
    for (const obj of relatedObjects) {
      if (obj !== object) {
        const [owner, object_type, object_name] = obj.split('/');
        const details = await getObjectDetails(
          baseDB, owner, object_type, object_name, false
        );
        // push the object details to the results array as a key value pair with
        // ${baseDB}.${owner}.${object_type}.${object_name} as the key
        if (details !== '404') {
          results.push({ [`${baseDB}.${owner}.${object_type}.${object_name}`]: details });
        }
      }
    }
    res.status(200).json(results);
  } catch (error) {
    logger.log('error',
      `controller.js getObjectReferences() failed for ${baseDB}`);
    logger.log('error', error);
    res.status(503).send(`Database connection failed for ${baseDB}`);
    next(error);
  }
}

module.exports.getObjectReferences = getObjectReferences;


async function getUsesDependencies(connection, object) {
  query = sql.statement['DEPENDS-ON'];
  query.params.object_id.val = object['OBJECT_ID'];
  const result = await dbService.query(connection, query.sql, query.params);
  return result;
}

/**
 * Implements POST /api/collection/:db endpoint.   Returns a list of matched objects
 * @param {*} req - request
 * @param {*} res - response
 * @param {*} next - next matching route
 */
async function getCollection(req, res, next) {
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
    return;
  }
  let connection;
  try {
    connection = await dbService.getConnection(poolAlias);

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
    res.status(200).json(result);
  } catch (err) {
    logger.log('error', `Failed to get collection for ${req.params.db}`);
    logger.log('error', err);
    res.status(503).send(err);
    next(err);
  }
  finally {
    if (connection) {
      try {
        await dbService.closeConnection(connection);
      } catch (err) {
        logger.log('error', err);
      }
    }
  }
}
module.exports.getCollection = getCollection;

/**
 * Implements GET /ai endpoint.
 * Returns true if httpConfig.googleAiKey is set and false otherwise
 * @param {*} req - request
 * @param {*} res - response
 */
function aiEnabled(req, res) {
  if (httpConfig.googleAiKey) {
    res.status(200).json({enabled: true});
  } else {
    res.status(200).json({enabled: false});
  }
}
module.exports.aiEnabled = aiEnabled;


/**
 * Implements POST /ai/ endpoint.  Calls Google AI to generate text
 * @param {*} req - request
 * @param {*} res - response
 */
async function generativeAI(req, res, next) {
  // Create a new instance of the GoogleGenerativeAI class if the GOOGLE_AI_KEY is set
  if (httpConfig.googleAiKey) {
    try {
      const genAI = new GoogleGenerativeAI(httpConfig.googleAiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: `You are a database architect called Visulate. You responsible for the design of an oracle database.
     You have access to a tool that generates json documents describing database objects and
     their related objects. The json documents follow a predictable structure for each database object.
     Each object comprises an array of properties. These properties vary by object type. but follow a
     consistent pattern. Title, description and display elements are followed by a list of rows. The display
     property lists items from the rows that should be displayed in a user interface.

     The context object for this exercise will include 2 objects. The first one will be called "objectDetails"
     and will contain the details of a database object that the user would like to ask questions about.
     The second object will be called "relatedObjects". It will contain a list of objects that are related to the
     objectDetails object. An additional object called "chatHistory" will contain the conversation history.

     Do not mention the JSON document in your response.

     Assume any questions the user asks are be about the objectDetails object unless the question states otherwise.
     Use the relatedObjects objects to provide context for the answers. Try to be expansive in your answers where
     appropriate. For example, if the user asks for a SQL statement for a table include the table's columns and
     join conditions to related tables in the response.`
      });

      let contextText;
      if (typeof req.body.context === 'object') {
        contextText = JSON.stringify(req.body.context);
      } else {
        contextText = req.body.context;
      }

      const prompt = `${req.body.message} \n\n ${contextText}`;
      const result = await model.generateContent(prompt);
      res.status(200).json(result.response.text());
    } catch (err) {
      logger.log('error', 'Generative AI request failed');
      logger.log('error', err);
      res.status(503).send(err);
      next(err);
    }
  } else {
    res.status(503).send("Google AI key is not set");
  }
}
module.exports.generativeAI = generativeAI;
