* TOC
{:toc id="toc"}
# Generate CSV from SQL

Visulate for Oracle allows users to run ad-hoc queries via the UI or API calls. The UI exposes a query editor when the user selects a schema in a registered database. The query editor region is collapsed by default unless the user has navigated to a table or view. Clicking on the title area of the region toggles its visibility.

![Query editor collapsed](/images/query-editor-collapsed.png){: class="screenshot" tabindex="0" }

The expanded region displays an HTML form with username, password, sql query, bind variables and query option fields. Most of the fields are populated with default values when the user navigates to a table or view.

![Query screen](/images/sql2csv.png){: class="screenshot" tabindex="0" }

Entering the database password for the schema where the table resides to enables the `Run Query` button. Pressing this button causes an HTTP POST request to be made to the SQL Query endpoint passing the SQL statement and database credentials. The SQL Query Engine makes a database connection, executes the query and then closes the connection.

Results are displayed in an HTML table. A curl command appears below the results. These show the syntax to use in a console window to execute REST API calls outside of the UI.

**Note:** Database credentials are passed to the SQL Query Engine using a basic auth header. Make sure you are using a secure (https) connection before submitting a query.


## Bind Variables

The query engine supports bind variable substitution. Bind variables can be included in the SQL Query using a colon (:) prefix.

The default query that appears on table or view selection shows an example. When the user navigates to a table or view the SQL Query field is populate with a default query in the form:
```
select * from [TABLE_NAME] where rownum < :maxrows
```
`:maxrows` is a bind variable in this query. A value for it must be supplied via the Bind Variables field for the query to run. The UI populates a default value of 10 `{"maxrows": 10 }` for this. This limits the number of rows that the query will return. Passing a different value will increase or reduce the number of rows returned.

Bind variables can be passed as an object e.g. `{"maxrows": 10 }` or an array `[10]`.

The SQL Query and Bind Variables field values must match. An error "400 Bad Request: ORA-01008: not all variables bound" is returned if there are bind variables in the query that do not have corresponding values. A separate error "400 Bad Request: ORA-01036: illegal variable name/number" is returned if a bind variable is passed that does not have a placeholder in the query.

## Query Options

The query engine supports 3 optional arguments to modify its behavior:
- download_lobs
- csv_header
- cx_oracle_object

These are passed as an object e.g. `{"download_lobs": "N", "csv_header": "N", "cx_oracle_object":  "MDSYS.SDO_GEOMETRY"}`

