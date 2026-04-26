/*!
 * Copyright 2019, 2025 Visulate LLC. All Rights Reserved.
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

function loadDialect(dialect) {
  const schemaSql = require(`./sql/${dialect}/schema-queries`);
  const tableSql = require(`./sql/${dialect}/table-queries`);
  const typeSql = require(`./sql/${dialect}/type-queries`);
  const depSql = require(`./sql/${dialect}/dependency-queries`);
  
  const statement = Object.assign({}, schemaSql.statement, tableSql.statement, typeSql.statement, depSql.statement);
  
  let collection = {};
  
  collection['DATABASE'] = {
    noParamQueries: [
      statement['DB-VERSION'],
      statement['ADB-YN'],
      statement['EBS-SCHEMA'],
      statement['PATCHES'],
      statement['DB-LINKS'],
      statement['COUNT-INVALID-OBJECTS'],
      statement['DB-SGA-SIZE'],
      statement['DB-SGA-FREE'],
      statement['DB-SIZE'],
      statement['DB-SPACE-USED'],
      statement['DB-OS-STAT'],
      statement['DB-FEATURE-USAGE']
    ].filter(s => s !== undefined)
  };

  collection['SCHEMA'] = {
    ownerNameQueries: [
      statement['SCHEMA-USER'],
      statement['SCHEMA-SUMMARY'],
      statement['SCHEMA-GRANTS']
    ].filter(s => s !== undefined)
  };

  collection['SCHEMA-FILTERED'] = {
    ownerNameQueries: [
      statement['SCHEMA-DATATYPES'],
      statement['SCHEMA-INDEXES'],
      statement['SCHEMA-INVALID-OBJECTS']
    ].filter(s => s !== undefined)
  };

  collection['TABLE'] = {
    objectNameQueries: [
      statement['TABLE-DETAILS'],
      statement['TABLE-COMMENTS'],
      statement['TABLE-INDEXES'],
      statement['INDEX-FUNCTION'],
      statement['TABLE-KEYS'],
      statement['TABLE-COLUMNS'],
      statement['FK-IN-TABLE-NAME'],
      statement['FK-TO-TABLE-NAME']
    ].filter(s => s !== undefined),
    objectIdQueries: [],
    objectTypeQueries: []
  };

  collection['VIEW'] = {
    objectNameQueries: [
      statement['TABLE-DETAILS'],
      statement['TABLE-COMMENTS'],
      statement['TABLE-COLUMNS'],
      statement['VIEW-SOURCE']
    ].filter(s => s !== undefined),
    objectTypeQueries: [],
    objectIdQueries: []
  };

  collection['PACKAGE'] = {
    objectNameQueries: [],
    objectIdQueries: [
      statement['PROCEDURE-ARGS']
    ].filter(s => s !== undefined),
    objectTypeQueries: [
      statement['SOURCE']
    ].filter(s => s !== undefined)
  };

  collection['PACKAGE BODY'] = {
    objectNameQueries: [],
    objectIdQueries: [],
    objectTypeQueries: [
      statement['SOURCE']
    ].filter(s => s !== undefined)
  };

  collection['PROCEDURE'] = {
    objectNameQueries: [],
    objectIdQueries: [
      statement['PROCEDURE-ARGS']
    ].filter(s => s !== undefined),
    objectTypeQueries: [
      statement['SOURCE']
    ].filter(s => s !== undefined)
  };

  collection['FUNCTION'] = {
    objectNameQueries: [],
    objectIdQueries: [
      statement['PROCEDURE-ARGS']
    ].filter(s => s !== undefined),
    objectTypeQueries: [
      statement['SOURCE']
    ].filter(s => s !== undefined)
  };

  collection['TYPE BODY'] = {
    objectNameQueries: [],
    objectIdQueries: [],
    objectTypeQueries: [
      statement['SOURCE']
    ].filter(s => s !== undefined)
  };

  collection['JAVA SOURCE'] = {
    objectNameQueries: [],
    objectIdQueries: [],
    objectTypeQueries: [
      statement['SOURCE']
    ].filter(s => s !== undefined)
  };

  collection['MATERIALIZED VIEW'] = {
    objectNameQueries: [
      statement['MVIEW-DETAILS'],
      statement['TABLE-COMMENTS'],
      statement['TABLE-COLUMNS'],
      statement['MVIEW-SOURCE'],
      statement['MVIEW-LOG_DEPENDENCIES']
    ].filter(s => s !== undefined),
    objectIdQueries: [],
    objectTypeQueries: []
  };

  collection['TRIGGER'] = {
    objectNameQueries: [
      statement['TRIGGER-DETAILS']
    ].filter(s => s !== undefined),
    objectIdQueries: [],
    objectTypeQueries: []
  };

  collection['INDEX'] = {
    objectNameQueries: [
      statement['INDEX-COLUMNS'],
      statement['INDEX-FUNCTION'],
    ].filter(s => s !== undefined),
    objectIdQueries: [],
    objectTypeQueries: []
  };

  collection['QUEUE'] = {
    objectNameQueries: [
      statement['QUEUE-DETAILS']
    ].filter(s => s !== undefined),
    objectIdQueries: [],
    objectTypeQueries: []
  };

  collection['SYNONYM'] = {
    objectNameQueries: [
      statement['DECODE-SYNONYM']
    ].filter(s => s !== undefined),
    objectIdQueries: [],
    objectTypeQueries: []
  };

  collection['CLUSTER'] = {
    objectNameQueries: [
      statement['TABLE-COLUMNS']
    ].filter(s => s !== undefined),
    objectIdQueries: [],
    objectTypeQueries: []
  };

  collection['TYPE'] = {
    objectNameQueries: [
      statement['TYPE-DETAILS'],
      statement['COLLECTION-TYPE-DETAILS'],
      statement['TYPE-ATTRIBUTES'],
      statement['TYPE-METHODS']
    ].filter(s => s !== undefined),
    objectIdQueries: [],
    objectTypeQueries: []
  };

  collection['DEPENDENCIES'] = {
    objectNameIdQueries: [statement['USED-BY-OBJECTS']].filter(s => s !== undefined),
    objectIdQueries: [statement['USES-OBJECTS']].filter(s => s !== undefined),
    objectTypeQueries: []
  };
  collection['DEPENDENCIES-NOSOURCE'] = {
    objectNameIdQueries: [statement['USED-BY-OBJECTS']].filter(s => s !== undefined),
    objectIdQueries: [statement['USES-OBJECTS-NOLINE']].filter(s => s !== undefined),
    objectTypeQueries: []
  };
  collection['DEPENDENCIES-ADB'] = {
    objectNameIdQueries: [],
    objectIdQueries: [],
    objectTypeQueries: [
      statement['USED-BY-ADB'],
      statement['USES-ADB']
    ].filter(s => s !== undefined)
  }

  return { statement, collection };
}

const oracle = loadDialect('oracle');
const postgres = loadDialect('postgres');

module.exports = { oracle, postgres };
