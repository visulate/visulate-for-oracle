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
 * Visulate user needs SELECT_CATALOG_ROLE, SELECT ANY DICTIONARY and CREATE SESSION
 * Query user_role_privs + user_sys_privs to get a list of granted privileges.
 */
const oracledb = require('oracledb');
let statement = {};
statement['VALIDATE-CONNECTION'] = {
  'title': 'Granted Role/Privilege',
  'display': [],
  'sql': `select granted_role as privilege
          from user_role_privs
          where username != 'PUBLIC'
          union all
          select privilege
          from user_sys_privs
          where username != 'PUBLIC'`,
  'params': {}
};

/**
 * SQL statements + bind variables to query the data dictionary
 */
statement['COUNT_DBA_OBJECTS'] = {
  'title': 'Object Count',
  'description': '',
  'display': [],
  'sql': `select o.owner, o.object_type, count(*) as object_count
           ,      max(case when u.oracle_maintained = 'Y' then 1 else 0 end) as INTERNAL
           from dba_objects o
           join dba_users u on o.owner = u.username
           where o.object_type not in ('INDEX PARTITION','INDEX SUBPARTITION',
                'LOB','LOB PARTITION','TABLE PARTITION','TABLE SUBPARTITION')
           group by o.owner, o.object_type
           order by o.owner, o.object_type`,
  'params': {
  }
};

statement['COUNT_DBA_OBJECTS_FILTER'] = {
  'title': 'Object Count',
  'description': '',
  'display': [],
  'sql': `select o.owner, o.object_type, count(*) as object_count
           ,      max(case when u.oracle_maintained = 'Y' then 1 else 0 end) as INTERNAL
           from dba_objects o
           join dba_users u on o.owner = u.username
           where o.object_name like :object_name ESCAPE :esc
           and o.object_type not in ('INDEX PARTITION','INDEX SUBPARTITION',
                'LOB','LOB PARTITION','TABLE PARTITION','TABLE SUBPARTITION')
           group by o.owner, o.object_type
           order by o.owner, o.object_type`,
  'params': {
    object_name: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "%" },
    esc: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "\\" },
  }
};

statement['DB-VERSION'] = {
  'title': 'Database Version',
  'description': '',
  'display': ["Version"],
  'sql': `select banner as "Version" from v$version`,
  'params': {
  }
};

statement['ADB-YN'] = {
  'title': 'Oracle Cloud Autonomous Database Instance',
  'display': ["Autonomous Database"],
  'sql': `select decode( count(*), 0, 'No',
                                       'Yes') as "Autonomous Database"
           from dba_objects
           where object_name = 'DBMS_CLOUD'`,
  'params': {}
}

statement['EBS-SCHEMA'] = {
  'title': 'E-Business Suite Schema Detected',
  'description': '',
  'display': ["EBS Schema"],
  'sql': `select decode(count(*), 1, 'Yes',
                                     'No') as "EBS Schema"
          from dba_tables
          where owner='APPLSYS'
          and table_name = 'FND_APPLICATION'`,
  'params': {
  }
};

statement['COUNT-INVALID-OBJECTS'] = {
  'title': 'Invalid Objects',
  'description': '',
  'link': 'Owner',
  'display': ["Owner", "Object Type", "Count"],
  'sql': `select owner as "Owner"
          ,      object_type as "Object Type"
          ,      count(*) as "Count"
          ,      owner as link
          from dba_objects
          where status = 'INVALID'
          group by owner, object_type
          order by owner, object_type`,
  'params': {}
}

statement['DB-FEATURES'] = {
  'title': 'Database Features',
  'description': '',
  'display': ["Feature"],
  'sql': `select comp_name as "Feature"
          from dba_registry
          where status = 'VALID'`,
  'params': {
  }
};

statement['DB-FEATURE-USAGE'] = {
  'title': 'Database Feature Usage',
  'description': '',
  'display': ["Feature", "Times Used", "First Used", "Last Used", "Used Now"],
  'sql': `select f.name as "Feature"
          ,      f.detected_usages as "Times Used"
          ,      to_char(f.first_usage_date, 'Mon DD, YYYY') as "First Used"
          ,      to_char(f.last_usage_date, 'Mon DD, YYYY') as "Last Used"
          ,      f.currently_used as "Used Now"
          from dba_feature_usage_statistics f
          ,    v$database d
          where f.detected_usages > 0
          and d.dbid = f.dbid
          order by f.name`,
  'params': {
  }
};

