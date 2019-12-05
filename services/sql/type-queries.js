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

statement['VIEW-SOURCE'] = {
  'title': 'Source',
  'description': 'Source query for the view',
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
  'description': '',
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
  'description': 'Materialized view source query',
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
  'description': '',
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
  'description': '',
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
  'description': 'Table aliases',
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
  'description': '',
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
  'description': '',
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
  'description': '',
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
  'description': '',
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
  'description': '',
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
  'description': '',
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
  'description': '',
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
  'description': 'PL/SQL source code',
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
  },
  'callback': 'extractSqlStatements'
};
statement['ERRORS'] = {
  'title': 'Error Details',
  'description': '',
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

module.exports.statement = statement;
