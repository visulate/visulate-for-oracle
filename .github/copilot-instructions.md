# Visulate for Oracle - Copilot Instructions

## Repository Overview

Visulate for Oracle is an Oracle data dictionary browsing service designed to help data engineers understand the structure and dependencies in Oracle databases for cloud migration. The application provides a REST API and web UI to browse metadata for registered Oracle database connections.

**Repository Type:** Multi-component web application  
**Primary Languages:** JavaScript/TypeScript, Python  
**Size:** Medium (multiple components with Docker/Kubernetes deployment)

## Architecture & Project Structure

The repository consists of 5 main components:

### 1. API Server (`api-server/`)
- **Technology:** Node.js/Express with node-oracledb
- **Entry Point:** `app.js`
- **Main Logic:** `services/` directory
- **Configuration:** `config/database.js` (database connections), `config/http-server.js` (server settings)
- **Dependencies:** Uses Oracle Instant Client, requires SELECT ANY DICTIONARY privilege on databases
- **Package Management:** npm

### 2. UI (`ui/`)
- **Technology:** Angular (v21.x)
- **Configuration:** `angular.json`, environment files in `src/environments/`
- **Build Output:** `dist/client`
- **Linting:** ESLint (`.eslintrc.js`)
- **Testing:** Karma/Jasmine for unit tests, Cypress for e2e

### 3. Query Engine (`query-engine/`)
- **Technology:** Python with Flask/Gunicorn
- **Setup:** Python virtual environment (`venv`)
- **Dependencies:** `requirements.txt`

### 4. AI Agent (`ai-agent/`)
- **Technology:** Python
- **Setup:** Python virtual environment (`.venv`)
- **Configuration:** `.env.example` shows required environment variables
- **Dependencies:** `pyproject.toml`

### 5. Proxy Config (`proxy-config/`)
- **Purpose:** Reverse proxy configuration for Docker deployment

## Building & Testing

### Prerequisites
- Node.js (API server and UI)
- Python 3 (Query Engine and AI Agent)
- Oracle Instant Client (for node-oracledb)
- Google AI Key (optional, for AI features)
- Docker (for containerized deployment)

### Development Environment Setup

**IMPORTANT:** Always run `npm install` in BOTH `api-server/` and `ui/` directories before development.

1. **Clone and Install Dependencies:**
   ```bash
   cd api-server && npm install
   cd ../ui && npm install
   ```

2. **Oracle Client Setup:**
   Follow https://oracle.github.io/node-oracledb/INSTALL.html#quickstart

3. **Database Configuration:**
   Edit `api-server/config/database.js` to register Oracle databases

4. **Optional CORS Configuration:**
   Edit `api-server/config/http-server.js` to whitelist client origins

### Running Locally

**Use the provided startup script for full stack:**
```bash
./start-local.sh
```

This script:
- Starts API Server on port 3000
- Starts Query Engine on port 5000
- Starts AI Agents on ports 10000-10007 (if GOOGLE_AI_KEY is set)
- Manages all processes and cleans up on exit

**Individual Components:**

API Server only:
```bash
cd api-server && npm start
```
Runs on http://localhost:3000

UI Development Server:
```bash
cd ui && ng serve
```
Runs on http://localhost:4200

### Testing

**API Server Tests:**
- Location: `api-server/test/`
- Requirements: 2 registered databases (11g non-PDB and 12c+ PDB) with WIKI schema
- Test schema DDL: `api-server/test/sample-schema/`
- Run: `cd api-server && npm test`
- Timeout: Tests use 20s timeout
- Environment Variables: `VISULATE_NON_PDB` and `VISULATE_PDB` (optional)

**UI Tests:**
- Unit tests: `cd ui && npm test` (Karma/Jasmine)
- E2E tests: `cd ui && npm run cypress:run` or `npm run cypress:open`

**Linting:**
- UI: `cd ui && npm run lint` or `npm run fix-lint`

