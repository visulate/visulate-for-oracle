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

const oracledb = require('oracledb');
let statement = {};
/**
 * SQL statements + bind variables to query the data dictionary
 */
statement['TABLE-DETAILS'] = {
  'title': 'Table Details',
  'description': '',
  'display': ["Tablespace", "Last Analyzed", "Rows", "Backed Up", "Temporary", "Duration"],
  'sql': `select table_name as "Name"
          ,      num_rows
          ,      to_char(last_analyzed, 'Mon dd, yyyy') as "Last Analyzed"
          ,      to_char(num_rows, 'FM999,999,999,999') as "Rows"
          ,      backed_up as "Backed Up"
          ,      tablespace_name as "Tablespace"
          ,      temporary as "Temporary"
          ,      duration as "Duration"
          from dba_tables
          where table_name = :object_name
          and owner = :owner
          order by table_name`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "", },
    object_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }    
   }
};
statement['TABLE-COMMENTS'] = {
  'title': 'Table Description',
  'description': '',
  'display': ["Description"],
  'sql' : `select comments as "Description"
           from dba_tab_comments
           where owner = :owner
           and table_name = :object_name
           and (table_type = 'TABLE' or table_type = 'VIEW')
           and comments is not null`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};

statement['TABLE-INDEXES'] = {
  'title': 'Indexes',
  'description': '',
  'display': ["Index", "Type", "Uniqueness", "Tablespace", "Column"],
  'sql' : `select i.index_name as "Index"
           ,      i.index_type as "Type"
           ,      i.uniqueness as "Uniqueness"
           ,      i.tablespace_name as "Tablespace"
           ,      LISTAGG(ic.column_name, ', ') WITHIN GROUP (ORDER BY ic.column_position ) as "Column"
           from dba_indexes i 
           left join dba_ind_columns ic on ic.index_name = i.index_name and ic.index_owner = i.owner
           where i.table_owner = :owner
           and i.table_name = :object_name
           group by i.index_name, i.index_type, i.uniqueness, i.tablespace_name
           order by i.uniqueness desc, i.index_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};

statement['INDEX-COLUMNS'] = {
  'title': 'Index Columns',
  'description': '',
  'display': ["Column"],
  'sql' : `select column_name as "Column"
           ,      column_length
           from dba_ind_columns
           where index_owner = :owner
           and index_name = :object_name
           order by column_position`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['INDEX-FUNCTION'] = {
  'title': 'Functional Index Expressions',
  'description': '',
  'display': ["Index", "Expression"],
  'sql' : `select index_name as "Index" 
           ,      column_expression as "Expression"
           from dba_ind_expressions
           where table_owner = :owner
           and table_name = :object_name
           order by index_name, column_position`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['TABLE-KEYS'] = {
  'title': 'Constraints',
  'description': 'Primary, foreign and unique keys + referential integrity and check constraints ',
  'display': ["Name", "Constraint Type", "Column", "Search Condition"],
  'sql' : `select c.constraint_name as "Name"
          ,       DECODE(c.constraint_type,
                         'C', 'Check',
                         'F', 'Foreign key', 
                         'P', 'Primary key',
                         'U', 'Unique key',
                         'R', 'Referential integrity',
                         'V', 'Constraint on a view',
                         'O', 'Read-only, on a view') as "Constraint Type"   
           , cc.columns as "Column"
           ,      c.search_condition as "Search Condition"
           from dba_constraints c
           ,    (select owner, constraint_name, LISTAGG(column_name, ', ') WITHIN GROUP (ORDER BY position ) as columns
                 from dba_cons_columns
                 where owner = :owner
                 group by owner, constraint_name) cc
           where c.owner = :owner
           and c.table_name = :object_name
           and c.constraint_name = cc.constraint_name (+)      
           and c.owner = cc.owner (+)     
           order by decode(c.constraint_type, 
                           'P', 1,
                           'U', 2,
                           'F', 3,
                           'R', 4,
                           'C', 5,
                           'V', 6,
                           'O', 7)  , c.constraint_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['CONSTRAINT-COLUMNS'] = {
  'title': 'Key Columns',
  'description': '',
  'display': [],
  'sql': `select column_name
          from dba_cons_columns
          where owner = :owner 
          and constraint_name = :constraint_name
          order by position`,
  'params' : {
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    constraint_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }    
  }
};
statement['TABLE-COLUMNS'] = {
  'title': 'Columns',
  'description': '',
  'display': ["Name", "Type", "Length", "Precision", "Nullable", "Comments"],
  'sql' : `select col.column_name as "Name"
           ,      col.data_type as "Type"
           ,      col.data_length as "Length"
           ,      col.data_precision as "Precision"
           ,      col.nullable as "Nullable"
           ,      com.comments as "Comments"
           from dba_tab_columns col
           ,    dba_col_comments com
           where col.owner = :owner
           and col.table_name = :object_name
           and col.table_name = com.table_name (+)
           and col.column_name = com.column_name (+)
           and col.owner = com.owner (+)
           order by col.column_id`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['FK-IN-TABLE'] = {
  'title': 'Foreign Keys',
  'description': 'Parent/lookup tables',
  'display': ["Table", "Owner"],
  'link': "Table",
  'sql': `select obj.object_name as "Table"
          ,    obj.owner as "Owner"
          ,    cdef.robj# object_id
          ,    cdef.con# cons_id
          ,    obj.owner||'/TABLE/'||obj.object_name as link
          from sys.cdef$ cdef
          ,    dba_objects obj
          where cdef.obj# = :object_id
          and cdef.robj# is not null
          and cdef.robj# = obj.object_id
          order by obj.object_name`,
  'params': {
    object_id: { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" }
  }
};

statement['FK-IN-TABLE-NAME'] = {
  'title': 'Foreign Keys',
  'description': 'Parent/lookup tables',
  'display': ["Table", "Owner"],
  'link': "Table",
  'sql': `select rcons.table_name as "Table"
          ,      rcons.owner as "Owner"
          ,      rcons.owner||'/TABLE/'||rcons.table_name as link
          from dba_constraints cons
          ,    dba_constraints rcons
          where cons.owner = :owner
          and cons.table_name = :object_name
          and cons.r_constraint_name = rcons.constraint_name
          and cons.r_owner = rcons.owner
          order by rcons.table_name`,
  'params': {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};

statement['FK-TO-TABLE'] = {
  'title': 'Foreign Keys to this Table',
  'description': 'Child/detail tables',
  'display': ["Table", "Owner"],
  'link': "Table",
  'sql': `select obj.object_name as "Table"
          ,    obj.owner as "Owner"
          ,    cdef.obj# object_id
          ,    cdef.con# cons_id
          ,    obj.owner||'/TABLE/'||obj.object_name as link
          from sys.cdef$ cdef
          ,    dba_objects obj
          where cdef.robj# = :object_id
          and cdef.obj# = obj.object_id
          order by obj.object_name`,
  'params': {
    object_id: { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" }
  }
};

statement['FK-TO-TABLE-NAME'] = {
  'title': 'Foreign Keys to this Table',
  'description': 'Child/detail tables',
  'display': ["Table", "Owner"],
  'link': "Table",
  'sql': `select cons.table_name as "Table"
          ,      cons.owner as "Owner"
          ,      cons.owner||'/TABLE/'||cons.table_name as link
          from dba_constraints cons
          ,    dba_constraints rcons
          where rcons.owner = :owner
          and rcons.table_name = :object_name
          and cons.r_constraint_name = rcons.constraint_name
          and cons.r_owner = rcons.owner
          order by cons.table_name`,
  'params': {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};

module.exports.statement = statement;