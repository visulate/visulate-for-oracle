import os
import json
import logging
from datetime import datetime
from typing import Tuple, List, Dict, Any, Optional

logger = logging.getLogger(__name__)

def _extract_md_metadata(file_path: str) -> Tuple[str, str]:
    """
    Extracts the title and a short summary excerpt from a Markdown file.
    Returns (title, summary).
    """
    title = os.path.basename(file_path)
    summary = ""
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            lines = [line.strip() for line in f.readlines()]

        for i, line in enumerate(lines):
            if not line:
                continue
            if line.startswith("# ") and title == os.path.basename(file_path):
                title = line.lstrip("#").strip()
                continue
            if not summary and not line.startswith("#") and not line.startswith("```"):
                # Clean simple markdown markers
                clean_line = line.lstrip(">-* \t").strip()
                if clean_line:
                    summary = clean_line[:120] + ("..." if len(clean_line) > 120 else "")
            if title != os.path.basename(file_path) and summary:
                break
    except Exception as e:
        logger.debug(f"Could not read metadata from {file_path}: {e}")

    return title, summary

def build_visulate_readme_content(visulate_dir: str, notes: str = "") -> str:
    """
    Generates structured Markdown content for visulate/README.md describing
    all database environments, memories, structures, and generated artifacts in visulate_dir.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Discover database subdirectories
    db_dirs = []
    root_files = []
    if os.path.exists(visulate_dir):
        for entry in sorted(os.listdir(visulate_dir)):
            if entry.startswith(".") or entry == "README.md":
                continue
            full_path = os.path.join(visulate_dir, entry)
            if os.path.isdir(full_path):
                db_dirs.append(entry)
            else:
                root_files.append(entry)

    md = [
        "# Visulate Architectural Knowledge Base",
        "",
        "This directory contains database architectural memories, object mappings, and generated artifacts maintained by the Visulate AI Root Agent and specialized microservices.",
        "",
        "## Directory Structure",
        "",
        "| Component | Description |",
        "| :--- | :--- |",
        "| `<db>/oracle-code-map.json` | Cross-reference index mapping database objects to repository source files. |",
        "| `<db>/codebase-dependencies.md` | Human-readable architectural summary of database objects and codebase references. |",
        "| `<db>/memories/` | Functional schema summaries, domain context, and architectural decisions. |",
        "| `<db>/structures/` | Structural analyses, object schemas, and entity relationships. |",
        "| `<db>/erd/` | Entity Relationship Diagrams in Draw.io XML format. |",
        "| `<db>/comments/` | Generated Oracle data dictionary `COMMENT ON` scripts. |",
        "| `<db>/remediation/` | Diagnostic root-cause reports and SQL remediation scripts for invalid database objects. |",
        "| `<db>/test-data/` | Generated test data suites (SQL inserts, CSV, and SQL*Loader CTL/DAT files). |",
        "| `<db>/reports/` | Schema comparison and impact analysis reports. |",
        "",
        "---",
        ""
    ]

    if notes:
        md.extend([
            "## Architectural Notes",
            "",
            notes.strip(),
            "",
            "---",
            ""
        ])

    if not db_dirs and not root_files:
        md.extend([
            "## Database Environments",
            "",
            "No database environments have been documented or indexed yet.",
            "Use the **Visulate Application Workbench** or AI Agents (e.g. `schema_analysis_agent`, `object_analysis_agent`, `erd_agent`, `comment_generator`) to generate memories, code maps, and database artifacts.",
            ""
        ])
    else:
        if root_files:
            md.extend([
                "## Global Repository Artifacts",
                ""
            ])
            for rf in root_files:
                md.append(f"- `{rf}`")
            md.extend(["", "---", ""])

        md.extend([
            "## Database Environments",
            ""
        ])

        for db in db_dirs:
            db_path = os.path.join(visulate_dir, db)
            md.append(f"### Database: `{db}`")
            md.append("")

            # 1. Codebase Map & Dependencies
            code_map_file = os.path.join(db_path, "oracle-code-map.json")
            code_deps_file = os.path.join(db_path, "codebase-dependencies.md")

            if os.path.exists(code_map_file) or os.path.exists(code_deps_file):
                md.append("#### Codebase Dependencies")
                if os.path.exists(code_map_file):
                    obj_count = 0
                    file_count = 0
                    try:
                        with open(code_map_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            obj_count = len(data.get("objects", {}))
                            file_count = len(data.get("files", {}))
                    except Exception:
                        pass
                    md.append(f"- **Codebase Mapping**: [`oracle-code-map.json`]({db}/oracle-code-map.json) ({obj_count} database objects mapped across {file_count} source files)")
                if os.path.exists(code_deps_file):
                    md.append(f"- **Dependency Summary**: [`codebase-dependencies.md`]({db}/codebase-dependencies.md)")
                md.append("")

            # 2. Memories
            memories_dir = os.path.join(db_path, "memories")
            if os.path.exists(memories_dir):
                mem_files = sorted([f for f in os.listdir(memories_dir) if f.endswith(".md")])
                if mem_files:
                    md.append("#### Architectural Memories (`memories/`)")
                    md.append("| File | Title / Summary |")
                    md.append("| :--- | :--- |")
                    for mf in mem_files:
                        t, s = _extract_md_metadata(os.path.join(memories_dir, mf))
                        summary_display = f"**{t}**" + (f" - {s}" if s and s != t else "")
                        md.append(f"| [`{mf}`]({db}/memories/{mf}) | {summary_display} |")
                    md.append("")

            # 3. Structures
            structures_dir = os.path.join(db_path, "structures")
            if os.path.exists(structures_dir):
                struct_files = sorted([f for f in os.listdir(structures_dir) if f.endswith(".md")])
                if struct_files:
                    md.append("#### Object Structures (`structures/`)")
                    md.append("| File | Object / Summary |")
                    md.append("| :--- | :--- |")
                    for sf in struct_files:
                        t, s = _extract_md_metadata(os.path.join(structures_dir, sf))
                        summary_display = f"**{t}**" + (f" - {s}" if s and s != t else "")
                        md.append(f"| [`{sf}`]({db}/structures/{sf}) | {summary_display} |")
                    md.append("")

            # 4. Generated Artifacts (ERD, Comments, Remediation, Test Data, Reports)
            artifact_sections = [
                ("erd", ".drawio", "Entity Relationship Diagrams (`erd/`)"),
                ("comments", ".sql", "Comments Scripts (`comments/`)"),
                ("remediation", ".sql", "Remediation Scripts (`remediation/`)"),
                ("reports", ".md", "Comparison & Analysis Reports (`reports/`)"),
            ]

            has_artifacts = False
            artifact_lines = []

            for folder, ext, title in artifact_sections:
                art_dir = os.path.join(db_path, folder)
                if os.path.exists(art_dir):
                    files = sorted([f for f in os.listdir(art_dir) if f.endswith(ext)])
                    if files:
                        has_artifacts = True
                        artifact_lines.append(f"- **{title}**")
                        for af in files:
                            artifact_lines.append(f"  - [`{af}`]({db}/{folder}/{af})")

            # Check test-data
            test_data_dir = os.path.join(db_path, "test-data")
            if os.path.exists(test_data_dir):
                sub_entries = sorted(os.listdir(test_data_dir))
                if sub_entries:
                    has_artifacts = True
                    artifact_lines.append(f"- **Test Data Suites (`test-data/`)**")
                    for se in sub_entries:
                        sub_full = os.path.join(test_data_dir, se)
                        if os.path.isdir(sub_full):
                            files_in_schema = sorted(os.listdir(sub_full))
                            artifact_lines.append(f"  - **Schema `{se}`**: {len(files_in_schema)} files generated")
                        else:
                            artifact_lines.append(f"  - [`{se}`]({db}/test-data/{se})")

            if has_artifacts:
                md.append("#### Generated Artifacts")
                md.extend(artifact_lines)
                md.append("")

            md.append("---")
            md.append("")

    md.extend([
        f"*Maintained automatically by Visulate Root Agent. Last updated: {timestamp}*"
    ])

    return "\n".join(md) + "\n"

def update_visulate_readme(repo_path: str, notes: str = "") -> str:
    """
    Generates and writes visulate/README.md in the specified repository workspace.
    Returns the repository-relative path 'visulate/README.md'.
    """
    if not repo_path or not os.path.exists(repo_path):
        raise ValueError(f"Repository path does not exist: {repo_path}")

    visulate_dir = os.path.join(repo_path, "visulate")
    os.makedirs(visulate_dir, exist_ok=True)

    content = build_visulate_readme_content(visulate_dir, notes=notes)
    readme_path = os.path.join(visulate_dir, "README.md")

    with open(readme_path, "w", encoding="utf-8") as f:
        f.write(content)

    rel_path = os.path.relpath(readme_path, repo_path)
    logger.info(f"Updated {rel_path} in {repo_path}")
    return rel_path
