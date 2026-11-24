import os
import shutil
import logging
import json
import requests
from typing import List, Optional, Dict, Any
from google.adk.tools import BaseTool
from google.adk.tools.mcp_tool import McpToolset, StreamableHTTPConnectionParams
from google.adk.tools.function_tool import FunctionTool
from common.config import (
    get_mcp_urls,
    resolve_repo_path,
    resolve_repo_for_db,
    ensure_memory_repo,
    get_default_memory_repo_name,
    get_memory_repo_path,
)
from common.credentials import CredentialManager
from common.utils import parse_token_from_response, create_token_request, mask_sensitive_data, call_mcp_tool_rest, format_mcp_text_response
from common.context import session_id_var, auth_token_var, progress_callback_var, ui_context_var, browser_session_id_var
from common.readme_builder import update_visulate_readme

logger = logging.getLogger(__name__)

async def get_valid_token(database: str, schema: str) -> Optional[str]:
    """
    Internal helper to retrieve or create a valid credential token.
    Uses the shared security logic to fetch from UI context and perform a handshake
    with the Query Engine of the specified database.
    """
    cred_manager = CredentialManager()
    
    # 1. Fetch password using prioritized sources (UI Context -> Secret Manager -> Env)
    # We pass the schema as a fallback, but get_password will now be smarter.
    password, source, username = cred_manager.get_password(database, schema)
    if not password:
        logger.warning(f"Handshake failed: No password found for {database}.{schema} in any source.")
        return None
    
    # 2. Extract session info
    _, query_engine_url = get_mcp_urls()
    session_id = browser_session_id_var.get() or session_id_var.get() or "default"
    
    # 3. Create token via Query Engine
    # Use the username found by the credential manager for the token request
    result = create_token_request(query_engine_url, database, username, password, session_id)
    token = parse_token_from_response(result)
    
    if token:
        logger.info(f"Handshake successful: Created new token for {database} (user: {username}) using {source}.")
    else:
        logger.error(f"Handshake failed: Query Engine rejected credential token request for {database}.{username}.")
        
    return token

def create_connection_token_tool() -> FunctionTool:
    """Provides a tool for agents to manually create a connection token if needed."""
    async def create_connection_token(database: str, schema: str) -> str:
        """
        Creates a temporary secure connection token for a database and schema.
        This allows for secure SQL execution without exposing plaintext passwords.
        """
        token = await get_valid_token(database, schema)
        if token:
            return f"Credential token created successfully: {token}"
        else:
            return f"Error: Failed to create credential token for {database}.{schema}. Ensure your 'Smart Key' credentials are provided in the UI."
            
    return FunctionTool(create_connection_token)

def create_smart_execute_sql_tool(query_engine_tools: McpToolset) -> FunctionTool:
    """
    Creates a 'Smart' execute_sql tool that wraps the raw MCP execute_sql.
    It automatically handles the credential-to-token handshake, removing the 
    burden of token management from the AI agent.
    """
    async def execute_sql(database: str, sql: str) -> str:
        """
        Executes a SQL query on the specified database. 
        Automatically handles secure authentication using session credentials.
        """
        # Resolve owner/schema from context for the handshake
        ui_ctx = ui_context_var.get()
        schema = ui_ctx.get('owner', 'UNKNOWN')
        
        # 1. Perform automated handshake
        token = await get_valid_token(database, schema)
        if not token:
             return f"Error: Authentication failed for {database}.{schema}. Please provide schema credentials using the Smart Key icon in the UI."
        
        # 2. Delegate to the actual MCP tool on the Query Engine via REST
        _, query_engine_url = get_mcp_urls()
        session_id = browser_session_id_var.get() or session_id_var.get() or "default"
        
        result = await call_mcp_tool_rest(query_engine_url, "execute_sql", {
            "database": database,
            "sql": sql,
            "credential_token": token,
            "session_id": session_id
        })
        
        return format_mcp_text_response(result)

    return FunctionTool(execute_sql)

