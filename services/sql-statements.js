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
  'description': '',
  'display': [],
  'sql' : `select owner, object_type, count(*) as object_count
           from dba_objects o
           where not exists (select 1
                             from dba_logstdby_skip l
                             where l.owner = o.owner
                             and l.statement_opt = 'INTERNAL SCHEMA')
           and owner not in ('PUBLIC')          
           group by owner, object_type
           order by owner, object_type`,
   'params': {
   }
};
statement['VALIDATE-OWNER-AND-TYPE'] = {
  'title': 'Validate OWNER + OBJECT_TYPE combination',
  'description': '',
  'display': [],
  'sql': `select count(*) as object_count
          from dba_objects
          where owner = :owner
          and object_type = :object_type`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_type : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['LIST_DBA_OBJECTS'] = {
  'title': 'Object List',
  'description': '',
  'display': [],
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
  'description': 'from DBA_OBJECTS',
  'display': ["Object Name", "Type", "Owner", "Created", "Status"], 
  'sql': `select object_name as "Object Name"
          ,      object_type as "Type"
          ,      owner as "Owner"
          ,      object_id
          ,      data_object_id
          ,      subobject_name
          ,      to_char(created, 'Mon dd, yyyy') as "Created"
          ,      to_char(last_ddl_time, 'Mon dd, yyyy') as "Last DDL"
          ,      timestamp as "Timestamp"
          ,      status as "Status"
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
  'description': 'from DBA_TABLES',
  'display': ["Name", "Rows", "Tablespace", "Temporary", "Duration"],
  'sql': `select table_name as "Name"
          ,      num_rows
          ,      to_char(num_rows, 'FM999,999,999,999') as "Rows"
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
  'description': 'from DBA_TAB_COMMENTS',
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
  'description': 'from DBA_INDEXES and DBA_IND_COLUMNS',
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
  'description': 'from DBA_IND_COLUMNS',
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
  'description': 'from DBA_IND_EXPRESSIONS',
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
  'description': 'from DBA_CONSTRAINTS and DBA_CONS_COLUMNS',
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
  'description': 'from DBA_CONS_COLUMNS',
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
  'description': 'from DBA_TAB_COLUMNS and DBA_CONS_COLUMNS',
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
           order by col.column_id`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['FK-IN-TABLE'] = {
  'title': 'Foreign Keys',
  'description': 'from SYS.CDEF$',
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
statement['FK-TO-TABLE'] = {
  'title': 'Foreign Keys to this Table',
  'description': 'from SYS.CDEF$',
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
statement['VIEW-SOURCE'] = {
  'title': 'Source',
  'description': 'from DBA_VIEWS',
  'display': ["Text"],
  'sql': `select text "Text"
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
  'description': 'from DBA_MVIEWS',
  'display': ["Container", "Updatable", "Rewrite Enabled", "Rewrite Capacity",
              "Refresh Mode", "Build Mode", "Fast Refreshable"],
  'sql' : `select container_name as "Container"
           ,      updatable as "Updatable"
           ,      rewrite_enabled as "Rewrite Enabled"
           ,      rewrite_capability as "Rewrite Capacity"
           ,      refresh_mode as "Refresh Mode"
           ,      refresh_method as "Refresh Method"
           ,      build_mode as "Build Mode"
           ,      fast_refreshable as "Fast Refreshable"
           ,      query as "Query"
           from dba_mviews
           where owner = :owner
           and mview_name = :object_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};

statement['MVIEW-SOURCE'] = {
  'title': 'Source',
  'description': 'from DBA_MVIEWS',
  'display': ["Text"],
  'sql' : `select query as "Text"
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
  'description': 'from SYS.SNAP_REFTIME$',
  'display': ["Tree Entry"],
  'sql' : `select lpad('-',5*(LEVEL-1)) || master  as "Tree Entry"
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
  'description': 'from DBA_TRIGGERS',
  'display': ["Table Owner", "Base Object Type", "Table Name", 
              "Column", "Referencing Names", "When Clause", 
              "Description", "Action Type", "Body"],
  'sql' : `select table_owner as "Table Owner"
           ,      base_object_type as "Base Object Type"
           ,      table_name as "Table Name"
           ,      column_name as "Column"
           ,      referencing_names as "Referencing Names"
           ,      when_clause as "When Clause"
           ,      description as "Description"
           ,      action_type as "Action Type"
           ,      trigger_body as "Body"
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
  'description': 'from DBA_SYNONYMS',
  'display': ["Table Owner", "Table Name", "Database Link"],
  'sql' : `select table_owner as "Table Owner"
           ,      table_name as "Table Name"
           ,      db_link as "Database Link"
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
  'description': 'from DBA_QUEUES',
  'display': ["Queue Table", "Queue Type", "Max Retries", "Retry Delay",
              "Enqueue Enabled", "Dequeue Enabled", "Retention", "User Comments"],
  'sql' : `select queue_table as "Queue Table"
           ,      queue_type as "Queue Type"
           ,      max_retries as "Max Retries"
           ,      retry_delay as "Retry Delay"
           ,      enqueue_enabled as "Enqueue Enabled"
           ,      dequeue_enabled as "Dequeue Enabled"
           ,      retention as "Retention"
           ,      user_comment as "User Comments"
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
  'description': 'from DBA_TYPES',
  'display': ["Typecode", "Attributes", "Methods", "Pre-Defined", "Incomplete"],
  'sql' : `select typecode as "Typecode"
           ,      attributes as "Attributes"
           ,      methods as "Methods"
           ,      predefined as "Pre-Defined"
           ,      incomplete as "Incomplete"
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
  'description': 'from DBA_COLL_TYPES',
  'display': ["Type Name", "Collection Type", "Upper Bound", "Element Type", 
              "Element Type Modifier", "Precision", "Scale", "Character Set",
              "Storage", "Nulls Stored"],
  'sql' : `select owner
           ,      type_name as "Type Name"
           ,      coll_type as "Collection Type"
           ,      upper_bound as "Upper Bound"
           ,      elem_type_mod as "Element Type Modifier"
           ,      elem_type_owner
           ,      elem_type_name as "Element Type"
           ,      length as "Length"
           ,      precision as "Precision"
           ,      scale as "Scale"
           ,      character_set_name as "Character Set"
           ,      elem_storage as "Storage"
           ,      nulls_stored as "Nulls Stored"
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
  'description': 'from DBA_TYPE_ATTRS',
  'display': ["Type", "Attribute", "Attribute Type", "Length", "Precision", "Character Set"],
  'sql' : `select owner
           ,      type_name as "Type"
           ,      attr_name as "Attribute"
           ,      attr_type_mod as "Modifier"
           ,      attr_type_owner as "Owner"
           ,      attr_type_name as "Attribute Type"
           ,      length as "Length"
           ,      precision as "Precision"
           ,      scale as "Scale"
           ,      character_set_name as "Character Set"
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
  'description': 'from DBA_TYPE_METHODS',
  'display': ["Type", "Method", "Method Type", "Parameters", "Results"],
  'sql' : `select owner
           ,      type_name as "Type"
           ,      method_name as "Method"
           ,      method_no
           ,      method_type as "Method Type"
           ,      parameters as "Parameters"
           ,      results as "Results"
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
  'description': 'from DBA_METHOD_PARAMS',
  'display': ["Parameter", "Parameter Type"],
  'sql' : `select param_name as "Parameter"
           ,      param_no
           ,      param_type_name as "Parameter Type"
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
  'description': 'from DBA_METHOD_RESULTS',
  'display': ["Result Type"],
  'sql' : `select result_type_name as "Result Type"
           from dba_method_results
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
  'description': 'from DBA_SOURCE',
  'display': ["Line", "Text"],
  'sql' : `select line as "Line"
           ,      text as "Text"
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
  'description': 'from DBA_ERRORS',
  'display': ["Line", "Position", "Text"],
  'sql' : `select line as "Line"
           ,      position as "Position"
           ,      text as "Text"
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
  'description': 'from SYS.SOURCE$',
  'display': [ "Line Number", "Text"],
  'sql' : `select line as "Line Number"
    ,      source as "Text"
    from sys.source$
    where upper(source) like :object_name
    and obj# = :object_id`,
  'params' : {
    object_id : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};

/**
 * Find dependencies to/from the current object.  
 * The queries run against the dependency$ table instead of the dba_dependencies
 * view for performance reasons.  
 */

statement['USED-BY-OBJECTS'] = {
  'title': 'Used By',
  'description': 'from SYS.DEPENDENCY$ and SYS.SOURCE$',
  'display': ["Object Name", "Object Type", "Line"],
  'link': 'Object Name',
  'sql' : `select d.d_obj# object_id
           ,      o.object_name as "Object Name"
           ,      o.object_type as "Object Type"
           ,      o.owner as "Owner"
           ,      o.owner||'/'||o.object_type||'/'||o.object_name as link           
           ,      LISTAGG(s.line, ', ') WITHIN GROUP (ORDER BY s.line ) as "Line"           
           from dba_objects o
           ,    sys.dependency$ d
           left join sys.source$ s on d.d_obj# = s.obj# and upper(s.source) like '%'||:object_name||'%' 
           where d.p_obj# = :object_id
           and d.d_obj# = o.object_id           
           group by d.d_obj#, o.owner, o.object_name, o.object_type, o.owner||'/'||o.object_type||'/'||o.object_name
           order by o.owner, o.object_name, o.object_type`,


  'params' : {
    object_id : { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" },
    object_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};
statement['USES-OBJECTS'] = {
  'title': 'Uses',
  'description': 'from SYS.DEPENDENCY$ and SYS.SOURCE$',
  'display': ["Object Name", "Object Type", "Line"],
  'link': 'Object Name',
  'sql' : `select d.p_obj#
           ,      o.object_name as "Object Name"
           ,      o.object_type as "Object Type"
           ,      o.owner as "Owner"
           ,      o.owner||'/'||o.object_type||'/'||o.object_name as link
           ,      LISTAGG(s.line, ', ') WITHIN GROUP (ORDER BY s.line ) as "Line"  
           from sys.dependency$ d 
           left join sys.source$ s on d.d_obj# = s.obj#
           left join dba_objects o on upper(s.source) like '%'||o.object_name||'%' 
           where d.d_obj# = :object_id
           and d.p_obj# = o.object_id
           group by d.p_obj#, o.owner, o.object_name, o.object_type, o.owner||'/'||o.object_type||'/'||o.object_name
           order by o.owner, o.object_name, o.object_type`,
  'params' : {
    object_id : { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" },
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
    statement['INDEX-FUNCTION'],
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
    statement['MVIEW-SOURCE'],
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
  objectNameIdQueries: [statement['USED-BY-OBJECTS']],
  objectIdQueries: [ statement['USES-OBJECTS'] ],
  objectTypeQueries: [],
  childObjectQueries: [
    statement['SOURCE-LINE-DEPENDENCY']
  ]
}
module.exports.collection = collection;
