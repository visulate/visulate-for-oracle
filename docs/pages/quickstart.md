* TOC
{:toc id="toc"}

# Visulate for Oracle quickstart
This page shows you how to create a Visulate for Oracle instance and connect it to an Oracle database.

Allow around 60 minutes to complete this tutorial.

## Docker Compose Deployment

Runs Visulate for Oracle + Ora2Pg on a Virtual Machine.

### Before you begin

1. Create a Visulate VM and download the application
2. Configure firewall rules allowing ingress to the Visulate VM on tcp ports 3000 and 443.
3. Configure firewall rules allowing access from the Visulate VM to source Oracle databases
4. (Optional if running Ora2Pg) configure firewall rules to access target PostgreSQL databases
4. Review the container locations in the docker-compose.yaml file and verify the Visulate VM can access them

### Setup Instructions

1. Use the `generate-cert.sh` script to create a self signed X.509 certificate

    ```
    hostname -f
    ora2pg.us-east1-b.c.my-gcp-project.internal

    sudo bash generate-cert.sh

    Generating a RSA private key
    .++++
    .....................................................................................................................................................................++++
    writing new private key to 'ora2pg-key.pem'
    Enter PEM pass phrase:
    Verifying - Enter PEM pass phrase:
    -----
    You are about to be asked to enter information that will be incorporated
    into your certificate request.
    What you are about to enter is what is called a Distinguished Name or a DN.
    There are quite a few fields but you can leave some blank
    For some fields there will be a default value,
    If you enter '.', the field will be left blank.
    -----
    Country Name (2 letter code) [AU]:US
    State or Province Name (full name) [Some-State]:Florida
    Locality Name (eg, city) []:Orlando
    Organization Name (eg, company) [Internet Widgits Pty Ltd]:Visulate
    Organizational Unit Name (eg, section) []:Ora2Pg
    Common Name (e.g. server FQDN or YOUR name) []:ora2pg.us-east1-b.c.my-gcp-project.internal
    Email Address []:
    ```

2. Set the passphrase for use by nginx and express

    - Edit the `pw` file in the certs directory. Replace its value with the passphrase used to generate the cert

      ```
      vi certs/pw
      ```
    - Edit the `.env` file. Update the `ORA2PG_TLS_CERT_PASSPHRASE` value

      ```
      vi .env

      ORA2PG_TLS_CERT_PASSPHRASE=ora2pgkey
      ```

3. Start Visulate

    ```
    sudo bash docker-compose.sh up -d

    Creating network "visulate_default" with the default driver
    Creating visulate_ora2pg_1       ... done
    Creating visulate_reverseproxy_1 ... done
    Creating visulate_visapi_1       ... done
    Creating visulate_vissql_1       ... done
    Creating visulate_visui_1        ... done
    ```

4. Use a browser session on the remote desktop to access Visulate via its internal IP address. Access Ora2Pg on port 3000 and Visulate for Oracle on port 443.

5. Stop Visulate

    ```
    sudo bash docker-compose.sh down

    Stopping visulate_visui_1        ... done
    Stopping visulate_vissql_1       ... done
    Stopping visulate_visapi_1       ... done
    Stopping visulate_reverseproxy_1 ... done
    Stopping visulate_ora2pg_1       ... done
    Removing visulate_visui_1        ... done
    Removing visulate_vissql_1       ... done
    Removing visulate_visapi_1       ... done
    Removing visulate_reverseproxy_1 ... done
    Removing visulate_ora2pg_1       ... done
    Removing network visulate_default
    ```

