* TOC
{:toc id="toc"}

# Platform Architecture and Design

Visulate for Oracle is an enterprise-grade platform that combines traditional database metadata analysis with modern Agentic AI to transform how Oracle database environments are documented, analyzed, and modernized.

---
## Application Architecture

![Architecture diagram](/images/database-connections.png)

Visulate for Oracle creates 3 docker containers to deliver a browser UI and REST endpoints for one or more Oracle databases. The UI Container exposes an Angular UI which makes API calls to REST endpoints exposed by the API Server Container and the SQL Query Engine Container.

The API Server is an [Express JS](https://expressjs.com/) instance.  It connects to one or more registered databases using [node-oracledb](https://oracle.github.io/node-oracledb/doc/api.html#intro). Database connections are registered by adding an entry to a configuration file that the API Server reads during initialization. It creates a [connection pool](https://oracle.github.io/node-oracledb/doc/api.html#connpooling) for each entry in the config file.


## Technical Architecture

Visulate is delivered as a set of Docker containers orchestrated by Docker Compose on a Google Compute Engine (GCE) virtual machine.

![GCE Architecture](/images/gce.png)

### Core Components

1.  **API Server (Node.js/Express)**:
    - Parses Oracle Data Dictionary metadata.
    - Orchestrates interactions with Google Gemini LLMs.
    - Grounds AI prompts with real-time schema context.
    - Manages connection pools for multiple registered databases.
2.  **AI Agents (Python)**:
    - A suite of specialized agents for Natural Language to SQL (NL2SQL), Entity Relationship Diagram (ERD) generation, and Schema Analysis.
    - Uses a Root Agent to route user intent to the appropriate sub-agent.
3.  **UI (Angular)**:
    - Provides a unified dashboard for schema exploration, AI chat, and query results.
4.  **SQL Query Engine (Python/Flask)**:
    - Handles secure, ad-hoc SQL execution.
    - Generates seed data CSV and JSON files from user-supplied queries.
5.  **Reverse Proxy (Nginx)**:
    - Routes external traffic to the UI, API, and SQL services.

### Secure Data Flow

Visulate operates as a private proxy. Database credentials and schema metadata reside within your private VPC. Data is only sent to Google Gemini for transient processing (grounding) and is not stored in the cloud, ensuring your data dictionary remains under your exclusive control.

---

## Design Philosophy: Metadata Meets AI

Visulate was designed specifically to solve the challenges of legacy Oracle systems: lack of documentation, complex dependencies, and the high cost of modernization.

### Automated Schema Understanding
By querying the database's dependency model, Visulate identifies precisely how objects interact (e.g., which views depend on which tables). This grounding data allows the Gemini LLM to provide architectural insights that are accurate and contextually relevant.

### Streamlined Modernization
Visulate accelerates database projects by:
- **Reducing Errors**: Automated code documentation and ERD generation eliminate manual research.
- **Increasing Productivity**: Developers spend less time navigating foreign keys and more time building value.
- **Enabling AI Potential**: Seamlessly integrates on-premise Oracle data with Google Cloud's AI/ML ecosystem.

---

## Service Offerings

Beyond the product platform, Visulate provides professional services to assist with complex modernization journeys:

- **Database Analysis**: Expert support for analyzing Oracle database schemas and dependencies.
- **AI Integration Design**: Custom solutions that leverage Gemini to automate business workflows using Oracle data.
- **Modernization Strategy**: Comprehensive audits of Oracle footprints to identify cost-saving opportunities and architectural bottlenecks.

Visit our [Professional Services](https://console.cloud.google.com/marketplace/product/visulate-llc-public/technical-design) listing on Google Cloud Marketplace to learn more.
