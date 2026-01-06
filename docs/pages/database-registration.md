* TOC
{:toc id="toc"}

# Database Registration
## Overview
Each database in the Visulate catalog needs to be registered. The API server maintains an Oracle database connection pool for each registration. Routing code in the server identifies the correct pool for a given API call and uses it to run SQL statements.

![Database Connections](/images/database-connections.png)

 The parameters for each pool are read from a file during initialization. The contents of this file is delivered via a Kubernetes secret. A secret is applied to the cluster with database registration information. Registration occurs when the API Server deployment is updated to reference the secret. This causes a redeployment of the API Server pods with an updated configuration.

## Database registration file

The database registration file (/config/database.js in the diagram) exports a Javascript array object with connection details for the Visulate account in each database (see [database setup guide](/pages/database-setup.html)).  A sample file appears below.

```
const endpoints = [
 { namespace: 'oracle18XE',
    description: '18c XE PDB instance running in a docker container',
    connect: { poolAlias: 'oracle18XE',
              user: 'visulate',
              password: 'HtuUDK%?4JY#]L3:',
              connectString: 'db20.visulate.net:41521/XEPDB1',
              poolMin: 4,
              poolMax: 4,
              poolIncrement: 0,
              poolPingInterval: 0
            }
  },
  { namespace: 'oracle11XE',
    description: '11.2 XE database',
    connect: { poolAlias: 'oracle11XE',
              user: 'visulate',
              password: '7>rC4P?!~U42tS^^',
              connectString: 'db20.visulate.net:49161/XE',
              poolMin: 4,
              poolMax: 4,
              poolIncrement: 0,
              poolPingInterval: 0
            }
  }
];
module.exports.endpoints = endpoints;
```

Parameter values are described in the [Oracle node-oracledb](https://oracle.github.io/node-oracledb/doc/api.html#connpooling) documentation. The Visulate for Oracle sets the [UV_THREADPOOL_SIZE environment variable](http://docs.libuv.org/en/v1.x/threadpool.html) to the sum of the poolMax values + 4 before starting the Express server.

## Registration on VM

In a VM deployment, the *database.js* file is the source of truth for all registered connections. It is located in the **/home/visulate/config** directory and can be edited directly.

### Steps to Register a Database:

1. **SSH into the VM**: Connect to your Visulate instance.
2. **Edit the Config**:
   ```bash
   cd /home/visulate
   sudo vi config/database.js
   ```
3. **Add Connection Details**: Follow the structure in the [database integration file](#database-registration-file) section.
4. **Restart Services**: Apply the changes by restarting the Docker containers.
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### SQL Query Engine Registration
If you want to use the SQL-to-CSV features with a registered database, you must also add an entry to `config/endpoints.json`.

1. **Edit the Endpoints**:
   ```bash
   sudo vi config/endpoints.json
   ```
2. **Add Mapping**: Add a key-value pair where the key is the `namespace` from `database.js` and the value is the `connectString`.
   ```json
   {"prod_db": "prod-scan.internal:1521/PROD"}
   ```

## Testing Connections
After restarting, call the `endpoints` API to list registered database connections:

```bash
curl http://localhost/endpoints/
```

The registered connections should also appear in the Database dropdown in the Visulate UI. If connections are missing, follow the [troubleshooting guide](/pages/troubleshooting.html).

## Deregistering Connections
To deregister a connection, simply remove its entry from `database.js` (and `endpoints.json` if applicable) and restart the services using the steps above.