def get_mcp_toolsets():
    """Returns api_server_tools and query_engine_tools."""
    api_server_url, query_engine_url = get_mcp_urls()

    api_server_tools = McpToolset(
        connection_params=StreamableHTTPConnectionParams(url=api_server_url)
    )
    query_engine_tools = McpToolset(
        connection_params=StreamableHTTPConnectionParams(url=query_engine_url)
    )
    return api_server_tools, query_engine_tools

def create_save_memory_tool() -> FunctionTool:
    """Creates a tool for saving architectural memories, object structures, and SQL query patterns to the shared Visulate memory repository."""
    async def save_memory_record(
        content: str,
        filename: str = "",
        category: str = "memories",
        description: str = "Architectural Memory Record",
        database: str = ""
    ) -> str:
        """
        Saves an architectural memory, object structure, or reusable SQL query pattern markdown document
        to the central Visulate memory repository under <db>/<category>/<filename>
        (never modifying user application repositories).
        Do NOT store passwords, tokens, sensitive credentials, or raw sensitive data rows in memory records.

        Args:
            content: The markdown formatted memory record, summary, or SQL query pattern and approach.
            filename: The target filename (e.g. 'schema_rntmgr2_summary.md', 'rental_agreements.md', or 'top_customers_query.md').
            category: The subfolder category: 'memories' (schema/domain summaries), 'structures' (table/object analyses), or 'queries' (NL2SQL queries, joins, and SQL approach notes).
            description: Brief description of the record.
            database: Optional target database endpoint name (defaults to the active UI context endpoint).
        """
        try:
            ui_ctx = ui_context_var.get() if ui_context_var else {}
            if not isinstance(ui_ctx, dict):
                ui_ctx = {}

            endpoint = (database or "").strip() or ui_ctx.get("endpoint")
            username = ui_ctx.get("username")

            memory_repo_name, repo_path = ensure_memory_repo(username)

            safe_db = "".join([c if c.isalnum() or c in "._-" else "_" for c in str(endpoint)]).strip("_").lower() if endpoint else "global"
            cat_lower = (category or "memories").strip().lower()
            if cat_lower in ("structures", "queries", "memories"):
                clean_category = cat_lower
            else:
                clean_category = "memories"

            if not filename:
                owner = ui_ctx.get("owner", "").lower()
                obj_name = ui_ctx.get("objectName", "").lower()
                if clean_category == "structures" and obj_name:
                    filename = f"{obj_name}.md"
                elif clean_category == "queries":
                    filename = f"query_{owner}.md" if owner else "sql_query_pattern.md"
                elif owner:
                    filename = f"schema_{owner}_summary.md"
                else:
                    filename = "architecture_summary.md"

            if not filename.endswith(".md"):
                filename += ".md"

            safe_filename = os.path.basename(filename)
            if not safe_db or safe_db in (".", ".."):
                return "Invalid database identifier."
            if not safe_filename or safe_filename in (".", ".."):
                return "Invalid filename."

            target_dir = os.path.join(repo_path, safe_db, clean_category)
            os.makedirs(target_dir, exist_ok=True)

            target_file = os.path.join(target_dir, safe_filename)
            real_repo = os.path.realpath(repo_path)
            real_target = os.path.realpath(target_file)
            if not real_target.startswith(real_repo + os.sep):
                return "Invalid memory record path."
            rel_file_path = os.path.relpath(real_target, real_repo)

            with open(target_file, "w", encoding="utf-8") as f:
                f.write(content.strip() + "\n")

            # Automatically maintain README.md in visulate-memory
            try:
                update_visulate_readme(repo_path)
            except Exception as readme_err:
                logger.warning(f"Error updating memory README.md after saving memory: {readme_err}")

            callback = progress_callback_var.get()
            if callback:
                callback(f"▌SUCCESS: Architectural memory saved to {memory_repo_name}/{rel_file_path}")

            logger.info(f"Saved memory record to {target_file}")
            return f"Successfully saved {description} to `{rel_file_path}` in repository `{memory_repo_name}`."
        except Exception as e:
            logger.error(f"Error saving memory record: {e}")
            return f"Error saving memory record: {str(e)}"

    return FunctionTool(save_memory_record)

