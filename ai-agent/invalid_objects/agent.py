import logging
import os
from datetime import datetime
from google.adk.agents import LlmAgent
from google.adk.tools.function_tool import FunctionTool

from common.tools import get_mcp_toolsets
from common.context import session_id_var, progress_callback_var

logger = logging.getLogger(__name__)

def report_progress(message: str) -> str:
    """Reports progress to the current context-local callback."""
    callback = progress_callback_var.get()
    if callback:
        callback(message)
    logger.info(message)
    return f"Progress reported: {message}"

SYSTEM_INSTRUCTION = """You are the Visulate Invalid Object Resolver Agent (Invalid Objects Agent).
Your role is to help DBAs investigate and resolve invalid Oracle database objects.

## Your Goal
Investigate invalid objects in a schema, identify root causes (e.g., missing dependencies, compilation errors), and generate a SQL remediation script.

## Your Workflow
When asked to investigate invalid objects:
1. **List Invalid Objects**: Use `getSchemaInvalidObjects` to get the list of all invalid objects in the schema along with their error messages.
2. **Analyze Errors**: Examine the error messages (type, name, line, error) provided by the tool.
3. **Trace Dependencies**: If the error message suggests a dependency issue (e.g., "table or view does not exist"), use `getContext` with `relationships='NONE'` on the *invalid object itself* and review its source code. Look at the line in the error message and compare to the source code to identify the missing dependency. List each missing dependency.
4. **Identify Root Causes**: Determine the "root" invalid objects (those that aren't invalid just because of another invalid object in the same schema).
5. **Generate Remediation Plan**:
   - Propose a series of SQL commands (e.g., `ALTER ... COMPILE`, `CREATE SYNONYM`, etc.) to resolve the issues.
   - Group the commands logically.
6. **Save Remediation Script**: Call the `save_remediation_script` tool with the generated SQL.
7. **Delivery**: Provide the user with the download link for the SQL script and a summary of your findings.

## Guidelines
- **Read-Only**: You MUST NOT attempt to execute any DDL or DML to fix the issues yourself. Your output is a SQL script for the user to review and run.
- **Progress Updates**: Use `report_progress` at each major step of your investigation.
- **Accuracy**: Be precise about line numbers and error text from `DBA_ERRORS`.
"""

async def save_remediation_script(database: str, schema: str, sql_content: str, plan_name: str = "remediation_plan") -> str:
    """
    Saves the generated SQL remediation script to a file and returns a download link.

    Args:
        database: The database name.
        schema: The schema name.
        sql_content: The full content of the SQL script.
        plan_name: A descriptive name for the plan.
    """
    try:
        session_id = session_id_var.get()
        downloads_base = os.getenv("VISULATE_DOWNLOADS") or os.path.join(os.path.abspath(os.getcwd()), "downloads")
        output_dir = os.path.join(downloads_base, session_id)
        os.makedirs(output_dir, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = "".join([c if c.isalnum() else "_" for c in plan_name]).strip("_")
        filename = f"{safe_name}_{schema}_{database}_{timestamp}.sql"
        output_path = os.path.join(output_dir, filename)

        with open(output_path, "w") as f:
            f.write(f"-- Visulate Remediation Script for {schema} @ {database}\n")
            f.write(f"-- Generated on {datetime.now().isoformat()}\n\n")
            f.write(sql_content)

        download_link = f"/download/{session_id}/{filename}"
        report_progress(f"Remediation script generated: {filename}")
        return f"Successfully generated remediation script. [Download SQL Script]({download_link})"

    except Exception as e:
        logger.error(f"Error saving remediation script: {e}")
        return f"Error saving remediation script: {str(e)}"

def create_invalid_objects_agent() -> LlmAgent:
    api_server_tools, _ = get_mcp_toolsets()

    progress_tool = FunctionTool(report_progress)
    save_tool = FunctionTool(save_remediation_script)

    return LlmAgent(
        model="gemini-flash-latest",
        name="invalid_objects_agent",
        description="Specialized agent for investigating and resolving invalid Oracle database objects",
        instruction=SYSTEM_INSTRUCTION,
        tools=[api_server_tools, progress_tool, save_tool]
    )
