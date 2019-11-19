create user wiki identified by wiki
default tablespace users
temporary tablespace temp;

alter user wiki quota unlimited on users;

grant create session to wiki;
grant create table to wiki;
grant create procedure to wiki;
grant create sequence to wiki;
grant create view to wiki;
grant create type to wiki;

grant create trigger to wiki;
grant create materialized view to wiki;

GRANT EXECUTE ON CTX_CLS    TO wiki;
GRANT EXECUTE ON CTX_DDL    TO wiki;
GRANT EXECUTE ON CTX_DOC    TO wiki;
GRANT EXECUTE ON CTX_OUTPUT TO wiki;
GRANT EXECUTE ON CTX_QUERY  TO wiki;
GRANT EXECUTE ON CTX_REPORT TO wiki;
GRANT EXECUTE ON CTX_THES   TO wiki;

