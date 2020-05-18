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
Verify your firewall rules allow connections from the API Server to each database.
1. Use `kubectl` to find the API Server pod name. Look for the pod with `-api-` in its name:

    ```
    $ kubectl get pods --namespace=test-nat-ns
    NAME                                                            READY   STATUS    RESTARTS   AGE
    test-nat-deployment1-visulate-api-5598f9b558-x75qj   4/4     Running   0          3d21h
    test-nat-deployment1-visulate-ui-6dc459fd65-cqtp9    2/2     Running   0          3d21h
    ```
2. Open a bash shell in the pod:

    ```
    kubectl exec -it test-nat-deployment1-visulate-for-oracle-api-5598f9b558-x75qj --namespace=test-nat-ns -- /bin/bash
    ```
3. Login to the database using SQL*Plus:

    ```
    Defaulting container name to visulate-for-oracle-api.
    Use 'kubectl describe pod/test-nat-deployment1-visulate-for-oracle-api-5598f9b558-x75qj -n test-nat-ns' to see all of the containers in this pod.
    bash-4.2# sqlplus visulate@db11.visulate.net:1521/vis13

    SQL*Plus: Release 19.0.0.0.0 - Production on Sat Mar 28 15:46:47 2020
    Version 19.5.0.0.0

    Copyright (c) 1982, 2019, Oracle.  All rights reserved.

    Enter password:

    Connected to:
    Oracle Database 11g Release 11.2.0.4.0 - 64bit Production

    SQL>
    ```