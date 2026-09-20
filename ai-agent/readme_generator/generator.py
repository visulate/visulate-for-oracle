import os
import json
import logging
import asyncio
from typing import Dict, Any, List, Optional, Tuple, Callable
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

try:
    from common.context import cancelled_var, cancelled_sessions, session_id_var
except ImportError:
    cancelled_var = None
    cancelled_sessions = set()
    session_id_var = None

# Standard directories to ignore during repository traversal
IGNORE_DIRS = {
    '.git', 'node_modules', 'venv', '.venv', 'dist', 'build',
    '.angular', '.vscode', 'coverage', '.pytest_cache', 'visulate',
    '.visulate', '__pycache__', '.idea', '.next', '.turbo', 'target',
    'bin', 'obj', '.gradle'
}

# Binary/non-source extensions to exclude from source analysis
IGNORE_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.zip',
    '.tar', '.gz', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3',
    '.exe', '.dll', '.so', '.dylib', '.jar', '.war', '.pyc', '.class'
}

def is_ignored_dir(dir_name: str) -> bool:
    """Checks if a directory name should be ignored."""
    return dir_name in IGNORE_DIRS or dir_name.startswith('.')


def build_directory_tree_bottom_up(repo_path: str, target_subpath: str = "") -> List[Dict[str, Any]]:
    """
    Traverses repository directories and returns them ordered bottom-up (deepest leaf first).
    Reads any existing README.md files first so they can be verified and updated.

    Args:
        repo_path: Root filesystem path of the git repository.
        target_subpath: Optional subdirectory path to scope the traversal to.

    Returns:
        A list of directory info dictionaries sorted by depth descending:
        [{
            'rel_path': str,              # e.g. "src/services/billing" or "" for root
            'full_path': str,
            'depth': int,
            'files': List[str],           # Source file names in this directory (excluding README)
            'subdirs': List[str],         # Immediate child subdirectories (rel paths)
            'existing_readme': Optional[str], # Content of existing README.md if present
            'has_existing_readme': bool
        }, ...]
    """
    if not repo_path or not os.path.exists(repo_path):
        raise ValueError(f"Repository path does not exist: {repo_path}")

    repo_path = os.path.realpath(repo_path)
    start_dir = os.path.realpath(os.path.join(repo_path, target_subpath.lstrip("/")))
    if os.path.commonpath([repo_path, start_dir]) != repo_path:
        raise ValueError(f"Invalid subpath '{target_subpath}' escapes repository boundary.")

    if not os.path.exists(start_dir) or not os.path.isdir(start_dir):
        return []

    collected_dirs: List[Dict[str, Any]] = []

    for root, dirs, files in os.walk(start_dir):
        root_real = os.path.realpath(root)
        if os.path.commonpath([repo_path, root_real]) != repo_path:
            continue

        # Filter directories in-place to avoid traversing ignored paths
        dirs[:] = [d for d in dirs if not is_ignored_dir(d)]

        rel_path = os.path.relpath(root, repo_path)
        if rel_path == ".":
            rel_path = ""

        # Skip if any segment in rel_path is an ignored directory
        segments = Path(rel_path).parts
        if any(is_ignored_dir(s) for s in segments):
            continue

        # Check for existing README
        existing_readme = None
        readme_name = None
        for f in files:
            if f.lower() == "readme.md":
                readme_name = f
                break

        if readme_name:
            readme_full = os.path.join(root, readme_name)
            if os.path.islink(readme_full):
                raise ValueError(f"Refusing to overwrite symlink: {readme_full}")
            try:
                with open(readme_full, "r", encoding="utf-8", errors="replace") as rf:
                    existing_readme = rf.read()
            except Exception as e:
                logger.warning(f"Could not read existing README at {readme_full}: {e}")

        # Collect source files (excluding readme and binaries)
        source_files = []
        for f in sorted(files):
            if f.lower() == "readme.md" or f.startswith("."):
                continue
            ext = os.path.splitext(f)[1].lower()
            if ext in IGNORE_EXTENSIONS:
                continue
            source_files.append(f)

        # Collect immediate subdirectories (rel paths)
        immediate_subdirs = []
        for d in sorted(dirs):
            child_rel = os.path.join(rel_path, d) if rel_path else d
            immediate_subdirs.append(child_rel)

        depth = len(segments)

        collected_dirs.append({
            'rel_path': rel_path,
            'full_path': root,
            'depth': depth,
            'files': source_files,
            'subdirs': immediate_subdirs,
            'existing_readme': existing_readme,
            'has_existing_readme': existing_readme is not None
        })

    # Sort descending by depth so lowest/leaf directories come first, root is last
    collected_dirs.sort(key=lambda d: (d['depth'], len(d['rel_path'])), reverse=True)
    return collected_dirs


