import logging
import os
from datetime import datetime
from typing import List, Dict
from google.adk.agents import LlmAgent
from google.adk.tools.function_tool import FunctionTool

from common.tools import get_mcp_toolsets
from common.config import resolve_repo_path
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
Generate high-quality code and migration scripts based on database metadata, and maintain Visulate architectural memory records in the repository's `.visulate/` directory.

## Memory & Context Protocol (CRITICAL)
- **Check Existing Memory Records First**: Before attempting any task (code generation, refactoring, dependency analysis, or schema updates), you MUST ALWAYS inspect existing memory records under "Visulate Architectural Memory & Dependency Map" provided in the prompt context. Adhere strictly to established architectural patterns, naming conventions, data structures, and cross-object relationships documented in existing memory records.
- **Database Striping & Storage**: Memory records are striped by database under `.visulate/<db>/` (e.g. `.visulate/<db>/structures/<object_name>.md` and `.visulate/<db>/memories/<topic>.md`) so that different database environments (Dev, UAT, Prod) maintain independent memory tracks and can be compared. When `<db>` is known from context, save to `.visulate/<db>/structures/<object_name>.md` or `.visulate/<db>/memories/<topic>.md`; if no database is specified, use `.visulate/structures/<object_name>.md` or `.visulate/memories/<topic>.md`.
- **Store Memory Records**: Whenever you generate or refactor code, design a migration, or establish architectural conventions, you MUST store or update memory records in the repository's `.visulate/` directory as part of the `files` array in `save_source_files`. This ensures continuity across sessions and tasks.

## Your Capabilities
1. **Code Generation**: Generate PL/SQL (packages, procedures, functions, triggers), SQL (DDL, DML), Java, Python, JavaScript, and other languages as requested.
2. **Migration & Refactoring Support**: Create data migration plans, refactored packages, and scripts.
3. **Architectural Memory Maintenance**: Upon completing code refactoring or generation tasks, you MUST generate or update `.visulate/<db>/structures/<object_name>.md` or `.visulate/<db>/memories/<topic>.md` capturing object structure, design decisions, and database dependencies.
4. **Dependency Analysis**: Use `getContext` and `getCodebaseDependencies` to identify metadata, schema dependencies, and mapped repository codebase files to analyze the impact of changes across the application codebase.
5. **Multi-File Workspace Output**: Write generated code and memory records directly into the project repository workspace using `save_source_files`.

## Guidelines
- **Precision**: Ensure the generated code is syntactically correct and follows best practices.
- **Memory Output**: Always include memory records (e.g. `.visulate/<db>/structures/<object_name>.md`) in the generated `files` parameter when refactoring or creating database objects.
- **NO TRUNCATION**: Output ENTIRE files completely. Do NOT use placeholders or `...`.
"""

async def save_source_files(files: List[Dict[str, str]], description: str = "Generated Code") -> str:
    """
    Saves generated source files into the project repository workspace.

    Args:
        files: A list of dictionaries, each containing 'filename' and 'content'.
               Example: [{"filename": "src/packages/emp_pkg.pkb", "content": "..."}, {"filename": ".visulate/pdb21/structures/emp_pkg.md", "content": "..."}]
        description: A brief description of the files being saved.
    """
    try:
        session_id = session_id_var.get()
        ui_ctx = ui_context_var.get() if ui_context_var else {}
        project_id = ui_ctx.get("projectId") if isinstance(ui_ctx, dict) else "default-project"
        username = ui_ctx.get("username") if isinstance(ui_ctx, dict) else None

        repo_dir = resolve_repo_path(project_id, username)
        if not repo_dir:
            return f"Invalid repository '{project_id}'."
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
