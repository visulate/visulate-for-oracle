import logging
import os
import requests
from typing import Dict

from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.a2a.utils.agent_to_a2a import to_a2a
from google.adk.tools.mcp_tool import MCPToolset, StreamableHTTPConnectionParams
from google.adk.tools.function_tool import FunctionTool

from google.api_core import exceptions
from google.cloud import secretmanager

# Import from common module
from common.config import get_mcp_urls
from common.credentials import CredentialManager
from common.utils import parse_token_from_response, create_token_request

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
   - Use search tools to identify relevant database tables and views
   - Get object context to understand the table's structure and relationships
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

        # Use helper to create token request
        result = create_token_request(query_engine_url, database_name, schema_name, password)
        token = parse_token_from_response(result)

        if token:
            return f"Credential token created successfully: {token}"
        else:
            return f"Error: Failed to create credential token. Response: {result}"

    return FunctionTool(_create_token)

logger.info("--- Loading MCP tools from Visulate servers... ---")

api_server_url, query_engine_url = get_mcp_urls()
logger.info(f"API Server: {api_server_url}")
logger.info(f"Query Engine: {query_engine_url}")

api_server_tools = MCPToolset(
    connection_params=StreamableHTTPConnectionParams(url=api_server_url)
)
query_engine_tools = MCPToolset(
    connection_params=StreamableHTTPConnectionParams(url=query_engine_url)
)
logger.info("--- Creating Visulate Oracle Database Agent... ---")

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

logger.info("Oracle Database Agent created successfully!")
logger.info("Agent capabilities:")
logger.info("   - Natural language database object search")
logger.info("   - Secure SQL execution with credential tokens")
logger.info("   - Database schema analysis and documentation")


if __name__ == "__main__":
    import uvicorn
    import uuid
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    from google.adk.runners import Runner
    from google.adk.sessions.in_memory_session_service import InMemorySessionService
    from google.genai import types

    # Initialize Runner
    session_service = InMemorySessionService()
    runner = Runner(
        app_name="visulate_agent",
        agent=root_agent,
        session_service=session_service
    )

    app = FastAPI()

    @app.post("/agent/generate")
    async def generate(request: Request):
        try:
            data = await request.json()
            message = data.get("message", "")
            context = data.get("context", {})

            # Construct prompt with context if available
            prompt_text = message
            logger.info(f"Received message: {message}")

            if context:
                 import json
                 context_str = json.dumps(context) if isinstance(context, dict) else str(context)
                 prompt_text = f"{message}\n\nContext:\n{context_str}"
                 logger.info(f"Full prompt length: {len(prompt_text)}")

            # Create Content object, explicitly setting role="user"
            content = types.Content(role="user", parts=[types.Part(text=prompt_text)])

            response_text = ""
            session_id = str(uuid.uuid4())

            # Create Session
            await session_service.create_session(
                app_name="visulate_agent",
                user_id="visulate_user",
                session_id=session_id
            )

            # Execute agent
            async for event in runner.run_async(user_id="visulate_user", session_id=session_id, new_message=content):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            response_text += part.text

            # Cleanup session (optional, but good for memory)
            # await session_service.delete_session(session_id)

            return JSONResponse(content=response_text)

        except Exception as e:
            logger.error(f"Error processing request: {e}", exc_info=True)
            return JSONResponse(content={"error": str(e)}, status_code=500)

    logger.info("Starting Visulate Agent on port 10000...")
    uvicorn.run(app, host="0.0.0.0", port=10000)