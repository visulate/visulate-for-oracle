import json
import logging
import os
import subprocess
from typing import Optional, Tuple
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

DEFAULT_MEMORY_REPO_FALLBACK = "visulate-memory"


def get_default_memory_repo_name() -> str:
    """Returns the configured folder name for the shared Visulate memory repository."""
    raw = (os.getenv("DEFAULT_MEMORY_REPO") or DEFAULT_MEMORY_REPO_FALLBACK).strip()
    if (
        not raw
        or raw in (".", "..")
        or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for c in raw)
    ):
        return DEFAULT_MEMORY_REPO_FALLBACK
    return raw


def get_memory_repo_path(username: str = None) -> str:
    """
    Resolves the directory path for the Visulate memory repository.
    Defaults to shared scope (<GIT_REPOS_DIR>/visulate-memory) so database memories
    are shared across users and repositories without storing sensitive credentials.
    """
    scope = (os.getenv("MEMORY_REPO_SCOPE") or "shared").lower()
    memory_repo_name = get_default_memory_repo_name()
    if scope == "user":
        base_dir = resolve_repos_base_dir(username)
    else:
        root = os.getenv("GIT_REPOS_DIR")
        if not root:
            home_git = os.path.expanduser("~/git")
            root = home_git if os.path.exists(home_git) else os.path.expanduser("~/visulate-repos")
        base_dir = root
    return os.path.join(base_dir, memory_repo_name)


def ensure_memory_repo(username: str = None) -> Tuple[str, str]:
    """
    Ensures the shared Visulate memory repository exists as a local Git repo
    (no upstream remote required). Bootstraps .gitignore, associations.json,
    and README.md with a single initial commit if HEAD does not exist yet.
    Subsequent AI writes remain uncommitted so the user retains commit control.
    """
    repo_name = get_default_memory_repo_name()
    repo_path = get_memory_repo_path(username)
    os.makedirs(repo_path, exist_ok=True)

    git_dir = os.path.join(repo_path, ".git")
    freshly_initialized = False
    if not os.path.exists(git_dir):
        try:
            res = subprocess.run(
                ["git", "-c", "safe.directory=*", "init", "-b", "main"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                check=False,
            )
            if res.returncode != 0:
                subprocess.run(
                    ["git", "-c", "safe.directory=*", "init"],
                    cwd=repo_path,
                    capture_output=True,
                    text=True,
                    check=False,
                )
            freshly_initialized = True
        except Exception as err:
            logger.warning(f"Could not initialize git in memory repo {repo_path}: {err}")

    gitignore_path = os.path.join(repo_path, ".gitignore")
    if not os.path.exists(gitignore_path):
        with open(gitignore_path, "w", encoding="utf-8") as f:
            f.write(
                "# Temporary Ora2Pg runtime configs and large archives\n"
                "**/ora2pg.conf\n"
                "**/*.tar.gz\n"
                "**/data/*.sql\n"
                "**/copy/*.sql\n"
                ".DS_Store\n"
            )

    assoc_path = os.path.join(repo_path, "associations.json")
    if not os.path.exists(assoc_path):
        with open(assoc_path, "w", encoding="utf-8") as f:
            json.dump({"version": 1, "links": []}, f, indent=2)
            f.write("\n")

    readme_path = os.path.join(repo_path, "README.md")
    if not os.path.exists(readme_path):
        with open(readme_path, "w", encoding="utf-8") as f:
            f.write(
                "# Visulate Architectural Knowledge Base\n\n"
                "This repository stores database architectural memories, dependency code maps, "
                "generated artifacts, and database-to-repository associations managed by Visulate.\n\n"
                "No upstream remote is required. You may configure an upstream remote at any time from the Application Workbench.\n"
            )

    if freshly_initialized:
        try:
            head_check = subprocess.run(
                ["git", "-c", "safe.directory=*", "rev-parse", "--verify", "HEAD"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                check=False,
            )
            if head_check.returncode != 0:
                subprocess.run(
                    ["git", "-c", "safe.directory=*", "add", ".gitignore", "README.md", "associations.json"],
                    cwd=repo_path,
                    capture_output=True,
                    text=True,
                    check=False,
                )
                subprocess.run(
                    [
                        "git",
                        "-c", "safe.directory=*",
                        "-c", "user.name=Visulate",
                        "-c", "user.email=visulate@localhost",
                        "commit",
                        "-m", "Initial Visulate memory repository",
                    ],
                    cwd=repo_path,
                    capture_output=True,
                    text=True,
                    check=False,
                )
        except Exception as err:
            logger.warning(f"Initial bootstrap commit skipped for {repo_path}: {err}")

    return repo_name, repo_path


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
    if safe_project == get_default_memory_repo_name():
        return get_memory_repo_path(username)
    base_dir = resolve_repos_base_dir(username)
    return os.path.join(base_dir, safe_project)


def resolve_repo_for_db(database: str = None, project_id: str = None, username: str = None) -> Tuple[Optional[str], Optional[str]]:
    """
    Resolves the repository for storing database-level knowledge and generated artifacts
    (memories, structures, ERDs, comments, remediation scripts, test data, reports).
    Always targets the central Visulate memory repository so findings are universally
    available across databases without dirtying application repositories.
    """
    return ensure_memory_repo(username)


