* TOC
{:toc id="toc"}

# Database Setup
Visulate needs to read the data dictionary in each registered database. Create a dedicated user with the minimum required privileges in each database you want to catalog.

## Oracle Setup
Login to SQL*Plus as SYSTEM and create a database user called "VISULATE" and grant CREATE SESSION, SELECT_CATALOG_ROLE and SELECT ANY DICTIONARY privileges to it:
```sql
create user visulate identified by &password;
alter user visulate account unlock;
grant create session to visulate;
grant select any dictionary to visulate;
grant select_catalog_role to visulate;
```

### Why these privileges?
The CREATE SESSION privilege is needed to allow database connections. SELECT ANY DICTIONARY privilege grants Read access on Data Dictionary tables owned by SYS. The SELECT_CATALOG_ROLE role grants Read access to Data Dictionary (DBA_%) and Performance (V$%) views.

## PostgreSQL Setup
Create a dedicated role with access to the metadata catalogs. For PostgreSQL 14+, use the predefined `pg_read_all_data` and `pg_read_all_stats` roles.

```sql
CREATE ROLE visulate WITH LOGIN PASSWORD 'your_secure_password';
GRANT pg_read_all_data TO visulate;
GRANT pg_read_all_stats TO visulate;
```

## Security Requirements
For security reasons, the database account must be called "VISULATE" and must not have additional privileges. The API server verifies these privileges on startup and will reject connections that are over-privileged.

## Next Steps
Once your database accounts are prepared, follow the [Database Registration Guide](/pages/database-registration.html) to add them to the Visulate catalog.