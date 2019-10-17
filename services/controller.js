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
const endpointList = dbConfig.getEndpointList();

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
  const query = sql['COUNT_DBA_OBJECTS'].sql;
  let rows = [];
  for (const ep of dbConfig.endpoints) {
     const result = await dbService.simpleExecute(ep.connect.poolAlias, query);
     const endpoint = formatEndpoint(ep,result.rows);
     rows.push(endpoint);
     }
  return rows;
}

async function getEndpoints(req, res, next) {
  try {
      const databaseList = await endpoints();
      res.status(200).json({endpoints: databaseList});
  } catch (err) {
    next(err);
  }
}

module.exports.getEndpoints = getEndpoints;

////////////////////////////////////////////////////////////////////////////////
// List object for a given database, schemea, object type and filter conditions
////////////////////////////////////////////////////////////////////////////////
async function listObjects(req, res, next) {
  const poolAlias = endpointList[req.params.db];
  if (!poolAlias) {
    res.status(401).send("Requested database was not found");
    return;
  }

  let query = sql['LIST_DBA_OBJECTS'];
  query.params.owner.val = req.params.owner;
  query.params.type.val = req.params.type;
  query.params.name.val = '%';
  query.params.status.val = '%';

  const result = await dbService.simpleExecute(poolAlias, query.sql, query.params);
  let objectList = [];
  result.rows.forEach(element => {
    objectList.push(element.OBJECT_NAME);
  });
  res.status(200).json(objectList);
}

module.exports.listObjects = listObjects;
