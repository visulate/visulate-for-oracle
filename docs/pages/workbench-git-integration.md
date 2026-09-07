* TOC
{:toc id="toc"}

# Application Workbench (Git Integration)

The **Application Workbench** connects Visulate's database metadata catalog with your application source code repositories. It provides an embedded [Monaco Editor](https://microsoft.github.io/monaco-editor/) environment, bi-directional database-to-code navigation, automated dependency indexing, Git version control workflows, and integrated AI-assisted modernizations.

---

## Overview & Architecture

Modern database-centric applications frequently suffer from a disconnect between the database data dictionary (tables, views, packages, procedures) and the application codebases that consume them. 

The Application Workbench bridges this gap:

```
                                  BROWSER (Angular UI)
                     +----------------------------------------------------+
                     | - Session Auth Dialog:                             |
                     |     * Personal Access Token (HTTPS PAT)            |
                     |     * Author Name & Email                          |
                     | - Stored in sessionStorage (cleared on close)      |
                     | - HTTP Interceptor attaches headers:               |
                     |     X-Git-User: <username>                         |
                     |     X-Git-Token: <token>                           |
                     |     X-Git-Author-Name: <name>                      |
                     |     X-Git-Author-Email: <email>                    |
                     +-------------------------+--------------------------+
                                               |
                                     HTTP REST |
                                               v
                                 VISULATE API SERVER (Node.js)
                     +----------------------------------------------------+
                     | Git Middleware & Service:                          |
                     |  - Resolves workspace directory:                   |
                     |      Local mode:  $GIT_REPOS_DIR                   |
                     |      Server mode: $GIT_REPOS_DIR/users/:user/      |
                     |  - Executes Git operations dynamically:            |
                     |      * HTTPS: token injected via http.extraHeader  |
                     |      * Commit: -c user.name="..." -c user.email    |
                     |      * Pull / Push: applies active session auth    |
                     |  - MCP Server & AI Integration:                    |
                     |      * Injects codebase dependencies in getContext |
                     |      * Exposes getCodebaseDependencies MCP tool    |
                     +-------------------------+--------------------------+
                                               |
                                               v
                     +----------------------------------------------------+
                     | Workspace Storage Volume                           |
                     |  Server: /app/repos/users/<user>/my-app/           |
                     |  Local:  $HOME/git/my-app/                         |
                     |  - .okf/oracle-code-map.json                       |
                     |  - .okf/codebase-dependencies.md                   |
                     +----------------------------------------------------+
```

### How Repository & Database Relationships Are Recorded

Visulate records the relationship between source code repositories and database schemas without mutable server-side registries:

1. **Schema Object-to-Code Mapping (`.okf/oracle-code-map.json`)**:
   Stored directly inside the root of each repository, this file records the associated database connection (`dbConnectionId`) along with bi-directional mappings between database catalog objects and specific code files:
   ```json
   {
     "projectId": "visulate",
     "dbConnectionId": "pdb21",
     "indexedAt": "2026-09-07T18:00:00.000Z",
     "objects": {
       "PR_PROPERTIES": {
         "owner": "RNTMGR2",
         "type": "TABLE",
         "files": [
           "code/database/plsql/rnt_properties_pkg.sql",
           "code/php/classes/database/pr_properties.class.php"
         ]
       }
     },
     "files": {
       "code/database/plsql/rnt_properties_pkg.sql": [
         "PR_PROPERTIES",
         "PR_PROPERTY_PHOTOS"
       ]
     }
   }
   ```
2. **Open Knowledge Format (OKF) Architectural Memory (`.okf/codebase-dependencies.md`)**:
   In addition to JSON data, the indexer generates a structured Markdown document summarizing mapped Oracle objects, referencing code files, and schema dependencies.
3. **Dynamic Live Git State**:
   Active branches, remotes, and diffs are queried live from the Git repositories on disk rather than cached in static files.
4. **Committed With Code**:
   Because `.okf/oracle-code-map.json` and `.okf/codebase-dependencies.md` live inside the repository, database relationships and entity indexes travel with the Git repository across branches and team checkouts.
