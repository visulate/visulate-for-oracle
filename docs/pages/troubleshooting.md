# Troubleshooting


The database account does not need to be called "VISULATE". You can use any account that has been granted CREATE SESSION, SELECT_CATALOG_ROLE and SELECT ANY DICTIONARY. It must not have any additional privileges. The API server checks the account's privileges on startup. It drops the connection if it finds any more or less that the required set. These appear in the API Server log file
```
{"level":"info","message":"Creating poolAlias system for db20.visulate.net:41521/XEPDB1",
         "timestamp":"2020-05-11T19:40:57.104Z"}
...
{"level":"error","message":"Closing poolAlias system. Account has invalid privileges.
          Expected: 'CREATE SESSION,SELECT ANY DICTIONARY,SELECT_CATALOG_ROLE'
          Found: 'AQ_ADMINISTRATOR_ROLE,CREATE MATERIALIZED VIEW,CREATE TABLE,DBA,DEQUEUE ANY QUEUE,
          ENQUEUE ANY QUEUE,GLOBAL QUERY REWRITE,MANAGE ANY QUEUE,SELECT ANY TABLE,UNLIMITED TABLESPACE'",
         "timestamp":"2020-05-11T19:41:04.414Z"}
```



## Test your firewall rules
