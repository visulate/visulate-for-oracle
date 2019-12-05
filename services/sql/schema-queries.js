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

statement['DB-VERSION'] = {
  'title': 'Database Version',
  'description': '',
  'display': ["Version"],
  'sql' : `select banner as "Version" from v$version`,
   'params': {
   }
};

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
  'title': 'Database Features',
  'description': '',
  'display': ["Feature", "Detected Usages"],
  'sql': `select name as "Feature"
          ,      detected_usages as "Detected Usages"
          from dba_feature_usage_statistics 
          where detected_usages > 0 
          order by detected_usages desc`,
   'params': {
   }
};

//select name, detected_usages from dba_feature_usage_statistics where detected_usages > 0 order by 2 desc

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
  'sql' : `select round(sum(value/1024/1024/1024), 2)as  "Total Size (GB)"
           from V$sga`,
   'params': {
   }
};

statement['DB-SGA-FREE'] = {
  'title': 'SGA Free',
  'description': '',
  'display': ["Free Memory (MB)"],
  'sql' : `select round(sum(bytes/1024/1024), 2) as "Free Memory (MB)"
           from v$sgastat
           where name like '%free memory%'`,
   'params': {
   }
};

statement['DB-SEGMENTS'] = {
  'title': 'Storage Segments',
  'description': '',
  'display': ["Schema", "Size (GB)"],
  'link': "Schema",
  'sql' : `select s.owner as "Schema"
           , round(sum(bytes/1024/1024/1024),2) as "Size (GB)"
           , owner as link
           from dba_segments s
           where not exists (select 1
            from dba_logstdby_skip l
            where l.owner = s.owner
            and l.statement_opt = 'INTERNAL SCHEMA')
           group by s.owner 
           order by 2 desc`,
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
  'sql': `select  object_id, object_name, object_type, owner
          from dba_objects
          where  owner = :owner
          and object_type like :object_type
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
    object_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_type: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }        
};

module.exports.statement = statement;
