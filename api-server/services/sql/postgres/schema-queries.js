/*!
 * Copyright 2025 Visulate LLC. All Rights Reserved.
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

let statement = {};

statement['VALIDATE-CONNECTION'] = {
  'title': 'Granted Role/Privilege',
  'display': [],
  'sql': `SELECT rolname as privilege
          FROM pg_roles
          WHERE rolname = CURRENT_USER`,
  'params': {}
};

/**
 * SQL statements + bind variables to query the data dictionary
 */
statement['COUNT_DBA_OBJECTS'] = {
  'title': 'Object Count',
  'description': '',
  'display': [],
  'sql': `SELECT 
            n.nspname as "OWNER",
            CASE c.relkind
              WHEN 'r' THEN 'TABLE'
              WHEN 'v' THEN 'VIEW'
              WHEN 'm' THEN 'MATERIALIZED VIEW'
              WHEN 'S' THEN 'SEQUENCE'
              WHEN 'f' THEN 'FOREIGN TABLE'
              WHEN 'p' THEN 'PARTITIONED TABLE'
            END as "OBJECT_TYPE",
            count(*) as "OBJECT_COUNT",
            CASE WHEN n.nspname IN ('pg_catalog', 'information_schema') THEN 1 ELSE 0 END as "INTERNAL"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('r', 'v', 'm', 'S', 'f', 'p')
          GROUP BY 1, 2, 4
`,
  'params': {
  }
};

statement['COUNT_DBA_OBJECTS_FILTER'] = {
  'title': 'Object Count',
  'description': '',
  'display': [],
  'sql': `SELECT 
            n.nspname as "OWNER",
            CASE c.relkind
              WHEN 'r' THEN 'TABLE'
              WHEN 'v' THEN 'VIEW'
              WHEN 'm' THEN 'MATERIALIZED VIEW'
              WHEN 'S' THEN 'SEQUENCE'
              WHEN 'f' THEN 'FOREIGN TABLE'
              WHEN 'p' THEN 'PARTITIONED TABLE'
            END as "OBJECT_TYPE",
            count(*) as "OBJECT_COUNT",
            CASE WHEN n.nspname IN ('pg_catalog', 'information_schema') THEN 1 ELSE 0 END as "INTERNAL"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname LIKE :object_name
          AND c.relkind IN ('r', 'v', 'm', 'S', 'f', 'p')
          GROUP BY 1, 2, 4
`,
  'params': {
    object_name: { val: "%" }
  }
};

statement['DB-VERSION'] = {
  'title': 'Database Version',
  'description': '',
  'display': ["Version"],
  'sql': `SELECT version() as "Version"`,
  'params': {
  }
};

statement['ADB-YN'] = {
  'title': 'Oracle Cloud Autonomous Database Instance',
  'display': ["Autonomous Database"],
  'sql': `SELECT 'No' as "Autonomous Database"`,
  'params': {}
}

statement['EBS-SCHEMA'] = {
  'title': 'Is E-Business Suite Instance?',
  'description': '',
  'display': ["Is E-Business Suite Instance?"],
  'sql': `SELECT 'No' as "Is E-Business Suite Instance?"`,
  'params': {
  }
};

statement['COUNT-INVALID-OBJECTS'] = {
  'title': 'Invalid Objects',
  'description': '',
  'link': 'Owner',
  'display': ["Owner", "Object Type", "Count"],
  'sql': `SELECT nspname as "Owner"
          ,      'N/A' as "Object Type"
          ,      0 as "Count"
          ,      nspname as link
          FROM pg_namespace
          WHERE false`,
  'params': {}
}

statement['DB-FEATURES'] = {
  'title': 'Database Features',
  'description': '',
  'display': ["Feature"],
  'sql': `SELECT extname as "Feature"
          FROM pg_extension`,
  'params': {
  }
};

statement['DB-SIZE'] = {
  'title': 'Database Size',
  'description': '',
  'display': ["Database", "Size (GB)"],
  'sql': `SELECT datname as "Database",
          round(pg_database_size(datname)/1024.0/1024.0/1024.0, 2) as "Size (GB)"
          FROM pg_database
          WHERE datname = current_database()`,
  'params': {}
};

statement['SCHEMA-USER'] = {
  'title': 'Schema Status',
  'description': '',
  'display': ["Owner"],
  'sql': `SELECT nspname as "Owner"
           FROM pg_namespace
           WHERE nspname = LOWER(:owner)`,
  'params': {
    owner: { val: "" }
  }
};