statement['DB-OS-STAT'] = {
  'title': 'System Utilization Statistics ',
  'description': '',
  'display': ["Statistic", "Value"],
  'sql': `select comments as "Statistic"
          ,      value
          ,      to_char(value, 'FM999,999,999,999') as "Value"
          from v$osstat`,
  'params': {
  }
};

statement['DB-SGA-SIZE'] = {
  'title': 'SGA Size',
  'description': '',
  'display': ["Total Size (GB)"],
  'sql': `select round(sum(value/1024/1024/1024), 2)as  "Total Size (GB)"
           from V$sga`,
  'params': {
  }
};

statement['DB-SGA-FREE'] = {
  'title': 'SGA Free',
  'description': '',
  'display': ["Free Memory (MB)"],
  'sql': `select round(sum(bytes/1024/1024)) as "Free Memory (MB)"
           from v$sgastat
           where name like '%free memory%'`,
  'params': {
  }
};

statement['DB-SIZE'] = {
  'title': 'Database Size',
  'description': '',
  'display': ["Tablespace", "Size (GB)"],
  'sql': `select nvl(tablespace_name, 'Total') as "Tablespace",
          round(sum(bytes)/1024/1024/1024, 2) as "Size (GB)"
          from dba_data_files
          group by grouping sets((), (tablespace_name))
          order by 2 desc`,
  'params': {}
};

statement['DB-SPACE-USED'] = {
  'title': 'Space Used',
  'description': '',
  'display': ["Schema", "Size (GB)"],
  'sql': `select nvl(owner, 'Total') as "Schema",
          round(sum(bytes)/1024/1024/1024, 2) as "Size (GB)"
          from dba_segments
          group by grouping sets((), (owner))
          order by 2 desc`,
  'params': {}
}

statement['PATCHES'] = {
  'title': 'Patch History',
  'description': '',
  'display': ["Time", "Action", "Namespace", "Version", "ID", "Comments"],
  'sql': `select to_char(action_time, 'Mon dd, yyyy hh24:mi') as "Time"
           ,      action as "Action"
           ,      namespace as "Namespace"
           ,      version as "Version"
           ,      id as "ID"
           ,      comments as "Comments"
           from  DBA_REGISTRY_HISTORY
           order by action_time`,
  'params': {
  }
};

statement['DB-LINKS'] = {
  'title': 'Database Links',
  'description': '',
  'display': ["Schema", "Database Link", "Username", "Connect String"],
  'sql': `select owner as "Schema",
           db_link as "Database Link",
           username as "Username",
           host as "Connect String"
           from dba_db_links
           order by 1, 2`,
  'params': {
  }
};

statement['SCHEMA-USER'] = {
  'title': 'Schema Status',
  'description': '',
  'display': ["Status", "Default Tablespace", "Temporary Tablespace"],
  'sql': `select account_status as "Status"
           ,      default_tablespace as "Default Tablespace"
           ,      temporary_tablespace as "Temporary Tablespace"
           from dba_users
           where username = :owner`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" }
  }
};

statement['SCHEMA-INDEXES'] = {
  'title': 'Non Standard Indexes',
  'description': 'Indexes that are not of type NORMAL or LOB',
  'display': ["Index", "Type"],
  'link': "Index",
  'sql': `select index_type as "Type"
           ,      index_name as "Index"
           ,      owner||'/INDEX/'||index_name as link
           from dba_indexes
           where owner = :owner
           and index_name like :object_name ESCAPE :esc
           and index_type not in ('NORMAL', 'LOB')
           order by index_name, index_type`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "%" },
    esc: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "\\" },
  }
};

statement['SCHEMA-INVALID-OBJECTS'] = {
  'title': 'Invalid Objects',
  'description': 'Invalid objects in the schema',
  'display': ["Type", "Name", "Line", "Error"],
  'link': 'Name',
  'sql': `select type as "Type"
          ,      name as "Name"
          ,      line as "Line"
          ,      text as "Error"
          ,      owner||'/'||type||'/'||name as link
          from dba_errors
          where owner = :owner
          and name like :object_name ESCAPE :esc
          order by type, name, line`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "%" },
    esc: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "\\" },
  }
};

