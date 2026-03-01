import logging
import os
from datetime import datetime
from typing import List, Dict
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

SYSTEM_INSTRUCTION = """You are the Visulate Application Developer Agent.
Your role is to assist with database-centric application development, including generating code, migration scripts, and analyzing dependencies.

## Your Goal
Generate high-quality code and migration scripts based on database metadata. Support multiple languages and migration scenarios.

## Your Capabilities
1. **Code Generation**: Generate PL/SQL (packages, procedures, functions, triggers), SQL (DDL, DML), Java, Python, JavaScript, and other languages as requested.
2. **Migration Support**: Create data migration plans and scripts. This includes generating DDL for new structures, DML for data movement, and cleanup scripts.
3. **Dependency Analysis**: Use `getContext` with `relationships='ALL'` to identify metadata and analyze the impact of changes.
4. **Multi-File Output**: You can generate multiple files for a single task (e.g., a migration might require a setup SQL, a migration SQL, and a cleanup SQL).

## Your Workflow
1. **Gather Metadata**: Use `getContext` with `relationships='ALL'` on relevant objects to understand the current structure and dependencies.
2. **Analyze Requirements**: Based on the user's request and the gathered metadata, plan the code change or migration.
3. **Identify Impacts**: Review dependencies to identify potential side effects of the proposed changes.
4. **Generate Code**: Develop the necessary source files.
5. **Save Files**: Call the `save_source_files` tool with the generated content.
6. **Provide Summary**: Explain the changes made and provide the download links.

## Guidelines
- **Precision**: Ensure the generated code is syntactically correct and follows best practices for the target language.
- **Context Awareness**: Use the provided UI context (database, schema, object) to resolve references.
- **Progress Updates**: Use `report_progress` at each major step.
- **No Direct Execution**: You generate code for the user to review and deploy; you do not execute DDL or DML yourself.
- **NO TRUNCATION**: When generating file contents for the `save_source_files` tool, you MUST output the ENTIRE file completely. Do NOT use placeholders, `...`, or comments like "rest of code here". Your file output must be a 100% complete, runnable script.
- **STRICT LINK USAGE**: When the `save_source_files` tool returns a download link to you, you MUST output that EXACT link to the user. Do not fabricate or shorten the link URL in your final generated response.
"""

async def save_source_files(files: List[Dict[str, str]], description: str = "Generated Code") -> str:
    """
    Saves one or more generated source files and returns download links.

    Args:
        files: A list of dictionaries, each containing 'filename' and 'content'.
               Example: [{"filename": "setup.sql", "content": "CREATE TABLE ..."}, {"filename": "migrate.sql", "content": "INSERT INTO ..."}]
        description: A brief description of the files being saved.
    """
    try:
        session_id = session_id_var.get()
        downloads_base = os.getenv("VISULATE_DOWNLOADS") or os.path.join(os.path.abspath(os.getcwd()), "downloads")
        output_dir = os.path.join(downloads_base, session_id)
        os.makedirs(output_dir, exist_ok=True)

        links = []
        for file_info in files:
            filename = file_info.get("filename")
            content = file_info.get("content")
            if not filename or content is None:
                continue

            # Ensure safe filename
            safe_filename = "".join([c if c.isalnum() or c in "._-" else "_" for c in filename]).strip("_")
            output_path = os.path.join(output_dir, safe_filename)

            with open(output_path, "w") as f:
                f.write(content)

            download_link = f"/download/{session_id}/{safe_filename}"
            links.append(f"[{safe_filename}]({download_link})")

        if not links:
            return "No files were saved."

        report_progress(f"Files generated: {', '.join([f.get('filename') for f in files])}")
        links_str = "\n".join([f"- {link}" for link in links])
        return f"### {description}\nSuccessfully generated the following files:\n{links_str}"

    except Exception as e:
        logger.error(f"Error saving source files: {e}")
        return f"Error saving source files: {str(e)}"

def create_app_developer_agent() -> LlmAgent:
    api_server_tools, _ = get_mcp_toolsets()

    progress_tool = FunctionTool(report_progress)
    save_tool = FunctionTool(save_source_files)

    return LlmAgent(
        model="gemini-flash-latest",
        name="app_developer_agent",
        description="Specialized agent for generating code and migration scripts based on database metadata",
        instruction=SYSTEM_INSTRUCTION,
        tools=[api_server_tools, progress_tool, save_tool]
    )