statement['LIST_DBA_OBJECTS'] = {
  'title': 'Object List',
  'description': '',
  'display': [],
  'sql': `SELECT 
            quote_ident(n.nspname) || '.' || quote_ident(c.relname) as object_id,
            c.relname as object_name,
            CASE c.relkind
              WHEN 'r' THEN 'TABLE'
              WHEN 'v' THEN 'VIEW'
              WHEN 'm' THEN 'MATERIALIZED VIEW'
              WHEN 'S' THEN 'SEQUENCE'
              WHEN 'f' THEN 'FOREIGN TABLE'
              WHEN 'p' THEN 'PARTITIONED TABLE'
            END as object_type,
            n.nspname as owner
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = LOWER(:owner)
          AND c.relname LIKE :object_name
          AND (CASE c.relkind
                 WHEN 'r' THEN 'TABLE'
                 WHEN 'v' THEN 'VIEW'
                 WHEN 'm' THEN 'MATERIALIZED VIEW'
                 WHEN 'S' THEN 'SEQUENCE'
                 WHEN 'f' THEN 'FOREIGN TABLE'
                 WHEN 'p' THEN 'PARTITIONED TABLE'
               END) LIKE :object_type
          AND c.relkind IN ('r', 'v', 'm', 'S', 'f', 'p')
          ORDER BY owner, object_type, object_name
          LIMIT 3000`,
  'params': {
    owner: { val: "" },
    object_type: { val: "" },
    object_name: { val: "" },
    status: { val: "%" }
  }
};

statement['FIND-DBA-OBJECTS'] = {
  'title': 'Search Results',
  'description': 'Database objects matching the search condition',
  'display': [],
  'sql': `SELECT 
            quote_ident(n.nspname) || '.' || quote_ident(c.relname) as "object_id",
            n.nspname as "owner",
            c.relname as "object_name",
            CASE c.relkind
              WHEN 'r' THEN 'TABLE'
              WHEN 'v' THEN 'VIEW'
              WHEN 'm' THEN 'MATERIALIZED VIEW'
              WHEN 'S' THEN 'SEQUENCE'
              WHEN 'f' THEN 'FOREIGN TABLE'
              WHEN 'p' THEN 'PARTITIONED TABLE'
            END as "object_type",
            'VALID' as "status"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = :object_name
          AND c.relkind IN ('r', 'v', 'm', 'S', 'f', 'p')`,
  'params': {
    object_name: { val: "" }
  }
};

statement['OBJECT-DETAILS'] = {
  'title': 'Object Details',
  'description': '',
  'display': ["Object Name", "Type", "Owner", "Status"],
  'sql': `SELECT 
            c.oid as object_id,
            c.relname as "Object Name",
            CASE c.relkind
              WHEN 'r' THEN 'TABLE'
              WHEN 'v' THEN 'VIEW'
              WHEN 'm' THEN 'MATERIALIZED VIEW'
              WHEN 'S' THEN 'SEQUENCE'
              WHEN 'f' THEN 'FOREIGN TABLE'
              WHEN 'p' THEN 'PARTITIONED TABLE'
            END as "Type",
            n.nspname as "Owner",
            'VALID' as "Status"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = :object_name
          AND n.nspname = LOWER(:owner)
          AND (CASE c.relkind
                 WHEN 'r' THEN 'TABLE'
                 WHEN 'v' THEN 'VIEW'
                 WHEN 'm' THEN 'MATERIALIZED VIEW'
                 WHEN 'S' THEN 'SEQUENCE'
                 WHEN 'f' THEN 'FOREIGN TABLE'
                 WHEN 'p' THEN 'PARTITIONED TABLE'
               END) LIKE :object_type
          AND c.relkind IN ('r', 'v', 'm', 'S', 'f', 'p')`,
  'params': {
    object_name: { val: "" },
    object_type: { val: "" },
    owner: { val: "" }
  }
};

statement['SCHEMA-SUMMARY'] = {
  'title': 'Schema Summary',
  'description': 'High level summary of tables and views in the schema',
  'link': 'Name',
  'display': ["Name", "Type", "Comments"],
  'sql': `SELECT 
            c.relname as "Name",
            CASE c.relkind
              WHEN 'r' THEN 'TABLE'
              WHEN 'v' THEN 'VIEW'
              WHEN 'm' THEN 'MATERIALIZED VIEW'
              WHEN 'S' THEN 'SEQUENCE'
              WHEN 'f' THEN 'FOREIGN TABLE'
              WHEN 'p' THEN 'PARTITIONED TABLE'
            END as "Type",
            obj_description(c.oid, 'pg_class') as "Comments",
            n.nspname || '/' || (CASE c.relkind
                                   WHEN 'r' THEN 'TABLE'
                                   WHEN 'v' THEN 'VIEW'
                                   WHEN 'm' THEN 'MATERIALIZED VIEW'
                                   WHEN 'S' THEN 'SEQUENCE'
                                   WHEN 'f' THEN 'FOREIGN TABLE'
                                   WHEN 'p' THEN 'PARTITIONED TABLE'
                                 END) || '/' || c.relname as link
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = LOWER(:owner)
          AND c.relkind IN ('r', 'v', 'm', 'S', 'f', 'p')
          ORDER BY 2, 1`,
  'params': {
    owner: { val: "" }
  }
};