def create_maintain_visulate_readme_tool() -> FunctionTool:
    """Creates a tool for maintaining and updating README.md in the central Visulate memory repository."""
    async def maintain_visulate_readme(notes: str = "") -> str:
        """
        Creates, updates, and refreshes README.md in the central Visulate memory repository.
        The README documents all database environments, codebase dependency maps, architectural memories,
        object structures, and generated artifacts (ERDs, comments, remediation scripts, test data, and reports).

        Args:
            notes: Optional additional architectural notes or domain overview to include in the README.
        """
        try:
            ui_ctx = ui_context_var.get() if ui_context_var else {}
            if not isinstance(ui_ctx, dict):
                ui_ctx = {}

            username = ui_ctx.get("username")
            memory_repo_name, repo_path = ensure_memory_repo(username)

            readme_rel_path = update_visulate_readme(repo_path, notes=notes)

            callback = progress_callback_var.get()
            if callback:
                callback(f"▌SUCCESS: Maintained {readme_rel_path} in repository '{memory_repo_name}'")

            logger.info(f"Updated {readme_rel_path} in {repo_path}")
            return f"Successfully generated and updated `{readme_rel_path}` in repository `{memory_repo_name}`."
        except Exception as e:
            logger.error(f"Error maintaining memory README.md: {e}", exc_info=True)
            return f"Error maintaining memory README.md: {str(e)}"

    return FunctionTool(maintain_visulate_readme)

def create_read_memory_tool() -> FunctionTool:
    """Creates a tool for reading specific architectural memory, code-map, or structure documents."""
    async def read_memory_record(
        name_or_path: str
    ) -> str:
        """
        Reads and returns the contents of a specific architectural memory, schema summary, code map,
        or structure record from the central Visulate memory repository (with legacy fallback).

        Args:
            name_or_path: The name or relative path of the memory record (e.g. 'schema_rntmgr2_summary.md', 'rental_agreements.md', 'code-maps/rental-portal/codebase-dependencies.md').
        """
        try:
            ui_ctx = ui_context_var.get() if ui_context_var else {}
            if not isinstance(ui_ctx, dict):
                ui_ctx = {}

            project_id = ui_ctx.get("projectId")
            endpoint = ui_ctx.get("endpoint")
            username = ui_ctx.get("username")

            memory_repo_name = get_default_memory_repo_name()
            memory_path = get_memory_repo_path(username)

            clean_name = os.path.basename(name_or_path.strip())
            if not clean_name.endswith(".md") and not clean_name.endswith(".json") and not clean_name.endswith(".sql"):
                clean_name += ".md"

            safe_db = "".join([c if c.isalnum() or c in "._-" else "_" for c in str(endpoint)]).strip("_").lower() if endpoint else None
            if safe_db in (".", ".."):
                safe_db = None

            search_roots = []
            if memory_path and os.path.exists(memory_path):
                search_roots.append((memory_repo_name, memory_path, memory_path))

            # Legacy fallback: inspect active code repo's visulate/ folder if present
            if project_id and project_id != memory_repo_name:
                legacy_repo = resolve_repo_path(project_id, username)
                legacy_vis = os.path.join(legacy_repo, "visulate") if legacy_repo else ""
                if legacy_vis and os.path.exists(legacy_vis):
                    search_roots.append((project_id, legacy_repo, legacy_vis))

            candidates = []
            rel_candidate = name_or_path.strip().lstrip("/")
            for r_name, r_root, base_dir in search_roots:
                # Direct relative path match first
                direct = os.path.abspath(os.path.join(base_dir, rel_candidate))
                real_base = os.path.abspath(base_dir)
                if direct.startswith(real_base + os.sep) and os.path.isfile(direct):
                    candidates.append((r_name, r_root, direct))

                if safe_db:
                    db_dir = os.path.join(base_dir, safe_db)
                    if os.path.exists(db_dir):
                        for root, dirs, files in os.walk(db_dir):
                            dirs[:] = [d for d in dirs if d != ".git"]
                            for f in files:
                                if f.lower() == clean_name.lower():
                                    full = os.path.join(root, f)
                                    if not any(c[2] == full for c in candidates):
                                        candidates.append((r_name, r_root, full))

                for root, dirs, files in os.walk(base_dir):
                    dirs[:] = [d for d in dirs if d != ".git"]
                    for f in files:
                        if f.lower() == clean_name.lower():
                            full = os.path.join(root, f)
                            if not any(c[2] == full for c in candidates):
                                candidates.append((r_name, r_root, full))

            if not candidates:
                return f"Memory record '{name_or_path}' not found in `{memory_repo_name}`."

            r_name, r_root, target_file = candidates[0]
            allowed_root = r_root if r_name == memory_repo_name else os.path.join(r_root, "visulate")
            real_root = os.path.realpath(allowed_root)
            real_target = os.path.realpath(target_file)
            if (
                not real_target.startswith(real_root + os.sep)
                or ".git" in os.path.relpath(real_target, real_root).split(os.sep)
                or not real_target.lower().endswith((".md", ".json", ".sql"))
            ):
                return "Invalid memory record path."

            rel_path = os.path.relpath(real_target, os.path.realpath(r_root))
            with open(real_target, "r", encoding="utf-8") as f:
                content = f.read()

            if len(content) > 50000:
                content = content[:50000] + "\n[Content truncated]"

            callback = progress_callback_var.get()
            if callback:
                callback(f"▌STATUS: Read architectural memory record: {r_name}/{rel_path}")

            return f"--- MEMORY RECORD: {r_name}/{rel_path} ---\n{content}\n--- END OF MEMORY RECORD: {r_name}/{rel_path} ---"
        except Exception as e:
            logger.error(f"Error reading memory record: {e}")
            return f"Error reading memory record: {str(e)}"

    return FunctionTool(read_memory_record)


