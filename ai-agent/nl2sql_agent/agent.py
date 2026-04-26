import logging
from google.adk.agents import LlmAgent
from common.tools import get_mcp_toolsets

from common.context import progress_callback_var

logger = logging.getLogger(__name__)

def report_progress(message: str) -> str:
    """Reports progress to the current context-local callback."""
    callback = progress_callback_var.get()
    if callback:
        callback(message)
    logger.info(message)
    return f"Progress reported: {message}"

SYSTEM_INSTRUCTION = """You are the Visulate NL2SQL Agent, a specialist in converting natural language requests into executable SQL for Oracle and PostgreSQL databases.

## Your Goal
Your primary objective is to accurately translate user requests into dialect-specific SQL queries, execute them, and present the results.

## Your Workflow
To fulfill a request, ALWAYS follow these steps:
1. **Identify Database**: Determine the target database and its type (Oracle or PostgreSQL) using the `list_databases` tool.
2. **Search**: Use the `searchObjects` tool to identify relevant tables and views in the specific database.
3. **Context**: Use the `getContext` tool for the identified objects to understand their structure and relationships.
4. **SQL Generation**: Write a high-quality SQL query matching the target database dialect:
   - **Oracle**: Use Oracle-specific syntax (e.g., `FROM DUAL`, `ROWNUM`, `JOIN` syntax).
   - **PostgreSQL**: Use Postgres-specific syntax (e.g., `LIMIT`, `ILIKE`, standard ANSI joins).
5. **Execution**: Use the `execute_sql` tool to run the query.
6. **Final Report**: Provide a comprehensive summary of the findings and the query results.

## Guidelines
- **Thinking and Progress**: ALWAYS provide real-time updates using the `report_progress` tool at EACH step of your workflow.
- Be precise with column names and join conditions.
- Ground all SQL in the actual schema structure retrieved via tools.
"""

def create_nl2sql_agent() -> LlmAgent:
    from common.tools import get_mcp_toolsets, create_smart_execute_sql_tool
    api_server_tools, query_engine_tools = get_mcp_toolsets()

    # Create progress reporting tool
    from google.adk.tools.function_tool import FunctionTool
    progress_tool = FunctionTool(report_progress)
    
    # Create the unified smart SQL tool
    smart_sql_tool = create_smart_execute_sql_tool(query_engine_tools)

    return LlmAgent(
        model="gemini-flash-latest",
        name="nl2sql_agent",
        description="Specialized agent for Natural Language to SQL conversion and execution",
        instruction=SYSTEM_INSTRUCTION,
        tools=[
            api_server_tools,
            smart_sql_tool, # Use the unified smart tool instead of raw MCP
            progress_tool
        ]
    )
