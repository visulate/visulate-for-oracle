import logging
import os
from datetime import datetime
from typing import List, Dict
from google.adk.agents import LlmAgent
from google.adk.tools.function_tool import FunctionTool

from common.tools import get_mcp_toolsets
from common.context import session_id_var, progress_callback_var, ui_context_var

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
Generate high-quality code and migration scripts based on database metadata, and maintain Open Knowledge Format (OKF) architectural memory.

## Your Capabilities
1. **Code Generation**: Generate PL/SQL (packages, procedures, functions, triggers), SQL (DDL, DML), Java, Python, JavaScript, and other languages as requested.
2. **Migration & Refactoring Support**: Create data migration plans, refactored packages, and scripts.
3. **OKF Architectural Memory Update**: Upon completing code refactoring or generation tasks, you MUST generate or update an `.okf/structures/<object_name>.md` file that captures object structure, design decisions, and database dependencies.
4. **Dependency Analysis**: Use `getContext` to identify metadata and analyze the impact of changes.
5. **Multi-File Workspace Output**: Write generated code and OKF documentation directly into the project repository workspace.

## Guidelines
- **Precision**: Ensure the generated code is syntactically correct and follows best practices.
- **OKF Output**: Always include an `.okf/structures/<object_name>.md` file in the generated `files` parameter when refactoring or creating database objects.
- **NO TRUNCATION**: Output ENTIRE files completely. Do NOT use placeholders or `...`.
"""

async def save_source_files(files: List[Dict[str, str]], description: str = "Generated Code") -> str:
    """
    Saves generated source files into the project repository workspace.

    Args:
        files: A list of dictionaries, each containing 'filename' and 'content'.
               Example: [{"filename": "src/packages/emp_pkg.pkb", "content": "..."}, {"filename": ".okf/structures/emp_pkg.md", "content": "..."}]
        description: A brief description of the files being saved.
    """
    try:
        session_id = session_id_var.get()
        ui_ctx = ui_context_var.get() if ui_context_var else {}
        project_id = ui_ctx.get("projectId") if isinstance(ui_ctx, dict) else "default-project"

        git_base = os.getenv("GIT_REPOS_DIR") or os.path.expanduser("~/visulate-repos")
        repo_dir = os.path.join(git_base, project_id)
        os.makedirs(repo_dir, exist_ok=True)

        saved_files = []
        for file_info in files:
            filename = file_info.get("filename")
            content = file_info.get("content")
            if not filename or content is None:
                continue

            # Sanitize & prevent path traversal outside repo_dir
            rel_path = filename.lstrip("/")
            output_path = os.path.abspath(os.path.join(repo_dir, rel_path))
            real_repo_dir = os.path.abspath(repo_dir)
            if not output_path.startswith(real_repo_dir):
                logger.warning(f"Prevented path traversal attempt for filename: {filename}")
                continue

            os.makedirs(os.path.dirname(output_path), exist_ok=True)

            with open(output_path, "w", encoding="utf-8") as f:
                f.write(content)

            saved_files.append(rel_path)

        if not saved_files:
            return "No files were saved."

        report_progress(f"Files written to Git workspace ({project_id}): {', '.join(saved_files)}")
        files_str = "\n".join([f"- {f}" for f in saved_files])
        return f"### {description}\nSuccessfully updated Git workspace `{project_id}` with files:\n{files_str}"

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
