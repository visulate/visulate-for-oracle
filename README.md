# visulate-for-oracle
Visulate is building an Oracle data dictionary browsing and comparison service for deployment in Google Cloud Platform. Customers provide connection details for the database they want to describe.  Visulate queries the data dictionary for this connection and allows the user to download or browse the result.  The goal is to help customers understand their structure and dependencies in Oracle databases that they plan to migrate to BigQuery or Cloud SQL.

The initial release of Visulate for Oracle will expose REST endpoints and a UI that allow users to browse the metadata for their registered connections.  Future versions could expand this functionality to support database diffs (e.g. identify the delta between stage and production environments)

We are interested in working with early adopters who can help define and refine requirements for the service. 

