const oracledb = require('oracledb')
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let statement = {};
statement['COUNT_DBA_OBJECTS'] = {
  'sql' : `select owner, object_type, count(*) as object_count
   from dba_objects o
   where not exists (select 1
                     from dba_logstdby_skip l
                     where l.owner = o.owner
                     and l.statement_opt = 'INTERNAL SCHEMA')
   group by owner, object_type
   order by owner, object_type`,
   'params': {}
};

statement['LIST_DBA_OBJECTS'] = {
  'sql': `select object_name
          from dba_objects
          where  owner = :owner
          and object_type = :type
          and object_name like :name
          and status like :status
          order by object_name`,
  'params': {
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    type: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    status: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "%" }
  }
};

statement['TABLE-DETAILS'] = {
  'sql': `select table_name
          ,      num_rows
          ,      tablespace_name
          ,      temporary
          ,      duration
          from dba_tables
          where table_name = :table_name
          and owner = :owner
          order by table_name`,
  'params': {
     table_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
     owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "", }
   }
};

statement['TABLE-COMMENTS'] = {
  'sql' : `select comments
           from dba_tab_comments
           where owner = :owner
           and table_name = :table_name
           and (table_type = 'TABLE' or table_type = 'VIEW')`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    table_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['TABLE-INDEXES'] = {
  'sql' : `select index_name
           ,      index_type
           ,      uniqueness
           ,      tablespace_name
           ,      owner
           from dba_indexes
           where table_owner = :owner
           and table_name = :table_name
           order by uniqueness desc, index_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    table_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['INDEX-COLUMNS'] = {
  'sql' : `select column_name
           ,      column_length
           from dba_ind_columns
           where index_owner = :owner
           and index_name :index_name
           order by column_position`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    index_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['INDEX-FUNCTION'] = {
  'sql' : `select column_expression
           from dba_ind_expressions
           where index_owner = :owner
           and index_name = :index_name
           order by column_position`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    index_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['TABLE-KEYS'] = {
  'sql' : `select constraint_type, constraint_name
           from dba_constraints
           where owner = :owner
           and table_name = :table_name
           order by constraint_type, constraint_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    table_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['CONSTRAINT-COLUMNS'] = {
  'sql': `select column_name
          from dba_cons_columns
          where constraint_name = :constraint_name
          and owner = :owner
          order by position`,
  'params' : {
    constraint_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['TABLE-COLUMNS'] = {
  'sql' : `select col.column_name
           ,      col.data_type
           ,      col.data_length
           ,      col.data_precision
           ,      col.nullable
           ,      com.comments
           from dba_tab_columns col
           ,    dba_col_comments com
           where col.owner = :owner
           and col.table_name = :table_name
           and col.table_name = com.table_name (+)
           and col.column_name = com.column_name (+)
           order by col.column_id`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    table_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}



statement['FK-IN-TABLE'] = {
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
    'sql' : `select text
             from dba_views
             where owner = :owner
             and view_name = :view_name  `,
    'params' : {
      owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
      view_name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
    }
  }

statement['MVIEW-DETAILS'] = {
  'sql' : `select container_name
           ,      updatable
           ,      rewrite_enabled
           ,      rewrite_capability
           ,      refresh_mode
           ,      refresh_method
           ,      build_mode
           ,      fast_refreshable
           from dba_mviews
           where owner = :owner
           and mview_name = :mview_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    mview_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['MVIEW-LOG_DEPENDENCIES'] = {
  'sql' : `select lpad(' ',5*(LEVEL-1)) || sft.master  tree_entry
           from sys.snap_reftime$ sft
           start with sft.vname = :mview_name
           connect by prior sft.master = sft.vname`,
  'params' : {
    mview_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['TRIGGER-DETAILS'] = {
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
           and   trigger_name = :trigger_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    trigger_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['DECODE-SYNONYM'] = {
  'sql' : `select table_owner
           ,      table_name
           ,      db_link
           from sys.dba_synonyms
           where owner = :owner
           and synonym_name = :synonym_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    synonym_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['QUEUE-DETAILS'] = {
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
           and name = :queue_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    queue_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}


statement['TYPE-DETAILS'] = {
  'sql' : `select typecode
           ,      attributes
           ,      methods
           ,      predefined
           ,      incomplete
           from dba_types
           where owner = :owner
           and type_name = :type_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    type_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}
statement['COLLECTION-TYPE-DETAILS'] = {
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
           and type_name= :type_name`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    type_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}
statement['TYPE-ATTRIBUTES'] = {
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
           and type_name = :type_name
           order by attr_no`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    type_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}
statement['TYPE-METHODS'] = {
  'sql' : `select owner
           ,      type_name
           ,      method_name
           ,      method_no
           ,      method_type
           ,      parameters
           ,      results
           from dba_type_methods
           where owner = :owner
           and type_name = :type_name
           order by method_no`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    type_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}
statement['METHOD-PARAMETERS'] = {
  'sql' : `select param_name
           ,      param_no
           ,      param_type_name
           from dba_method_params
           where owner = :owner
           and type_name = :type_name
           and method_name = :method_name
           and method_no = :method_no
           order by param_no`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    type_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    method_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    method_no : { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" }
  }
}

statement['METHOD-RESULTS'] = {
  'sql' : `select result_type_name
           from sys.dba_method_results
           where owner = :owner
           and type_name = :type_name
           and method_name = :method_name
           and method_no = :method_no`,
  'params' : {
    owner : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    type_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    method_name : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    method_no : { dir: oracledb.BIND_IN, type:oracledb.NUMBER, val: "" }
  }
}

statement['SOURCE'] = {
  'sql' : `select line
           ,      text
           from dba_source
           where owner = :owner
           and type = :type
           and name = :name`,
  'params' : {
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    type: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['ERRORS'] = {
  'sql' : `select line
           ,      position
           ,      text
           from dba_errors
           where owner = :owner
           and type = :type
           and name = :name
           order by sequence`,
  'params' : {
    owner: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    type: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" },
    name: { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['SOURCE-LINE-DEPENDENCY'] = {
  'sql' : `select line
    ,      source
    from sys.source$
    where upper(source) like c_name
    and obj# = n_object_id`,
  'params' : {
    n : { dir: oracledb.BIND_IN, type:oracledb.STRING, val: "" }
  }
}

statement['USED-BY-OBJECTS'] = {
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
}

statement['USES-OBJECTS'] = {
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
}

module.exports = statement;
