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
1. **Check Existing Memory First**: Review any previously saved query patterns, table structures, or schema memories provided in your prompt context under "Visulate Architectural Memory & Dependency Map" so you reuse proven join paths and dialect conventions.
2. **Identify Database**: Determine the target database and its type (Oracle or PostgreSQL) using the `list_databases` tool (or from the Current UI Context).
3. **Search**: Use the `searchObjects` tool to identify relevant tables and views in the specific database.
4. **Context**: Use the `getContext` tool for the identified objects to understand their structure and relationships.
5. **SQL Generation**: Write a high-quality SQL query matching the target database dialect:
   - **Oracle**: Use Oracle-specific syntax (e.g., `FROM DUAL`, `ROWNUM`, `JOIN` syntax).
   - **PostgreSQL**: Use Postgres-specific syntax (e.g., `LIMIT`, `ILIKE`, standard ANSI joins, proper schema/identifier casing).
6. **Execution**: Use the `execute_sql` tool to run the query.
7. **Save Query Memory (`save_memory_record`)**: After generating or executing a SQL query, ALWAYS persist the reusable SQL query pattern and approach to `visulate-memory` using `save_memory_record`:
   - Set `category="queries"`, `database=<target_database>`, and a concise descriptive `filename` (e.g. `monthly_revenue_by_property.md`).
   - Record: the user's question/goal, target database & dialect (Oracle/PostgreSQL), tables/views and join relationships used, key filtering/aggregation approach or dialect gotchas, and the verified SQL statement in a fenced `sql` block.
   - Do **NOT** store raw sensitive data rows, PII, passwords, or credentials in the memory file—capture the query approach and SQL itself.
8. **Final Report**: Provide a comprehensive summary of the findings, the SQL query used, and the query results.

## Guidelines
- **Thinking and Progress**: ALWAYS provide real-time updates using the `report_progress` tool at EACH step of your workflow.
- Be precise with column names and join conditions.
- Ground all SQL in the actual schema structure retrieved via tools.
"""

def create_nl2sql_agent() -> LlmAgent:
    from common.tools import get_mcp_toolsets, create_smart_execute_sql_tool, create_save_memory_tool
    api_server_tools, query_engine_tools = get_mcp_toolsets()

    # Create progress reporting tool
    from google.adk.tools.function_tool import FunctionTool
    progress_tool = FunctionTool(report_progress)
    
    # Create the unified smart SQL tool and memory tool
    smart_sql_tool = create_smart_execute_sql_tool(query_engine_tools)
    save_memory_tool = create_save_memory_tool()

    return LlmAgent(
        model="gemini-flash-latest",
        name="nl2sql_agent",
        description="Specialized agent for Natural Language to SQL conversion and execution",
        instruction=SYSTEM_INSTRUCTION,
        tools=[
            api_server_tools,
            smart_sql_tool, # Use the unified smart tool instead of raw MCP
            progress_tool,
            save_memory_tool
        ]
    )
