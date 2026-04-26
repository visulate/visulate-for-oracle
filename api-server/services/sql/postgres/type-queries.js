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

statement['VIEW-SOURCE'] = {
  'title': 'Source',
  'description': 'Source query for the view',
  'display': ["Text"],
  'sql': `SELECT pg_get_viewdef(c.oid, true) as "Text"
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = :object_name
          AND n.nspname = LOWER(:owner)
          AND c.relkind IN ('v', 'm')`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};

statement['SOURCE'] = {
  'title': 'Source',
  'description': 'Function or View source code',
  'display': ["Line", "Text"],
  'sql': `WITH source_text AS (
            SELECT 
              CASE 
                WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid, true)
                ELSE NULL
              END as src
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = :object_name
            AND n.nspname = LOWER(:owner)
            UNION ALL
            SELECT pg_get_functiondef(p.oid)
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE p.proname = :object_name
            AND n.nspname = LOWER(:owner)
          )
          SELECT line_number as "Line", line_text as "Text"
          FROM source_text, unnest(string_to_array(src, E'\n')) WITH ORDINALITY AS s(line_text, line_number)
          WHERE src IS NOT NULL`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};

statement['PROCEDURE-ARGS'] = {
  'title': 'Arguments',
  'description': '',
  'display': ["Parameter", "Direction", "Data Type"],
  'sql': `SELECT 
            p.parameter_name as "Parameter",
            p.parameter_mode as "Direction",
            p.data_type as "Data Type"
          FROM information_schema.parameters p
          JOIN information_schema.routines r 
            ON p.specific_name = r.specific_name 
            AND p.specific_schema = r.specific_schema
          WHERE r.specific_schema = LOWER(:owner)
          AND r.routine_name = :object_name
          ORDER BY p.ordinal_position`,
  'params': {
    owner: { val: "" },
    object_name: { val: "" }
  }
};

module.exports.statement = statement;