6. Configure Visulate for Oracle.

  - Use the `create_user.sql` script in the `config` directory to create a Visulate account in the database(s) you want to document

    ```
    sudo bash sqlplus.sh

    SQL*Plus: Release 19.0.0.0.0 - Production on Sun Jul 24 17:49:59 2022
    Version 19.14.0.0.0

    Copyright (c) 1982, 2021, Oracle.  All rights reserved.

    Enter user-name: system/oracle@oratest.us-east1-b.c.visulate-llc-dev.internal:1521/xe

    Connected to:
    Oracle Database 11g Express Edition Release 11.2.0.2.0 - 64bit Production

    SQL> @/config/create_user
    Enter value for password: vis1066r
    old   1: create user visulate identified by &password
    new   1: create user visulate identified by vis1066r

    User created.


    User altered.


    Grant succeeded.


    Grant succeeded.


    Grant succeeded.

    SQL>
    ```

  - Edit `database.js` file in the `config` directory with the connect details

    ```
    vi config/database.js

    const endpoints = [
    { namespace: 'testdb',
        description: 'Example endpoint',
        connect: { poolAlias: 'testdb',
                user: 'visulate',
                password: 'vis1066r',
                connectString: 'oratest.us-east1-b.c.visulate-llc-dev.internal:1521/xe',
                poolMin: 4,
                poolMax: 4,
                poolIncrement: 0
                }
    }
    ];
    ```

  - *Optional*  Edit `endpoints.json` in the `config` directory to enable query access for a database. Note: the json key must match an endpoint declared in the database.js file and the json value must match its connectString.

    ```
    vi config/endpoints.json

    {"testdb":"oratest.us-east1-b.c.visulate-llc-dev.internal:1521/xe"}
    ```

  - Restart Visulate

### Verify the instance

Navigate to port 443 of the Visulate VM in a browser window

![UI Homepage](/images/ui-screen.png){: class="screenshot" tabindex="0" }

Edit the url changing "/database" to "/api/". This should make a call to the API server. **Tip:** make sure you include the trailing slash "/" in "/api/"

![Empty API Response](/images/empty-api-response.png){: class="screenshot" tabindex="0" }

Change "/api/" to "/api-docs/" to review the API documentation.

![Swagger UI](/images/swagger.png){: class="screenshot" tabindex="0" }


### Review your database and its data model
Open the Visulate for Oracle UI (using the load balancer IP address assigned by the Ingress). Click on the Database dropdown list. You should see an entry called "vis13". Select the value and wait for database report to run (may take a couple of seconds). The results will appear below the selection form. Scroll down the page to review.

![Visulate Opening Screen](/images/opening-screen.png){: class="screenshot" tabindex="0" }

Select a database user from the Schema drop down. Notice the database report is replaced by a schema one. Now select "TABLE" from the Object Type field to see a list of tables in the schema.

![List of tables](/images/table-list.png){: class="screenshot" tabindex="0" }

Click on one of the tables to open the table report. This report shows table details like its tablespace, number of rows, indexes, constraints, foreign keys and columns. A Download DDL link at the top of the page can be used to generate the data definition language SQL for the table.

![Table details](/images/table-details.png){: class="screenshot" tabindex="0" }

Scroll to the bottom of the page to see a list of object (e.g. packages, package bodies and views) that reference the table.

![Dependencies](/images/dependencies.png){: class="screenshot" tabindex="0" }

Clicking on an object name in the dependency list will take you to a report showing its definition. For example, selecting a package body will open a report that shows the source code for the package body and a list of the SQL statement it contains.

![SQL Statements](/images/sql-statements.png){: class="screenshot" tabindex="0" }

Open the hamburger menu at the top (left) of the page. This provides a quick way to access other objects of the same type in the schema.

![Hamburger menu](/images/hamburger-menu.png){: class="screenshot" tabindex="0" }

Click on the search icon at the top (right) of the page to access the search form. Enter dba_objects in the search box and press return. This queries every registered database to find objects with a matching object_name (in our case we only have one registered database).

![Search](/images/search.png){: class="screenshot" tabindex="0" }

Click on one of the results to see its definition report.

![Search result](/images/search-result.png){: class="screenshot" tabindex="0" }

