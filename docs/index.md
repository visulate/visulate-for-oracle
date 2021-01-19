<div>
<!-- Banner -->
<section id="banner">
  <div class="content">
    <header>
      <h1>Oracle to GCP</h1>
      <p>Support for Oracle database migrations to Google Cloud Platform</p>
    </header>
    <p>Visulate for Oracle is a Cloud-based application to catalog and query Oracle databases during
    migration to GCP. Users create connections from a central server to each database and then query
    using REST APIs or a browser.</p>
    <ul class="actions">
      <li><a href="https://console.cloud.google.com/marketplace/details/visulate-llc-public/visulate-for-oracle" class="button big">Learn More</a></li>
    </ul>
  </div>
  <span class="image">
    <img src="images/visulate-for-oracle.png" alt="Visulate for Oracle" style="height: auto"/>
  </span>
</section>

<!-- Section -->
  <section>
    <header class="major">
      <h2>Features</h2>
    </header>
    <div class="features">
      <article>
        <span class="icon solid fa-database"></span>
        <div class="content">
          <h3>One tool</h3>
          <p>Single tool to catalog the company’s Oracle databases. No server agents to install and manage.
           No client code to download or host via Citrix. Does not require Oracle server modifications
           e.g. UTL_FILE directories or REST Data Services (ORDS)</p>
        </div>
      </article>
      <article>
        <span class="icon solid fa-cloud"></span>
        <div class="content">
          <h3>Cloud-based</h3>
          <p>Enterprise-ready containerized solution with prebuilt deployment templates.
          Available as a Kubernetes application on Google Cloud Marketplace.
         </p>
        </div>
      </article>
      <article>
        <span class="icon solid fa-sitemap"></span>
        <div class="content">
          <h3>Database Object Reporting</h3>
         <p>Search and browse the data dictionary in each database.  Create bookmarks and links to schemas and objects.</p>
         <p>Query the database's dependency model to identify dependencies to and from the object (e.g a view "uses" the tables it is based on and is "used by" a procedure that selects from it).</p>
        </div>
      </article>
      <article>
        <span class="icon solid fa-file"></span>
        <div class="content">
          <h3>SQL, PL/SQL, DDL and CSV</h3>
          <p>Examine PL/SQL packages and procedures. Extract SQL statements from them. Identify dependencies on other database objects.</p>
          <p> Generate and download DDL for individual objects or groups of objects. </p>
          <p>Run SQL statements to review table contents and generate CSV files for data migrations</p>
        </div>
      </article>
      <article>
        <span class="icon solid fa-search"></span>
        <div class="content">
          <h3>Advanced Search and Filter</h3>
          <p>Single query to find objects by name in every schema and database. Filtered search to find objects in a database that match a wildcard pattern (e.g. E-Business Suite product prefix). </p><p>Advanced search API to identify objects and their dependent objects (e.g. a find the schema definition for a stored procedure and every object it needs to install cleanly)</p>
        </div>
      </article>
      <article>
        <span class="icon solid fa-wrench"></span>
        <div class="content">
          <h3>API Support</h3>
          <p>REST APIs are available for all application features.</p>
        </div>
      </article>
    </div>
  </section>
</div>
<div>
  <header class="major">
    <h2>Common use cases</h2>
  </header>
</div>

### On-Premises to GCP Bare Metal

Document and analyze on-premises environments prior to migration. Review system utilization for capacity planning. Evaluate proprietary feature usage in each database. Identify "lift and shift" projects and candidates for conversion to microservices or other database engines.

Document custom code in Commercial-off-the-shelf (COTS) application databases. Review the schema definitions in E-Business Suite databases.

Catalog Oracle database instances. Identify Enterprise Edition feature and option usage. Find Enterprise Edition license instances that could be be downgraded to Standard Edition 2. Review the contents of old databases. Identify targets for consolidation or decommissioning.

### Oracle Data Warehouse to Big Query

Analyze star, snowflake and 3NF schemas in the Oracle data warehouse. Execute queries to review data values and prototype denormalized structures. Generate CSV from SQL statements for download as files or streaming to Google Cloud Storage. Generate code stubs from Oracle table and PL/SQL metadata for use in ETL tools. Replicate data from Oracle via REST APIs.

### Oracle OLTP to Cloud SQL for PostgreSQL

Review Oracle schemas to identify Oracle specific data types and indexes. Examine custom PL/SQL and other database related program logic in stored procedures, packages and triggers. Extract SQL statements and business logic. Rewrite in other languages. Download Oracle DDL for manual conversion to PostgreSQL.

Execute Ora2Pg via an easy to use single page web application or REST API.
