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

SYSTEM_INSTRUCTION = """You are the Visulate Invalid Object Diagnostic Agent.
Your role is to perform deep-dive investigations into invalid Oracle database objects and provide specific, verified root-cause analysis.

## Your Goal
Perform a step-by-step diagnostic investigation for each invalid object in a schema. Your output should be a detailed **Diagnostic Investigation Report** and a **verified SQL Remediation Script**.

## Your Workflow
Follow this systematic diagnostic flow for each invalid object:

1. **List Invalid Objects**: Use `getSchemaInvalidObjects` to identify all invalid objects and their associated compilation errors (`DBA_ERRORS`).
2. **Review Error Messages**: For each invalid object, examine the error message, position (line/column), and error text.
3. **Examine Source Code**:
   - Use `getContext` to retrieve the source code of the invalid object.
   - For line-specific errors, examine the code at that line.
   - **Important**: For `VIEW` definitions, errors often reference line 0. In these cases, scan the `FROM` clause of the view source to identify referenced tables or views.
4. **Identify Referenced Objects**:
   - Identify the names of objects (tables, views, packages, synonyms) referenced at the error location.
5. **Verify Existence and Accessibility (CRITICAL)**:
   - For every object name identified in Step 4, you **MUST** call `findObject` to verify its existence and discover its owner.
   - **Do NOT** assume an object exists just because it is mentioned in an error message. If `findObject` returns no results, the object is MISSING.
   - If an object is referenced via a synonym, use `getContext` on the synonym and check `synonymDetails` for the base object, then verify the base object with `findObject`.
   - Check if a database link is required and verify its existence using `getDbLinks`.
6. **Generate Remediation Script (Downloadable)**:
   - You **MUST** call the `save_remediation_script` tool to provide a downloadable SQL file.
   - The script must include specific fixes (e.g., `GRANT EXECUTE`, `CREATE SYNONYM`) for **verified** missing dependencies.
   - **The script MUST end with a call to compile the entire schema**: `exec dbms_utility.compile_schema('YOUR_SCHEMA_NAME', false);`
7. **Final Report**: Provide a summary of your findings, identifying exactly why each object is invalid (e.g., "Missing package UTL_MAIL", "Inaccessible table CUSTOMERS via broken DB Link SALES_LINK").

## Guidelines
- **Verification First**: Never suggest a `GRANT` on an object unless you have verified that the object actually exists using `findObject`.
- **Downloadable Output**: Always use `save_remediation_script`.
- **Precision**: Do not provide high-level summaries. Identify specific missing links, objects, and grants.
- **Progress Updates**: Use `report_progress` at each logical step of the investigation.
- **Read-Only**: You are a diagnostic tool. You generate reports and plans, you do not execute DDL/DML yourself.
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
        description="Specialized agent for deep-dive diagnostics of invalid Oracle database objects",
        instruction=SYSTEM_INSTRUCTION,
        tools=[api_server_tools, progress_tool, save_tool]
    )
