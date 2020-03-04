# Visulate for Oracle Database Setup Instructions

## Target Database
Visulate needs access to the data dictionary in the Oracle database.  Use the create_visulate_user.sql script to create a user to do this.  This script creates a database user called "visulate" and grants CREATE SESSION, SELECT_CATALOG_ROLE and SELECT ANY DICTIONARY privileges to it.  The script accepts the password for the new user as an argument.

The SELECT ANY DICTIONARY privilege grants Read access on Data Dictionary tables owned by SYS (with the exception of the following objects: DEFAULT_PWD$, ENC$, LINK$, USER$, USER_HISTORY$, and XS$VERIFIERS).  The SELECT_CATALOG_ROLE role grants Read access to Data Dictionary (DBA_%) and Performance (V$%) views.

Some of the queries in Visulate for Oracle access data dictionary tables instead of the DBA_ views for performance reasons hence the need for SELECT ANY DICTIONARY.  The DDL download feature calls DBMS_METADATA which requires SELECT_CATALOG_ROLE

A separate script drop_visulate_user.sql can be used to drop the account when it is no longer required.