statement['SCHEMA-MISSING-TABLE-COMMENTS'] = {
  'title': 'Tables and Views Missing Comments',
  'description': 'Tables and views in the schema that do not have a description',
  'display': ["Owner", "Name", "Type"],
  'sql': `SELECT 
            n.nspname as "Owner",
            c.relname as "Name",
            CASE c.relkind
              WHEN 'r' THEN 'TABLE'
              WHEN 'v' THEN 'VIEW'
              WHEN 'm' THEN 'MATERIALIZED VIEW'
              WHEN 'p' THEN 'PARTITIONED TABLE'
            END as "Type"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = LOWER(:owner)
          AND c.relname LIKE :object_name
          AND c.relkind IN ('r', 'v', 'm', 'p')
          AND obj_description(c.oid, 'pg_class') IS NULL`,
  'params': {
    owner: { val: "" },
    object_name: { val: "%" }
  }
};

statement['SCHEMA-MISSING-COL-COMMENTS'] = {
  'title': 'Columns Missing Comments',
  'description': 'Columns in the schema that do not have a description',
  'display': ["Owner", "Table Name", "Column Name"],
  'sql': `SELECT 
            n.nspname as "Owner",
            c.relname as "Table Name",
            a.attname as "Column Name"
          FROM pg_attribute a
          JOIN pg_class c ON a.attrelid = c.oid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = LOWER(:owner)
          AND c.relname LIKE :object_name
          AND c.relkind IN ('r', 'v', 'm', 'p')
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND col_description(c.oid, a.attnum) IS NULL`,
  'params': {
    owner: { val: "" },
    object_name: { val: "%" }
  }
};

statement['SCHEMA-COLUMNS'] = {
  'title': 'Schema Columns',
  'description': 'Column definitions in the schema',
  'display': ["Table Name", "Column Name", "Data Type", "Length", "Nullable"],
  'sql': `SELECT 
            c.relname as "Table Name",
            a.attname as "Column Name",
            format_type(a.atttypid, a.atttypmod) as "Data Type",
            a.attlen as "Length",
            CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END as "Nullable"
          FROM pg_attribute a
          JOIN pg_class c ON a.attrelid = c.oid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = LOWER(:owner)
          AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
          AND a.attnum > 0
          AND NOT a.attisdropped
          ORDER BY c.relname, a.attnum`,
  'params': {
    owner: { val: "" }
  }
};

statement['SCHEMA-RELATIONSHIPS'] = {
  'title': 'Schema Relationships',
  'description': 'Foreign key relationships in the schema',
  'display': ["Table Name", "Constraint Name", "Referenced Table", "Referenced Owner"],
  'sql': `SELECT DISTINCT
            tc.table_name as "Table Name",
            tc.constraint_name as "Constraint Name",
            ccu.table_name as "Referenced Table",
            ccu.table_schema as "Referenced Owner"
          FROM information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_schema = LOWER(:owner)`,
  'params': {
    owner: { val: "" }
  }
};

statement['MVIEW-DETAILS'] = {
  'title': 'Materialized View Details',
  'description': '',
  'display': ["Owner", "Name", "Is Populated", "Last Refresh"],
  'sql': `SELECT 
            schemaname as "Owner",
            matviewname as "Name",
            ispopulated as "Is Populated",
            'N/A' as "Last Refresh"
          FROM pg_matviews
          WHERE schemaname = LOWER(:owner)
          AND matviewname = :object_name`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};

statement['VIEW-SOURCE'] = {
  'title': 'Source',
  'description': '',
  'display': ["Text"],
  'sql': `SELECT pg_get_viewdef(c.oid, true) as "Text"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = LOWER(:owner)
          AND c.relname = :object_name
          AND c.relkind = 'v'`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};

statement['MVIEW-SOURCE'] = {
  'title': 'Source',
  'description': '',
  'display': ["Text"],
  'sql': `SELECT pg_get_viewdef(c.oid, true) as "Text"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = LOWER(:owner)
          AND c.relname = :object_name
          AND c.relkind = 'm'`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};



module.exports.statement = statement;
