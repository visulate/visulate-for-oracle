const oracledb = require('oracledb')
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let statement = {};
statement['COUNT_DBA_OBJECTS'] = {
  'sql' : `select owner, object_type, count(*) as object_count
   from dba_objects
   group by owner, object_type
   order by owner, object_type`,
   'params': {}
};

statement['LIST_DBA_OBJECTS'] = {
  'sql': `select object_name
          from dba_objects
          where  owner = :p_owner
          and object_type = :p_type
          and object_name like :p_name
          and status like :p_status
          order by object_name`,
  'params': {
    p_owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    p_type: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    p_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    p_status: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "%" }
  }
};

statement['TABLE_DETAILS'] = {
  'sql': `select table_name
          ,      tablespace_name
          ,      pct_free
          ,      pct_used
          ,      temporary
          ,      duration
          from dba_tables
          where table_name = :table_name
          and owner = :owner
          order by table_name;`,
  'params': {
     table_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
     owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "", }
   }
};

module.exports = statement;