statement['SCHEMA-DATATYPES'] = {
  'title': 'Data Types',
  'description': 'Column data type usage in tables and views',
  'display': ["Data Type", "Count"],
  'sql': `select data_type as "Data Type"
           ,      count(*) as "Count"
           from dba_tab_columns
           where owner = :owner
           and table_name like :object_name ESCAPE :esc
           group by data_type
           order by data_type`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "%" },
    esc: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "\\" },
  }
};

statement['SCHEMA-DBMS-USAGE'] = {
  'title': 'DBMS and UTL Usage',
  'description': 'Stored procedures using DBMS_ and UTL_ packages',
  'display': ["Name", "Type", "Count"],
  'link': "Name",
  'sql': `select name as "Name"
           ,      type as "Type"
           ,      owner||'/'||type||'/'||name as link
           ,      count(*) as "Count"
           from dba_source
           where owner = :owner
           and name like :object_name ESCAPE :esc
           and (TEXT LIKE '%UTL%' OR TEXT LIKE '%DBMS%')
           group by name, type, owner||'/'||type||'/'||name
           order by name, type`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "%" },
    esc: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "\\" },
  }
};

statement['SCHEMA-SPATIAL-USAGE'] = {
  'title': 'Spatial',
  'description': 'Tables and views with spatial columns',
  'display': ["Object Name", "Type", "Column"],
  'link': "Object Name",
  'sql': `select c.table_name as "Object Name"
           ,      o.object_type as "Type"
           ,      c.column_name as "Column"
           ,      c.owner||'/'||o.object_type||'/'||c.table_name as link
           from dba_tab_columns c
           ,    dba_objects o
           where c.owner = :owner
           and c.data_type= 'SDO_GEOMETRY'
           and o.owner = c.owner
           and o.object_name = c.table_name
           and o.object_name like :object_name ESCAPE :esc
           order by c.table_name, o.object_type, c.column_name`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "%" },
    esc: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "\\" },
  }
};

statement['VALIDATE-OWNER-AND-TYPE'] = {
  'title': 'Validate OWNER + OBJECT_TYPE combination',
  'description': '',
  'display': [],
  'sql': `select count(*) as object_count
          from dba_objects
          where owner like :owner
          and object_type like :object_type`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_type: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" }
  }
};
statement['LIST_DBA_OBJECTS'] = {
  'title': 'Object List',
  'description': '',
  'display': [],
  'sql': `select  object_id, object_name, object_type, owner
          from dba_objects
          where  owner = :owner
          and object_type like :object_type
          and object_name like :object_name ESCAPE :esc
          and status like :status
          and rownum < 3000
          and object_type not in ('INDEX PARTITION','INDEX SUBPARTITION',
                'LOB','LOB PARTITION','TABLE PARTITION','TABLE SUBPARTITION')
          order by owner, object_type, object_name`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_type: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    esc: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "\\" },
    status: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "%" }
  }
};

// https://stackoverflow.com/questions/10886450/how-to-generate-entire-ddl-of-an-oracle-schema-scriptable
statement['DDL-GEN'] = {
  'title': 'DDL',
  'description': '',
  'display': [],
  'sql': `select dbms_metadata.get_ddl(object_type, object_name, owner) as ddl
          from
          ( select owner
            ,      object_name
            ,      decode(object_type,
                            'DATABASE LINK',      'DB_LINK',
                            'JOB',                'PROCOBJ',
                            'RULE SET',           'PROCOBJ',
                            'RULE',               'PROCOBJ',
                            'EVALUATION CONTEXT', 'PROCOBJ',
                            'CREDENTIAL',         'PROCOBJ',
                            'CHAIN',              'PROCOBJ',
                            'PROGRAM',            'PROCOBJ',
                            'PACKAGE',            'PACKAGE_SPEC',
                            'PACKAGE BODY',       'PACKAGE_BODY',
                            'TYPE',               'TYPE_SPEC',
                            'TYPE BODY',          'TYPE_BODY',
                            'MATERIALIZED VIEW',  'MATERIALIZED_VIEW',
                            'QUEUE',              'AQ_QUEUE',
                            'JAVA CLASS',         'JAVA_CLASS',
                            'JAVA TYPE',          'JAVA_TYPE',
                            'JAVA SOURCE',        'JAVA_SOURCE',
                            'JAVA RESOURCE',      'JAVA_RESOURCE',
                            'XML SCHEMA',         'XMLSCHEMA',
                            object_type
                          ) as object_type
            from dba_objects
            where owner = :owner
            and object_type like :object_type
            and object_name like :object_name ESCAPE :esc
            and status like :status
            and object_type not in ('INDEX PARTITION','INDEX SUBPARTITION',
                'LOB','LOB PARTITION','TABLE PARTITION','TABLE SUBPARTITION')
            and not (object_type = 'TYPE' and object_name like 'SYS_PLSQL_%')
            and (owner, object_name) not in
                      (select owner, table_name
                      from dba_nested_tables)
            and (owner, object_name) not in
                      (select owner, table_name
                      from dba_tables
                      where iot_type = 'IOT_OVERFLOW')
            )
          order by owner, object_type, object_name`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_type: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    esc: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "\\" },
    status: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "%" }
  }
}

