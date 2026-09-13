import os
import logging
import json
import requests
from typing import List, Optional, Dict, Any
from google.adk.tools import BaseTool
from google.adk.tools.mcp_tool import McpToolset, StreamableHTTPConnectionParams
from google.adk.tools.function_tool import FunctionTool
from common.config import get_mcp_urls
from common.credentials import CredentialManager
from common.utils import parse_token_from_response, create_token_request, mask_sensitive_data, call_mcp_tool_rest, format_mcp_text_response
from common.context import session_id_var, auth_token_var, progress_callback_var, ui_context_var, browser_session_id_var

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
    """Creates a tool for saving architectural memories and summaries to the active repository."""
    async def save_memory_record(
        content: str,
        filename: str = "",
        category: str = "memories",
        description: str = "Architectural Memory Record"
    ) -> str:
        """
        Saves an architectural memory or summary markdown document to the active Git repository workspace.
        Stores the record under .visulate/<db>/<category>/<filename>.

        Args:
            content: The markdown formatted memory record or summary.
            filename: The target filename (e.g. 'schema_rntmgr2_summary.md' or 'rental_agreements.md').
            category: The subfolder category, typically 'memories' (for schema/domain summaries) or 'structures' (for table/object analyses).
            description: Brief description of the record.
        """
        try:
            ui_ctx = ui_context_var.get() if ui_context_var else {}
            if not isinstance(ui_ctx, dict):
                ui_ctx = {}

            project_id = ui_ctx.get("projectId")
            endpoint = ui_ctx.get("endpoint")

            if not project_id:
                return "No active Git repository linked in the current context. Memory record could not be written to repository."

            repos_dir = os.getenv("GIT_REPOS_DIR") or (
                os.path.expanduser("~/git") if os.path.exists(os.path.expanduser("~/git")) else os.path.expanduser("~/visulate-repos")
            )
            safe_project_id = "".join([c if c.isalnum() or c in "._-" else "_" for c in str(project_id)]).strip("_") or "default-project"
            repo_path = os.path.join(repos_dir, safe_project_id)
            if not os.path.exists(repo_path):
                return f"Repository '{safe_project_id}' not found in '{repos_dir}'. Memory record could not be saved."

            safe_db = "".join([c if c.isalnum() or c in "._-" else "_" for c in str(endpoint)]).strip("_").lower() if endpoint else "global"
            clean_category = "structures" if category == "structures" else "memories"

            if not filename:
                owner = ui_ctx.get("owner", "").lower()
                obj_name = ui_ctx.get("objectName", "").lower()
                if clean_category == "structures" and obj_name:
                    filename = f"{obj_name}.md"
                elif owner:
                    filename = f"schema_{owner}_summary.md"
                else:
                    filename = "architecture_summary.md"

            if not filename.endswith(".md"):
                filename += ".md"

            safe_filename = os.path.basename(filename)
            target_dir = os.path.join(repo_path, ".visulate", safe_db, clean_category)
            os.makedirs(target_dir, exist_ok=True)

            target_file = os.path.join(target_dir, safe_filename)
            rel_file_path = os.path.relpath(target_file, repo_path)

            with open(target_file, "w", encoding="utf-8") as f:
                f.write(content.strip() + "\n")

            callback = progress_callback_var.get()
            if callback:
                callback(f"▌SUCCESS: Architectural memory saved to {rel_file_path}")

            logger.info(f"Saved memory record to {target_file}")
            return f"Successfully saved {description} to `{rel_file_path}` in repository `{safe_project_id}`."
        except Exception as e:
            logger.error(f"Error saving memory record: {e}")
            return f"Error saving memory record: {str(e)}"

    return FunctionTool(save_memory_record)

def create_read_memory_tool() -> FunctionTool:
    """Creates a tool for reading specific architectural memory or structure documents from the active repository."""
    async def read_memory_record(
        name_or_path: str
    ) -> str:
        """
        Reads and returns the contents of a specific architectural memory, schema summary, or structure record
        from the active Git repository workspace (.visulate/ directory).

        Args:
            name_or_path: The name or relative path of the memory record (e.g. 'schema_rntmgr2_summary.md', 'rental_agreements.md', 'structures/leases.md', or 'architecture_decisions.md').
        """
        try:
            ui_ctx = ui_context_var.get() if ui_context_var else {}
            if not isinstance(ui_ctx, dict):
                ui_ctx = {}

            project_id = ui_ctx.get("projectId")
            endpoint = ui_ctx.get("endpoint")

            if not project_id:
                return "No active Git repository linked in the current context."

            repos_dir = os.getenv("GIT_REPOS_DIR") or (
                os.path.expanduser("~/git") if os.path.exists(os.path.expanduser("~/git")) else os.path.expanduser("~/visulate-repos")
            )
            safe_project_id = "".join([c if c.isalnum() or c in "._-" else "_" for c in str(project_id)]).strip("_") or "default-project"
            repo_path = os.path.join(repos_dir, safe_project_id)
            if not os.path.exists(repo_path):
                return f"Repository '{safe_project_id}' not found in '{repos_dir}'."

            clean_name = os.path.basename(name_or_path.strip())
            if not clean_name.endswith(".md") and not clean_name.endswith(".json"):
                clean_name += ".md"

            safe_db = "".join([c if c.isalnum() or c in "._-" else "_" for c in str(endpoint)]).strip("_").lower() if endpoint else None

            candidates = []
            for base_folder in (".visulate", ".okf"):
                base_dir = os.path.join(repo_path, base_folder)
                if not os.path.exists(base_dir):
                    continue
                if safe_db:
                    db_dir = os.path.join(base_dir, safe_db)
                    if os.path.exists(db_dir):
                        for root, _, files in os.walk(db_dir):
                            for f in files:
                                if f.lower() == clean_name.lower():
                                    candidates.append(os.path.join(root, f))
                for root, _, files in os.walk(base_dir):
                    for f in files:
                        if f.lower() == clean_name.lower():
                            cand_path = os.path.join(root, f)
                            if cand_path not in candidates:
                                candidates.append(cand_path)

            if not candidates:
                return f"Memory record '{name_or_path}' not found in repository '{safe_project_id}'."

            target_file = candidates[0]
            rel_path = os.path.relpath(target_file, repo_path)
            with open(target_file, "r", encoding="utf-8") as f:
                content = f.read()

            if len(content) > 50000:
                content = content[:50000] + "\n[Content truncated]"

            callback = progress_callback_var.get()
            if callback:
                callback(f"▌STATUS: Read architectural memory record: {rel_path}")

            return f"--- MEMORY RECORD: {rel_path} ---\n{content}\n--- END OF MEMORY RECORD: {rel_path} ---"
        except Exception as e:
            logger.error(f"Error reading memory record: {e}")
            return f"Error reading memory record: {str(e)}"

    return FunctionTool(read_memory_record)

