# Visulate for Oracle

Visulate for Oracle is a comprehensive Oracle data dictionary browsing service and AI-powered analysis framework. It helps data engineers, developers, and architects understand complex database structures, dependencies, and business logic through an intuitive UI and intelligent AI agents.

![Visulate for Oracle AI Assistant](docs/images/object-ai.png?raw=true)

## Key Features

- **Data Dictionary Browser**: Explore tables, views, packages, and other database objects.
- **Dependency Analysis**: Visualize relationships between objects, including line-level references in stored procedures.
- **AI-Powered Insights**: Generate documentation, analyze schema differences, and generate test data using integrated AI agents.
- **MCP (Model Context Protocol) Support**: Exposes database metadata and SQL execution capabilities to AI agents via secure MCP endpoints.
- **DDL Generation**: Generate DDL for individual objects or entire schemas.

![Visulate for Oracle database object selection](docs/images/object-selection.png?raw=true)

Detailed documentation is available at [docs.visulate.net](https://docs.visulate.net) and in the [Visulate Code Wiki](https://codewiki.google/github.com/visulate/visulate-for-oracle).

## Architecture

Visulate for Oracle is built as a microservices architecture consisting of the following components:

- **API Server (Node.js/Express)**: Provides REST and MCP endpoints for data dictionary metadata. Uses `node-oracledb` to connect to Oracle.
- **Query Engine (Python/Flask)**: Provides secure SQL execution via MCP-SQL endpoints.
- **AI Agents (Python/Google ADK)**: A suite of intelligent agents for specialized tasks like documentation generation and schema analysis.
- **UI (Angular)**: A web-based interface for browsing and interacting with the system.
- **Reverse Proxy (Nginx)**: Routes requests to the appropriate backend services.

![Visulate for Oracle object details](docs/images/object-details.png?raw=true)


## Setup and Deployment

### Development Environment (Local)

The easiest way to start the entire stack for development is to use the `start-local.sh` script.

1. **Clone the repository**:
   ```bash
   git clone https://github.com/visulate/visulate-for-oracle.git
   cd visulate-for-oracle
   ```

2. **Install dependencies**:
   Run `npm install` in `api-server` and `ui` directories.
   Follow the [node-oracledb installation guide](https://oracle.github.io/node-oracledb/INSTALL.html#quickstart) to set up Oracle connectivity.

3. **Configure the system**:
   - Create a `.env` file in the root directory (see `.env.example` if available, or use `start-local.sh` prompts).
   - Register your databases in `api-server/config/database.js`.
   - Ensure you have a `GOOGLE_AI_KEY` if you want to use AI features.

4. **Start the services**:
   ```bash
   ./start-local.sh
   ```
   This script will start the API Server, Query Engine, and AI Agents in the background.

5. **Start the UI**:
   ```bash
   cd ui
   npm start
   ```
   Navigate to `http://localhost:4200` to access the UI.

### Docker Compose Deployment

For a production-like environment using Docker, you can use the provided `docker-compose.yaml` file.

1. **Set environment variables**:
   Ensure `GOOGLE_AI_KEY` and `CORS_ORIGIN_WHITELIST` are set in your environment or a `.env` file.

2. **Build and start**:
   ```bash
   docker-compose up --build
   ```
   This will build and start all components, including the reverse proxy.

## Testing

The project includes test suites for each major component:

- **API Server**: Run `npm test` in the `api-server` directory.
- **UI**: Run `npm test` or `npm run e2e` in the `ui` directory.
- **Query Engine**: Run `pytest` in the `query-engine` directory.
- **AI Agents**: See `ai-agent/README.md` for agent-specific testing instructions.

For a comprehensive test run, you can use the `run-all-tests.sh` script in the root directory.

> [!IMPORTANT]
> **Database Dependencies**: Some tests in the API Server and Query Engine suites require active Oracle database connections and a specific sample schema (`RNTMGR2`). These tests may fail if the databases defined in `api-server/config/database.js` or `query-engine/tests/conftest.json` are unreachable.
>
> **Workaround**:
> - **Configure Connections**: Update the configuration files mentioned above with your own database details.
> - **Skip SQL Tests**: In the API Server, tests that require a database are often grouped under `describe.skip`. You can skip individual tests or entire suites by modifying the test files.
> - **Environment Variables**: Use `VISULATE_NON_PDB` and `VISULATE_PDB` to point the API Server tests to your available instances.



## Manual Docker Deployment

If you prefer to build and run individual components manually:

1. **Build images**:
   ```bash
   docker build -t visulate-server ./api-server
   docker build -t visulate-ui ./ui
   docker build -t visulate-sql ./query-engine
   docker build -t visulate-agent ./ai-agent
   ```

2. **Run containers**:
   Refer to the individual `README.md` files in each directory for specific `docker run` commands and environment variable requirements.

## Kubernetes Deployment

For enterprise deployments on Kubernetes, please contact us via our [Professional Services](https://console.cloud.google.com/marketplace/product/visulate-llc-public/technical-design) offering on Google Cloud Marketplace.

## Documentation

- **User Guide**: [docs.visulate.net](https://docs.visulate.net)
- **AI Agent Guide**: [ai-agent-guide.md](docs/pages/ai-agent-guide.md)
- **Architecture**: [architecture.md](docs/pages/architecture.md)
- **Security**: [MCP Security](query-engine/sql2csv/MCP_SECURITY.md)

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
