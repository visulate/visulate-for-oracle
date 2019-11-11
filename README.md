# Visulate for Oracle
Visulate for Oracle is an Oracle data dictionary browsing service to help data engineers understand the structure and dependencies in Oracle databases that they plan to migrate to the Cloud.
## Functionality
A configuration file stores connection details for one or more the databases.  Visulate queries the data dictionary for each connection and allows the user to browse the result. 
![Alt text](/screenshots/object-selection.png?raw=true "Visulate for Oracle database object selection")
A report is generated for each database object by querying the appropriate dictionary views (e.g. DBA_TABLES for table objects or DBA_SOURCE for packages)  
![Alt text](/screenshots/object-details.png?raw=true "Visulate for Oracle object details")
This report also queries database's dependency model to identify dependencies to and from the object (e.g a view "uses" the tables it is based on and is "used by" a procedure that selects from it).  The dependency info identifies line numbers for references that appear in stored procedures.
![Alt text](/screenshots/object-dependencies.png?raw=true "Visulate for Oracle object dependencies")
## Implementation
Visulate for Oracle exposes REST endpoints and a UI to browse the metadata for registered connections. The API server is implemented in Express and uses node-oracledb to connect to the database(s).  Connections are registered in a configuration file (database.js) located in the config directory. A separate file (http-server.js) in the same directory controls the behavior of the Express server.
The start point for the Express server is app.js.  Most of the source code is in the services directory. Registered databases  must connect to a user with the SELECT ANY DICTIONARY privilege. The setup directory includes a script to create a user with the minimum required privileges. The SYSTEM account would also work (in a non-production environment) or you can grant SELECT ANY DICTIONARY to an existing user.
An Angular UI makes API calls to the Express server and displays the result. The source code for this is in the client directory. It reads the apiBase property in the src/environments/environment.ts (or environment.prod.ts) file to identify the base url for API calls.