5. **Browser Storage Association**:
   Users can link any Database and Git Repository directly from the top toolbar using the **Link** icon button or keyboard shortcut (`Alt+L`). Associations are maintained in browser `localStorage`. Once linked, selecting a database automatically selects its associated repository, and vice versa. Clicking the button again breaks the association.

---

## Enabling the Feature

Follow these step-by-step instructions to enable the Application Workbench:

### Step 1: Enable the API Server Feature Flag & Set Workspace Mode

In the backend API server (`api-server`), set the `ENABLE_GIT_INTEGRATION` environment variable to `true`.

#### Local Development (`start-local.sh` or `api-server/.env`):
In local mode, the API server runs directly as your local OS user and points to your real Git directory (`$HOME/git`) without any nested user subfolders:
```bash
export ENABLE_GIT_INTEGRATION=true
export GIT_MODE=local
export GIT_REPOS_DIR="${GIT_REPOS_DIR:-$HOME/git}"
```

#### Server / Container Deployment (`docker-compose.yaml`):
In server mode, each user's repository checkouts are partitioned under `/app/repos/users/<username>/`:
```yaml
services:
  visapi:
    environment:
      - ENABLE_GIT_INTEGRATION=true
      - GIT_MODE=server
      - GIT_REPOS_DIR=/app/repos
    volumes:
      - git_workspaces:/app/repos
```

---

### Step 2: Configure Git Authentication & Credentials

Visulate uses **Personal Access Tokens (HTTPS)** for session-based authentication:

1. Click the **Git Auth** button in the Workbench toolbar.
2. Enter your **Git Username** (e.g. your GitHub or GitLab username).
3. Enter your **Personal Access Token (PAT)** (e.g. GitHub `ghp_...` or GitLab `glpat-...`).
4. Enter your **Author Name** and **Author Email** for Git commits.
5. Click **Save Session Credentials**.

Credentials are saved exclusively in the browser's `sessionStorage` and are **never written to server-side configuration files or Git config**. When the user closes the browser tab, the session credentials are automatically destroyed.

---

### Step 3: Enable the Frontend Feature Flag & Build UI

The Angular UI uses the `enableGitIntegration` flag to activate the **Workbench** navigation tab, Monaco editor, and database-to-code mapping badges:

1. Open your target environment configuration:
   - **Development**: `ui/src/environments/environment.ts`
   - **Production**: `ui/src/environments/environment.prod.ts`
2. Set `enableGitIntegration: true`:
   ```typescript
   export const environment = {
     production: true, // or false in dev
     enableGitIntegration: true,
     // ...
   };
   ```
3. Build or restart the UI application:
   ```bash
   cd ui && npm run build
   ```

---

## Technical Workflows

### 1. Repository Discovery, Cloning & Pulling

When the Workbench is active, the top toolbar provides full repository control:

* **Existing Repositories**: The API scans the active workspace (`GET /api/git/repositories`) and lists all discovered Git repositories.
* **Clone Remote Repository**: Click **Clone New Repo** to provide:
  - **Git Remote URL**: HTTPS (`https://github.com/org/repo.git`).
  - **Folder Name**: Target folder name in the workspace.
  - **Branch**: Optional initial branch (defaults to remote default branch).
  - *Clones use `--depth 1` (shallow clone) by default to prevent filesystem exhaustion.*
* **Pull Latest Changes**: Click **Pull** (`POST /api/git/pull`) to fetch and fast-forward/rebase the latest commits from the remote branch using active session credentials.

### 2. Branch Viewing & Switching

* **Active Branch Display**: The toolbar detects the checked-out branch directly from `.git/HEAD` (e.g. `main`, `master`, `feature/x`) and displays all local and remote branches.
* **Switch Branch**: Select a branch from the dropdown to check it out immediately and reload the file explorer.
* **Create Branch**: Click **`+`** to create and switch to a new branch.

### 3. Dependency Indexing (`oracle-code-map.json` & `codebase-dependencies.md`)

The indexing engine analyzes the relationship between the active database connection and the repository source code:

