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

statement['SOURCE-LINE-DEPENDENCY'] = {
  'title': 'Source Dependencies',
  'description': '',
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
 *
 * xmlagg - see:
 * https://blog.tuningsql.com/how-to-fix-ora-01489-result-of-string-concatenation-is-too-long-when-using-listagg/
 */

statement['USED-BY-OBJECTS'] = {
  'title': 'Used By',
  'description': 'Dependencies other objects have on this one',
  'display': ["Object Name", "Object Type", "Line"],
  'link': 'Object Name',
  'sql' : `select d.d_obj# object_id
           ,      o.object_name as "Object Name"
           ,      o.object_type as "Object Type"
           ,      o.owner as "Owner"
           ,      o.owner||'/'||o.object_type||'/'||o.object_name as link
           ,      rtrim(xmlagg(xmlelement(e,s.line,', ').extract('//text()') order by s.line).getclobval(),', ') as "Line"
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
  'description': 'Dependencies this object has on others',
  'display': ["Object Name", "Object Type", "Line"],
  'link': 'Object Name',
  'sql' : `select d.p_obj#
           ,      o.object_name as "Object Name"
           ,      o.object_type as "Object Type"
           ,      o.owner as "Owner"
           ,      o.owner||'/'||o.object_type||'/'||o.object_name as link
           ,      rtrim(xmlagg(xmlelement(e,s.line,', ').extract('//text()') order by s.line).getclobval(),', ') as "Line"
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
statement['USED-BY-OBJECTS-NOLINE'] = {
  'title': 'Used By',
  'display': ["Object Name", "Object Type", "Owner"],
  'sql' : `select d_obj# as object_id
           ,      object_name as "Object Name"
           ,      object_type as "Object Type"
           ,      owner as "Owner"
           from sys.dependency$
           ,    dba_objects
           where p_obj# = :object_id
           and d_obj# = object_id
           order by owner, object_name, object_type`,
  'params' : {
    object_id : { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" }
  }
};
statement['USES-OBJECTS-NOLINE'] = {
  'title': 'Uses',
  'description': 'Dependencies this object has on others',
  'display': ["Object Name", "Object Type"],
  'link': 'Object Name',
  'sql' : `select p_obj# as object_id
           ,      object_name
           ,      object_type
           ,      owner
           ,      object_name as "Object Name"
           ,      object_type as "Object Type"
           ,      owner as "Owner"
           ,      owner||'/'||object_type||'/'||object_name as link
           from sys.dependency$
           ,    dba_objects
           where d_obj# = :object_id
           and p_obj# = object_id
           order by owner, object_name, object_type`,
  'params' : {
    object_id : { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" }
  }
};

/**
 * Autonomous database instances do not expose the dependency$ table
 * Need to query dba_dependencies instead.
 */

statement['USED-BY-ADB'] = {
  'title': 'Used By',
  'description': 'Dependencies other objects have on this one',
  'display': ["Object Name", "Object Type"],
  'link': 'Object Name',
  'sql' : `select name as "Object Name"
           ,      type as "Object Type"
           ,      owner as "Owner"
           ,      owner||'/'||type||'/'||name as link
           from dba_dependencies
           where referenced_owner = :owner
           and referenced_type = :object_type
           and referenced_name = :object_name
           order by owner, name, type`,
  'params' : {
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_type: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};

statement['USES-ADB'] = {
  'title': 'Uses',
  'description': 'Dependencies this object has on others',
  'display': ["Object Name", "Object Type"],
  'link': 'Object Name',
  'sql' : `select referenced_name as "Object Name"
           ,      referenced_type as "Object Type"
           ,      referenced_owner as "Owner"
           ,      referenced_owner||'/'||referenced_type||'/'||referenced_name as link
           from dba_dependencies
           where owner = :owner
           and type = :object_type
           and name = :object_name
           order by referenced_owner, referenced_name, referenced_type`,
  'params' : {
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_type: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    object_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
};

// used by collections query
statement['DEPENDS-ON'] = {
  'title': 'Depends On',
  'description': 'Dependencies this object has on others',
  'display': ["Object Name", "Object Type"],
  'link': 'Object Name',
  'sql' : `select p_obj# as object_id
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