statement['FIND-DBA-OBJECTS'] = {
  'title': 'Search Results',
  'description': 'Database objects matching the search condition',
  'display': [],
  'sql': `select object_id as "object_id"
          ,      owner as "owner"
          ,      object_name as "object_name"
          ,      object_type as "object_type"
          ,      status as "status"
          from dba_objects
          where object_name = :object_name
          order by owner, object_name, object_type`,
  'params': {
    object_name: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" }
  }
};

statement['OBJECT-DETAILS'] = {
  'title': 'Object Details',
  'description': '',
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
    object_name: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_type: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" }
  }
};
statement['SCHEMA-SUMMARY'] = {
  'title': 'Schema Summary',
  'description': 'High level summary of tables and views in the schema',
  'link': 'Name',
  'display': ["Name", "Type", "Comments"],
  'sql': `select table_name as "Name"
          ,      table_type as "Type"
          ,      comments as "Comments"
          ,      owner||'/'||table_type||'/'||table_name as link
          from dba_tab_comments
          where owner = :owner
          and table_type in ('TABLE', 'VIEW')
          order by table_type, table_name`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" }
  }
};
statement['SCHEMA-RELATIONSHIPS'] = {
  'title': 'Schema Relationships',
  'description': 'Foreign key relationships in the schema',
  'display': ["Table Name", "Constraint Name", "Referenced Table", "Referenced Owner"],
  'sql': `select cons.table_name as "Table Name"
          ,      cons.constraint_name as "Constraint Name"
          ,      rcons.table_name as "Referenced Table"
          ,      rcons.owner as "Referenced Owner"
          from dba_constraints cons
          join dba_constraints rcons on cons.r_constraint_name = rcons.constraint_name
                                   and cons.r_owner = rcons.owner
          where cons.owner = :owner
          and cons.constraint_type = 'R'
          order by cons.table_name, cons.constraint_name`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" }
  }
};
statement['SCHEMA-COLUMNS'] = {
  'title': 'Schema Columns',
  'description': 'Column definitions in the schema',
  'display': ["Table Name", "Column Name", "Data Type", "Length", "Nullable"],
  'sql': `select table_name as "Table Name"
          ,      column_name as "Column Name"
          ,      data_type as "Data Type"
          ,      data_length as "Length"
          ,      nullable as "Nullable"
          from dba_tab_columns
          where owner = :owner
          order by table_name, column_id`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" }
  }
};

statement['SCHEMA-MISSING-TABLE-COMMENTS'] = {
  'title': 'Tables and Views Missing Comments',
  'description': '',
  'display': ["Owner", "Name", "Type"],
  'sql': `SELECT owner, table_name as "Name", table_type as "Type"
          FROM dba_tab_comments
          WHERE owner = :owner
          AND table_name LIKE :object_name ESCAPE :esc
          AND comments IS NULL
          AND table_type IN ('TABLE', 'VIEW')`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "%" },
    esc: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "\\" },
  }
};

statement['SCHEMA-MISSING-COL-COMMENTS'] = {
  'title': 'Columns Missing Comments',
  'description': '',
  'display': ["Owner", "Table Name", "Column Name"],
  'sql': `SELECT owner, table_name as "Table Name", column_name as "Column Name"
          FROM dba_col_comments
          WHERE owner = :owner
          AND table_name LIKE :object_name ESCAPE :esc
          AND comments IS NULL`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "%" },
    esc: { dir: oracledb.BIND_IN, type: oracledb.STRING, val: "\\" },
  }
};

module.exports.statement = statement;