1. In the Workbench, select a **Database Connection** (e.g., `pdb21`) and click **Index DB Map** in the toolbar.
2. The API calls `POST /api/git/index-dependencies`:
   - Queries the database catalog using `DBA_OBJECTS` (with fallback to `ALL_OBJECTS` in Oracle or `information_schema` in Postgres) for all valid user-defined tables, views, packages, procedures, functions, sequences, and types. System schemas (`SYS`, `SYSTEM`, etc.) and `PUBLIC` synonyms are excluded so that application schemas are discovered comprehensively.
   - Recursively scans the project files for references to these catalog objects across DDL statements, SQL query clauses (`FROM`, `JOIN`, `INTO`, `UPDATE`, `EXEC`, `CALL`, etc.), and application code.
   - Writes the cross-reference index to `.okf/oracle-code-map.json` and human-readable Markdown to `.okf/codebase-dependencies.md` in the root of the repository.

### 4. Bi-Directional Database-to-Code Navigation

Once `.okf/oracle-code-map.json` exists:

* **From the Database View**: Navigating to an object in the Visulate Catalog (e.g., `/database/pdb21/RNTMGR2/TABLE/PR_PROPERTIES`) displays an accordion panel: **Related Repository Code Files** with **"Mapped codebase files in {repo} ({count})"**.
* **One-Click Navigation**: Clicking **Open in Workbench** on any referenced file navigates directly to `/workbench?db=:db&projectId=:repo&file=:file`, auto-selecting the repository in the Workbench and opening the file in Monaco Editor.
* **From the Workbench File Tree**: Files referencing database objects display visual badges indicating the count and names of matched schema objects.

### 5. AI Agent & MCP Server Integration

Codebase dependencies are fully integrated into Visulate's AI agent architecture:

* **Context Injection**: When an agent requests object context via `getContext`, the API server resolves codebase dependencies using `dependencyIndexer.getObjectCodeDependencies()`. The resulting files and repository name are added to `codebaseDependencies` and `associatedRepo`.
* **Prompt Formatting (`ai-context.hbs`)**: The Handlebars context template formats referencing codebase files into a structured section for LLM consumption.
* **MCP Tool `getCodebaseDependencies`**: Exposed on the Model Context Protocol (MCP) server, allowing agents like `app_developer` and `object_analysis_agent` to query codebase dependencies on demand to assess application impact and maintain OKF architectural memory.

### 6. File Editing, Diffs, and Committing

Within the Monaco editor:

* **Edit and Save**: Edit files directly in the browser and save via `Ctrl+S` / `Cmd+S` or the toolbar **Save** button (`PUT /api/git/file`).
* **Diff View**: Compare the working copy against `HEAD` (`GET /api/git/diff`) using Monaco's side-by-side or inline diff viewer.
* **Commit & Push**: Click **Commit & Push** (`POST /api/git/commit-push`) to stage modified files, commit using your session author identity (`user.name` and `user.email`), and push to the remote branch using your session token.

---

## API Reference Summary

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/git/repositories` | `GET` | Lists local repository directories in active workspace. |
| `/api/git/clone` | `POST` | Clones a remote repository (with `--depth 1` and session auth). |
| `/api/git/pull` | `POST` | Pulls latest remote changes for the checked-out branch. |
| `/api/git/branches` | `GET` | Lists current branch and available branches. |
| `/api/git/checkout` | `POST` | Switches to an existing branch or creates a new branch. |
| `/api/git/files` | `GET` | Recursively lists files for a repository workspace. |
| `/api/git/file` | `GET` | Retrieves the content of a file (optional `revision`). |
| `/api/git/file` | `PUT` | Saves modified file content to disk. |
| `/api/git/diff` | `GET` | Generates a `git diff` against `HEAD` or unstaged changes. |
| `/api/git/commit-push` | `POST` | Stages, commits (with session author), and pushes to remote. |
| `/api/git/index-dependencies` | `POST` | Scans files and builds `.okf/oracle-code-map.json` and `.okf/codebase-dependencies.md`. |
| `/api/git/code-dependencies` | `GET` | Queries codebase files referencing a database object (`?db=:db&name=:name[&repo=:repo]`). |
