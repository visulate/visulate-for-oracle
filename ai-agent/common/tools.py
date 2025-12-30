import logging
from typing import List
from google.adk.tools import BaseTool
from google.adk.tools.mcp_tool import McpToolset, StreamableHTTPConnectionParams
from google.adk.tools.function_tool import FunctionTool
from common.config import get_mcp_urls
from common.credentials import CredentialManager
from common.utils import parse_token_from_response, create_token_request, mask_sensitive_data

logger = logging.getLogger(__name__)

def create_connection_token_tool(query_engine_tools: McpToolset) -> FunctionTool:
    """Factory to create the connection token tool."""
    cred_manager = CredentialManager()

    def _create_token(database_name: str, schema_name: str) -> str:
        """
        Creates a temporary connection token for a given database and schema.
        This tool securely fetches the required password from a secret manager or
        environment variables and then calls the query engine to generate a token.
        """
        password = cred_manager.get_password(database_name, schema_name)
        if not password:
            return f"Error: Credentials for database '{database_name}' and schema '{schema_name}' are not configured."

        # Get the query engine URL from the environment
        _, query_engine_url = get_mcp_urls()

        # Use helper to create token request
        result = create_token_request(query_engine_url, database_name, schema_name, password)
        token = parse_token_from_response(result)

        if token:
            return f"Credential token created successfully: {token}"
        else:
            return f"Error: Failed to create credential token. Response: {mask_sensitive_data(result)}"

    return FunctionTool(_create_token)

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
