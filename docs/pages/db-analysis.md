* TOC
{:toc id="toc"}

# Analyzing Oracle database complexity

The first step in an Oracle database migration is to analyze the source database's complexity. Much of the information required to do this can be obtained by querying the Oracle data dictionary. The Oracle database dictionary is a set of system catalog views which contain metadata about the database. This metadata includes the number and type of different schema objects used, the source code for stored procedures, the server configuration and more.

Visulate for Oracle includes a series of pre-defined database analysis queries. They run automatically when the database or schema selection changes in the UI.

## Database Analysis

Select a database on the homepage of the application to run the database analysis queries

![Database instance report](/images/opening-screen.png){: class="screenshot" }


### Database Version

List the database version

```
select banner as "Version" from v$version
```

### Oracle Cloud Autonomous Database Instance

Is the database running on Oracle Cloud infrastructure?

```
select decode( count(*), 0, 'No',
                            'Yes') as "Autonomous Database"
from dba_objects
where object_name = 'DBMS_CLOUD'
```

### E-Business Suite Schema Detected

Is it an E-Business suite instance?

```
select decode(count(*), 1, 'Yes',
                           'No') as "EBS Schema"
from dba_tables
where owner='APPLSYS'
and table_name = 'FND_APPLICATION'
```

### Invalid Objects

Count invalid objects by schema

```
select owner as "Owner"
,      object_type as "Object Type"
,      count(*) as "Count"
from dba_objects
where status = 'INVALID'
group by owner, object_type
order by owner, object_type
```

### SGA Size

List the total size of the system global area

```
select round(sum(value/1024/1024/1024), 2)as  "Total Size (GB)"
from v$sga

```

### SGA Free

List the total free space

```
select round(sum(bytes/1024/1024), 2) as "Free Memory (MB)"
from v$sgastat
where name like '%free memory%'
```

### Storage Segments

List the storage allocation for each schema

```
select s.owner as "Schema"
, round(sum(bytes/1024/1024/1024),2) as "Size (GB)"
, owner as link
from dba_segments s
group by s.owner
order by 2 desc
```

### System Utilization Statistics

Display system utilization statistics from the operating system

```
select comments as "Statistic"
,      value
,      to_char(value, 'FM999,999,999,999') as "Value"
from v$osstat
```

### Database Features

List components loaded into the database

```
select comp_name as "Feature"
from dba_registry
where status = 'VALID'
```

### Database Feature Usage

Displays database feature usage statistics

```
select name as "Feature"
,      detected_usages as "Detected Usages"
from dba_feature_usage_statistics
where detected_usages > 0
order by detected_usages desc
```

## Schema Analysis
Select a database user from the schema drop down to run schema reports.

### Schema Status

List the account status (e.g. open, locked or expired) along with the default tablespaces for the schema.
```
select account_status as "Status"
,      default_tablespace as "Default Tablespace"
,      temporary_tablespace as "Temporary Tablespace"
from dba_users
where username = :owner
```

### Data Types

Count the column data type usage in the schema's tables and views. Look for Oracle specific data types if you are planning to migrate from Oracle to Postgres or MySQL.

```
select data_type as "Data Type"
,      count(*) as "Count"
from dba_tab_columns
where owner = :owner
group by data_type
order by data_type
```

### Spatial

List and link to tables and views with spatial columns

```
select c.table_name as "Object Name"
,      o.object_type as "Type"
,      c.column_name as "Column"
from dba_tab_columns c
,    dba_objects o
where c.owner = :owner
and c.data_type= 'SDO_GEOMETRY'
and o.owner = c.owner
and o.object_name = c.table_name
order by c.table_name, o.object_type, c.column_name
```

### Non Standard Indexes

List non standard indexes

```
select index_type as "Type"
,      index_name as "Index"
from dba_indexes
where owner = :owner
and index_name like :object_name ESCAPE :esc
and index_type not in ('NORMAL', 'LOB')
order by index_name, index_type
```

DBMS and UTL Usage

List and link to stored procedures that reference Oracle's UTL and DBMS packages. These will need to be re-written if you are planning to migrate from Oracle to Postgres or MySQL.

```
select name as "Name"
,      type as "Type"
,      owner||'/'||type||'/'||name as link
,      count(*) as "Count"
from dba_source
where owner = :owner
and name like :object_name ESCAPE :esc
group by name, type, owner||'/'||type||'/'||name
order by name, type
```
