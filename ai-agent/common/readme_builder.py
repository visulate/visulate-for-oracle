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
    associations_links = []
    if os.path.exists(visulate_dir):
        assoc_path = os.path.join(visulate_dir, "associations.json")
        if os.path.exists(assoc_path):
            try:
                with open(assoc_path, "r", encoding="utf-8") as af:
                    assoc_data = json.load(af)
                    if isinstance(assoc_data.get("links"), list):
                        associations_links = assoc_data["links"]
            except Exception:
                pass
        for entry in sorted(os.listdir(visulate_dir)):
            if entry.startswith(".") or entry in ("README.md", "associations.json"):
                continue
            full_path = os.path.join(visulate_dir, entry)
            if os.path.isdir(full_path):
                db_dirs.append(entry)
            else:
                root_files.append(entry)

    md = [
        "# Visulate Architectural Knowledge Base",
        "",
        "This directory contains database architectural memories, cross-codebase dependency maps, and generated artifacts maintained by the Visulate AI Root Agent and specialized microservices.",
        "",
        "## Directory Structure",
        "",
        "| Component | Description |",
        "| :--- | :--- |",
        "| `associations.json` | Many-to-many links between databases and repositories with roles (`app`, `dba`, `source`, `target`). |",
        "| `<db>/code-maps/<repo>/` | Cross-reference dependency maps (`oracle-code-map.json` & `codebase-dependencies.md`) per linked repository. |",
        "| `<db>/memories/` | Functional schema summaries, domain context, and architectural decisions. |",
        "| `<db>/structures/` | Structural analyses, object schemas, and entity relationships. |",
        "| `<db>/queries/` | Reusable NL2SQL queries, join paths, and SQL approach notes. |",
        "| `<db>/erd/` | Entity Relationship Diagrams in Draw.io XML format. |",
        "| `<db>/comments/` | Generated database data dictionary `COMMENT ON` scripts. |",
        "| `<db>/remediation/` | Diagnostic root-cause reports and SQL remediation scripts for invalid database objects. |",
        "| `<db>/test-data/` | Generated test data suites (SQL inserts, CSV, and SQL*Loader CTL/DAT files). |",
        "| `<db>/reports/` | Schema comparison and impact analysis reports. |",
        "| `<db>/ora2pg/` | Ora2Pg migration configurations, assessments, and generated PostgreSQL scripts. |",
        "",
        "---",
        ""
    ]

    if associations_links:
        md.extend([
            "## Database ↔ Repository Associations",
            "",
            "| Database | Repository | Role |",
            "| :--- | :--- | :--- |",
        ])
        for link in associations_links:
            md.append(f"| `{link.get('db', '')}` | `{link.get('repo', '')}` | `{link.get('role', 'app')}` |")
        md.extend(["", "---", ""])

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

            # 1. Codebase Maps & Dependencies (multi-repo code-maps/<repo>/ and legacy root)
            code_maps_dir = os.path.join(db_path, "code-maps")
            code_map_file = os.path.join(db_path, "oracle-code-map.json")
            code_deps_file = os.path.join(db_path, "codebase-dependencies.md")
            repo_code_maps = []
            if os.path.exists(code_maps_dir) and os.path.isdir(code_maps_dir):
                for r_entry in sorted(os.listdir(code_maps_dir)):
                    r_dir = os.path.join(code_maps_dir, r_entry)
                    if os.path.isdir(r_dir):
                        r_map = os.path.join(r_dir, "oracle-code-map.json")
                        r_md = os.path.join(r_dir, "codebase-dependencies.md")
                        if os.path.exists(r_map) or os.path.exists(r_md):
                            repo_code_maps.append((r_entry, r_map, r_md))

            if repo_code_maps or os.path.exists(code_map_file) or os.path.exists(code_deps_file):
                md.append("#### Codebase Dependencies")
                for r_entry, r_map, r_md in repo_code_maps:
                    if os.path.exists(r_map):
                        obj_count = 0
                        file_count = 0
                        try:
                            with open(r_map, "r", encoding="utf-8") as f:
                                data = json.load(f)
                                obj_count = len(data.get("objects", {}))
                                file_count = len(data.get("files", {}))
                        except Exception:
                            pass
                        md.append(f"- **Repository `{r_entry}`**: [`oracle-code-map.json`]({db}/code-maps/{r_entry}/oracle-code-map.json) ({obj_count} database objects mapped across {file_count} source files)")
                    if os.path.exists(r_md):
                        md.append(f"  - Dependency Summary: [`codebase-dependencies.md`]({db}/code-maps/{r_entry}/codebase-dependencies.md)")
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

            # 3b. Saved NL2SQL Queries & Patterns
            queries_dir = os.path.join(db_path, "queries")
            if os.path.exists(queries_dir):
                query_files = sorted([f for f in os.listdir(queries_dir) if f.endswith(".md")])
                if query_files:
                    md.append("#### Saved SQL Queries & Patterns (`queries/`)")
                    md.append("| File | Query / Approach |")
                    md.append("| :--- | :--- |")
                    for qf in query_files:
                        t, s = _extract_md_metadata(os.path.join(queries_dir, qf))
                        summary_display = f"**{t}**" + (f" - {s}" if s and s != t else "")
                        md.append(f"| [`{qf}`]({db}/queries/{qf}) | {summary_display} |")
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

            # Check ora2pg migration projects
            ora2pg_dir = os.path.join(db_path, "ora2pg")
            if os.path.exists(ora2pg_dir):
                proj_entries = sorted([p for p in os.listdir(ora2pg_dir) if not p.startswith(".")])
                if proj_entries:
                    has_artifacts = True
                    artifact_lines.append("- **Ora2Pg Migration Projects (`ora2pg/`)**")
                    for pe in proj_entries:
                        artifact_lines.append(f"  - Project `{pe}`")

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
    Generates and writes README.md for the knowledge base.
    For the dedicated visulate-memory repository, writes README.md at the repository root.
    For legacy application repositories, writes visulate/README.md.
    """
    from common.config import get_default_memory_repo_name

    if not repo_path or not os.path.exists(repo_path):
        raise ValueError(f"Repository path does not exist: {repo_path}")

    is_memory_repo = os.path.basename(os.path.normpath(repo_path)) == get_default_memory_repo_name()
    target_dir = repo_path if is_memory_repo else os.path.join(repo_path, "visulate")
    os.makedirs(target_dir, exist_ok=True)

    content = build_visulate_readme_content(target_dir, notes=notes)
    readme_path = os.path.join(target_dir, "README.md")

    with open(readme_path, "w", encoding="utf-8") as f:
        f.write(content)

    rel_path = os.path.relpath(readme_path, repo_path)
    logger.info(f"Updated {rel_path} in {repo_path}")
    return rel_path