### Building

**API Server:**
No build step required (Node.js runtime)

**UI Production Build:**
```bash
cd ui && ng build --configuration production
```
- Output: `dist/client/`
- Environment file is baked in at build time from `src/environments/environment.prod.ts`

### Docker Build

**Important:** Before building Docker images:
1. Update `ui/src/environments/environment.prod.ts` with correct API server URL
2. Update `api-server/config/http-server.js` with correct CORS whitelist

**Individual Images:**
```bash
docker build -t visulate-server:latest ./api-server
docker build -t visulate-client:latest ./ui
docker build -t visulate-sql:latest ./query-engine
docker build -t visulate-proxy:latest ./proxy-config
docker build -t visulate-ai-agent:latest ./ai-agent
```

**Docker Compose:**
```bash
docker-compose up
```

**Production Deployment:**
```bash
docker run -d -p 3000:3000 \
  -v /path/to/config:/visulate-server/config \
  -v /path/to/logs:/visulate-server/logs \
  visulate-server:latest
```

### Google Cloud Build

**Important:** Always update `google-marketplace/schema.yaml` release notes before building.

**Build Script (Interactive):**
```bash
./build-and-push.sh <version>
```
The script will prompt you to:
1. Select GCP project (visulate-for-oracle or visulate-llc-public)
2. Confirm schema.yaml updates
3. Choose build type:
   - Option 1: Full Build - Uses `cloudbuild.yaml` to build all 9 images in parallel
   - Option 2: Component Build - Uses `cloudbuild-component.yaml` for single component (faster)

Build timeout: 1800s (30 minutes)

## Key Configuration Files

- `api-server/config/database.js` - Database connection registration
- `api-server/config/http-server.js` - HTTP server and CORS settings
- `ui/src/environments/environment.ts` - Development environment config
- `ui/src/environments/environment.prod.ts` - Production environment config (baked into build)
- `docker-compose.yaml` - Multi-container orchestration
- `cloudbuild.yaml` - Full GCP Cloud Build pipeline
- `cloudbuild-component.yaml` - Single component build
- `api-server/openapi.yaml` - API specification
- `.dockerignore`, `.gitignore`, `.gcloudignore` - Build exclusions

## Common Pitfalls & Important Notes

1. **Always run `npm install` in both api-server and ui directories** before building or testing
2. **Environment variables are baked into UI at build time** - edit environment.prod.ts before building for production
3. **CORS whitelist must match UI origin** - update api-server/config/http-server.js
4. **Tests require specific database setup** - see api-server/test/README.md
5. **UV_THREADPOOL_SIZE is calculated from poolMax** - set in app.js based on registered databases
6. **AI features require GOOGLE_AI_KEY** - optional for basic functionality
7. **Docker volumes for config allow hot updates** - mount config directory to modify without rebuild
8. **Thread pool sizing:** API server automatically calculates UV_THREADPOOL_SIZE based on database pool configurations

## Validation Steps

Before submitting changes:

1. **API Server:** Run `cd api-server && npm test` (requires test database setup)
2. **UI:** Run `cd ui && npm run lint && npm test`
3. **Docker:** Test with `docker-compose up` if changing deployment configs
4. **Environment Files:** Verify URLs match your deployment architecture

## Dependencies

**Critical External Dependencies:**
- Oracle Instant Client (required for node-oracledb)
- Oracle databases with SELECT ANY DICTIONARY privilege
- Google AI API key (optional, for AI features)

**Python Virtual Environments:**
- Query Engine: `query-engine/venv/`
- AI Agent: `ai-agent/.venv/`
- Created automatically by start-local.sh if missing

## Additional Resources

- Setup directory: `api-server/database-setup/` - Scripts for creating database users
- Documentation: `docs/` directory
- Kubernetes deployment: See install guide at https://docs.visulate.net/pages/install-guide.html
