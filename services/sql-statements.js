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
let collection = {};
/**
 * SQL statements + bind variables to query the data dictionary
 */
statement['COUNT_DBA_OBJECTS'] = {
  'title': 'Object Count',
  'sql' : `select owner, object_type, count(*) as object_count
           from dba_objects o
           where not exists (select 1
                             from dba_logstdby_skip l
                             where l.owner = o.owner
                             and l.statement_opt = 'INTERNAL SCHEMA')
           group by owner, object_type
           order by owner, object_type`,
   'params': {
   }
};
statement['LIST_DBA_OBJECTS'] = {
  'title': 'Object List',
  'sql': `select object_name
          from dba_objects
          where  owner = :owner
          and object_type = :object_type
          and object_name like :object_name ESCAPE :esc
          and status like :status
          order by object_name`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_type: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    esc: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "\\" },
    status: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "%" }
  }
};
statement['OBJECT-DETAILS'] = {
  'title': 'Object Details',
  'sql': `select object_name
          ,      object_type
          ,      owner
          ,      object_id
          ,      data_object_id
          ,      subobject_name
          ,      created
          ,      last_ddl_time
          ,      timestamp
          ,      status
          ,      temporary
          ,      generated
          ,      secondary
          from dba_objects
          where object_name = :object_name
          and   object_type = :object_type
          and   owner       = :owner`,
  'params': {
    object_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_type: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }        
};
statement['TABLE-DETAILS'] = {
  'title': 'Table Details',
  'sql': `select table_name
          ,      num_rows
          ,      tablespace_name
          ,      temporary
          ,      duration
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
  'title': 'Description',
  'sql' : `select comments
           from dba_tab_comments
           where owner = :owner
           and table_name = :object_name
           and (table_type = 'TABLE' or table_type = 'VIEW')`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['TABLE-INDEXES'] = {
  'title': 'Indexes',
  'sql' : `select index_name
           ,      index_type
           ,      uniqueness
           ,      tablespace_name
           ,      owner
           from dba_indexes
           where table_owner = :owner
           and table_name = :object_name
           order by uniqueness desc, index_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['INDEX-COLUMNS'] = {
  'title': 'Index Columns',
  'sql' : `select column_name
           ,      column_length
           from dba_ind_columns
           where index_owner = :owner
           and index_name :object_name
           order by column_position`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['INDEX-FUNCTION'] = {
  'title': 'Index Expression',
  'sql' : `select column_expression
           from dba_ind_expressions
           where index_owner = :owner
           and index_name = :object_name
           order by column_position`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['TABLE-KEYS'] = {
  'title': 'Keys',
  'sql' : `select constraint_type
           ,      constraint_name
           from dba_constraints
           where owner = :owner
           and table_name = :object_name
           order by constraint_type, constraint_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['CONSTRAINT-COLUMNS'] = {
  'title': 'Key Columns',
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
  'sql' : `select col.column_name
           ,      col.data_type
           ,      col.data_length
           ,      col.data_precision
           ,      col.nullable
           ,      com.comments
           from dba_tab_columns col
           ,    dba_col_comments com
           where col.owner = :owner
           and col.table_name = :object_name
           and col.table_name = com.table_name (+)
           and col.column_name = com.column_name (+)
           order by col.column_id`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['FK-IN-TABLE'] = {
  'title': 'Foreign Keys',
  'sql': `select obj.name as table_name
          ,    cdef.robj# object_id
          ,    cdef.con# cons_id
          from sys.cdef$ cdef
          ,    sys.obj$ obj
          where cdef.obj# = :object_id
          and cdef.robj# is not null
          and cdef.robj# = obj.obj#
          order by obj.name`,
  'params': {
    object_id: { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" }
  }
};
statement['FK-TO-TABLE'] = {
  'title': 'Foreign Keys to this Table',
  'sql': `select obj.name as table_name
          ,    cdef.obj# object_id
          ,    cdef.con# cons_id
          from sys.cdef$ cdef
          ,    sys.obj$ obj
          where cdef.robj# = :object_id
          and cdef.obj# = obj.obj#
          order by obj.name`,
  'params': {
    object_id: { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" }
  }
};
statement['VIEW-SOURCE'] = {
  'title': 'Source',
  'sql': `select text
          from dba_views
          where owner = :owner
          and view_name = :object_name  `,
  'params' : {
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['MVIEW-DETAILS'] = {
  'title': 'Materialized View Details',
  'sql' : `select container_name
           ,      updatable
           ,      rewrite_enabled
           ,      rewrite_capability
           ,      refresh_mode
           ,      refresh_method
           ,      build_mode
           ,      fast_refreshable
           ,      query
           from dba_mviews
           where owner = :owner
           and mview_name = :object_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['MVIEW-LOG_DEPENDENCIES'] = {
  'title': 'Log Dependencies',
  'sql' : `select lpad(' ',5*(LEVEL-1)) || master  tree_entry
           from sys.snap_reftime$ 
           start with sowner = :owner
                  and vname = :object_name
           connect by prior mowner = sowner
                        and master = vname`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['TRIGGER-DETAILS'] = {
  'title': 'Trigger Details',
  'sql' : `select table_owner
           ,      base_object_type
           ,      table_name
           ,      column_name
           ,      referencing_names
           ,      when_clause
           ,      description
           ,      action_type
           ,      trigger_body
           from dba_triggers
           where owner = :owner
           and   trigger_name = :object_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['DECODE-SYNONYM'] = {
  'title': 'Synonym for',
  'sql' : `select table_owner
           ,      table_name
           ,      db_link
           from sys.dba_synonyms
           where owner = :owner
           and synonym_name = :object_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['QUEUE-DETAILS'] = {
  'title': 'Queue Details',
  'sql' : `select queue_table
           ,      queue_type
           ,      max_retries
           ,      retry_delay
           ,      enqueue_enabled
           ,      dequeue_enabled
           ,      retention
           ,      user_comment
           from dba_queues
           where owner = :owner
           and name = :object_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['TYPE-DETAILS'] = {
  'title': 'Type Details',
  'sql' : `select typecode
           ,      attributes
           ,      methods
           ,      predefined
           ,      incomplete
           from dba_types
           where owner = :owner
           and type_name = :object_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['COLLECTION-TYPE-DETAILS'] = {
  'title': 'Collection Type Details',
  'sql' : `select owner
           ,      type_name
           ,      coll_type
           ,      upper_bound
           ,      elem_type_mod
           ,      elem_type_owner
           ,      elem_type_name
           ,      length
           ,      precision
           ,      scale
           ,      character_set_name
           ,      elem_storage
           ,      nulls_stored
           from dba_coll_types
           where owner = :owner
           and type_name= :object_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['TYPE-ATTRIBUTES'] = {
  'title': 'Type Attributes',
  'sql' : `select owner
           ,      type_name
           ,      attr_name
           ,      attr_type_mod
           ,      attr_type_owner
           ,      attr_type_name
           ,      length
           ,      precision
           ,      scale
           ,      character_set_name
           ,      attr_no
           from dba_type_attrs
           where owner = :owner
           and type_name = :object_name
           order by attr_no`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['TYPE-METHODS'] = {
  'title': 'Type Methods',
  'sql' : `select owner
           ,      type_name
           ,      method_name
           ,      method_no
           ,      method_type
           ,      parameters
           ,      results
           from dba_type_methods
           where owner = :owner
           and type_name = :object_name
           order by method_no`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['METHOD-PARAMETERS'] = {
  'title': 'Method Parameters',
  'sql' : `select param_name
           ,      param_no
           ,      param_type_name
           from dba_method_params
           where owner = :owner
           and type_name = :object_name
           and method_name = :method_name
           and method_no = :method_no
           order by param_no`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    method_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    method_no : { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" }
  }
};
statement['METHOD-RESULTS'] = {
  'title': 'Method Results',
  'sql' : `select result_type_name
           from sys.dba_method_results
           where owner = :owner
           and type_name = :object_name
           and method_name = :method_name
           and method_no = :method_no`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    method_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    method_no : { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" }
  }
};
statement['SOURCE'] = {
  'title': 'Source',
  'sql' : `select line
           ,      text
           from dba_source
           where owner = :owner
           and type = :object_type
           and name = :object_name`,
  'params' : {
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_type: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['ERRORS'] = {
  'title': 'Error Details',
  'sql' : `select line
           ,      position
           ,      text
           from dba_errors
           where owner = :owner
           and type = :object_type
           and name = :object_name
           order by sequence`,
  'params' : {
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_type: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['SOURCE-LINE-DEPENDENCY'] = {
  'title': 'Source Dependencies',
  'sql' : `select line
    ,      source
    from sys.source$
    where upper(source) like c_name
    and obj# = :object_id`,
  'params' : {
    object_id : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['USED-BY-OBJECTS'] = {
  'title': 'Used By',
  'sql' : `select d_obj# object_id
           ,      object_name
           ,      object_type
           ,      owner
           from sys.dependency$
           ,    dba_objects
           where p_obj# = :object_id
           and d_obj# = object_id
           order by owner, object_name, object_type`,
  'params' : {
    object_id : { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" }
  }
};
statement['USES-OBJECTS'] = {
  'title': 'Uses',
  'sql' : `select p_obj#
           ,      object_name
           ,      object_type
           ,      owner
           from sys.dependency$
           ,    dba_objects
           where d_obj# = :object_id
           and p_obj# = object_id
           order by owner, object_name, object_type`,
  'params' : {
    object_id : { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" }
  }
};
module.exports.statement = statement;

/**
 * Collect statments by object type.  
 * @param objectNameQueries - queries that accept owner + object_name as input
 * @param objectIdQueries - queries that accept object_id as input
 * @param objectTypeQueries - queries that accept owner, object_name + object_type
 * @param childObjectQueries - drill down from an earlier query e.g. columns in an index
 */
collection['TABLE'] = {
  objectNameQueries: [
    statement['TABLE-DETAILS'], 
    statement['TABLE-COMMENTS'],
    statement['TABLE-INDEXES'],
    statement['TABLE-KEYS'],
    statement['TABLE-COLUMNS']
  ],
  objectIdQueries: [
    statement['FK-IN-TABLE'],
    statement['FK-TO-TABLE']
  ],
  objectTypeQueries: [],
  childObjectQueries: [
    collection['INDEX'],
    statement['CONSTRAINT-COLUMNS']
  ]
};
collection['VIEW'] = {
  objectNameQueries: [
    statement['TABLE-DETAILS'], 
    statement['TABLE-COMMENTS'],
    statement['TABLE-COLUMNS'],
    statement['VIEW-SOURCE']
  ],
  objectTypeQueries: [],
  objectIdQueries: [],
  childObjectQueries: []
};
collection['PACKAGE'] = {
  objectNameQueries: [],
  objectIdQueries: [],
  objectTypeQueries: [
    statement['SOURCE']
  ],
  childObjectQueries: []
};
collection['PACKAGE BODY'] = {
  objectNameQueries: [],
  objectIdQueries: [],
  objectTypeQueries: [
    statement['SOURCE']
  ],
  childObjectQueries: []
};
collection['PROCEDURE'] = {
  objectNameQueries: [],
  objectIdQueries: [],
  objectTypeQueries: [
    statement['SOURCE']
  ],
  childObjectQueries: []
};
collection['FUNCTION'] = {
  objectNameQueries: [],
  objectIdQueries: [],
  objectTypeQueries: [
    statement['SOURCE']
  ],
  childObjectQueries: []
};
collection['TYPE BODY'] = {
  objectNameQueries: [],
  objectIdQueries: [],
  objectTypeQueries: [
    statement['SOURCE']
  ],
  childObjectQueries: []
};
collection['JAVA SOURCE'] = {
  objectNameQueries: [],
  objectIdQueries: [],
  objectTypeQueries: [
    statement['SOURCE']
  ],
  childObjectQueries: []
};
collection['MATERIALIZED VIEW'] = {
  objectNameQueries: [
    statement['MVIEW-DETAILS'],
    statement['MVIEW-LOG_DEPENDENCIES']
  ],
  objectIdQueries: [],
  objectTypeQueries: [],
  childObjectQueries: []
};
collection['TRIGGER'] = {
  objectNameQueries: [
    statement['TRIGGER-DETAILS']
  ],
  objectIdQueries: [],
  objectTypeQueries: [],
  childObjectQueries: []
};
collection['INDEX'] = {
  objectNameQueries: [
    statement['INDEX-COLUMNS'],
    statement['INDEX-FUNCTION'],
  ],
  objectIdQueries: [],
  objectTypeQueries: [],
  childObjectQueries: []
};
collection['QUEUE'] = {
  objectNameQueries: [
    statement['QUEUE-DETAILS']
  ],
  objectIdQueries: [],
  objectTypeQueries: [],
  childObjectQueries: []
};
collection['SYNONYM'] = {
  objectNameQueries: [
    statement['DECODE-SYNONYM']
  ],
  objectIdQueries: [],
  objectTypeQueries: [],
  childObjectQueries: []
};
collection['CLUSTER'] = {
  objectNameQueries: [
    statement['TABLE-COLUMNS']
  ],
  objectIdQueries: [],
  objectTypeQueries: [],
  childObjectQueries: []
};
collection['TYPE'] = {
  objectNameQueries: [
    statement['TYPE-DETAILS'],
    statement['COLLECTION-TYPE-DETAILS'],
    statement['TYPE-ATTRIBUTES'],
    statement['TYPE-METHODS']
  ],
  objectIdQueries: [],
  objectTypeQueries: [],
  childObjectQueries: [
    statement['METHOD-PARAMETERS'],
    statement['METHOD-RESULTS']
  ]
};
collection['DEPENDENCIES'] = {
  objectNameQueries: [],
  objectIdQueries: [
    statement['USED-BY-OBJECTS'],
    statement['USES-OBJECTS']
  ],
  objectTypeQueries: [],
  childObjectQueries: [
    statement['SOURCE-LINE-DEPENDENCY']
  ]
}
module.exports.collection = collection;
