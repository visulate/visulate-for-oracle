import os
import json
import tempfile
import shutil
import pytest

from common.readme_builder import (
    _extract_md_metadata,
    build_visulate_readme_content,
    update_visulate_readme
)

@pytest.fixture
def temp_repo():
    temp_dir = tempfile.mkdtemp()
    repo_dir = os.path.join(temp_dir, "test-repo")
    os.makedirs(repo_dir, exist_ok=True)
    yield repo_dir
    shutil.rmtree(temp_dir, ignore_errors=True)

def test_extract_md_metadata(temp_repo):
    md_file = os.path.join(temp_repo, "test_doc.md")
    with open(md_file, "w", encoding="utf-8") as f:
        f.write("# Property Management Module\n\nCore module handling rental units, tenant contracts, and payments.\n")

    title, summary = _extract_md_metadata(md_file)
    assert title == "Property Management Module"
    assert "Core module handling rental units" in summary

def test_extract_md_metadata_no_header(temp_repo):
    md_file = os.path.join(temp_repo, "notes.md")
    with open(md_file, "w", encoding="utf-8") as f:
        f.write("Some unstructured notes without a heading.\n")

    title, summary = _extract_md_metadata(md_file)
    assert title == "notes.md"
    assert "Some unstructured notes" in summary

def test_build_visulate_readme_empty_directory(temp_repo):
    visulate_dir = os.path.join(temp_repo, "visulate")
    os.makedirs(visulate_dir, exist_ok=True)

    content = build_visulate_readme_content(visulate_dir)
    assert "# Visulate Architectural Knowledge Base" in content
    assert "No database environments have been documented or indexed yet." in content

def test_build_visulate_readme_with_databases_and_artifacts(temp_repo):
    visulate_dir = os.path.join(temp_repo, "visulate")
    db_dir = os.path.join(visulate_dir, "pdb21")
    os.makedirs(db_dir, exist_ok=True)

    # 1. oracle-code-map.json
    code_map = {
        "projectId": "test-repo",
        "dbConnectionId": "pdb21",
        "objects": {"PR_PROPERTIES": {}, "RNT_TENANTS": {}},
        "files": {"code/pkg.sql": ["PR_PROPERTIES"]}
    }
    with open(os.path.join(db_dir, "oracle-code-map.json"), "w", encoding="utf-8") as f:
        json.dump(code_map, f)

    # 2. codebase-dependencies.md
    with open(os.path.join(db_dir, "codebase-dependencies.md"), "w", encoding="utf-8") as f:
        f.write("# Dependencies for PDB21\n")

    # 3. memories/
    memories_dir = os.path.join(db_dir, "memories")
    os.makedirs(memories_dir, exist_ok=True)
    with open(os.path.join(memories_dir, "schema_rntmgr2_summary.md"), "w", encoding="utf-8") as f:
        f.write("# Schema RNTMGR2\nProperty management schema supporting leases and tenants.\n")

    # 4. structures/
    structures_dir = os.path.join(db_dir, "structures")
    os.makedirs(structures_dir, exist_ok=True)
    with open(os.path.join(structures_dir, "pr_properties.md"), "w", encoding="utf-8") as f:
        f.write("# Table PR_PROPERTIES\nStores properties and physical unit descriptions.\n")

    # 5. erd/
    erd_dir = os.path.join(db_dir, "erd")
    os.makedirs(erd_dir, exist_ok=True)
    with open(os.path.join(erd_dir, "rntmgr2_erd.drawio"), "w", encoding="utf-8") as f:
        f.write("<xml></xml>")

    # 6. comments/
    comments_dir = os.path.join(db_dir, "comments")
    os.makedirs(comments_dir, exist_ok=True)
    with open(os.path.join(comments_dir, "comments_pdb21_rntmgr2.sql"), "w", encoding="utf-8") as f:
        f.write("-- Comments SQL\n")

    # 7. test-data/
    test_data_dir = os.path.join(db_dir, "test-data", "RNTMGR2")
    os.makedirs(test_data_dir, exist_ok=True)
    with open(os.path.join(test_data_dir, "pr_properties.csv"), "w", encoding="utf-8") as f:
        f.write("id,name\n")

    content = build_visulate_readme_content(visulate_dir, notes="Important architectural domain note.")

    assert "# Visulate Architectural Knowledge Base" in content
    assert "Important architectural domain note." in content
    assert "### Database: `pdb21`" in content
    assert "2 database objects mapped across 1 source files" in content
    assert "[`schema_rntmgr2_summary.md`](pdb21/memories/schema_rntmgr2_summary.md)" in content
    assert "Schema RNTMGR2" in content
    assert "[`pr_properties.md`](pdb21/structures/pr_properties.md)" in content
    assert "Table PR_PROPERTIES" in content
    assert "[`rntmgr2_erd.drawio`](pdb21/erd/rntmgr2_erd.drawio)" in content
    assert "[`comments_pdb21_rntmgr2.sql`](pdb21/comments/comments_pdb21_rntmgr2.sql)" in content
    assert "**Schema `RNTMGR2`**: 1 files generated" in content

def test_update_visulate_readme(temp_repo):
    rel_path = update_visulate_readme(temp_repo, notes="Initial repository README generation.")
    assert rel_path == "visulate/README.md"
    readme_full = os.path.join(temp_repo, "visulate", "README.md")
    assert os.path.exists(readme_full)

    with open(readme_full, "r", encoding="utf-8") as f:
        content = f.read()

    assert "# Visulate Architectural Knowledge Base" in content
    assert "Initial repository README generation." in content
