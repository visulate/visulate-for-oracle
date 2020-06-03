* TOC
{:toc id="toc"}
# Troubleshooting

## Registered database does not appear in the UI drop down

### Review the API deployment log files

### Make an API call

Call the /api/ endpoint (e.g. http://my-ipaddress/api/)

### Check the username, password and connect string

Follow the instructions in the [network configuration guide](/pages/network-configuration.html) to open a bash shell in one of the API server pods. Navigate to the "/visulate-server/config" directory. Use the cat command to view the contents of the "database.js" file. 

```
bash-4.2# cd /visulate-server/config
bash-4.2# cat database.js
```

This file holds the credentials that the API server read on startup to establish database connection pools. See the [database registration guide](/pages/database-registration.html) for additional details

### Test your firewall rules

Follow the steps in the [network configuration guide](/pages/network-configuration.html)

### Check the Visulate account permissions  

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

## Lost database registration file

See [Check the username, password and connect string](#check-the-username-password-and-connect-string) step above.


## Orphaned network resources
The **combined length** of the namespace and instance names **should not exceed 32 characters**. This avoids the potential for orphaned network resources when the instance is deleted. See [GCP Marketplace Tools issue 495](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-tools/issues/495)

## Database registration failure

### Pod unschedulable
https://cloud.google.com/kubernetes-engine/docs/troubleshooting#PodUnschedulable