Click on the "Visulate for Oracle" title at the top (center) of the screen to return to the homepage. Notice the Object Filter field has been populated with DBA_OBJECTS (the last search condition). Change this value to DBA_* and then select a database and schema. Notice the navigation lists are now filtered using this wildcard.

![Filter condition](/images/filter.png){: class="screenshot" tabindex="0" }


### Generate a CSV file

Open the Visulate for Oracle UI and navigate to a database table. A query editor region is included at the top of the page. It contains an HTML form with username, password, sql query, bind variables and query option fields. Most of the fields are populated with default values.

![Query screen](/images/sql2csv.png){: class="screenshot" tabindex="0" }

Enter the database password for the schema where the table resides to enable the `Run Query` button. Note: database credentials are passed to the SQL Query Engine using a basic auth header. Make sure you are using a secure (https) connection before submitting the query (you may need to accept some browser warnings). Run the query and review the results.

A curl command appears below the results. Cut an paste this into a console window to execute the REST API call outside of the UI. Note you may need to pass `-k` or `--insecure` option if you haven't setup a TLS certificate

### Visulate Ora2Pg

Navigate to port 3000 of the Visulate VM in a browser window to access Visulate Ora2Pg.

[Ora2Pg](https://github.com/darold/ora2pg) is an open source Perl script used to migrate an Oracle database to a PostgreSQL compatible schema. It connects an Oracle database, scans it to extract its structure or data, then generates SQL scripts for loading into a PostgreSQL database. Visulate Ora2Pg provides a web based UI to control the configuration and execution of Ora2Pg.

![Visulate Ora2Pg](/images/visulate-ora2pg-config.png?raw=true "Visulate Ora2Pg configuration"){: class="screenshot" tabindex="0" }

Edit the `ORACLE_DSN` field to provide the connect string for an Oracle database and provide Oracle system credentials in the pop-up window

![Visulate Ora2Pg connection](/images/ora2pg-login.png?raw=true "Visulate Ora2Pg login"){: class="screenshot" tabindex="0" }


Once the configuration parameters have been set click the `RUN` button at the top of screen.

![Ora2Pg Output](/images/visulate-ora2pg-run.png?raw=true "Visulate Ora2Pg run results"){: class="screenshot" tabindex="0" }

Output files are written to a Docker volume which can be bound to the host filesystem. There's also a UI to download output files. Click the `REVIEW` button to access it.

## Kubernetes Deployment

How to create a Visulate for Oracle instance on Google Cloud Platform (GCP) and connect it to an Oracle database.


### Before you begin
1. Identify or [create a Kubernetes cluster](https://cloud.google.com/kubernetes-engine/docs/quickstart) in GCP running GKE 1.16 or later
2. Identify an Oracle database that you want to document. **Note:** you'll need the ability to create an account in this database
3. [Configure your network](/pages/network-configuration.html) to allow connections from the GKE cluster to your database
4. Open the Visulate for Oracle Console

<a href="https://console.cloud.google.com/marketplace/details/visulate-llc-public/visulate-for-oracle"
   class="button big" target="_blank">Go to Console</a>

### Configure an instance

Review the terms of service and click the `Purchase Plan` button followed by the `Configure` button.

Complete the deploy screen

![Deploy Screen](/images/mp-deploy-visulate.png){: class="screenshot" tabindex="0" tabindex="0"}

- Select or create a namespace
- Change the default instance name to visulate-01 (see note below)
- Accept the defaults for the remaining fields and press the `Deploy` button

The **combined length** of the namespace and instance names **should not exceed 32 characters**. This avoids the potential for orphaned network resources when the instance is deleted. See [GCP Marketplace Tools issue 495](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-tools/issues/495)

### Wait for instance to reach ready state

It may take over 15 minutes for the instance to deploy. Most of this time is spent creating network resources to support the ingress component.

![Components Pending](/images/mp-components-pending.png){: class="screenshot" tabindex="0" }

You can monitor the progress of this from the ingress screen

![Ingress Unknown State](/images/mp-ingress-unknown-state.png){: class="screenshot" tabindex="0" }

The instance is ready when the Backend services reach a health state.

![Ingress Green](/images/mp-ingress-green.png){: style="border: solid 1px rgba(210, 215, 217, 0.75);"}

### Verify the instance

Click on the Load balancer IP address to open the Visulate for Oracle UI. Ingress rules should rewrite the url appending "/database" to the ip address as shown in the screenshot below.

![UI Homepage](/images/ui-screen.png){: class="screenshot" tabindex="0" }

Edit the url changing "/database" to "/api/". This should make a call to the API server. **Tip:** make sure you include the trailing slash "/" in "/api/"

![Empty API Response](/images/empty-api-response.png){: class="screenshot" tabindex="0" }

Change "/api/" to "/api-docs/" to review the API documentation.

![Swagger UI](/images/swagger.png){: class="screenshot" tabindex="0" }

At this point you have a Visulate for Oracle instance running. Now we need to connect it to an Oracle database.

### Create a database user in the database you want to document

Login to SQL*Plus as SYSTEM, create a database user called "VISULATE" and grant CREATE SESSION, SELECT_CATALOG_ROLE and SELECT ANY DICTIONARY privileges to it:
```
create user visulate identified by &password;
alter user visulate account unlock;
grant create session to visulate;
grant select any dictionary to visulate;
grant select_catalog_role to visulate;
```
Note: the API server runs a query on startup to verify account privileges. It drops the connection if the account does not have the required grants **or if the account has more privileges than it needs**. See the [database setup guide](/pages/database-setup.html) for additional details.


### Register your database connection

A kubernetes secret is used to pass database connection details to the instance. Open a text editor and create a file called db-connections.js. With the following content:
```
const endpoints = [
{ namespace: 'vis13',
  description: 'Test instance',
  connect: { poolAlias: 'vis13',
            user: 'visulate',
            password: 'jkafDD!@997',
            connectString: 'dev115.visulate.net:1521/vis13',
            poolMin: 4,
            poolMax: 4,
            poolIncrement: 0
          }
}
];
module.exports.endpoints = endpoints;
```

Edit the password and connectString values to match the ones for your database instance.

Create a Kubernetes secret called `oracle-database-connections` with `database.js` as a key the registration file contents as its value:

```shell
kubectl create secret generic oracle-database-connections --from-file=database.js=./db-connections.js
```
**Note:** the secret's name is not important but **it's key must be `database.js`**

Open the API deployment screen (from GCP -> Kubernetes Engine -> Workloads) and press the `Edit` button

![API Deployment Screen](/images/api-deployment.png){: class="screenshot" tabindex="0" }

Find the "config-database-volume" entry and change the secretName value to "oracle-database-connections"

![Edit API Deployment](/images/edit-api-deployment.png){: class="screenshot" tabindex="0" }

The edited value should look like this:
```
      volumes:
      - name: config-database-volume
      - secret:
          defaultMode: 420
          secretName: oracle-database-connections
```

Press the `Save` button and wait for a new pod to deploy replacing the previous revision.

Note: See the [database registration guide](/pages/database-registration.html) for additional details on this step.

### Review your database and its data model
Open the Visulate for Oracle UI (using the load balancer IP address assigned by the Ingress). Click on the Database dropdown list. You should see an entry called "vis13". Select the value and wait for database report to run (may take a couple of seconds). The results will appear below the selection form. Scroll down the page to review.

![Visulate Opening Screen](/images/opening-screen.png){: class="screenshot" tabindex="0" }

Select a database user from the Schema drop down. Notice the database report is replaced by a schema one. Now select "TABLE" from the Object Type field to see a list of tables in the schema.

![List of tables](/images/table-list.png){: class="screenshot" tabindex="0" }

Click on one of the tables to open the table report. This report shows table details like its tablespace, number of rows, indexes, constraints, foreign keys and columns. A Download DDL link at the top of the page can be used to generate the data definition language SQL for the table.

![Table details](/images/table-details.png){: class="screenshot" tabindex="0" }

Scroll to the bottom of the page to see a list of object (e.g. packages, package bodies and views) that reference the table.

![Dependencies](/images/dependencies.png){: class="screenshot" tabindex="0" }

Clicking on an object name in the dependency list will take you to a report showing its definition. For example, selecting a package body will open a report that shows the source code for the package body and a list of the SQL statement it contains.

![SQL Statements](/images/sql-statements.png){: class="screenshot" tabindex="0" }

Open the hamburger menu at the top (left) of the page. This provides a quick way to access other objects of the same type in the schema.

![Hamburger menu](/images/hamburger-menu.png){: class="screenshot" tabindex="0" }

Click on the search icon at the top (right) of the page to access the search form. Enter dba_objects in the search box and press return. This queries every registered database to find objects with a matching object_name (in our case we only have one registered database).

![Search](/images/search.png){: class="screenshot" tabindex="0" }

Click on one of the results to see its definition report.

![Search result](/images/search-result.png){: class="screenshot" tabindex="0" }

Click on the "Visulate for Oracle" title at the top (center) of the screen to return to the homepage. Notice the Object Filter field has been populated with DBA_OBJECTS (the last search condition). Change this value to DBA_* and then select a database and schema. Notice the navigation lists are now filtered using this wildcard.

![Filter condition](/images/filter.png){: class="screenshot" tabindex="0" }

### SQL Query Engine Configuration

The SQL Query Engine exposes a REST API to generate CSV files from user supplied SQL. Access to this feature is controlled by a configuration file. This allows a DBA to limit the list of database environments that allow SQL access. For example, they may wish to allow access for development databases but not production.

Use the `/endpoints` API to generate a configuration file for your database:

```shell
curl http://load-balancer-ip/endpoints/ > endpoints.json
```

Generate a kubernetes secret from the file with a key of `endpoints.json`:

```shell
kubectl create secret generic sql-endpoints --from-file=endpoints.json=./endpoints.json
```

Edit the config-endpoints-volume entry in the deployment manifest for the SQL query engine deployment (`-sql` suffix):

```yaml
      volumes:
      - name: config-endpoints-volume
        secret:
          defaultMode: 420
          secretName: sql-endpoints
```

Follow the steps outlined in the [database registration](#register-your-database-connection) process above or review the [Query engine configuration guide](/pages/query-engine-config.html) for detailed instructions.

### Generate a CSV file

Open the Visulate for Oracle UI and navigate to a database table. A query editor region is included at the top of the page. It contains an HTML form with username, password, sql query, bind variables and query option fields. Most of the fields are populated with default values.

![Query screen](/images/sql2csv.png){: class="screenshot" tabindex="0" }

Enter the database password for the schema where the table resides to enable the `Run Query` button. Note: database credentials are passed to the SQL Query Engine using a basic auth header. Make sure you are using a secure (https) connection before submitting the query (you may need to accept some browser warnings). Run the query and review the results.

A curl command appears below the results. Cut an paste this into a console window to execute the REST API call outside of the UI. Note you may need to pass `-k` or `--insecure` option if you haven't [setup a TLS certificate](/pages/tls-cert.html)


### Clean up

- Use the Kubernetes Engine -> Applications screen to delete the instance. Select the check box next to the application name then press the `Delete` button at the top of the screen

![Delete Visulate for Oracle](/images/mp-delete-app.png){: class="screenshot" tabindex="0" }

- Delete the GKE Cluster if it is no longer required.
- Drop the visulate user from the database. Login to SQL*Plus as SYSTEM and run `drop user visulate cascade;`
- Verify the Load balancer that was created to support the Ingress resource has been removed (see the [troubleshooting guide](/pages/troubleshooting.html#orphaned-network-resources) for details).