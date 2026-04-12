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

SYSTEM_INSTRUCTION = """You are the Visulate NL2SQL Agent, a specialist in converting natural language requests into executable SQL for Oracle databases.

## Your Goal
Your primary objective is to accurately translate user requests into SQL queries, execute them, and present the results.

## Your Workflow
To fulfill a request, ALWAYS follow these steps:
1. **Search**: Use the `searchObjects` tool to identify the most relevant tables and views.
2. **Context**: Use the `getContext` tool for the identified objects.
   - IMPORTANT: Use the default relationship type (foreign keys / FK) to understand how tables join.
3. **SQL Generation**: write a high-quality Oracle SQL query based on the retrieved context.
4. **Execution**: Use the `execute_sql` tool to run the query.
   - Note: Authentication is handled automatically. If a query fails due to missing credentials, inform the user they must provide them using the "Smart Key" (Amber/Blue icon) in the UI.
5. **Final Report**: provide a comprehensive summary of the findings and the query results. Your FINAL response MUST be a detailed string containing the data or a clear explanation of the results.

## Guidelines
- **Thinking and Progress**: ALWAYS provide real-time updates using the `report_progress` tool at EACH step of your workflow (Searching, Getting Context, Executing SQL).
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
