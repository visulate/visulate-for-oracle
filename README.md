# Visulate for Oracle
## Functionality
Visulate for Oracle is an Oracle data dictionary browsing service to help data engineers understand the structure and dependencies in Oracle databases that they plan to migrate to the Cloud.  A configuration file stores connection details for one or more the databases.  Visulate queries the data dictionary for each connection and allows the user to browse the result. 
![Alt text](/screenshots/object-selection.png?raw=true "Visulate for Oracle database object selection")
A report is generated for each database object by querying the appropriate dictionary views (e.g. DBA_TABLES for table objects or DBA_SOURCE for packages)  
![Alt text](/screenshots/object-details.png?raw=true "Visulate for Oracle object details")
This report also queries database's dependency model to identify dependencies to and from the object (e.g a view "uses" the tables it is based on and is "used by" a procedure that selects from it).  The dependency info identifies line numbers for references that appear in stored procedures.
![Alt text](/screenshots/object-dependencies.png?raw=true "Visulate for Oracle object dependencies")
## Implementation
The initial release of Visulate for Oracle will expose REST endpoints and a UI that allow users to browse the metadata for their registered connections.  Future versions could expand this functionality to support database diffs (e.g. identify the delta between stage and production environments)

We are interested in working with early adopters who can help define and refine requirements for the service. 

