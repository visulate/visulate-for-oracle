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

let statement = {};

statement['TABLE-DETAILS'] = {
  'title': 'Table Details',
  'description': '',
  'display': ["Rows", "Total Size", "Table Size", "Index Size", "Last Analyzed"],
  'sql': `SELECT 
            c.reltuples as "Rows",
            pg_size_pretty(pg_total_relation_size(c.oid)) as "Total Size",
            pg_size_pretty(pg_relation_size(c.oid)) as "Table Size",
            pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) as "Index Size",
            to_char(s.last_analyze, 'Mon dd, yyyy') as "Last Analyzed"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
          WHERE c.relname = :object_name
          AND n.nspname = LOWER(:owner)`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};

statement['TABLE-COMMENTS'] = {
  'title': 'Table Description',
  'description': '',
  'display': ["Description"],
  'sql': `SELECT obj_description(c.oid, 'pg_class') as "Description"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = :object_name
          AND n.nspname = LOWER(:owner)`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};

statement['TABLE-COLUMNS'] = {
  'title': 'Columns',
  'description': '',
  'display': ["Column", "Data Type", "Nullable", "Comment"],
  'sql': `SELECT 
            a.attname as "Column",
            format_type(a.atttypid, a.atttypmod) as "Data Type",
            CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END as "Nullable",
            col_description(c.oid, a.attnum) as "Comment"
          FROM pg_attribute a
          JOIN pg_class c ON a.attrelid = c.oid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = :object_name
          AND n.nspname = LOWER(:owner)
          AND a.attnum > 0
          AND NOT a.attisdropped
          ORDER BY a.attnum`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};

statement['TABLE-INDEXES'] = {
  'title': 'Indexes',
  'description': '',
  'display': ["Index", "Definition"],
  'sql': `SELECT 
            indexname as "Index",
            indexdef as "Definition"
          FROM pg_indexes
          WHERE tablename = :object_name
          AND schemaname = LOWER(:owner)`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};

statement['TABLE-KEYS'] = {
  'title': 'Constraints',
  'description': '',
  'display': ["Constraint", "Type", "Definition"],
  'sql': `SELECT 
            conname as "Constraint",
            CASE contype
              WHEN 'p' THEN 'PRIMARY KEY'
              WHEN 'u' THEN 'UNIQUE'
              WHEN 'f' THEN 'FOREIGN KEY'
              WHEN 'c' THEN 'CHECK'
              WHEN 't' THEN 'TRIGGER'
              WHEN 'x' THEN 'EXCLUSION'
            END as "Type",
            pg_get_constraintdef(oid) as "Definition"
          FROM pg_constraint
          WHERE conrelid = (
            SELECT c.oid 
            FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE c.relname = :object_name 
            AND n.nspname = LOWER(:owner)
          )`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};

statement['FK-IN-TABLE-NAME'] = {
  'title': 'Foreign Keys (Inbound)',
  'description': 'Foreign keys that reference this table',
  'display': ["Constraint", "Source Table", "Definition"],
  'sql': `SELECT 
            conname as "Constraint",
            relname as "Source Table",
            pg_get_constraintdef(pg_constraint.oid) as "Definition"
          FROM pg_constraint
          JOIN pg_class ON pg_constraint.conrelid = pg_class.oid
          WHERE confrelid = (
            SELECT c.oid 
            FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE c.relname = :object_name 
            AND n.nspname = LOWER(:owner)
          )
          AND contype = 'f'`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};

statement['FK-TO-TABLE-NAME'] = {
  'title': 'Foreign Keys (Outbound)',
  'description': 'Foreign keys in this table that reference other tables',
  'display': ["Constraint", "Target Table", "Definition"],
  'sql': `SELECT 
            conname as "Constraint",
            confrelid::regclass::text as "Target Table",
            pg_get_constraintdef(oid) as "Definition"
          FROM pg_constraint
          WHERE conrelid = (
            SELECT c.oid 
            FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE c.relname = :object_name 
            AND n.nspname = LOWER(:owner)
          )
          AND contype = 'f'`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};

module.exports.statement = statement;