**Note** the cx_oracle_object functionality is currently unavailable due to [Github Issue 317](https://github.com/visulate/visulate-for-oracle/issues/317)

### download_lobs

By default the query engine returns a character string with the LOB size rather than the actual content for queries that include a CLOB or BLOB column. This behavior can be modified by passing a value of "Y" for the download_lobs option. This will cause the query engine to return CLOB and BLOB values in the results as long as the values do not exceed 1 GB in length. BLOB values base64 encoded prior to download.

**Note:** An error is returned for rows with LOBs that exceed 1 GB in length if the download_lobs option is set to "Y".

### csv_header

The csv_header option includes or excludes the generation of a header row in the results with column names from the query. It affects the CSV file contents returned from the REST API (e.g. via curl). The UI ignores this parameter.

<!-- comment out until fix for https://github.com/visulate/visulate-for-oracle/issues/317 is available

### cx_oracle_object

By default the query engine lists the object type rather than attempting to display its contents for queries that include Oracle object type columns. For example, the following query includes a spatial column called GEOM:

```
curl -L 'https://visulate.mycorp.com/sql/vis13'
-H 'Authorization: Basic dkjkjadiDDDwiidjf'
-H 'Content-Type: application/json'
-H 'Accept: text/csv'
-d @- << EOF
{ "sql": "select parcelno, geom from PR_GEO where rownum < :maxrows",
"binds":  {"maxrows": 2 },
"options": {"download_lobs": "N", "csv_header": "Y"}
}
EOF
"PARCELNO","GEOM"
"00000000-19-1075-0013","<cx_Oracle.Object MDSYS.SDO_GEOMETRY at 0x7f22557c9c70>"
```

The query engine returned "<cx_Oracle.Object MDSYS.SDO_GEOMETRY at 0x7f22557c9c70>" as a value for GEOM indicating an object type of MDSYS.SDO_GEOMETRY for the column. Passing `"cx_oracle_object": "MDSYS.SDO_GEOMETRY"` as a query option causes the query engine to parse the spatial column and return its value:

```
curl -L 'https://visulate.mycorp.com/sql/vis13'
-H 'Authorization: Basic dkjkjadiDDDwiidjf'
-H 'Content-Type: application/json'
-H 'Accept: text/csv'
-d @- << EOF
{ "sql": "select parcelno, geom from PR_GEO where rownum < :maxrows",
"binds":  {"maxrows": 2 },
"options": {"download_lobs": "N", "csv_header": "Y", "cx_oracle_object": "MDSYS.SDO_GEOMETRY"}
}
EOF
"PARCELNO","GEOM"
"00000000-19-1075-0013"," {
   SDO_GTYPE: 3
   SDO_SRID: 8307
   SDO_POINT: None
   SDO_ELEM_INFO:
   [
     1
     3
     1
   ]
   SDO_ORDINATES:
   [
     -85.6198436336
     30.530487272
     -85.6200461878
     30.5303544724
     -85.6204100845
     30.5307704037
     -85.6202075298
     30.5309031996
     -85.6198436336
     30.530487272
   ]
 }
"
```

**Note:** The query engine only allows one object type per query -->

## CSV file generation

Use the UI to develop and test queries for CSV file generation then cut and paste the curl statement to generate files. Examples:

### Download to file:
```
curl \
-L 'https://visulate.mycorp.com/sql/vis13' \
-H 'Authorization: Basic dkjkjadiDDDwiidjf' \
-H 'Content-Type: application/json' \
-H 'Accept: text/csv' \
-o pr_property_geo.csv \
-d @- << EOF
{ "sql": "select *
from PR_PROPERTIES p
,    PR_GEO g
where p.prop_id = g.prop_id",
"binds":  {},
"options": {"download_lobs": "N",  "cx_oracle_object": "MDSYS.SDO_GEOMETRY"}
}
EOF
```

### Stream to Google Cloud Storage:
```
curl \
-L 'https://visulate.mycorp.com/sql/vis13' \
-H 'Authorization: Basic dkjkjadiDDDwiidjf' \
-H 'Content-Type: application/json' \
-H 'Accept: text/csv' \
-d @- << EOF | gsutil cp - gs://bigquery-geo/pr_property_geo.csv
{ "sql": "select *
from PR_PROPERTIES p
,    PR_GEO g
where p.prop_id = g.prop_id",
"binds":  {},
"options": {"download_lobs": "N",  "cx_oracle_object": "MDSYS.SDO_GEOMETRY"}
}
EOF
```

## JSON file generation

Change the http request header `Accept` value from test/csv to application/json to generate JSON instead of CSV output.

## Timeout behavior

Long running queries may timeout before completion. The default setting for this is 30 seconds. Update the load balancer backend timeout to increase this value.

## Security considerations

- Access to this feature can be controlled by a configuration file. This allows an admin to limit the list of database environments that allow query access. For example, they may wish to allow access for development databases but not production. See The [query engine config](/pages/query-engine-config.html) guide for details.
- Database credentials are passed to the SQL Query Engine using a basic auth header. It should only be used via a secure (https) connection.

## Using curl in an IAP enabled environment

curl requests to Visulate will fail with an empty token error if IAP has been enabled:

```
curl \
-L 'https://catalog2.visulate.com/sql/testdb' \
-H 'X-DB-Credentials: SFIvaHIyMIDzQHRlc3RkYg==' \
-H 'Content-Type: application/json' \
-H 'Accept: text/csv' \
-d @- << EOF
{ "sql": "select * from EMPLOYEES where rownum < :maxrows",
"binds":  {"maxrows": 10 },
"options": {"download_lobs": "N", "csv_header": "N", "cx_oracle_object": null}
}
EOF

Invalid IAP credentials: empty token
```

Additional setup steps are required to enable access:

1. Grant the [service account token creator](https://cloud.google.com/iam/docs/understanding-roles#iam.serviceAccountTokenCreator) role to the user that needs to make the request
2. Create a service account for Visulate access
3. Grant the *IAP-secured Web App User* role to the service account for the IAP protected endpoint (see [IAP setup](/pages/iap-setup.html#setup-iap-access) document)
4. Identify the OAUTH_CLIENT_ID for the IAP protected endpoint from [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials) screen
5. Verify the *User Type* on the [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) is set to **External**
6. Call the API:

    ```
    gcloud auth application-default login

    OAUTH_CLIENT_ID=214450074222-rlc11nhjs22cf4n9mafupf417a7p16l2.apps.googleusercontent.com
    AUTHORIZED_SA=visulate-iap-cur@my-project.iam.gserviceaccount.com

    ID_TOKEN=$(
    gcloud auth print-identity-token \
    --audiences  $OAUTH_CLIENT_ID \
    --include-email \
    --impersonate-service-account $AUTHORIZED_SA
    )

    curl \
    -L 'https://catalog2.visulate.com/sql/testdb' \
    -H "Proxy-Authorization: Bearer $ID_TOKEN" \
    -H 'X-DB-Credentials: SFIvaHIyMDIzQHRlc3RkYg==' \
    -H 'Content-Type: application/json' \
    -H 'Accept: text/csv' \
    -d @- << EOF
    { "sql": "select * from EMPLOYEES where rownum < :maxrows",
    "binds":  {"maxrows": 10 },
    "options": {"download_lobs": "N", "csv_header": "N", "cx_oracle_object": null}
    }
    EOF

    100,"Steven","King","SKING","1.515.555.0100","2013-06-17 00:00:00","AD_PRES",24000.0,"","",90
    101,"Neena","Yang","NYANG","1.515.555.0101","2015-09-21 00:00:00","AD_VP",17000.0,"",100,90
    102,"Lex","Garcia","LGARCIA","1.515.555.0102","2011-01-13 00:00:00","AD_VP",17000.0,"",100,90
    103,"Alexander","James","AJAMES","1.590.555.0103","2016-01-03 00:00:00","IT_PROG",9000.0,"",102,60
    104,"Bruce","Miller","BMILLER","1.590.555.0104","2017-05-21 00:00:00","IT_PROG",6000.0,"",103,60
    105,"David","Williams","DWILLIAMS","1.590.555.0105","2015-06-25 00:00:00","IT_PROG",4800.0,"",103,60
    106,"Valli","Jackson","VJACKSON","1.590.555.0106","2016-02-05 00:00:00","IT_PROG",4800.0,"",103,60
    107,"Diana","Nguyen","DNGUYEN","1.590.555.0107","2017-02-07 00:00:00","IT_PROG",4200.0,"",103,60
    108,"Nancy","Gruenberg","NGRUENBE","1.515.555.0108","2012-08-17 00:00:00","FI_MGR",12008.0,"",101,100
  ```
