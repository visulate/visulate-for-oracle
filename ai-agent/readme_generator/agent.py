import os
import logging
from typing import Optional, Dict, Any, List
from google.adk.agents import LlmAgent
from google.adk.tools.function_tool import FunctionTool
from google import genai

from common.config import resolve_repo_path
from common.context import progress_callback_var, session_id_var, stream_callback_var, ui_context_var
from common.tools import get_mcp_toolsets
from readme_generator.generator import (
    run_bottom_up_readme_generation,
    build_directory_tree_bottom_up,
    load_indexed_dependencies,
    generate_readme_for_directory
)

logger = logging.getLogger(__name__)

def report_progress(message: str) -> str:
    """Reports progress to the current context-local callback."""
    callback = progress_callback_var.get()
    if callback:
        callback(message)
    logger.info(message)
    return f"Progress reported: {message}"


SYSTEM_INSTRUCTION = """You are the Visulate Codebase README Generator Agent.
Your purpose is to create, validate, and update README files across the codebase in the Git repository, establishing a foundation layer for database application maintenance, modernizations, and application rewrites.

## Traversal & Generation Protocol (CRITICAL)
1. **Bottom-Up Traversal**: You start at the lowest point in the directory structure (leaf directories first), summarize the contents of each directory, and navigate up to the parent directory until reaching the root.
2. **Verify Existing READMEs First**: For each directory, you MUST inspect and read any existing `README.md` first. Verify its content against actual files and indexed database dependencies, correcting any outdated or missing details while preserving accurate human context and design decisions.
3. **Database Dependency Integration**: Incorporate indexed dependency knowledge from `visulate/<db>/oracle-code-map.json` and `codebase-dependencies.md`. Clearly explain how the application code interacts with Oracle and PostgreSQL catalog objects (tables, views, packages, procedures, triggers).
4. **Foundation for Modernization**: The generated READMEs must explain the code's function, document data contracts, and provide clear guidance for maintenance tasks and application rewrites.

## Tools
- `generate_all_readmes`: Executes the complete bottom-up traversal across the repository (or a target subdirectory), verifying existing READMEs, documenting code and database dependencies, and updating all README.md files.
- `validate_or_update_directory_readme`: Inspects, verifies, and updates the README.md in a specific single directory.
- `scan_readme_status`: Scans the repository tree and reports the current README coverage and mapped database dependencies without modifying files.

## Guidelines
- When the user asks to generate or update READMEs for the repository or a path, call `generate_all_readmes`.
- Present a clear, concise summary of the generated/updated README files, highlighting key database dependencies discovered.
"""


def create_generate_all_readmes_tool() -> FunctionTool:
    """Creates tool for running bottom-up repository README generation."""
    async def generate_all_readmes(target_path: str = "") -> str:
        """
        Traverses the repository bottom-up to create, validate, or update README.md files.
        Reads existing READMEs first to verify and correct their content against actual code
        and indexed database dependencies.

        Args:
            target_path: Optional subdirectory to scope the generation to (default: whole repository).
        """
        try:
            ui_ctx = ui_context_var.get() or {}
            if not isinstance(ui_ctx, dict):
                ui_ctx = {}

            project_id = ui_ctx.get("projectId") or "default-project"
            username = ui_ctx.get("username")
            endpoint = ui_ctx.get("endpoint")

            # Resolve target path: explicit target_path parameter takes precedence,
            # otherwise check selectedDirectory or activeFile directory in ui_ctx
            effective_target = target_path or ""
            if not effective_target:
                selected_dir = ui_ctx.get("selectedDirectory")
                if selected_dir:
                    effective_target = selected_dir
                elif ui_ctx.get("activeFile") and "/" in str(ui_ctx.get("activeFile")):
                    af = str(ui_ctx.get("activeFile"))
                    effective_target = af.rsplit("/", 1)[0]

            repo_path = resolve_repo_path(project_id, username)
            if not repo_path or not os.path.exists(repo_path):
                return f"Error: Repository workspace '{project_id}' not found. Please select a Git repository in the Application Workbench."

            api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_AI_KEY")
            client = genai.Client(api_key=api_key) if api_key else None

            result = await run_bottom_up_readme_generation(
                repo_path=repo_path,
                db_endpoint=endpoint,
                target_subpath=effective_target,
                progress_callback=progress_callback_var.get(),
                stream_callback=stream_callback_var.get(),
                genai_client=client
            )

            processed = result["processed_count"]
            created = result["created"]
            updated = result["updated"]

            lines = [
                f"### Codebase README Generation Complete (`{project_id}`)",
                "",
                f"- **Directories Analyzed**: {processed}",
                f"- **Created READMEs**: {len(created)}",
                f"- **Updated/Verified READMEs**: {len(updated)}",
                "",
                "| Action | README File | Functional Summary |",
                "| :--- | :--- | :--- |"
            ]

            for item in result["details"]:
                action_badge = "Created" if item["action"] == "created" else "Verified & Updated"
                lines.append(f"| **{action_badge}** | [`{item['path']}`](/workbench?file={item['path']}) | {item['summary']} |")

            lines.extend([
                "",
                "All README files are saved in the Git workspace and ready to view, commit, or review in the Application Workbench."
            ])

            return "\n".join(lines)

        except Exception as e:
            logger.error(f"Error in generate_all_readmes: {e}", exc_info=True)
            return f"Error generating READMEs: {str(e)}"

    return FunctionTool(generate_all_readmes)


