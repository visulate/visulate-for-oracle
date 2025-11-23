import logging
import os
import re
import requests
from typing import Dict

from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.a2a.utils.agent_to_a2a import to_a2a
from google.adk.tools.mcp_tool import MCPToolset, StreamableHTTPConnectionParams
from google.adk.tools.function_tool import FunctionTool

from google.api_core import exceptions
from google.cloud import secretmanager

logger = logging.getLogger(__name__)
logging.basicConfig(format="[%(levelname)s]: %(message)s", level=logging.INFO)

load_dotenv()

SYSTEM_INSTRUCTION = """You are the Visulate Oracle Database Agent, an expert AI assistant specialized in Oracle database operations and analysis.

## Your Capabilities

You have access to two powerful MCP (Model Context Protocol) toolsets:

### 1. Visulate API Server Tools
- **Search Database Objects**: Find tables, views, procedures, etc. using natural language
- **Get Object Context**: Retrieve detailed information about database objects and their relationships
- **Schema Analysis**: Understand database structure, relationships, and dependencies
- **AI-Powered Insights**: Use generative AI to analyze complex database structures

### 2. Visulate Query Engine Tools
- **Secure SQL Execution**: Execute SQL queries using credential token system
- **Credential Management**: Create, manage, and revoke temporary access tokens
- **Multi-Database Support**: Work with different Oracle database environments
- **Query Result Processing**: Format and analyze SQL query results

## Important Guidelines

1. **Database Context**: Before executing SQL queries:
   - Use search tools to understand the database structure
   - Get object context to understand relationships
   - Provide meaningful explanations of your findings

2. **User Experience**:
   - Ask clarifying questions when queries are ambiguous
   - Explain your approach before executing operations
   - Provide clear, actionable results and insights
   - Suggest follow-up queries when appropriate

3. **Error Handling**:
   - If SQL fails, analyze the error and suggest corrections
   - Verify object names and schemas exist before querying
   - Provide helpful debugging information

You excel at helping users understand Oracle databases, write effective SQL,
and perform complex data analysis while maintaining the highest security standards.
"""

class CredentialManager:
    """Manages retrieval of database credentials from GCP Secret Manager or .env."""

    def __init__(self):
        self.gcp_project = os.getenv("GCP_PROJECT_ID")
        self.secret_client = None
        if self.gcp_project:
            try:
                self.secret_client = secretmanager.SecretManagerServiceClient()
                logger.info("🔑 GCP Secret Manager client initialized.")
            except Exception as e:
                logger.warning(
                    f"⚠️ Failed to initialize GCP Secret Manager client: {e}"
                )
                self.gcp_project = None

    def get_password(self, db_name: str, schema_name: str) -> str | None:
        """
        Retrieves a password, trying GCP Secret Manager first, then .env.
        """
        db_name = db_name.lower()
        schema_name = schema_name.upper()

        if self.secret_client:
            secret_name = f"db-password-{db_name}-{schema_name}"
            secret_path = self.secret_client.secret_version_path(
                self.gcp_project, secret_name, "latest"
            )
            try:
                response = self.secret_client.access_secret_version(
                    request={"name": secret_path}
                )
                password = response.payload.data.decode("UTF-8")
                logger.info(f"✅ Fetched secret '{secret_name}' from GCP.")
                return password
            except exceptions.NotFound:
                logger.info(f"🔍 Secret '{secret_name}' not found in GCP, checking .env.")
            except Exception as e:
                logger.warning(f"⚠️ Error fetching secret '{secret_name}' from GCP: {e}")

        # Fallback to environment variables
        env_var_name = f"DB_PASSWORD_{db_name.upper()}_{schema_name.upper()}"
        password = os.getenv(env_var_name)
        if password:
            logger.info(f"✅ Fetched password from env var '{env_var_name}'.")
        else:
            logger.warning(f"❌ Password not found in GCP or for env var '{env_var_name}'.")
        return password

def create_connection_token_tool(query_engine_tools: MCPToolset) -> FunctionTool:
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

        # Make HTTP call to the MCP endpoint
        url = f"{query_engine_url}/call_tool"
        payload = {
            "name": "create_credential_token",
            "arguments": {
                "database": database_name,
                "username": schema_name,
                "password": password,
                "expiry_minutes": 30
            }
        }

        try:
            response = requests.post(url, json=payload, timeout=30)
            response.raise_for_status()
            result = response.json()

            # Handle different response formats
            token = None

            # Direct format: {"credential_token": "abc123..."}
            if "credential_token" in result:
                token = result["credential_token"]

            # MCP format: {"content": [{"text": "...token: abc123...", "type": "text"}]}
            elif "content" in result and isinstance(result["content"], list):
                for content_item in result["content"]:
                    if content_item.get("type") == "text":
                        text = content_item.get("text", "")
                        # Extract token from text like "Use this token for execute_sql calls: abc123..."
                        if "Use this token for execute_sql calls:" in text:
                            token = text.split("Use this token for execute_sql calls:")[-1].strip()
                            break
                        # Also handle format like "Token: abc123..."
                        elif "Token:" in text:
                            token = text.split("Token:")[-1].strip()
                            break

            if token:
                return f"Credential token created successfully: {token}"
            else:
                return f"Error: Failed to create credential token. Response: {result}"

        except Exception as e:
            return f"Error: Failed to create credential token: {str(e)}"

    return FunctionTool(_create_token)

def get_mcp_urls():
    """Get MCP endpoint URLs based on environment configuration"""
    visulate_base = os.getenv("VISULATE_BASE", "http://localhost")
    visulate_base = visulate_base.rstrip('/')

    # Handle both reverse proxy and direct access scenarios
    if "localhost" in visulate_base and ":" not in visulate_base:
        # Local development without reverse proxy
        api_server_url = f"{visulate_base}:3000/mcp"
        query_engine_url = f"{visulate_base}:5000/mcp-sql"
    elif "localhost" in visulate_base:
        # Local development with specific port
        api_server_url = f"{visulate_base}/mcp"
        query_engine_url = f"{visulate_base.replace(':3000', ':5000')}/mcp-sql"
    else:
        # Production with reverse proxy - both endpoints on same base URL
        api_server_url = f"{visulate_base}/mcp"
        query_engine_url = f"{visulate_base}/mcp-sql"

    return api_server_url, query_engine_url

logger.info("--- 🔧 Loading MCP tools from Visulate servers... ---")

api_server_url, query_engine_url = get_mcp_urls()
logger.info(f"📡 API Server: {api_server_url}")
logger.info(f"🔐 Query Engine: {query_engine_url}")

api_server_tools = MCPToolset(
    connection_params=StreamableHTTPConnectionParams(url=api_server_url)
)
query_engine_tools = MCPToolset(
    connection_params=StreamableHTTPConnectionParams(url=query_engine_url)
)
logger.info("--- 🤖 Creating Visulate Oracle Database Agent... ---")

root_agent = LlmAgent(
    model="gemini-2.5-flash",
    name="oracle_database_agent",
    description="An intelligent agent for Oracle database operations using Visulate MCP services",
    instruction=SYSTEM_INSTRUCTION,
    tools=[
        api_server_tools,
        query_engine_tools,
        create_connection_token_tool(query_engine_tools),
    ],
)

logger.info("✅ Oracle Database Agent created successfully!")
logger.info("🎯 Agent capabilities:")
logger.info("   - Natural language database object search")
logger.info("   - Secure SQL execution with credential tokens")
logger.info("   - Database schema analysis and documentation")