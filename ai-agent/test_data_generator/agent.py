import logging
import os
import json
import httpx
from datetime import datetime
from typing import List, Dict, Any, Optional
from google.adk.agents import LlmAgent
from google.adk.tools.function_tool import FunctionTool

from common.tools import get_mcp_toolsets
from common.config import get_mcp_urls
from common.context import session_id_var, progress_callback_var
from common.utils import create_zip_archive
from test_data_generator.generator import TestDataGenerator

logger = logging.getLogger(__name__)

def report_progress(message: str) -> str:
    """Reports progress to the current context-local callback."""
    callback = progress_callback_var.get()
    if callback:
        callback(message)
    logger.info(message)
    return f"Progress reported: {message}"

async def list_tables(database: str, owner: str, filter_pattern: str) -> str:
    """
    Lists tables in a specific database and schema matching a filter pattern.

    Args:
        database: The database connection name.
        owner: The schema/owner name.
        filter_pattern: A wildcard filter (e.g., 'RNT_MENU*'). Use '*' for all tables.
    """
    api_server_url, _ = get_mcp_urls()
    url = f"{api_server_url.rstrip('/')}/schema-summary/{database}"
    try:
        report_progress(f"Listing tables in {owner} matching '{filter_pattern}'...")
        payload = {"owner": owner}
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=30.0)
            response.raise_for_status()
            data = response.json()

        # Custom filtering since the REST endpoint returns everything
        pattern = filter_pattern.replace('*', '').upper()
        tables = [f"{item['type']} {item['name']}" for item in data
                 if item['type'] == 'TABLE' and (not pattern or pattern in item['name'].upper())]

        if not tables:
            return f"No tables found matching '{filter_pattern}' in schema {owner}."
        return "\n".join(tables)
    except Exception as e:
        logger.error(f"Error listing tables from {url}: {e}")
        return f"Error listing tables: {str(e)}"

async def generate_test_data_suite(database: str, schema: str, tables: List[str]) -> str:
    """
    Generates a complete test data suite (SQL, CSV, Loader, Fixed-length) for a list of tables.

    Args:
        database: Target database name.
        schema: Target schema/owner name.
        tables: A list of table names to process.
    """
    api_server_url, _ = get_mcp_urls()
    try:
        if not isinstance(tables, list):
            # Fallback for LLM type confusion
            if isinstance(tables, str):
                tables = [tables]
            else:
                return f"Error: 'tables' must be a list of strings, got {type(tables)}"

        # Clean table names (remove 'TABLE ' prefix if present)
        tables = [t.split()[-1] if ' ' in t else t for t in tables]

        session_id = session_id_var.get()
        downloads_base = os.getenv("VISULATE_DOWNLOADS") or os.path.join(os.path.abspath(os.getcwd()), "downloads")
        output_dir = os.path.join(downloads_base, session_id)
        os.makedirs(output_dir, exist_ok=True)

        generator = TestDataGenerator(api_server_url, session_id)
        result = await generator.run(database, schema, tables, output_dir)
        file_list = result.get('files', [])
        errors = result.get('errors', [])

        if not file_list:
            err_summary = "\n".join([f"- {e}" for e in errors])
            fallback_msg = "No files were generated."
            if errors:
                fallback_msg += f" Reasons:\n{err_summary}"
            return f"{fallback_msg}\n\nPlease verify table names and database connectivity."

        # Create zip archive of all generated files
        safe_schema = "".join([c if c.isalnum() else "_" for c in schema]).strip("_")
        safe_database = "".join([c if c.isalnum() else "_" for c in database]).strip("_")
        archive_name = f"test_data_{safe_database}_{safe_schema}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        zip_path = create_zip_archive(output_dir, archive_name)

        # Formulate the response with the single zip download link as the primary action
        zip_download_link = f"[{archive_name}](/download/{session_id}/{archive_name})"

        # Also provide a list of individual files for transparency, but emphasize the zip
        individual_files_str = ", ".join(file_list)

        error_section = ""
        if errors:
            err_list = "\n".join([f"- {e}" for e in errors])
            error_section = f"\n\n**Warnings during generation:**\n{err_list}"

        final_msg = (
            f"Successfully generated test data for {len(tables)} tables.\n\n"
            f"### [Download All Files (Zip)]({zip_download_link})\n\n"
            f"**Included files:** {individual_files_str}"
            f"{error_section}"
        )
        report_progress(f"▌SUCCESS: Generated {len(file_list)} files and compressed into {archive_name}")
        return final_msg

    except Exception as e:
        logger.error(f"Error in generate_test_data_suite: {e}", exc_info=True)
        return f"Error: {str(e)}"

SYSTEM_INSTRUCTION = """You are the Visulate Test Data Generator Agent.
Your purpose is to generate comprehensive test data suites for Oracle database tables.

## Your Workflow
1. **Identify Tables**:
   - Check the "Current UI Context" (objectList or Selected Object).
   - If the user provides a filter or wildcard (e.g., "RNT_MENU*"), call `list_tables` first to get the actual table names.
2. **Generate Data**: Call `generate_test_data_suite` with the resolved list of table names.
3. **Report Output**: Summarize what was generated and present the download links provided by the tool.

## Guidelines
- **Always use the tools**: Never try to generate the data formats yourself in text.
- **Table Discovery**: Always resolve wildcards/filters using `list_tables` before calling the generation suite.
- **Reference Context**: Use the `owner` and `database` names from the UI context preamble.
- **STRICT LINK USAGE**: When the `generate_test_data_suite` tool returns a download link to you, you MUST output that EXACT link to the user. Do not fabricate or shorten the link URL or change the file extension in your final generated response.
"""

def create_test_data_generator_agent() -> LlmAgent:
    progress_tool = FunctionTool(report_progress)
    list_tool = FunctionTool(list_tables)
    suite_tool = FunctionTool(generate_test_data_suite)

    return LlmAgent(
        model="gemini-flash-latest",
        name="test_data_generator_agent",
        description="Specialized agent for generating meaningful Oracle test data suites",
        instruction=SYSTEM_INSTRUCTION,
        tools=[progress_tool, list_tool, suite_tool]
    )
