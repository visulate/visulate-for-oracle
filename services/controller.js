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
const endpointList = getEndpointList(dbConfig.endpoints);

/**
 * Gets a list of endpoints
 * @returns an endpoint to pool alias  dictionary 
 */
function getEndpointList(endpoints){
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
    const result = await dbService.simpleExecute(ep.connect.poolAlias, query);
    const endpoint = formatEndpoint(ep, result.rows);
    rows.push(endpoint);
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
async function listObjects(req, res, next) {

  // Validate the database parameter 
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(404).send("Requested database was not found");
    return;
  }
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
}

module.exports.listObjects = listObjects;

////////////////////////////////////////////////////////////////////////////////
// Show object details
////////////////////////////////////////////////////////////////////////////////

async function getObjectDetails(poolAlias, owner, object_type, object_name) {
  let query = sql.statement['OBJECT-DETAILS'];
  query.params.owner.val = owner;
  query.params.object_type.val = object_type;
  query.params.object_name.val = object_name;

  const connection = await dbService.getConnection(poolAlias);
  const r = await dbService.query(connection, query.sql, query.params);
  if (!r[0]) {
    await dbService.closeConnection(connection);
    return('404');
  }

  // Store the object_id for  use in queries that require it
  const object_id = r[0]['OBJECT_ID'];
  let result = [{ title: query.title, description: query.description, display: query.display, rows: r }];
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
    }
  }

  queryCollection = sql.collection['DEPENDENCIES'];
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

async function showObject(req, res, next) {
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(401).send("Requested database was not found");
    return;
  }
  const objectDetails = await getObjectDetails(
    poolAlias, req.params.owner, req.params.type, req.params.name
  ).catch((error) => {
    console.error(error);
    res.status(500).json(error);
  });
  objectDetails === '404'?  
    res.status(404).send('Database object was not found'): res.status(200).json(objectDetails);
}

module.exports.showObject = showObject;