* TOC
{:toc id="toc"}
# SQL Query Engine Configuration

The SQL Query Engine exposes a REST API to generate CSV files from user supplied SQL. An HTTP POST request is made to the SQL Query endpoint passing the SQL statement. The SQL Query Engine makes a database connection, executes the query and then closes the connection. Results are returned to the user as CSV or JSON.

![Database Connections](/images/database-connections.png)

Access to this feature is controlled by a configuration file. This allows a DBA to limit the list of database environments that allow SQL access. For example, they may wish to allow access for development databases but not production.

## endpoints.json file

The configuration file is called `endpoints.json`. It contains an object of key value pairs with keys that correspond to database endpoints and a values that represent their connect strings. Example:

```
{"oracle18XE":"db205.visulate.net:98521/XEPDB1",
 "oracle11XE":"db205.visulate.net:44561/XE",
 "vis115":"db135.visulate.net:88521/vis115"}
```

The API server exposes an `/endpoints` endpoint which returns a list of valid endpoints based on the [database registration file](/pages/database-registration.html#database-registration-file). Use the /endpoints API to generate a default configuration file for your environment:

```shell
curl http://load-balancer-ip/endpoints/ > endpoints.json
```

Edit the generated file to remove any entries you don't want to expose. Note: Do not edit individual endpoint keys or connect string values. The UI will not enable the query editor for database endpoints where the API Server and SQL Query Engine values do not match.

## Apply the endpoints.json file as a new Kubernetes secret

Generate a kubernetes secret from the file with a key of `endpoints.json`:

```shell
kubectl create secret generic sql-endpoints --from-file=endpoints.json=./endpoints.json
```

Note: the secret name is not important but it's key must be `endpoints.json`

use kubectl to verify the secret has been applied

```
kubectl get secret
NAME                                            TYPE                                  DATA   AGE
other entries ...

sql-endpoints                                   Opaque                                1      10d
```

## Update the SQL Query Engine deployment

Find the deployment name:

```shell
kubectl get deploy
NAME                                               READY   UP-TO-DATE   AVAILABLE   AGE
visulate-for-oracle-1107-visulate-for-oracle-api   1/1     1            1           3d1h
visulate-for-oracle-1107-visulate-for-oracle-sql   1/1     1            1           3d1h
visulate-for-oracle-1107-visulate-for-oracle-ui    1/1     1            1           3d1h
```

Download the deployment manifest:

```shell
kubectl get deploy visulate-for-oracle-1107-visulate-for-oracle-sql \
 -oyaml > sql-deployment.yaml
```

Edit the config-endpoints-volume entry in the manifest:

```yaml
      volumes:
      - name: config-endpoints-volume
        secret:
          defaultMode: 420
          secretName: sql-endpoints
```

Validate the edited file:

```shell
$ kubectl apply --dry-run=client --validate -f sql-deployment.yaml
```

Apply the file:

```shell
$ kubectl apply --validate -f sql-deployment.yaml
```

## Test the connections

Use curl to verify the connections. A GET request for a given endpoint should return its connect string. For example, with the endpoints.json example shown above:

```shell
$ curl http:\\load-balancer-ip/sql/vis115
db135.visulate.net:88521/vis115
```

## Timeout Duration

The timeout duration for long running requests is controlled using backend service timeouts see [GKE Ingress Documentation](https://cloud.google.com/kubernetes-engine/docs/how-to/ingress-features#timeout). The Visulate for Oracle kubernetes manifest includes a backendConfig that specifies a timeout value. This backendConfig is associated with the SQL Query Engine service via an annotation.

The timeout duration for the SQL Query Engine can be specified while provisioning the application. It defaults to 300 seconds (5 minutes). This value can be updated via the backendConfig. Use kubectl to list the backendConfigs:

```shell
kubectl get backendConfig
NAME                                                      AGE
visulate-for-oracle-1107-visulate-for-oracle-sql-conf     3d2h
```

Download the manifest
```shell
kubectl get backendConfig visulate-for-oracle-1107-visulate-for-oracle-sql-conf \
 -oyaml > backendconfig.yaml
 ```

 Edit the file updating the `timeoutSec` value at the bottom of the file:

```yaml
apiVersion: cloud.google.com/v1
kind: BackendConfig
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
  {"apiVersion":"cloud.google.com/v1",
   "kind":"BackendConfig",
   "metadata":{"annotations":{},
               "labels":{
                 "app.kubernetes.io/name":"visulate-for-oracle-1107"},
                 "name":"visulate-for-oracle-1107-visulate-for-oracle-sql-conf",
               "namespace":"test-nat-ns"},
    "spec":{"timeoutSec":300}}
  creationTimestamp: "2020-08-14T20:04:48Z"
  generation: 1
  labels:
    app.kubernetes.io/name: visulate-for-oracle-1107
  name: visulate-for-oracle-1107-visulate-for-oracle-sql-conf
  namespace: test-nat-ns
  resourceVersion: "52864557"
  selfLink: /apis/cloud.google.com/v1/namespaces/nat-ns/backendconfigs/visulate-for-oracle-sql-conf
  uid: 363b3943-112b-4a74-b806-9590b664280c
spec:
  timeoutSec: 300
```

Apply the file:

```
kubectl apply -f backendconfig.yaml
```

Wait a few minutes for the changes to take effect. The current timeout is displayed on the Load balancer details screen:

![Backend timeout](/images/backend-timeout.png){: class="screenshot" }