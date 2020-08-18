* TOC
{:toc id="toc"}

## Application Architecture

![Architecture diagram](/images/database-connections.png)

Visulate for Oracle creates 3 docker containers to deliver a browser UI and REST endpoints for one or more Oracle databases. The UI Container exposes an Angular UI which makes API calls to REST endpoints exposed by the API Server Container and the SQL Query Engine Container.

The API Server is an [Express JS](https://expressjs.com/) instance.  It connects to one or more registered databases using [node-oracledb](https://oracle.github.io/node-oracledb/doc/api.html#intro). Database connections are registered by adding an entry to a configuration file that the API Server reads during initialization. It creates a [connection pool](https://oracle.github.io/node-oracledb/doc/api.html#connpooling) for each entry in the config file.

### API Server

The API Server has SQL for each database object that queries the appropriate dictionary views (e.g. DBA_TABLES and other views for table objects or DBA_SOURCE for packages). It also queries database’s dependency model to identify dependencies to and from the object (e.g a view “uses” the tables it is based on and is “used by” a procedure that selects from it).

The API Server exposes REST endpoints that allow users initiate queries for a given database + object description. Most API calls include in a query against DBA_OBJECTS.  For example a call to the `/api/{db}/{owner}/{type}/{name}/{status}` endpoint returns the result of running the following query in the specified database:
```
select  object_id, object_name, object_type, owner
from dba_objects
where owner = :owner
and object_type like :type
and object_name like :name ESCAPE \_
and status like :status
order by object_name
```
Results are returned in JSON format. An [Open API Specification](https://github.com/visulate/visulate-for-oracle/blob/master/api-server/openapi.yaml) for the API Server is available in Github.

### UI

An Angular UI makes API calls to the API Server and displays the result.

### SQL Query Engine

The SQL Query Engine allows users to run ad-hoc queries and download the result as CSV or JSON. It is a [WSGI Flask](https://flask.palletsprojects.com/) instance which uses [cx_Oracle](https://cx-oracle.readthedocs.io/en/latest/) to make database connections. Access to this feature is controlled by a configuration file called `endpoints.json`. This allows a DBA to limit the list of database environments that allow SQL access. For example, they may wish to allow access for development databases but not production.

The SQL Query Engine exposes a REST API to generate CSV or JSON from user supplied SQL. An HTTP POST request is made to the SQL Query endpoint passing the database credentials as a basic auth header and a SQL query in the request body. A typical request might look like this:

```
echo -n hr:hr-password| base64
aHI6aHItcGFzc3dvcmQ=

curl \
-L 'https://demo115.visulate.net/sql/vis115' \
-H 'Authorization: Basic aHI6aHItcGFzc3dvcmQ=' \
-H 'Content-Type: application/json' \
-H 'Accept: text/csv' \
-d @- << EOF
{ "sql": "select * from EMPLOYEES where rownum < :maxrows",
"binds":  {"maxrows": 10 },
"options": {"download_lobs": "N", "csv_header": "N", "cx_oracle_object": null}
}
EOF
```

The endpoints.json file populates a Python dictionary of endpoint:connect string pairs. The Query Engine accepts the endpoint as a path parameter (vis115 in the example above) and uses the dictionary to lookup its connect string. It combines this with the username and password passed in the header to establish a database connection. The SQL Query Engine does not use connection pooling. Each request makes a new database connection, executes the query, streams the result and then closes the connection.

## Kubernetes Architecture

![K8S Architecture](/images/k8s.png)

Web users connect to the application via an Ingress resource. Http path rules in the ingress spec route requests to the UI, API or SQL Service as required. Database registration is performed using a Secret.  The Secret manifest delivers the database.js configuration file that the Express server reads during initialization as part of the API Server deployment. A similar mechanism is used to deliver the SQL Query Engine's endpoints.json file.

The UI and API Server deployment manifests include sidecar containers to support Google Cloud Platform (GCP) integration. The UI and API Server manifests use sidecar containers to make log file contents available to Stackdriver. The API Server manifest creates 2 additional sidecars to support GCP Marketplace. The SQL Query Engine sends its logs to stderr and stdout instead of writing to a file. This avoids the need for a sidecar to populate Stackdriver

The application's [helm chart](https://github.com/visulate/visulate-for-oracle/tree/master/google-marketplace/chart/visulate-for-oracle) is available in GitHub. The [install guide](/pages/install-guide.html#command-line-instructions) has instructions for using it.
