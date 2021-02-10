* TOC
{:toc id="toc"}
# Planning a migration to Google Bare Metal Solution
Peter Goldthorp, February 2021

*Google Cloud Bare Metal Solution (BMS) is a co-location offering from Google. It is designed to address the challenges enterprise CIOs face delivering new cloud based services while supporting their existing systems. Customers and the board of directors expect technical innovation. In reality 80% the budget is spent on maintenance.*

## Cloud innovation while keeping the lights on

Most enterprises run a mixture of commercial off the shelf (COTS) software applications and custom code developed in-house. For example, they may run SAP to support their manufacturing operations, Oracle E-Business Suite for Financials and PeopleSoft for human resource management. The systems were customized by systems integrators during the initial implementation and have been extended over the years with business specific logic.

Each software implementation is different. No two enterprises will be running the same software configuration even if they happen to be running the same application versions. Each change requires extensive testing. Many large Oracle customers are willing to pay additional fees for extended support on an old version of their software to avoid the cost and disruption associated with an upgrade to the latest version.

The requirements involved in delivering new digital products and supporting existing systems often work against each other. Smartphone apps, decision support systems and machine learning projects need data as a raw material. The challenge is getting it to them without disrupting the mission critical enterprise resource planning (ERP) systems that store it.

## Moving 1990’s technology to the cloud

New products are developed using cloud native technologies. In an ideal world the ERP systems that supply their data would also be cloud based. Unfortunately, this is easier said than done. Most on-prem ERP systems are based on design patterns from the 1990’s or 2000’s. They were designed to run on dedicated hardware. They often include one or more Oracle databases running Real Application Clusters (RAC). While it’s technically feasible to run these systems on virtual machines in the cloud it’s hard to justify the level of effort required to do this.

A system that has been optimized for dedicated servers and a storage area network (SAN) will require modifications and extensive testing to certify its performance and behavior on virtual machines with cloud storage. The effort involved in this certification does not typically result in service improvements or cost savings. The system was not designed to take advantage of cloud elasticity. The VMs need to be sized for peak load and may be underutilized for much of the time.

## Oracle’s 2x license penalty

Cloud VMs running Oracle software may incur additional license fees. Oracle Enterprise Edition licenses are based on CPU cores. Oracle applies a “core factor” to each processor core to determine the required number of processor licenses. This core factor is multiplied by the number of cores to determine the number of licenses.

For most chipsets the core factor is less than one. For example, the core factor for an Intel CPU is 0.5 so a 4-core single socket machine requires 2 Oracle processor licenses. In January 2017 Oracle removed the core factor for “Authorized Cloud Environments” effectively doubling the license requirement for cloud based VMs.

## Google Cloud BMS

Google Cloud BMS is designed to address this need. It is a colocation offering from Google that allows customers to migrate their Oracle environments into the cloud “as-is” with support for RAC and older database versions. Customers lease dedicated hardware for fixed terms in data centers distinct from but geographically close to a Google Cloud data center. BMS provides commodity x86-64 server hardware to run specialized workloads with low-latency access to Google Cloud services. Google manages the server hardware, networking, facilities, and other core infrastructure.

Customers sign a 3 year commitment to lease the BMS hardware which Google purchases on their behalf. At the time of writing the hardware options varied from a 16 core machine with 192GB of RAM to 448 cores and 24TB RAM. Customers are responsible for the software, applications, and data that they use and store in the BMS environment.

## Analyze Existing Usage

The first step in a BMS migration is to document the existing database topology. Assemble a list of Oracle databases that you want to migrate and the systems that rely on them. Identify all of the associated databases for a system (e.g. staging and development in addition to the production instance and its standby).

Use a combination of top down and bottom up techniques to assemble the list. Top down techniques include reviewing application source code and configuration files (e.g. EBSapps.env, or tnsnames.ora). Bottom up techniques examine the servers you plan to decommission for open ports e.g. `nmap 127.0.0.1 -sS |grep 1521` and processes running e.g. `ps -ef |grep ora_pmon`

