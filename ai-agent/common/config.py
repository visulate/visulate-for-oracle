import json
import logging
import os
from typing import Optional, Tuple
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


def get_mcp_urls():
    """
    Get MCP endpoint URLs based on environment configuration.
    Returns:
        tuple: (api_server_url, query_engine_url)
            - api_server_url: URL for the MCP API server endpoint.
            - query_engine_url: URL for the MCP SQL query engine endpoint.
    The returned URLs depend on the environment:
        - Local development without reverse proxy (e.g., "http://localhost"):
            api_server_url: "http://localhost:3000/mcp"
            query_engine_url: "http://localhost:5000/mcp-sql"
        - Local development with specific port (e.g., "http://localhost:3000"):
            api_server_url: "http://localhost:3000/mcp"
            query_engine_url: "http://localhost:5000/mcp-sql"
        - Production with reverse proxy (e.g., "https://visulate.example.com"):
            api_server_url: "https://visulate.example.com/mcp"
            query_engine_url: "https://visulate.example.com/mcp-sql"
    """
    visulate_base = os.getenv("VISULATE_BASE", "http://localhost")
    visulate_base = visulate_base.rstrip('/')

    parsed = urlparse(visulate_base)
    host = (parsed.hostname or "").lower()

    if host in ("localhost", "127.0.0.1", "::1"):
        if parsed.port:
            api_server_url = f"{visulate_base}/mcp"
            query_engine_url = f"{visulate_base.replace(f':{parsed.port}', ':5000')}/mcp-sql"
        else:
            api_server_url = f"{visulate_base}:3000/mcp"
            query_engine_url = f"{visulate_base}:5000/mcp-sql"
    else:
        # Production with reverse proxy - both endpoints on same base URL
        api_server_url = f"{visulate_base}/mcp"
        query_engine_url = f"{visulate_base}/mcp-sql"

    return api_server_url, query_engine_url


def get_ai_timeout() -> int:
    """
    Get the AI session timeout in seconds.
    Default: 240 seconds (to provide a safety buffer before GCP Load Balancer's 300s limit).
    """
    return int(os.getenv("VISULATE_AI_TIMEOUT", "240"))

def get_max_attachments() -> int:
    """
    Get the maximum number of file attachments allowed.
    Default: 10
    """
    return int(os.getenv("VISULATE_MAX_ATTACHMENTS", "10"))


def resolve_repos_base_dir(username: str = None) -> str:
    """
    Resolves the base directory for git repositories.
    - In server mode (GIT_MODE=server) and when username is provided,
      partitions workspaces under $GIT_REPOS_DIR/users/<username>/
    - In local mode (default), uses $GIT_REPOS_DIR directly.
    """
    root = os.getenv("GIT_REPOS_DIR")
    if not root:
        home_git = os.path.expanduser("~/git")
        root = home_git if os.path.exists(home_git) else os.path.expanduser("~/visulate-repos")

    mode = (os.getenv("GIT_MODE") or "local").lower()
    if mode == "server" and username:
        safe_user = "".join([c if c.isalnum() or c in "._-" else "_" for c in str(username)]).strip("_")
        if safe_user and safe_user not in (".", ".."):
            return os.path.join(root, "users", safe_user)
    return root


def resolve_repo_path(project_id: str, username: str = None) -> str:
    """
    Resolves directory for a target repository folder.
    Matches gitService.js:getProjectRepoDir partition logic.
    """
    if not project_id:
        return ""
    safe_project = "".join([c if c.isalnum() or c in "._-" else "_" for c in str(project_id)]).strip("_")
    if not safe_project or safe_project in (".", ".."):
        return ""
    base_dir = resolve_repos_base_dir(username)
    return os.path.join(base_dir, safe_project)


def resolve_repo_for_db(database: str = None, project_id: str = None, username: str = None) -> Tuple[Optional[str], Optional[str]]:
    """
    Finds the repository associated with a database or project_id.
    Returns (repo_name, repo_path) or (None, None).
    """
    # 1. If project_id is given and resolves to an existing directory
    if project_id:
        path = resolve_repo_path(project_id, username)
        if path and os.path.exists(path):
            safe_name = "".join([c if c.isalnum() or c in "._-" else "_" for c in str(project_id)]).strip("_")
            return safe_name, path

    # 2. If database is given, scan repositories for visulate/<database>
    if database:
        safe_db = "".join([c if c.isalnum() or c in "._-" else "_" for c in str(database)]).strip("_").lower()
        base_dir = resolve_repos_base_dir(username)
        if os.path.exists(base_dir):
            try:
                for entry in os.listdir(base_dir):
                    if entry.startswith(".") or entry == "users":
                        continue
                    repo_dir = os.path.join(base_dir, entry)
                    if os.path.isdir(repo_dir):
                        # Check visulate/<safe_db>
                        if os.path.exists(os.path.join(repo_dir, "visulate", safe_db)):
                            return entry, repo_dir
                        # Check visulate/oracle-code-map.json
                        code_map = os.path.join(repo_dir, "visulate", "oracle-code-map.json")
                        if os.path.exists(code_map):
                            try:
                                with open(code_map, "r", encoding="utf-8") as f:
                                    data = json.load(f)
                                    if (data.get("dbConnectionId") or "").lower().strip() == safe_db:
                                        return entry, repo_dir
                            except Exception:
                                pass
            except Exception as e:
                logger.warning(f"Error scanning repositories in {base_dir}: {e}")

    return None, None


