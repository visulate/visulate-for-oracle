* TOC
{:toc id="toc"}

# Register an Oracle Autonomous Database Instance

Connections to Oracle Autonomous Data Warehouse and Transaction Processing instances require a client credentials wallet and tnsnames.ora file. Use a kubernetes secret to add these to the Visulate deployment.

## Download a Client Credentials Wallet

Login to your Oracle Cloud tenancy and navigate to the Autonomous Database details page to download a wallet. Download an instance wallet to create a connection for a single database or a regional wallet if you need connections for more than one instance.

![Download the database wallet](/images/download-wallet.png){: class="screenshot" }

Expand the zipfile into an empty directory

## Edit the sqlnet.ora file

The sqlnet.ora file needs updating to include a method_data directory. It also needs some sqlnet parameters from Visulate's base image.

Open the sqlnet.ora file in a text editor. Update the method_data directory parameter to "/usr/lib/oracle/19.6/client64/lib/network/admin". Then merge values from [the base image](https://github.com/visulate/visulate-for-oracle/blob/master/api-server/database-setup/sqlnet.ora) into the file. These are needed to workaround a [Node-OracleDB issue](https://github.com/oracle/node-oracledb/issues/1274).

The edited file should look like this:

```
WALLET_LOCATION = (SOURCE = (METHOD = file) (METHOD_DATA = (DIRECTORY="/usr/lib/oracle/19.6/client64/lib/network/admin")))
SSL_SERVER_DN_MATCH=yes
SQLNET.OUTBOUND_CONNECT_TIMEOUT=15
TCP.CONNECT_TIMEOUT = 10
DISABLE_OOB=ON
SQLNET.DOWN_HOSTS_TIMEOUT = 0
SQLNET.RECV_TIMEOUT=30
```

## Database Registration

Create a kubernetes secret with the contents of the wallet directory

```
kubectl create secret generic tns-admin-secret --from-file /*path-to-directory*/wallet/ -n test-ns
```

Edit your [database registration file](pages/database-registration.html#create-a-database-registration-file) using
one of the predefined database service names in the tnsnames.ora file. Example:

```
{ namespace: 'vis21',
    description: 'Autonomous TP instance',
    connect: { poolAlias: 'vis21',
            user: 'visulate',
            password: 'SUIFO^lskjfldkj',
            connectString: 'db202010061019_high',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
            }
}
```

Apply the file:
```
kubectl create secret generic atp-connection --from-file=database.js=./db-registration.js --namespace=test-ns
```

## Deployment manifest

Follow the instructions in the [database registration guide](/pages/database-registration.html#update-the-api-server-deployment)
to download the API Server deployment manifest.

Edit the spec.containers.volumeMounts element to add a `tns-admin-directory` mountPath:

```
    spec:
      containers:
      - env:
        - name: CORS_ORIGIN_WHITELIST
        image: gcr.io/visulate-for-oracle/visulate-for-oracle:1.1.16
        imagePullPolicy: IfNotPresent
        livenessProbe:
          failureThreshold: 3
          httpGet:
            path: /endpoints/
            port: 3000
            scheme: HTTP
          initialDelaySeconds: 40
          periodSeconds: 60
          successThreshold: 1
          timeoutSeconds: 20
        name: visulate-for-oracle-api
        ports:
        - containerPort: 3000
          protocol: TCP
        resources: {}
        terminationMessagePath: /dev/termination-log
        terminationMessagePolicy: File
        volumeMounts:
        - mountPath: /visulate-server/config/database.js
          name: config-database-volume
          subPath: database.js
        - mountPath: /visulate-server/logs
          name: logfiles
        - mountPath: /etc/ubbagent/
          name: ubbagent-config
        - mountPath: /var/lib/ubbagent
          name: ubbagent-state
        - mountPath: /usr/lib/oracle/19.6/client64/lib/network/admin
          name: tns-admin-directory
```

Edit spec.volumes element. Update the config-database-volume to reference the database registration secret.
Add a new tns-admin-directory volume which references the tns-admin-secret.

```
      volumes:
      - name: config-database-volume
        secret:
          defaultMode: 420
          secretName: atp-connection
      - emptyDir: {}
        name: logfiles
      - emptyDir: {}
        name: ubbagent-state
      - configMap:
          defaultMode: 420
          name: visulate-for-oracle-1116-ubbagent-config
        name: ubbagent-config
      - name: tns-admin-directory
        secret:
          defaultMode: 420
          secretName: tns-admin-secret
```

## Next Steps

Follow the instruction in the [SQL Query Engine configuration guide](/pages/query-engine-config.html) to enable CSV file generation.