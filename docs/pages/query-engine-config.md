* TOC
{:toc id="toc"}
# SQL Query Engine Configuration

The SQL Query Engine exposes a REST API to generate CSV files from user supplied SQL. An HTTP POST request is made to the SQL Query endpoint passing the SQL statement. The SQL Query Engine makes a database connection, executes the query and then closes the connection. Results are returned to the user as CSV or JSON.

![Database Connections](/images/database-connections.png)

Access to this feature is controlled by a configuration file. This allows a DBA to limit the list of database environments that allow SQL access. For example, they may wish to allow access for development databases but not production.

## endpoints.json file

The configuration file is called `endpoints.json`. It contains an object of key value pairs with keys that correspond to database endpoints and values that represent their connect strings. Example:

```
{"oracle18XE":"db205.visulate.net:98521/XEPDB1",
 "oracle11XE":"db205.visulate.net:44561/XE",
 "vis115":"db135.visulate.net:88521/vis115"}
```

### Wallet-Based Connections

The SQL Query Engine can connect to Oracle Autonomous Database instances that require a wallet. To enable this, the endpoint configuration in `endpoints.json` must be an object containing the `dsn`, `wallet_location`, and optionally `wallet_password`.

Here is an example of an `endpoints.json` file with both a traditional connect string and a wallet-based connection:

```json
{
    "oracle18XE": "db205.visulate.net:98521/APDB1",
    "my_adb": {
        "dsn": "my_adb_tns_alias",
        "wallet_location": "/usr/src/app/wallet"
    }
}
```

- `dsn`: The TNS alias for the database from your `tnsnames.ora` file.
- `wallet_location`: The directory path inside the container where the wallet files are located.
- `wallet_password`: (Optional) The password for the wallet, if required.

When using a wallet, the UI validation logic will check the `dsn` value against the value returned by the API server.

## /endpoints API

The API server exposes an `/endpoints` endpoint which returns a list of valid endpoints based on the [database registration file](/pages/database-registration.html#database-registration-file). Use the /endpoints API to generate a default configuration file for your environment:

```shell
curl http://load-balancer-ip/endpoints/ > endpoints.json
```

Edit the generated file to remove any entries you don't want to expose. Note: Do not edit individual endpoint keys or connect string values. The UI will not enable the query editor for database endpoints where the API Server and SQL Query Engine values do not match.

## Edit the endpoints.json for a VM deployment

In a VM deployment the *endpoints.json* file is located in the **/home/visulate/config** directory. ssh into the VM to change its value and then restart the service using docker-compose:

```
cd /home/visulate
sudo vi config/endpoints.json
docker-compose down
docker-compose up -d
```

## Apply the endpoints.json file as a new secret for a Kubernetes deployment

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

By default requests to the SQL Query Engine timeout after 30 seconds. This can be extended by modifying the timeout duration for the load balancer backend.