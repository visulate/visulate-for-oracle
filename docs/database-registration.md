# Database Registration
## Overview
The API Server maintains a connection pool for each registered database.

![Database Connections](images/database-connections.png)

The parameters for each pool are read from a file during initialization. A sample file appears below. 

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
              poolIncrement: 0
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
              poolIncrement: 0
            }
  }
];
module.exports.endpoints = endpoints;
```

Parameter values are described in the [Oracle node-oracledb](https://oracle.github.io/node-oracledb/doc/api.html#connpooling) documentation. The Visulate for Oracle sets the [UV_THREADPOOL_SIZE environment variable](http://docs.libuv.org/en/v1.x/threadpool.html) to the sum of the poolMax values + 4 before starting the Express server.

## Register your databases

The initial deployment from GCP Marketplace provisions an API Server with no registered databases. The user must create and apply a database registration file. This is done using a Kubernetes Secret.  

![Update Database Connections](images/update-database-connections.png)

Download and edit the api-server-secret.yaml and api-server-deployment.yaml manifest files. Edit the secret manifest file to supply connection details for one or more databases, update the metadata name for the Secret. Use `kubectl` to apply the file. Edit the deployment manifest to reference the name used in the Secret.  Apply the deployment file to rollout a new deployment with registered databases. 

## Example
Find the API Server deployment name. (in this example the application was deployed in a namespace called 'test-ns')
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
Create a Secret manifest to identify the database connections. Make a note of the metadata name (test-deployment-database-js-update in the example below) for use in the next step
```
---
apiVersion: v1
kind: Secret
type: Opaque
metadata:
  name: test-deployment-database-js-update
stringData:
  database.js: |-
    const endpoints = [
    { namespace: 'oracle18XE',
      description: '18c XE pluggable database instance running in a docker container',
      connect: { poolAlias: 'oracle18XE',
                user: 'visulate',
                password: 'HtuUDK%?4JY#]L3:',
                connectString: 'db20.visulate.net:41521/XEPDB1',
                poolMin: 4,
                poolMax: 4,
                poolIncrement: 0
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
                poolIncrement: 0
              }
    }
    ];
    module.exports.endpoints = endpoints;
```
Edit the downloaded deployment manifest. Update the secretName with the value from the previous step.
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
          secretName: test-deployment-database-js-update
        name: config-database-volume
      - emptyDir: {}
        name: logfiles
status: {}
```
Validate the edited secret and deployment manifests:
```
$ kubectl apply --dry-run --validate --namespace=test-ns -f secret.yaml 
$ kubectl apply --dry-run --validate --namespace=test-ns -f deployment.yaml 
```

Apply the secret and deployment manifests:

```
$ kubectl apply --namespace=test-ns -f secret.yaml 
$ kubectl apply --namespace=test-ns -f deployment.yaml 
```