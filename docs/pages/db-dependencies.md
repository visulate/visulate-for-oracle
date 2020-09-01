* TOC
{:toc id="toc"}

# Analyze database object dependencies

Visulate for Oracle provides a UI and APIs to identify database object dependencies.

Every Oracle database maintains a record of the dependencies between its objects in the SYS schema's DEPENDENCY$ table. It queries this table to identify the status of an object. For example, a stored procedure is marked as invalid if you drop a table that it relies on. Visulate for Oracle provides APIs which read the same table.

## Using the UI

Dependency reports are included at the bottom of each database object report. For example, to view the dependencies for a table use the navigation menu or search box to open its object report.

![Table details](/images/table-details.png){: class="screenshot" }

Scroll to the bottom of the page to see a list of object (e.g. packages, package bodies and views) that reference the table.

![Dependencies](/images/dependencies.png){: class="screenshot" }

Clicking on an object name in the dependency list will take you to a report showing its definition. For example, selecting a package body will open a report that shows the source code for the package body and a list of the SQL statement it contains.

## Using the object report API

The database object report that the UI displays can also be accessed via an API call. Call the `/api` endpoint passing the database, schema, object type and object name as path parameters `/api/{database}/{schema}/{object type}/{object name}` Example:

``` shell
curl -X GET "https://my-domain.com/api/my-db/WIKI/PACKAGE/RNT_MENUS_PKG" \
-H  "accept: application/json" | json_pp

  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100  8390  100  8390    0     0  15594      0 --:--:-- --:--:-- --:--:-- 15594
[
   {
      "description" :
        ... database object report items
   }

   {
      "description" : "Dependencies other objects have on this one",
      "display" : [
         "Object Name",
         "Object Type",
         "Line"
      ],
      "link" : "Object Name",
      "rows" : [
         {
            "LINK" : "WIKI/PACKAGE BODY/RNT_MENUS_PKG",
            "Line" : "1, 4, 110",
            "OBJECT_ID" : 73477,
            "Object Name" : "RNT_MENUS_PKG",
            "Object Type" : "PACKAGE BODY",
            "Owner" : "WIKI"
         }
      ],
      "title" : "Used By"
   },
   {
      "description" : "Dependencies this object has on others",
      "display" : [
         "Object Name",
         "Object Type",
         "Line"
      ],
      "link" : "Object Name",
      "rows" : [
         {
            "LINK" : "WIKI/TABLE/RNT_MENUS",
            "Line" : "1, 4, 5, 11, 12, 13, 15, 16, 17, 18, 19, 21, 22, 23, 24, 26, 27, 29",
            "Object Name" : "RNT_MENUS",
            "Object Type" : "TABLE",
            "Owner" : "WIKI",
            "P_OBJ#" : 73457
         },
         {
            "LINK" : "WIKI/VIEW/RNT_MENUS_V",
            "Line" : "13, 19",
            "Object Name" : "RNT_MENUS_V",
            "Object Type" : "VIEW",
            "Owner" : "WIKI",
            "P_OBJ#" : 73469
         }
      ],
      "title" : "Uses"
   }
]
```

## Using the object collection API

The object collection API is used to identify a collection of objects along with the dependent objects that are needed to create them. It is designed to support partial schema migrations where a subset of the objects in a schema are to be migrated to a new database.

The object collection API accepts one or more object patterns as input and returns a collection of matching objects and their "uses" dependencies. An object pattern is an object describing a combination of owner, type, name and status. For example, the following pattern identifies objects in the "APPS" schema with an object name that start with "AP_BANK" of any type and status

```
[
  {
    "owner": "APPS",
    "type": "*",
    "name": "AP_BANK*",
    "status": "*"
  }
]
```

The API converts "*" characters to "%" and assembles a list of matching objects by running the following query

```
select  object_id, object_name, object_type, owner
from dba_objects
where  owner = :owner
and object_type like :object_type
and object_name like :object_name
and status like :status
and rownum < 3000
and object_type not in ('INDEX PARTITION','INDEX SUBPARTITION', 'LOB','LOB PARTITION','TABLE PARTITION','TABLE SUBPARTITION')
order by owner, object_type, object_name
```

For each matching object it queries the SYS.DEPENDENCY$ table to identify its "uses" dependencies. These are objects that need to exist for a valid install of the matched object. For example, the API would return FND_CURRENCIES in the result set for the AP_BANK* pattern if it matched a package body called AP_BANK_CHARGE_PKG which included a SQL statement that selects from FND_CURRENCIES

The object collection API is accessed by calling the `/api/collection/` endpoint passing the database as a path parameter `/api/collection/{database}` and an object pattern in the body of a POST request. Example:

```
curl \
-L 'https://my-domain.com/api/collection/vis115' \
-H 'Content-Type: application/json' \
-o collection_dependencies.json \
-d @- << EOF
[
  {
    "owner": "RNTMGR2",
    "type": "%",
    "name": "PR_RECORDS_PKG",
    "status": "*"
  },
  {
    "owner": "RNTMGR2",
    "type": "%",
    "name": "PR_PUMS_PKG",
    "status": "*"
  }
]
EOF

  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100 12416  100 12234  100   182  13933    207 --:--:-- --:--:-- --:--:-- 14125

$ json_pp < collection_dependencies.json
[
   {
      "OBJECT_ID" : 88898,
      "OBJECT_NAME" : "PR_RECORDS_PKG",
      "OBJECT_TYPE" : "PACKAGE",
      "OWNER" : "RNTMGR2"
   },
   {
      "OBJECT_ID" : 88717,
      "OBJECT_NAME" : "PROPERTY_LIST_T",
      "OBJECT_TYPE" : "TYPE",
      "OWNER" : "RNTMGR2",
      "REQUIRED_BY" : [
         {
            "OBJECT_ID" : 88898,
            "OBJECT_NAME" : "PR_RECORDS_PKG",
            "OBJECT_TYPE" : "PACKAGE",
            "OWNER" : "RNTMGR2"
         },
         {
            "OBJECT_ID" : 89244,
            "OBJECT_NAME" : "PR_RECORDS_PKG",
            "OBJECT_TYPE" : "PACKAGE BODY",
            "OWNER" : "RNTMGR2"
         }
      ]
   },

...

]

```