Document the dependencies between databases and applications as well as inter-database dependencies (e.g. via database links). Look for orphaned instances that are no longer required. Examples could include development or test databases that were left running at the end of a project.

Identify database versions and patch levels along with sizing and server details.
Work with an Oracle license audit specialist to review the feature and option usage in each database. Identify audit vulnerabilities and opportunities e.g. Enterprise Edition (EE) databases that could be converted to Standard Edition (SE).

Create a spreadsheet to document your findings with:
- Database name
- Connect string
- Current version
- License (EE, SE or SE2)
- Enterprise Edition options
- Patch level
- Usage
- SLA
- Single instance or RAC
- Standby location
- Database Size
- SGA Size
- Physical server details (CPU, Memory .. etc)
- Operating system & version
- Hypervisor
- Notes and links

## Identify the future state
Perform a capacity planning exercise to identify your server requirements for the next 3 years. Compare this to the list of available regions and machine configurations in the [Google's BMS planning guide](https://cloud.google.com/bare-metal/docs/bms-planning). Identify the optimal configuration for "lift and shift" migration where each on-premises application system is migrated as-is to BMS.

Review this provisional architecture and modify as necessary. For example, have your disaster recovery requirements changed? Are you planning to modify, re-write or retire any of the systems during the term of the BMS agreement? If so does it make sense to provision them on separate hardware to avoid disruption? Do you want to consolidate the smaller instances into a single container database to reduce administrative overhead?

## Migration planning

Develop a migration plan to cover the transformation of each environment to BMS.  Develop and document test plans for each migration along with rollback procedures in the event of a test failure.

Consider the amount of acceptable downtime and data volume for each database. Identify the high level approach (e.g. Data Pump, Transportable Tablespaces, Pluggable database, Dataguard, Golden Gate or SQL Loader) and expected duration of each migration. Use the table below to identify the time required for data transfer.

![Data transfer time](https://cloud.google.com/transfer-appliance/docs/2.2/640w_2x.png){: class="screenshot" }

Google Cloud Interconnect or a Transfer Appliance may be required for large data volumes.

Consider the potential impact the migration may have on Oracle license compliance. Do you need to stagger database migrations to avoid running too many concurrent  instances?

## Documenting databases with Visulate

Visulate is an Oracle database documentation tool from a Google Cloud development partner. It addresses an issue that almost every database customer has: inconsistent documentation.

While some database environments have extensive, well maintained documentation  others are not documented at all. Most environments fall somewhere in between. Documentation exists but may not reflect the current state. As a result developers and DBAs rely on the data dictionary as a system of record. They use SQL queries and client tools to determine the current database structure.

Visulate packages these queries in a cloud native application that "auto documents" Oracle databases. It includes custom queries for each Oracle object type. Users create connections from a central server to each database and then interact with them using APIs or a browser. The application reads the data dictionary in each registered database and shows its current state in a browser based UI with links that can be bookmarked or shared with others.

The tool provides a database instance report that identifies many of the required items  during the analysis of an on-premises database. These include the database version, patch level, system utilization, SGA size, total size, space used, database links and database feature usage.

## Identifing database usage

Visulate provides search and filter mechanisms that can help identify database usage. These include the ability to search metadata across databases and find every instance with a given table or pl/sql package. It detects E-Business Suite instances automatically and provides a product prefix filter similar to the one in Oracle’s eTRM documentation tool. This lets you identify all the database objects associated with a given product across multiple schemas.

Visulate’s database object reports identify dependencies to and from each object (e.g a view "uses" the tables it is based on and is "used by" a procedure that selects from it). There’s also an API to identify objects and their dependent objects (e.g. a find the schema definition for a stored procedure and every object it needs to install cleanly). These can be used to analyze schemas that you plan to refactor.

## Test development

Users can run ad-hoc queries via the UI or API calls. The UI exposes a query editor when the user selects a schema in a registered database. This feature can be used to develop BMS migration tests. Tests can be developed and refined using the UI and then included as cURL commands in a test suite.