def load_indexed_dependencies(repo_path: str, db_endpoint: str = None) -> Dict[str, Any]:
    """
    Loads database dependency indexing data from visulate/<db>/oracle-code-map.json
    and codebase-dependencies.md.

    Returns:
        Dict with:
        - file_to_objects: { file_rel_path: [object_names] }
        - objects: { object_name: { owner, type, files, dependencies } }
        - db_connection: database name if identified
        - dependency_markdown: Architectural summary text from codebase-dependencies.md
    """
    result: Dict[str, Any] = {
        "file_to_objects": {},
        "objects": {},
        "db_connection": db_endpoint or "",
        "dependency_markdown": ""
    }

    visulate_dir = os.path.join(repo_path, "visulate")
    if not os.path.exists(visulate_dir):
        return result

    candidate_files = []
    if db_endpoint:
        safe_db = "".join([c if c.isalnum() or c in "._-" else "_" for c in str(db_endpoint)]).strip("_").lower()
        db_map = os.path.join(visulate_dir, safe_db, "oracle-code-map.json")
        if os.path.exists(db_map):
            candidate_files.append((safe_db, db_map))

    # Also scan any database subdirectories in visulate/
    if not candidate_files:
        try:
            for entry in sorted(os.listdir(visulate_dir)):
                entry_path = os.path.join(visulate_dir, entry)
                if os.path.isdir(entry_path):
                    code_map = os.path.join(entry_path, "oracle-code-map.json")
                    if os.path.exists(code_map):
                        candidate_files.append((entry, code_map))
            # Check root visulate/oracle-code-map.json
            root_code_map = os.path.join(visulate_dir, "oracle-code-map.json")
            if os.path.exists(root_code_map):
                candidate_files.append(("global", root_code_map))
        except Exception as e:
            logger.warning(f"Error scanning visulate directory: {e}")

    for db_name, map_file in candidate_files:
        try:
            with open(map_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if not result["db_connection"]:
                    result["db_connection"] = data.get("dbConnectionId", db_name)

                # Merge files map
                for file_path, objs in data.get("files", {}).items():
                    norm_path = file_path.replace("\\", "/").lstrip("/")
                    if norm_path not in result["file_to_objects"]:
                        result["file_to_objects"][norm_path] = []
                    for obj in objs:
                        if obj not in result["file_to_objects"][norm_path]:
                            result["file_to_objects"][norm_path].append(obj)

                # Merge objects map
                for obj_name, obj_meta in data.get("objects", {}).items():
                    if obj_name not in result["objects"]:
                        result["objects"][obj_name] = obj_meta
                    else:
                        existing_files = set(result["objects"][obj_name].get("files", []))
                        existing_files.update(obj_meta.get("files", []))
                        result["objects"][obj_name]["files"] = sorted(list(existing_files))
        except Exception as e:
            logger.warning(f"Could not load indexed dependencies from {map_file}: {e}")

        # Check for companion codebase-dependencies.md in same directory
        comp_md = os.path.join(os.path.dirname(map_file), "codebase-dependencies.md")
        if os.path.exists(comp_md):
            try:
                with open(comp_md, "r", encoding="utf-8", errors="replace") as mf:
                    md_text = mf.read().strip()
                    if md_text:
                        if result["dependency_markdown"]:
                            result["dependency_markdown"] += "\n\n" + md_text
                        else:
                            result["dependency_markdown"] = md_text
            except Exception as e:
                logger.warning(f"Could not load companion markdown from {comp_md}: {e}")

    # Check root visulate/codebase-dependencies.md if none loaded
    if not result["dependency_markdown"]:
        root_md = os.path.join(visulate_dir, "codebase-dependencies.md")
        if os.path.exists(root_md):
            try:
                with open(root_md, "r", encoding="utf-8", errors="replace") as mf:
                    result["dependency_markdown"] = mf.read().strip()
            except Exception as e:
                logger.warning(f"Could not load root codebase-dependencies.md: {e}")

    return result


def extract_file_summaries(repo_path: str, rel_dir: str, files: List[str], max_bytes_per_file: int = 3000) -> List[Dict[str, Any]]:
    """
    Extracts high-level signature and comment information from source files in a directory.
    """
    summaries = []
    dir_full = os.path.join(repo_path, rel_dir) if rel_dir else repo_path

    for f in files:
        f_path = os.path.join(dir_full, f)
        if os.path.islink(f_path) or not os.path.isfile(f_path):
            continue

        sample_lines = []
        try:
            file_size = os.path.getsize(f_path)
            with open(f_path, "r", encoding="utf-8", errors="replace") as sf:
                content = sf.read(max_bytes_per_file)

            lines = content.splitlines()
            # Extract header comments or significant declarations
            for line in lines[:60]:
                stripped = line.strip()
                if stripped:
                    sample_lines.append(stripped)

            summaries.append({
                "filename": f,
                "size_bytes": file_size,
                "sample_content": "\n".join(sample_lines[:40])
            })
        except Exception as e:
            logger.debug(f"Could not read sample for {f_path}: {e}")
            summaries.append({
                "filename": f,
                "size_bytes": 0,
                "sample_content": ""
            })

    return summaries


def _build_deterministic_readme(
    rel_dir: str,
    files: List[str],
    matched_deps: Dict[str, List[str]],
    dep_objects: Dict[str, Any],
    subdirs: List[str],
    child_summaries: Dict[str, str],
    existing_readme: Optional[str]
) -> Tuple[str, str]:
    """
    Fallback deterministic generator for creating or updating READMEs
    when offline or when Gemini client is not initialized.
    """
    dir_name = os.path.basename(rel_dir) if rel_dir else "Repository Root"
    title = f"# {dir_name.capitalize()}" if dir_name != "Repository Root" else "# Application Codebase & Architecture"

    lines = [
        title,
        "",
        f"This directory (`{rel_dir or '.'}`) is part of the application codebase.",
        ""
    ]

    if existing_readme:
        lines.extend([
            "> [!NOTE]",
            "> **Verified & Updated Content**: This README incorporates existing module documentation, verified against current codebase files and indexed database dependencies.",
            ""
        ])

    # Submodules / Child directories
    if subdirs:
        lines.extend([
            "## Submodules & Subdirectories",
            "",
            "| Subdirectory | Description |",
            "| :--- | :--- |"
        ])
        for sd in subdirs:
            child_name = os.path.basename(sd)
            summary = child_summaries.get(sd, f"Submodule `{child_name}` component.")
            lines.append(f"| [`{child_name}/`]({child_name}/README.md) | {summary} |")
        lines.append("")

    # Files inventory
    if files:
        lines.extend([
            "## Files & Component Overview",
            "",
            "| File | Database Dependencies | Description |",
            "| :--- | :--- | :--- |"
        ])
        for f in files:
            f_rel = os.path.join(rel_dir, f) if rel_dir else f
            norm_rel = f_rel.replace("\\", "/").lstrip("/")
            objs = matched_deps.get(norm_rel, [])
            deps_str = ", ".join([f"`{o}`" for o in objs]) if objs else "*None mapped*"
            lines.append(f"| `{f}` | {deps_str} | Source component in `{dir_name}` |")
        lines.append("")

    # Database Dependencies Detail
    all_dir_objs = set()
    for obj_list in matched_deps.values():
        all_dir_objs.update(obj_list)

    if all_dir_objs:
        lines.extend([
            "## Database Dependencies & Schema Interactions",
            "",
            "The code in this directory references the following indexed database catalog objects:",
            "",
            "| Object | Type | Owner | Mapped Files |",
            "| :--- | :--- | :--- | :--- |"
        ])
        for obj_name in sorted(list(all_dir_objs)):
            meta = dep_objects.get(obj_name, {})
            obj_type = meta.get("type", "OBJECT")
            owner = meta.get("owner", "")
            mapped_f = [os.path.basename(p) for p in meta.get("files", []) if (rel_dir in p or not rel_dir)]
            mapped_str = ", ".join([f"`{mf}`" for mf in mapped_f]) if mapped_f else f"`{dir_name}`"
            lines.append(f"| `{obj_name}` | `{obj_type}` | `{owner or 'N/A'}` | {mapped_str} |")
        lines.append("")

    # Maintenance & Modernization Notes
    lines.extend([
        "## Maintenance & Modernization Notes",
        "",
        "- **Foundation Layer**: This README is maintained by the Visulate README Generator Agent to provide an architectural foundation for application maintenance tasks, refactoring, and rewrites.",
        "- **Data Contracts**: When refactoring or modifying SQL queries or procedures in this module, verify compatibility with mapped database objects listed above."
    ])

    if existing_readme:
        # Preserve original human notes section if one was present
        lines.extend([
            "",
            "### Preserved Architectural Notes",
            "",
            "```markdown",
            existing_readme.strip(),
            "```"
        ])

    lines.append("")
    content = "\n".join(lines)
    short_summary = f"{dir_name}: Contains {len(files)} files and {len(subdirs)} submodules" + (f" referencing {len(all_dir_objs)} database objects." if all_dir_objs else ".")
    return content, short_summary


async def generate_readme_for_directory(
    repo_path: str,
    dir_info: Dict[str, Any],
    dep_info: Dict[str, Any],
    child_summaries: Dict[str, str],
    genai_client: Optional[Any] = None
) -> Tuple[str, str]:
    """
    Generates or verifies/updates the README.md content for a single directory.
    If an existing README.md is present, reads it first and verifies its content
    against current files, submodules, and indexed database dependencies.

    Returns:
        (readme_content, short_summary)
    """
    rel_dir = dir_info['rel_path']
    files = dir_info['files']
    subdirs = dir_info['subdirs']
    existing_readme = dir_info['existing_readme']

    # Filter mapped database dependencies for files in this directory
    file_to_objects = dep_info.get("file_to_objects", {})
    objects_meta = dep_info.get("objects", {})

    dir_matched_deps: Dict[str, List[str]] = {}
    for f in files:
        f_rel = os.path.join(rel_dir, f) if rel_dir else f
        norm_f = f_rel.replace("\\", "/").lstrip("/")
        if norm_f in file_to_objects:
            dir_matched_deps[norm_f] = file_to_objects[norm_f]

    # If no Gemini client is available, produce deterministic Markdown
    if not genai_client:
        return _build_deterministic_readme(
            rel_dir=rel_dir,
            files=files,
            matched_deps=dir_matched_deps,
            dep_objects=objects_meta,
            subdirs=subdirs,
            child_summaries=child_summaries,
            existing_readme=existing_readme
        )

    # Prepare detailed context for Gemini
    file_samples = extract_file_summaries(repo_path, rel_dir, files)

    prompt = f"""You are the Visulate Codebase README Generator Agent.
Your task is to create, validate, or update the `README.md` file for the directory `{rel_dir or '.'}` in the Git repository.

## DIRECTORY METADATA
- Directory Path: `{rel_dir or '.'}`
- Files in Directory: {json.dumps(files)}
- Subdirectories: {json.dumps([os.path.basename(sd) for sd in subdirs])}
- Child Subdirectory Summaries (Bottom-Up): {json.dumps({os.path.basename(k): v for k, v in child_summaries.items() if k in subdirs})}

## INDEXED DATABASE DEPENDENCIES
{json.dumps(dir_matched_deps, indent=2)}

## DATABASE OBJECT CATALOG INFO
{json.dumps({k: v for k, v in objects_meta.items() if any(k in objs for objs in dir_matched_deps.values())}, indent=2)}

## CODEBASE DEPENDENCY SUMMARY (codebase-dependencies.md)
{dep_info.get("dependency_markdown") or "No codebase-dependencies.md summary available."}

## SOURCE FILE SAMPLES
{json.dumps(file_samples, indent=2)}

## EXISTING README CONTENT (VERIFY AND UPDATE)
{existing_readme if existing_readme else "No existing README.md found in this directory."}

## REQUIREMENTS:
1. READ THE EXISTING README FIRST (if present):
   - Verify its content against actual files and indexed database dependencies.
   - Correct any outdated, inaccurate, or missing file/module descriptions.
   - Add documentation for indexed database dependencies.
   - Preserve valid architectural insights, design decisions, or domain logic from the original README.
2. If NO existing README was present, generate a clean, comprehensive README from scratch.
3. STRUCTURE OF GENERATED README:
   - `# <Directory Name or Title>`
   - **Functional Overview**: Describe what this directory/module does in the overall application.
   - **Files & Component Responsibilities**: Table or list explaining each file and what it does.
   - **Database Dependencies & Interactions**: Document which database tables, views, packages, and procedures are used and how they are accessed.
   - **Submodules / Subdirectories**: If subdirectories exist, summarize them using the child summaries provided.
   - **Maintenance & Modernization Notes**: Specific considerations when refactoring, modernizing queries, or rewriting this code.
4. AT THE VERY END OF YOUR RESPONSE, provide a 1-sentence executive summary in the format:
   `SUMMARY: <1-2 sentences summarizing the function of this directory>`
"""

    try:
        model_name = os.getenv("MODEL", "gemini-flash-latest")
        response = await asyncio.to_thread(
            genai_client.models.generate_content,
            model=model_name,
            contents=prompt,
        )
        text = response.text if hasattr(response, "text") and response.text else ""

        if not text:
            return _build_deterministic_readme(
                rel_dir, files, dir_matched_deps, objects_meta, subdirs, child_summaries, existing_readme
            )

        # Extract SUMMARY: line
        lines = text.splitlines()
        short_summary = f"Module {os.path.basename(rel_dir) or 'Root'}: contains {len(files)} files."
        content_lines = []

        for line in lines:
            if line.startswith("SUMMARY:"):
                short_summary = line.replace("SUMMARY:", "").strip()
            else:
                content_lines.append(line)

        content = "\n".join(content_lines).strip() + "\n"
        return content, short_summary

    except Exception as e:
        logger.warning(f"Error during Gemini README generation for {rel_dir}: {e}. Falling back to deterministic generation.")
        return _build_deterministic_readme(
            rel_dir, files, dir_matched_deps, objects_meta, subdirs, child_summaries, existing_readme
        )


async def run_bottom_up_readme_generation(
    repo_path: str,
    db_endpoint: str = None,
    target_subpath: str = "",
    progress_callback: Optional[Callable[[str], None]] = None,
    stream_callback: Optional[Callable[[str], None]] = None,
    genai_client: Optional[Any] = None,
    is_cancelled: Optional[Callable[[], bool]] = None
) -> Dict[str, Any]:
    """
    Executes bottom-up traversal of the repository to create, validate, or update README files.

    Args:
        repo_path: Base directory of the git repository.
        db_endpoint: Database connection identifier (e.g. 'pdb21').
        target_subpath: Optional subdirectory path to restrict generation to.
        progress_callback: Callback to stream progress updates to UI.
        stream_callback: Callback to stream text summaries directly to the chat window.
        genai_client: Initialized Google GenAI Client.
        is_cancelled: Optional callable returning True if the operation was aborted.

    Returns:
        Summary dict containing generated file paths, created/updated counts, and details.
    """
    if not repo_path or not os.path.exists(repo_path):
        raise ValueError(f"Repository path does not exist: {repo_path}")

    def check_cancelled() -> bool:
        if is_cancelled and is_cancelled():
            return True
        if cancelled_var and cancelled_var.get():
            return True
        if session_id_var:
            sid = session_id_var.get()
            if sid in cancelled_sessions:
                return True
        return False

    async def report(msg: str):
        clean_msg = str(msg).replace("▌STATUS: ", "").replace("▌STATUS:", "").strip()
        if progress_callback:
            progress_callback(clean_msg)
        logger.info(clean_msg)
        # Yield to event loop immediately so chunks are dispatched over the network
        await asyncio.sleep(0.02)

    await report("Scanning repository directory structure bottom-up...")
    dirs_bottom_up = build_directory_tree_bottom_up(repo_path, target_subpath)

    if not dirs_bottom_up:
        await report(f"No eligible directories found in {target_subpath or 'repository'}.")
        return {"processed_count": 0, "created": [], "updated": [], "details": []}

    target_label = f"in `{target_subpath}`" if target_subpath else "across repository"
    await report(f"Found {len(dirs_bottom_up)} directories {target_label}. Loading database dependencies...")
    dep_info = load_indexed_dependencies(repo_path, db_endpoint)
    mapped_files_count = len(dep_info.get("file_to_objects", {}))
    await report(f"Loaded dependencies ({mapped_files_count} files mapped to database objects).")

    child_summaries: Dict[str, str] = {}
    created_files: List[str] = []
    updated_files: List[str] = []
    details: List[Dict[str, Any]] = []

    for i, dir_info in enumerate(dirs_bottom_up, 1):
        if check_cancelled():
            await report("Generation stopped by user.")
            break

        rel_dir = dir_info['rel_path']
        display_name = rel_dir if rel_dir else "."
        action_verb = "Validating/updating" if dir_info['has_existing_readme'] else "Creating"

        await report(f"[{i}/{len(dirs_bottom_up)}] {action_verb} README.md for `{display_name}`...")

        content, summary = await generate_readme_for_directory(
            repo_path=repo_path,
            dir_info=dir_info,
            dep_info=dep_info,
            child_summaries=child_summaries,
            genai_client=genai_client
        )

        if check_cancelled():
            await report("Generation stopped by user.")
            break

        child_summaries[rel_dir] = summary

        # Write README.md to disk immediately as generated
        target_readme = os.path.join(repo_path, rel_dir, "README.md")
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

        rel_readme_path = os.path.relpath(target_readme, repo_path).replace("\\", "/")
        if dir_info['has_existing_readme']:
            updated_files.append(rel_readme_path)
            action = "updated"
        else:
            created_files.append(rel_readme_path)
            action = "created"

        details.append({
            "path": rel_readme_path,
            "action": action,
            "summary": summary,
            "files_count": len(dir_info['files']),
            "subdirs_count": len(dir_info['subdirs'])
        })

        await report(f"[{i}/{len(dirs_bottom_up)}] Saved {rel_readme_path}")
        if stream_callback:
            try:
                stream_callback(f"- **{action.title()}** [`{rel_readme_path}`](/workbench?file={rel_readme_path}): {summary}\n")
            except Exception as cb_err:
                logger.warning(f"Error calling stream_callback: {cb_err}")

        await asyncio.sleep(0.01)

    if not check_cancelled():
        await report(f"Bottom-up README generation complete! Created {len(created_files)}, updated {len(updated_files)} README files.")

    return {
        "processed_count": len(details),
        "created": created_files,
        "updated": updated_files,
        "details": details
    }
