* TOC
{:toc id="toc"}

# Database Setup
Visulate for Oracle needs to read the data dictionary in each registered database. Create a dedicated user with the minimum required privileges in each database you want to catalog.

## Create a user
Login to SQL*PLus as SYSTEM and create a database user called "VISULATE" and grant CREATE SESSION, SELECT_CATALOG_ROLE and SELECT ANY DICTIONARY privileges to it:
```
create user visulate identified by &password;
alter user visulate account unlock;
grant create session to visulate;
grant select any dictionary to visulate;
grant select_catalog_role to visulate;
```

## What do these roles and privileges do?
The CREATE SESSION privilege is needed to allow database connections.

SELECT ANY DICTIONARY privilege grants Read access on Data Dictionary tables owned by SYS (with the exception of the following objects: DEFAULT_PWD$, ENC$, LINK$, USER$, USER_HISTORY$, and XS$VERIFIERS).  The SELECT_CATALOG_ROLE role grants Read access to Data Dictionary (DBA_%) and Performance (V$%) views.

Some of the queries in Visulate for Oracle access data dictionary tables instead of the DBA_ views for performance reasons hence the need for SELECT ANY DICTIONARY.  The DDL download feature calls DBMS_METADATA which requires SELECT_CATALOG_ROLE.

## Can I use an existing database account?
 Probably not. The database account needs to be called "VISULATE" and granted CREATE SESSION, SELECT_CATALOG_ROLE and SELECT ANY DICTIONARY. **It must not have additional privileges** for security reasons. The API server checks the account's privileges on startup. It drops the connection if it finds any more or less that the required set.

## Drop the user
Visulate for Oracle needs a database user account in each registered database. You should drop the user if you decide to de-register the database. Login to SQL*PLus as SYSTEM and run the following:
```
drop user visulate cascade;
```

## SQL Scripts
SQL Scripts to create and drop users are available in [GitHub](https://github.com/visulate/visulate-for-oracle/tree/master/api-server/database-setup)