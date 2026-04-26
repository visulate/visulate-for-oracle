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

statement['USED-BY-OBJECTS'] = {
  'title': 'Used By',
  'description': 'Dependencies other objects have on this one',
  'display': ["Object Name", "Object Type", "Owner"],
  'link': 'Object Name',
  'sql': `WITH dependencies AS (
            -- Direct dependencies
            SELECT d.objid as dep_oid
            FROM pg_depend d
            WHERE d.refobjid = :object_id
            UNION
            -- Rule-based dependencies (e.g. views/mviews)
            SELECT rw.ev_class
            FROM pg_depend d
            JOIN pg_rewrite rw ON d.objid = rw.oid
            WHERE d.refobjid = :object_id
          )
          SELECT DISTINCT
            c.relname as "Object Name",
            CASE c.relkind
              WHEN 'r' THEN 'TABLE'
              WHEN 'v' THEN 'VIEW'
              WHEN 'm' THEN 'MATERIALIZED VIEW'
              WHEN 'S' THEN 'SEQUENCE'
              WHEN 'f' THEN 'FOREIGN TABLE'
              WHEN 'p' THEN 'PARTITIONED TABLE'
            END as "Object Type",
            n.nspname as "Owner",
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
          JOIN dependencies d ON d.dep_oid = c.oid
          WHERE c.oid != :object_id`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" },
    object_id: { val: "" }
  }
};

statement['USES-OBJECTS'] = {
  'title': 'Uses',
  'description': 'Dependencies this object has on others',
  'display': ["Object Name", "Object Type", "Owner"],
  'link': 'Object Name',
  'sql': `WITH dependencies AS (
            -- Direct dependencies
            SELECT d.refobjid as ref_oid
            FROM pg_depend d
            WHERE d.objid = :object_id
            UNION
            -- Rule-based dependencies (e.g. view uses table)
            SELECT d.refobjid
            FROM pg_rewrite rw
            JOIN pg_depend d ON rw.oid = d.objid
            WHERE rw.ev_class = :object_id
          )
          SELECT DISTINCT
            c.relname as "Object Name",
            CASE c.relkind
              WHEN 'r' THEN 'TABLE'
              WHEN 'v' THEN 'VIEW'
              WHEN 'm' THEN 'MATERIALIZED VIEW'
              WHEN 'S' THEN 'SEQUENCE'
              WHEN 'f' THEN 'FOREIGN TABLE'
              WHEN 'p' THEN 'PARTITIONED TABLE'
            END as "Object Type",
            n.nspname as "Owner",
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
          JOIN dependencies d ON d.ref_oid = c.oid
          WHERE c.oid != :object_id`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" },
    object_id: { val: "" }
  }
};

statement['USES-OBJECTS-NOLINE'] = statement['USES-OBJECTS'];

module.exports.statement = statement;