def create_copy_artifact_to_repo_tool() -> FunctionTool:
    """Creates a tool to copy a file or directory from visulate-memory into a user-specified code repository."""
    async def copy_artifact_to_repo(
        source_path: str,
        target_repo: str,
        target_path: str,
        overwrite: bool = False
    ) -> str:
        """
        Explicitly copies a generated artifact (such as comment scripts, test data, ERDs,
        remediation scripts, or Ora2Pg SQL) from the central visulate-memory repository
        into a target application or DBA code repository working tree (uncommitted).

        Args:
            source_path: Relative path inside visulate-memory (e.g. 'pdb21/comments/comments_pdb21_rntmgr2.sql').
            target_repo: Destination repository folder name (e.g. 'rental-portal').
            target_path: Destination relative path inside target_repo (e.g. 'db/scripts/comments.sql').
            overwrite: Whether to overwrite existing files in target_repo (default False).
        """
        try:
            ui_ctx = ui_context_var.get() if ui_context_var else {}
            username = ui_ctx.get("username") if isinstance(ui_ctx, dict) else None

            memory_repo_name, memory_dir = ensure_memory_repo(username)
            target_repo_dir = resolve_repo_path(target_repo, username)
            if not target_repo_dir or not os.path.exists(target_repo_dir):
                return f"Target repository '{target_repo}' was not found."

            norm_src = source_path.strip().lstrip("/")
            norm_dst = target_path.strip().lstrip("/")
            if not norm_src or ".git" in norm_src.split("/") or not norm_dst or ".git" in norm_dst.split("/"):
                return "Invalid source_path or target_path."

            real_mem = os.path.realpath(memory_dir)
            real_dst_root = os.path.realpath(target_repo_dir)

            def _has_symlink_component(root_dir: str, candidate_path: str) -> bool:
                rel_parts = os.path.relpath(candidate_path, root_dir).split(os.sep)
                cur = root_dir
                for part in rel_parts:
                    cur = os.path.join(cur, part)
                    if os.path.islink(cur):
                        return True
                return False

            def _validate_destination(candidate_dst: str) -> Optional[str]:
                abs_dst = os.path.abspath(candidate_dst)
                if not abs_dst.startswith(real_dst_root + os.sep):
                    return f"Target path '{target_path}' escapes repository boundary."
                rel_parts = os.path.relpath(abs_dst, real_dst_root).split(os.sep)
                if ".git" in rel_parts:
                    return "Invalid target path: repository metadata cannot be modified."
                if _has_symlink_component(real_dst_root, abs_dst):
                    return f"Target path '{os.path.relpath(abs_dst, real_dst_root)}' cannot traverse or write to a symbolic link."
                # Verify canonical path of the deepest existing ancestor stays inside target_repo
                check_dir = abs_dst
                while not os.path.exists(check_dir) and check_dir != os.path.dirname(check_dir):
                    check_dir = os.path.dirname(check_dir)
                if os.path.exists(check_dir):
                    real_ancestor = os.path.realpath(check_dir)
                    if real_ancestor != real_dst_root and not real_ancestor.startswith(real_dst_root + os.sep):
                        return f"Target path '{target_path}' escapes repository boundary."
                return None

            unresolved_src = os.path.abspath(os.path.join(real_mem, norm_src))
            if not unresolved_src.startswith(real_mem + os.sep) or not os.path.lexists(unresolved_src):
                return f"Source path '{source_path}' not found in `{memory_repo_name}`."
            if _has_symlink_component(real_mem, unresolved_src):
                return f"Source path '{source_path}' cannot be a symbolic link."

            src_full = os.path.realpath(unresolved_src)
            if (
                not src_full.startswith(real_mem + os.sep)
                or ".git" in os.path.relpath(src_full, real_mem).split(os.sep)
                or not os.path.exists(src_full)
            ):
                return f"Source path '{source_path}' not found in `{memory_repo_name}`."

            dst_full = os.path.abspath(os.path.join(real_dst_root, norm_dst))
            dst_err = _validate_destination(dst_full)
            if dst_err:
                return dst_err

            copied = []
            if os.path.isdir(src_full):
                for root, dirs, files in os.walk(src_full):
                    dirs[:] = [
                        d for d in dirs
                        if d != ".git" and not os.path.islink(os.path.join(root, d))
                    ]
                    for fn in files:
                        s_file = os.path.join(root, fn)
                        if os.path.islink(s_file):
                            continue
                        rel = os.path.relpath(s_file, src_full)
                        d_file = os.path.abspath(os.path.join(dst_full, rel))
                        d_err = _validate_destination(d_file)
                        if d_err:
                            return d_err
                        if os.path.lexists(d_file) and not overwrite:
                            return f"Target file already exists: `{os.path.relpath(d_file, real_dst_root)}` (pass overwrite=True to replace)."
                        os.makedirs(os.path.dirname(d_file), exist_ok=True)
                        shutil.copy2(s_file, d_file)
                        copied.append(os.path.relpath(d_file, real_dst_root))
            else:
                if os.path.lexists(dst_full) and not overwrite:
                    return f"Target file already exists: `{norm_dst}` (pass overwrite=True to replace)."
                os.makedirs(os.path.dirname(dst_full), exist_ok=True)
                shutil.copy2(src_full, dst_full)
                copied.append(os.path.relpath(dst_full, real_dst_root))

            callback = progress_callback_var.get()
            if callback:
                callback(f"▌SUCCESS: Copied {len(copied)} file(s) to {target_repo}")
            files_list = "\n".join([f"- `{f}`" for f in copied])
            return f"Copied {len(copied)} file(s) from `{memory_repo_name}/{norm_src}` into `{target_repo}` (uncommitted):\n{files_list}"
        except Exception as e:
            logger.error(f"Error copying artifact to repo: {e}")
            return f"Error copying artifact to repo: {str(e)}"

    return FunctionTool(copy_artifact_to_repo)

