* TOC
{:toc id="toc"}

# Visulate for Oracle quickstart
This page shows you how to create a Visulate for Oracle instance on Google Cloud Platform (GCP) and connect it to an Oracle database.

## Before you begin
1. Identify or [create a Kubernetes cluster](https://cloud.google.com/kubernetes-engine/docs/quickstart) in GCP
2. Identify one or more Oracle databases that you want to document
3. [Configure your network](/pages/network-configuration.html) to allow connections from the GKE cluster to each Oracle database

## Open the config screen
- Visit the [Kubernetes Engine page](https://console.cloud.google.com/projectselector/kubernetes?_ga=2.63610924.2027644729.1585254356-1471266844.1580858508) in the Google Cloud Console and create or select a project.
- Select Applications from the left menu then click the "DEPLOY FROM MARKETPLACE" link:

![Google Cloud Marketplace](/images/mp-deploy-from-marketplace.png){: class="screenshot" }

- Enter Visluate in the search box and click on the result:

![Search Marketplace](/images/mp-search.png){: class="screenshot" }

- Press the `CONFIGURE` button on the screen that this opens.

## Configure an instance

Review the terms of service and complete the deploy screen

![Deploy Screen](/images/mp-deploy-visulate.png){: class="screenshot" }

- Select or create a namespace
- Change the default instance name to visulate-01 (see note below)
- Accept the defaults for the remaining fields and press the `Deploy` button

The **combined length** of the namespace and instance names **should not exceed 32 characters**. This avoids the potential for orphaned network resources when the instance is deleted. See [GCP Marketplace Tools issue 495](https://github.com/GoogleCloudPlatform/marketplace-k8s-app-tools/issues/495)

## Wait for instance to reach ready state

It may take over 10 minutes for the instance to deploy. Most of this time is spent creating network resources to support the ingress component.

![Components Pending](/images/mp-components-pending.png){: class="screenshot" }

You can monitor the progress of this from the ingress screen

![Ingress Unknown State](/images/mp-ingress-unknown-state.png){: class="screenshot" }

The instance is ready when the Backend services reach a health state.

![Ingress Green](/images/mp-ingress-green.png){: style="border: solid 1px rgba(210, 215, 217, 0.75);"}

## Verify the instance

Click on the Load balancer IP address to open the Visulate for Oracle UI. Ingress rules should rewrite the url appending "/database" to the ip address as shown in the screenshot below.

![UI Homepage](/images/ui-screen.png){: class="screenshot" }

Edit the url changing "/database" to "/api/". This should make a call to the API server.

![Empty API Response](/images/empty-api-response.png){: class="screenshot" }

Change "/api/" to "/api-docs/" to review the API documentation.

![Swagger UI](/images/swagger.png){: class="screenshot" }

At this point you have a Visulate for Oracle instance running. Now we need to connect it to an Oracle database.

## Create a database user in the database you want to document

Login to SQL*Plus as SYSTEM, create a database user called "VISULATE" and grant CREATE SESSION, SELECT_CATALOG_ROLE and SELECT ANY DICTIONARY privileges to it:
```
create user visulate identified by &password;
alter user visulate account unlock;
grant create session to visulate;
grant select any dictionary to visulate;
grant select_catalog_role to visulate;
```
Note: the API server runs a query on startup to verify account privileges. It drops the connection if the account does not have the required grants **or if the account has more privileges than it needs**. See the [database setup guide](/pages/database-setup.html) for additional details.


## Register your database connection

A kubernetes secret is used to pass database connection details to the instance. Open a text editor and create a file called db-connection-secret.yaml. With the following content:
```
---
apiVersion: v1
kind: Secret
type: Opaque
metadata:
  name: oracle-database-connections
stringData:
  database.js: |-
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

Use `kubectl` to verify and apply the file. Example:
```
$ kubectl apply --dry-run --validate --namespace=test-nat-ns -f db-connection-secret.yaml
secret/oracle-database-connections created (dry run)
$ kubectl apply --namespace=test-nat-ns -f db-connection-secret.yaml
secret/oracle-database-connections created
```

Open the API deployment screen (from GCP -> Kubernetes Engine -> Workloads) and press the `Edit` button

![API Deployment Screen](/images/api-deployment.png){: class="screenshot" }

Find the "config-database-volume" entry and change the secretName value to "oracle-database-connections"

![Edit API Deployment](/images/edit-api-deployment.png){: class="screenshot" }

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

## Review your database and its data model
Open the Visulate for Oracle UI (using the load balancer IP address assigned by the Ingress). Click on the Database dropdown list. You should see an entry called "vis13". Select the value and wait for database report to run (may take a couple of seconds). The results will appear below the selection form. Scroll down the page to review.

![Visulate Opening Screen](/images/opening-screen.png){: class="screenshot" }

Select a database user from the Schema drop down. Notice the database report is replaced by a schema one. Now select "TABLE" from the Object Type field to see a list of tables in the schema.

![List of tables](/images/table-list.png){: class="screenshot" }

Click on one of the tables to open the table report. This report shows table details like its tablespace, number of rows, indexes, constraints, foreign keys and columns. A Download DDL link at the top of the page can be used to generate the data definition language SQL for the table.

![Table details](/images/table-details.png){: class="screenshot" }

Scroll to the bottom of the page to see a list of object (e.g. packages, package bodies and views) that reference the table.

![Dependencies](/images/dependencies.png){: class="screenshot" }

Clicking on an object name in the dependency list will take you to a report showing its definition. For example, selecting a package body will open a report that shows the source code for the package body and a list of the SQL statement it contains.

![SQL Statements](/images/sql-statements.png){: class="screenshot" }

Open the hamburger menu at the top (left) of the page. This provides a quick way to access other objects of the same type in the schema.

![Hamburger menu](/images/hamburger-menu.png){: class="screenshot" }

Click on the search icon at the top (right) of the page to access the search form. Enter dba_objects in the search box and press return. This queries every registered database to find objects with a matching object_name (in our case we only have one registered database).

![Search](/images/search.png){: class="screenshot" }

Click on one of the results to see its definition report.

![Search result](/images/search-result.png){: class="screenshot" }

Click on the "Visulate for Oracle" title at the top (center) of the screen to return to the homepage. Notice the Object Filter field has been populated with DBA_OBJECTS (the last search condition). Change this value to DBA_* and then select a database and schema. Notice the navigation lists are now filtered using this wildcard.

![Filter condition](/images/filter.png){: class="screenshot" }

## Clean up

- Use the Kubernetes Engine -> Applications screen to delete the instance. Select the check box next to the application name then press the `Delete` button at the top of the screen

![Delete Visulate for Oracle](/images/mp-delete-app.png){: class="screenshot" }

- Delete the GKE Cluster if it is no longer required.
- Drop the visulate user from the database. Login to SQL*Plus as SYSTEM and run `drop user visulate cascade;`
- Verify the Load balancer that was created to support the Ingress resource has been removed (see the [troubleshooting guide](/pages/troubleshooting.html#orphaned-network-resources) for details).