def create_validate_directory_tool() -> FunctionTool:
    """Creates tool for validating/updating a single directory's README."""
    async def validate_or_update_directory_readme(directory: str) -> str:
        """
        Validates, corrects, or updates the README.md in a specific directory.
        Reads any existing README first, verifies against current files and indexed
        database dependencies, and rewrites with corrections.

        Args:
            directory: The directory path relative to the repository root.
        """
        try:
            ui_ctx = ui_context_var.get() or {}
            project_id = ui_ctx.get("projectId") or "default-project"
            username = ui_ctx.get("username")
            endpoint = ui_ctx.get("endpoint")

            repo_path = resolve_repo_path(project_id, username)
            if not repo_path or not os.path.exists(repo_path):
                return f"Error: Repository workspace '{project_id}' not found."

            api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_AI_KEY")
            client = genai.Client(api_key=api_key) if api_key else None

            # Get directory info
            dirs = build_directory_tree_bottom_up(repo_path, target_subpath=directory)
            target_info = None
            norm_target = directory.replace("\\", "/").strip("/")
            for d in dirs:
                if d['rel_path'].replace("\\", "/").strip("/") == norm_target:
                    target_info = d
                    break

            if not target_info:
                return f"Directory `{directory}` not found in repository `{project_id}`."

            dep_info = load_indexed_dependencies(repo_path, endpoint)

            content, summary = await generate_readme_for_directory(
                repo_path=repo_path,
                dir_info=target_info,
                dep_info=dep_info,
                child_summaries={},
                genai_client=client
            )

            target_readme = os.path.join(repo_path, target_info['rel_path'], "README.md")
            if os.path.islink(target_readme):
                raise ValueError(f"Refusing to overwrite symlink: {target_readme}")
            target_real = os.path.realpath(target_readme)
            if os.path.exists(target_readme) and os.path.commonpath([repo_path, target_real]) != repo_path:
                raise ValueError(f"Refusing to write to target outside repository: {target_readme}")

            os.makedirs(os.path.dirname(target_readme), exist_ok=True)
            with open(target_readme, "w", encoding="utf-8") as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())

            rel_readme = os.path.relpath(target_readme, repo_path).replace("\\", "/")
            action = "Updated" if target_info['has_existing_readme'] else "Created"

            return f"### {action} README.md\n- Path: [`{rel_readme}`](/workbench?file={rel_readme})\n- Summary: {summary}"

        except Exception as e:
            logger.error(f"Error in validate_or_update_directory_readme: {e}")
            return f"Error validating directory README: {str(e)}"

    return FunctionTool(validate_or_update_directory_readme)


def create_scan_readme_status_tool() -> FunctionTool:
    """Creates tool for scanning README status without modifying files."""
    async def scan_readme_status(directory: str = "") -> str:
        """
        Scans repository directories to report existing README coverage and database dependencies.

        Args:
            directory: Optional directory path to scope the scan to.
        """
        try:
            ui_ctx = ui_context_var.get() or {}
            project_id = ui_ctx.get("projectId") or "default-project"
            username = ui_ctx.get("username")
            endpoint = ui_ctx.get("endpoint")

            repo_path = resolve_repo_path(project_id, username)
            if not repo_path or not os.path.exists(repo_path):
                return f"Error: Repository workspace '{project_id}' not found."

            dirs = build_directory_tree_bottom_up(repo_path, target_subpath=directory)
            dep_info = load_indexed_dependencies(repo_path, endpoint)
            file_to_objs = dep_info.get("file_to_objects", {})

            has_readme = sum(1 for d in dirs if d['has_existing_readme'])
            missing_readme = len(dirs) - has_readme

            lines = [
                f"### Repository README Coverage & Dependency Scan (`{project_id}`)",
                "",
                f"- **Total Directories**: {len(dirs)}",
                f"- **Directories with existing README**: {has_readme}",
                f"- **Directories missing README**: {missing_readme}",
                f"- **Files mapped to Database Objects**: {len(file_to_objs)}",
                "",
                "| Directory | Status | Files | Submodules | Mapped DB Objects |",
                "| :--- | :--- | :--- | :--- | :--- |"
            ]

            for d in dirs:
                rel = d['rel_path'] or "."
                status = "README Present" if d['has_existing_readme'] else "Missing README"

                # Check matched DB objects for files in this directory
                matched = set()
                for f in d['files']:
                    norm_f = os.path.join(d['rel_path'], f).replace("\\", "/").lstrip("/")
                    if norm_f in file_to_objs:
                        matched.update(file_to_objs[norm_f])

                db_str = ", ".join(sorted(list(matched))) if matched else "-"
                lines.append(f"| `{rel}` | {status} | {len(d['files'])} | {len(d['subdirs'])} | {db_str} |")

            return "\n".join(lines)

        except Exception as e:
            logger.error(f"Error in scan_readme_status: {e}")
            return f"Error scanning README status: {str(e)}"

    return FunctionTool(scan_readme_status)


def create_readme_generator_agent() -> LlmAgent:
    """Configures and returns the Readme Generator Agent."""
    api_server_tools, _ = get_mcp_toolsets()

    progress_tool = FunctionTool(report_progress)
    generate_all_tool = create_generate_all_readmes_tool()
    validate_tool = create_validate_directory_tool()
    scan_tool = create_scan_readme_status_tool()

    return LlmAgent(
        model="gemini-flash-latest",
        name="readme_generator_agent",
        description="Specialized agent for creating, validating, and updating codebase README files using bottom-up traversal and indexed database dependency knowledge",
        instruction=SYSTEM_INSTRUCTION,
        tools=[api_server_tools, progress_tool, generate_all_tool, validate_tool, scan_tool]
    )
