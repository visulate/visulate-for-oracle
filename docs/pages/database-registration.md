* TOC
{:toc id="toc"}

# Database Registration
## Overview
Each database in the Visulate catalog needs to be registered. The API server maintains an Oracle database connection pool for each registration. Routing code in the server identifies the correct pool for a given API call and uses it to run SQL statements.

![Database Connections](/images/database-connections.png)

 The parameters for each pool are read from a file during initialization. The contents of this file is delivered via a Kubernetes secret. A secret is applied to the cluster with database registration information. Registration occurs when the API Server deployment is updated to reference the secret. This causes a redeployment of the API Server pods with an updated configuration.

## Database registration file

The database registration file (/config/database.js in the diagram) exports a Javascript array objects with connection details for the Visulate account in each database (see [database setup guide](/pages/database-setup.html)).  A sample file appears below.

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

## Register your databases

The initial deployment from GCP Marketplace provisions an API Server with no registered databases. You must create and apply a database registration file. A Kubernetes Secret is used to deliver a database registration file to the cluster. After the secret has been applied the API Server deployment is updated to use it. 

![Update Database Connections](/images/update-database-connections.png)

### Create a database registration file

Create a registration file to identify your database connections. Cut and paste the secret below into a text editor or [download from GitHub](https://raw.githubusercontent.com/visulate/visulate-for-oracle/master/api-server/database-setup/sample-db-registration.js). Edit connections in the endpoints array to identify the databases you want to register. Add or remove connection objects as needed.  
```
const endpoints = [
{ namespace: 'oracle18XE',
  description: '18c XE pluggable database instance running in a docker container',
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
**Tip:** keep a copy of the database registration file for future use. For example, when [updating to a new version](/pages/upgrade-guide.html) 
of Visulate or to create a new secret after changing the database passwords. 

### Validate the file for JavaScript syntax errors

Use a JavaScript code editor or lint tool to check the registration file for syntax errors before continuing. 
For example, a missing comma in the endpoints object would look like this in in Visual Studio Code:

![JavaScript syntax error](/images/js-syntax-error.png)

or this in `jshint`:

```shell
# install jshint (do this once)
sudo npm install -g jshint

# create a configuration file (do this once)
echo '{ "esversion": 6 }' > /tmp/jshint.conf 

# test the file
jshint --config /tmp/jshint.conf db-registration.js 

sample-db-registration.js: line 13, col 1, Expected ']' to match '[' from line 1 and instead saw '{'.
sample-db-registration.js: line 13, col 2, Missing semicolon.
sample-db-registration.js: line 13, col 14, Label 'namespace' on oracle11XE statement.
sample-db-registration.js: line 14, col 3, Expected an assignment or function call and instead saw an expression.
sample-db-registration.js: line 14, col 14, Missing semicolon.
sample-db-registration.js: line 14, col 3, Unrecoverable syntax error. (53% scanned).

6 errors
```

### Apply the registration file as a new Kubernetes secret

Create a Kubernetes secret called `oracle-database-connections` with `database.js` as a key the registration file contents as its value:  

```shell
kubectl create secret generic oracle-database-connections --from-file=database.js=./db-registration.js --namespace=test-ns
```

**Note:** the secret name is not important but **the secret's key must be `database.js`** 

The secret details should now appear in the Kubernetes UI.

![Kubernetes Secret](/images/db-secret.png){: class="screenshot" }

### Update the API Server deployment

Find the API Server deployment name:
```
$ kubectl get deploy --namespace=test-ns
NAME                                      READY   UP-TO-DATE   AVAILABLE   AGE
test-deployment-visulate-for-oracle-api   1/1     1            1           43h
test-deployment-visulate-for-oracle-ui    1/1     1            1           43h
```

Download the API Server deployment manifest
```
kubectl get deploy test-deployment-visulate-for-oracle-api --namespace=test-ns -oyaml > deployment.yaml
```

Edit the downloaded deployment manifest. Update the secretName with the value from the previous step (use `kubectl get secret` if you forgot to make a note the value).
```
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  annotations:
    deployment.kubernetes.io/revision: "1"

...

      volumes:
      - secret:
          defaultMode: 420
          secretName: oracle-database-connections
        name: config-database-volume
      - emptyDir: {}
        name: logfiles
status: {}
```
**Tip:** the API server deployment manifest is quite long, look for a volumes secret called "config-database-volume". It should have a default secretName in the form {{ Release.Name }}-empty-database-array

Validate the edited manifest:
```
$ kubectl apply --dry-run=client --validate --namespace=test-ns -f deployment.yaml
```

Apply the deployment manifest:

```
$ kubectl apply --namespace=test-ns -f deployment.yaml
```

Note: the API server deployment can also be updated using the GKE UI as shown in the [quickstart guide](/pages/quickstart.html#register-your-database-connection)

### Test the connections
Wait for the updated deployment to apply then test the connections.  Call the "endpoints" endpoint to list registered database connections: 

```
$ curl https://visulate.mycorp.com/endpoints/
{"mptest":"35.232.143.223:51521/XEPDB1"}
```

The registed connections should also appear in the database dropdown in the UI. Follow the steps in the  [troubleshooting guide](/pages/troubleshooting.html) if some or all of your database connections are missing

## Deregister connections
Database connections that are no longer required should be deregistered to avoid unnecessary charges.

Deregistration follows the same process as registration. A new secret is applied with the connection removed and the API Server deployment is updated.
