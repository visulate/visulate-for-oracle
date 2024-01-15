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

By default requests to the SQL Query Engine timeout after 30 seconds. This can be extended using backend service timeouts as described in the [GKE Ingress Documentation](https://cloud.google.com/kubernetes-engine/docs/how-to/ingress-features#timeout).

Use a text editor to create a manifest. For example, the following file creates a backend config called `sql-engine-5-minute-timeout` in the `test-ns` namespace with a timeout value of 300 seconds:

```yaml
---
apiVersion: cloud.google.com/v1
kind: BackendConfig
metadata:
  name: sql-engine-5-minute-timeout
  namespace: test-ns
spec:
  timeoutSec: 300
```

Use kubectl to apply the file:

```shell
kubectl apply -f BackendConfig.yaml
```

Download the manifest for SQL Engine service. Find the service with the `visulate-for-oracle-sql-svc` suffix

```
 kubectl get service -n test-ns
NAME                                                   TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)                      AGE
visulate-for-oracle-1121-visulate-for-oracle-api-svc   NodePort   10.202.15.63    <none>        3000:31668/TCP               18d
visulate-for-oracle-1121-visulate-for-oracle-sql-svc   NodePort   10.202.13.200   <none>        5000:30458/TCP               18d
visulate-for-oracle-1121-visulate-for-oracle-ui-svc    NodePort   10.202.14.94    <none>        80:31934/TCP,443:30824/TCP   18d

kubectl get service visulate-for-oracle-1121-visulate-for-oracle-sql-svc -n test-nat-ns -oyaml > sqlEngineSrv.yaml
```
Edit the generated file (sqlEngineSrv.yaml in the example above). Add an annotation `cloud.google.com/backend-config: '{"default":"sql-engine-5-minute-timeout-conf"}'` as shown below


```yaml
kind: Service
metadata:
  annotations:
    cloud.google.com/backend-config: '{"default":"sql-engine-5-minute-timeout-conf"}'
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"v1","kind":"Service","metadata":{"annotations":{},"labels":{"app":"visulate-for-oracle", ... other content
  creationTimestamp: "2021-03-03T23:20:27Z"
  labels:
    ... other content

```

Validate and apply the file:

```
$ kubectl apply --dry-run=client --validate --namespace=test-ns -f sqlEngineSrv.yaml
service/visulate-for-oracle-1121-visulate-for-oracle-sql-svc configured (dry run)

$ kubectl apply --namespace=test-ns -f sqlEngineSrv.yaml
service/visulate-for-oracle-1121-visulate-for-oracle-sql-svc configured
```

Wait a few minutes for the changes to take effect. The current timeout is displayed on the Load balancer details screen:

![Backend timeout](/images/backend-timeout.png){: class="screenshot" tabindex="0" }