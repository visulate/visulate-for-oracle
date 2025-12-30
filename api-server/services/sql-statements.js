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


/**
 * SQL statements + bind variables to query the data dictionary
 */
const schemaSql = require('./sql/schema-queries');
const tableSql = require('./sql/table-queries');
const typeSql = require('./sql/type-queries');
const depSql = require('./sql/dependency-queries');
const statement = Object.assign(schemaSql.statement, tableSql.statement, typeSql.statement, depSql.statement);
module.exports.statement = statement;

/**
 * Collect statements by object type.
 * @param noParamQueries - queries that do not require input parameters
 * @param ownerNameQueries - queries that accept owner as input
 * @param objectNameQueries - queries that accept owner + object_name as input
 * @param objectIdQueries - queries that accept object_id as input
 * @param objectTypeQueries - queries that accept owner, object_name + object_type
 * @param objectNameIdQueries - queries that accept object_name + object_id
 */
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
  ]
};

collection['SCHEMA'] = {
  ownerNameQueries: [
    statement['SCHEMA-USER'],
    statement['SCHEMA-SUMMARY'],
    statement['SCHEMA-INVALID-OBJECTS'],
    statement['SCHEMA-INDEXES']
  ]
};

collection['SCHEMA-FILTERED'] = {
  ownerNameQueries: [
    statement['SCHEMA-DATATYPES'],
    statement['SCHEMA-INDEXES'],
    statement['SCHEMA-INVALID-OBJECTS']
  ]
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
  ],
  objectIdQueries: [
  ],
  objectTypeQueries: []
};

collection['VIEW'] = {
  objectNameQueries: [
    statement['TABLE-DETAILS'],
    statement['TABLE-COMMENTS'],
    statement['TABLE-COLUMNS'],
    statement['VIEW-SOURCE']
  ],
  objectTypeQueries: [],
  objectIdQueries: []
};

collection['PACKAGE'] = {
  objectNameQueries: [],
  objectIdQueries: [
    statement['PROCEDURE-ARGS']
  ],
  objectTypeQueries: [
    statement['SOURCE']
  ]
};

collection['PACKAGE BODY'] = {
  objectNameQueries: [],
  objectIdQueries: [],
  objectTypeQueries: [
    statement['SOURCE']
  ]
};

collection['PROCEDURE'] = {
  objectNameQueries: [],
  objectIdQueries: [
    statement['PROCEDURE-ARGS']
  ],
  objectTypeQueries: [
    statement['SOURCE']
  ]
};


collection['FUNCTION'] = {
  objectNameQueries: [],
  objectIdQueries: [
    statement['PROCEDURE-ARGS']
  ],
  objectTypeQueries: [
    statement['SOURCE']
  ]
};

collection['TYPE BODY'] = {
  objectNameQueries: [],
  objectIdQueries: [],
  objectTypeQueries: [
    statement['SOURCE']
  ]
};

collection['JAVA SOURCE'] = {
  objectNameQueries: [],
  objectIdQueries: [],
  objectTypeQueries: [
    statement['SOURCE']
  ]
};

collection['MATERIALIZED VIEW'] = {
  objectNameQueries: [
    statement['MVIEW-DETAILS'],
    statement['MVIEW-SOURCE'],
    statement['MVIEW-LOG_DEPENDENCIES']
  ],
  objectIdQueries: [],
  objectTypeQueries: []
};

collection['TRIGGER'] = {
  objectNameQueries: [
    statement['TRIGGER-DETAILS']
  ],
  objectIdQueries: [],
  objectTypeQueries: []
};

collection['INDEX'] = {
  objectNameQueries: [
    statement['INDEX-COLUMNS'],
    statement['INDEX-FUNCTION'],
  ],
  objectIdQueries: [],
  objectTypeQueries: []
};

collection['QUEUE'] = {
  objectNameQueries: [
    statement['QUEUE-DETAILS']
  ],
  objectIdQueries: [],
  objectTypeQueries: []
};

collection['SYNONYM'] = {
  objectNameQueries: [
    statement['DECODE-SYNONYM']
  ],
  objectIdQueries: [],
  objectTypeQueries: []
};

collection['CLUSTER'] = {
  objectNameQueries: [
    statement['TABLE-COLUMNS']
  ],
  objectIdQueries: [],
  objectTypeQueries: []
};

collection['TYPE'] = {
  objectNameQueries: [
    statement['TYPE-DETAILS'],
    statement['COLLECTION-TYPE-DETAILS'],
    statement['TYPE-ATTRIBUTES'],
    statement['TYPE-METHODS']
  ],
  objectIdQueries: [],
  objectTypeQueries: []
};

// https://github.com/visulate/visulate-for-oracle/issues/253
// use NOLINE for all dependencies
collection['DEPENDENCIES'] = {
  objectNameIdQueries: [statement['USED-BY-OBJECTS']],
  objectIdQueries: [statement['USES-OBJECTS']],
  objectTypeQueries: []
};
collection['DEPENDENCIES-NOSOURCE'] = {
  objectNameIdQueries: [statement['USED-BY-OBJECTS']],
  objectIdQueries: [statement['USES-OBJECTS-NOLINE']],
  objectTypeQueries: []
};
collection['DEPENDENCIES-ADB'] = {
  objectNameIdQueries: [],
  objectIdQueries: [],
  objectTypeQueries: [
    statement['USED-BY-ADB'],
    statement['USES-ADB']
  ]
}

module.exports.collection = collection;
