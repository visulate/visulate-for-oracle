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
